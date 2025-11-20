"""
Observability manager for Claude Code runner - simplified Langfuse integration.

Provides Langfuse LLM observability for Claude sessions:
- Session-based grouping via propagate_attributes() with session_id and user_id
- Each interaction creates a separate generation trace with usage_details
- Langfuse automatically aggregates tokens and costs by session_id
- Accurate cost calculation with separate cache token tracking
- Filter by user and session in Langfuse UI

Pattern:
1. Initialize with propagate_attributes(session_id, user_id)
2. Each Claude interaction creates ONE generation with canonical usage_details format:
   {
       "input": int,
       "output": int,
       "cache_read_input_tokens": int,  # Optional
       "cache_creation_input_tokens": int,  # Optional
   }
3. Langfuse applies correct pricing to each token type and aggregates automatically
4. Flush at session end

Reference: https://langfuse.com/docs/observability/sdk/python/sdk-v3
"""

import os
import logging
from typing import Any
from urllib.parse import urlparse

from security_utils import sanitize_exception_message, with_sync_timeout


class ObservabilityManager:
    """Manages Langfuse observability for Claude sessions.

    Simplified approach:
    - Each interaction is its own generation trace with canonical usage_details:
      {"input": int, "output": int, "cache_read_input_tokens": int, "cache_creation_input_tokens": int}
    - Langfuse automatically aggregates by session_id and applies correct pricing to each token type
    - No manual accumulation, no session_summary needed
    """

    def __init__(self, session_id: str, user_id: str, user_name: str):
        """Initialize observability manager.

        Args:
            session_id: Unique session identifier
            user_id: Sanitized user ID
            user_name: Sanitized user name
        """
        self.session_id = session_id
        self.user_id = user_id
        self.user_name = user_name
        self.langfuse_client = None
        self._propagate_ctx = None
        self._tool_spans: dict[str, tuple[Any, Any]] = {}

    async def initialize(self, prompt: str, namespace: str) -> bool:
        """Initialize Langfuse observability.

        Args:
            prompt: Initial prompt for the session
            namespace: Kubernetes namespace

        Returns:
            True if Langfuse initialized successfully
        """
        langfuse_enabled = os.getenv("LANGFUSE_ENABLED", "").strip().lower() in (
            "1",
            "true",
            "yes",
        )
        if not langfuse_enabled:
            return False

        try:
            from langfuse import Langfuse, propagate_attributes
        except ImportError:
            logging.debug("Langfuse not available - continuing without observability")
            return False

        public_key = os.getenv("LANGFUSE_PUBLIC_KEY", "").strip()
        secret_key = os.getenv("LANGFUSE_SECRET_KEY", "").strip()
        host = os.getenv("LANGFUSE_HOST", "").strip()

        if not public_key or not secret_key:
            logging.warning(
                "LANGFUSE_ENABLED is true but keys are missing. "
                "Create 'ambient-admin-langfuse-secret' with LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY."
            )
            return False

        if not host:
            logging.warning("LANGFUSE_HOST is missing. Add to secret (e.g., http://langfuse:3000).")
            return False

        # Validate host format
        try:
            parsed = urlparse(host)
            if not parsed.scheme or not parsed.netloc or parsed.scheme not in ("http", "https"):
                logging.warning(f"LANGFUSE_HOST invalid format: {host}")
                return False
        except Exception as e:
            logging.warning(f"Failed to parse LANGFUSE_HOST: {e}")
            return False

        try:
            # Initialize client
            self.langfuse_client = Langfuse(
                public_key=public_key, secret_key=secret_key, host=host
            )

            # Enter propagate_attributes context - all traces grouped by session_id
            self._propagate_ctx = propagate_attributes(
                user_id=self.user_id,
                session_id=self.session_id,
                tags=["claude-code", f"namespace:{namespace}"],
                metadata={
                    "namespace": namespace,
                    "user_name": self.user_name,
                    "initial_prompt": prompt[:200] if len(prompt) > 200 else prompt
                }
            )
            self._propagate_ctx.__enter__()

            logging.info(f"Langfuse: Session tracking enabled (session_id={self.session_id}, user_id={self.user_id})")
            return True

        except Exception as e:
            secrets = {"public_key": public_key, "secret_key": secret_key, "host": host}
            error_msg = sanitize_exception_message(e, secrets)
            logging.warning(f"Langfuse init failed: {error_msg}")

            if self._propagate_ctx:
                try:
                    self._propagate_ctx.__exit__(None, None, None)
                except Exception:
                    pass

            self.langfuse_client = None
            self._propagate_ctx = None
            return False

    def track_interaction(
        self, message: Any, model: str, turn_count: int, usage: dict | None = None
    ) -> None:
        """Track a Claude interaction with usage data.

        Creates a separate trace for this turn using start_as_current_observation.
        Usage data from ResultMessage is formatted for Langfuse SDK v3 canonical format:
            {
                "input": int,  # Regular input tokens
                "output": int,  # Output tokens
                "cache_read_input_tokens": int,  # Optional, if present
                "cache_creation_input_tokens": int,  # Optional, if present
            }

        Langfuse applies correct pricing to each token type:
        - input: $3.00 per 1M tokens
        - cache_creation_input_tokens: $3.75 per 1M tokens (25% premium)
        - cache_read_input_tokens: $0.30 per 1M tokens (90% discount)

        All traces are grouped by session_id via propagate_attributes().
        Langfuse automatically aggregates usage across all traces in a session.

        Args:
            message: AssistantMessage from Claude SDK
            model: Model name (e.g., "claude-3-5-sonnet-20241022")
            turn_count: Current turn number
            usage: Usage dict from ResultMessage with input_tokens, output_tokens, cache tokens, etc.
        """
        if not self.langfuse_client:
            return

        try:
            from claude_agent_sdk import TextBlock

            # Extract text content
            text_content = []
            message_content = getattr(message, "content", []) or []
            for blk in message_content:
                if isinstance(blk, TextBlock):
                    text_content.append(getattr(blk, "text", ""))

            if not text_content:
                logging.debug(f"Turn {turn_count}: No text content, skipping")
                return

            output_text = "\n".join(text_content)

            # Build metadata
            metadata = {"turn": turn_count}

            # Calculate usage_details upfront if we have usage data
            usage_details_dict = None
            if usage and isinstance(usage, dict):
                input_tokens = usage.get("input_tokens", 0)
                output_tokens = usage.get("output_tokens", 0)
                cache_creation = usage.get("cache_creation_input_tokens", 0)
                cache_read = usage.get("cache_read_input_tokens", 0)

                # Langfuse canonical format with separate cache tokens for accurate cost calculation
                # Each token type has different pricing in Anthropic Claude:
                # - input: $3.00 per 1M tokens
                # - cache_creation_input_tokens: $3.75 per 1M (25% premium)
                # - cache_read_input_tokens: $0.30 per 1M (90% discount)
                usage_details_dict = {
                    "input": input_tokens,  # Regular input tokens only
                    "output": output_tokens,
                }

                # Add cache tokens separately if present for accurate cost calculation
                if cache_read > 0:
                    usage_details_dict["cache_read_input_tokens"] = cache_read
                if cache_creation > 0:
                    usage_details_dict["cache_creation_input_tokens"] = cache_creation

            # Create independent generation (not nested observation)
            # propagate_attributes() ensures it's grouped by session_id in Langfuse
            # SDK v3: set output/usage via update(), context manager handles end()
            logging.info(f"Langfuse: Creating independent trace for turn {turn_count} with model={model}")
            with self.langfuse_client.start_as_current_observation(
                as_type="generation",
                name=f"claude_turn_{turn_count}",
                input=[{"role": "user", "content": f"Turn {turn_count}"}],
                model=model,
                metadata=metadata,
            ) as generation:
                # Update with output and usage_details (SDK v3 requires 'usage_details' parameter)
                update_params = {"output": output_text}
                if usage_details_dict:
                    update_params["usage_details"] = usage_details_dict
                generation.update(**update_params)

            if usage_details_dict:
                input_count = usage_details_dict.get('input', 0)
                output_count = usage_details_dict.get('output', 0)
                cache_read_count = usage_details_dict.get('cache_read_input_tokens', 0)
                cache_creation_count = usage_details_dict.get('cache_creation_input_tokens', 0)
                total_tokens = input_count + output_count + cache_read_count + cache_creation_count

                log_msg = (
                    f"Langfuse: Tracked turn {turn_count} - model={model}, "
                    f"{input_count} input, {output_count} output"
                )
                if cache_read_count > 0 or cache_creation_count > 0:
                    log_msg += f", {cache_read_count} cache_read, {cache_creation_count} cache_creation"
                log_msg += f" (total: {total_tokens})"
                logging.info(log_msg)
            else:
                logging.info(f"Langfuse: Tracked turn {turn_count} - model={model} (no usage data)")

        except Exception as e:
            logging.error(f"Langfuse: Failed to track interaction: {e}", exc_info=True)

    def track_tool_use(self, tool_name: str, tool_id: str, tool_input: dict) -> None:
        """Track tool use.

        Args:
            tool_name: Tool name
            tool_id: Unique tool use ID
            tool_input: Tool input parameters
        """
        if not self.langfuse_client:
            return

        try:
            # Create span and store for later update with result
            span_ctx = self.langfuse_client.start_as_current_observation(
                as_type="span",
                name=f"tool_{tool_name}",
                input=tool_input,
                metadata={"tool_id": tool_id, "tool_name": tool_name}
            )
            span = span_ctx.__enter__()
            self._tool_spans[tool_id] = (span_ctx, span)
        except Exception as e:
            logging.debug(f"Langfuse: Failed to track tool use: {e}")

    def track_tool_result(self, tool_use_id: str, content: Any, is_error: bool) -> None:
        """Track tool result.

        Args:
            tool_use_id: Tool use ID
            content: Tool result content
            is_error: Whether execution failed
        """
        if tool_use_id not in self._tool_spans:
            return

        try:
            tool_span_ctx, tool_span = self._tool_spans[tool_use_id]

            # Truncate long results
            result_text = str(content) if content else "No output"
            if len(result_text) > 500:
                result_text = result_text[:500] + "...[truncated]"

            tool_span.update(
                output={"result": result_text},
                level="ERROR" if is_error else "DEFAULT",
                metadata={"is_error": is_error or False}
            )
            tool_span_ctx.__exit__(None, None, None)
            del self._tool_spans[tool_use_id]

        except Exception as e:
            logging.debug(f"Langfuse: Failed to track tool result: {e}")

    async def finalize(self) -> None:
        """Finalize and flush observability data."""
        if not self.langfuse_client:
            return

        try:
            # Exit propagate_attributes context
            if self._propagate_ctx:
                self._propagate_ctx.__exit__(None, None, None)
                logging.info("Langfuse: Session context closed")

            # Flush data
            success, _ = await with_sync_timeout(
                self.langfuse_client.flush, 30.0, "Langfuse flush"
            )
            if success:
                logging.info("Langfuse: Flush completed")
            else:
                logging.error("Langfuse: Flush timed out after 30s")

        except Exception as e:
            logging.error(f"Langfuse: Failed to finalize: {e}", exc_info=True)

    async def cleanup_on_error(self, error: Exception) -> None:
        """Cleanup on error.

        Args:
            error: Exception that caused failure
        """
        if not self.langfuse_client:
            return

        try:
            if self._propagate_ctx:
                self._propagate_ctx.__exit__(None, None, None)

            success, _ = await with_sync_timeout(
                self.langfuse_client.flush, 30.0, "Langfuse error flush"
            )
            if not success:
                logging.error("Langfuse: Error flush timed out")

        except Exception as cleanup_err:
            logging.error(f"Langfuse: Failed to cleanup: {cleanup_err}", exc_info=True)
