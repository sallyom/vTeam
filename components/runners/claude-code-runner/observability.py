"""
Observability manager for Claude Code runner.

Provides Langfuse LLM observability for Claude sessions,
including security features (secret sanitization, timeouts).
"""

import os
import logging
from typing import Any
from urllib.parse import urlparse

from security_utils import sanitize_exception_message, with_sync_timeout

# Langfuse for LLM observability (optional)
try:
    from langfuse import Langfuse, get_client, propagate_attributes

    LANGFUSE_AVAILABLE = True
except ImportError:
    LANGFUSE_AVAILABLE = False
    logging.debug("Langfuse not available - continuing without LLM observability")


class ObservabilityManager:
    """Manages Langfuse observability for Claude sessions.

    Handles initialization, event tracking, and cleanup for Langfuse with
    security features (secret sanitization, timeouts).
    """

    def __init__(self, session_id: str, user_id: str, user_name: str):
        """Initialize observability manager.

        Args:
            session_id: Unique session identifier
            user_id: Sanitized user ID (for user tracking in traces)
            user_name: Sanitized user name (for user tracking in traces)
        """
        self.session_id = session_id
        self.user_id = user_id
        self.user_name = user_name

        # Langfuse state
        self.langfuse_client = None
        self._propagate_ctx = None
        self.langfuse_span = None
        self._langfuse_tool_spans: dict[str, Any] = {}

    async def initialize(self, prompt: str, namespace: str) -> bool:
        """Initialize Langfuse observability.

        Args:
            prompt: Initial prompt for the session
            namespace: Kubernetes namespace for the session

        Returns:
            True if Langfuse initialized successfully
        """
        return await self._init_langfuse(prompt, namespace)

    async def _init_langfuse(self, prompt: str, namespace: str) -> bool:
        """Initialize Langfuse observability with security checks.

        Args:
            prompt: Initial prompt for the session
            namespace: Kubernetes namespace for the session

        Returns:
            True if Langfuse initialized successfully
        """
        if not LANGFUSE_AVAILABLE:
            return False

        langfuse_enabled = os.getenv("LANGFUSE_ENABLED", "").strip().lower() in (
            "1",
            "true",
            "yes",
        )
        if not langfuse_enabled:
            return False

        # Check if required Langfuse keys are present
        public_key = os.getenv("LANGFUSE_PUBLIC_KEY", "").strip()
        secret_key = os.getenv("LANGFUSE_SECRET_KEY", "").strip()
        host = os.getenv("LANGFUSE_HOST", "").strip()

        if not public_key or not secret_key:
            logging.warning(
                "LANGFUSE_ENABLED is true but LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY is missing. "
                "Langfuse observability will be disabled for this session. "
                "To enable Langfuse, platform admin must create the 'ambient-admin-langfuse-secret' secret "
                "in the operator's namespace with all LANGFUSE_* keys: "
                "LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST, LANGFUSE_ENABLED. "
                "See e2e/langfuse/README.md for setup instructions."
            )
            return False

        if not host:
            logging.warning(
                "LANGFUSE_HOST is missing. Langfuse observability will be disabled for this session. "
                "Add LANGFUSE_HOST to the 'ambient-admin-langfuse-secret' secret "
                "(e.g., LANGFUSE_HOST=http://langfuse-web.langfuse.svc.cluster.local:3000)."
            )
            return False

        # Validate LANGFUSE_HOST format to prevent malformed URLs
        try:
            parsed = urlparse(host)
            # URL must have a scheme (http/https) and a valid network location (hostname)
            if not parsed.scheme or not parsed.netloc:
                logging.warning(
                    f"LANGFUSE_HOST has invalid format (missing scheme or hostname): {host}. "
                    "Expected format: http://hostname:port or https://hostname:port. "
                    "Langfuse observability will be disabled for this session."
                )
                return False
            # Validate scheme is http or https
            if parsed.scheme not in ("http", "https"):
                logging.warning(
                    f"LANGFUSE_HOST has unsupported scheme '{parsed.scheme}'. "
                    "Only http and https are supported. "
                    "Langfuse observability will be disabled for this session."
                )
                return False
        except Exception as e:
            logging.warning(
                f"Failed to parse LANGFUSE_HOST URL '{host}': {e}. "
                "Langfuse observability will be disabled for this session."
            )
            return False

        try:
            # Initialize Langfuse client
            self.langfuse_client = Langfuse(
                public_key=public_key, secret_key=secret_key, host=host
            )

            # CRITICAL: Use propagate_attributes to ensure ALL child spans inherit user context
            # This is the Langfuse 3.0 pattern for proper user tracking across all observations
            self._propagate_ctx = propagate_attributes(
                user_id=self.user_id if self.user_id else None,
                session_id=self.session_id,
                tags=["ambient-code", f"agentic-session:{self.session_id}"],
                metadata={
                    "namespace": namespace,
                    "user_name": self.user_name if self.user_name else None,
                },
            )
            # Enter the context to start propagation
            self._propagate_ctx.__enter__()

            # Create a ROOT span for this session (will inherit propagated attributes)
            self.langfuse_span = self.langfuse_client.start_span(
                name="claude_agent_session",
                input={"prompt": prompt},
            )

            # Also update trace-level attributes for backwards compatibility
            langfuse = get_client()
            langfuse.update_current_trace(
                user_id=self.user_id if self.user_id else None,
                session_id=self.session_id,
                tags=["ambient-code", f"agentic-session:{self.session_id}"],
                metadata={
                    "namespace": namespace,
                    "user_name": self.user_name if self.user_name else None,
                },
            )

            if self.user_id:
                logging.info(
                    f"Langfuse: Tracking session for user {self.user_name} ({self.user_id})"
                )

            logging.info("Langfuse tracing enabled for session")
            return True

        except Exception as e:
            # Sanitize error message to prevent API key and host leakage
            # NEVER log exception object - only sanitized message string
            secrets = {
                "public_key": public_key,
                "secret_key": secret_key,
                "host": host,
            }
            error_msg = sanitize_exception_message(e, secrets)

            # Log sanitized warning without exception object or traceback
            logging.warning(
                f"Langfuse initialization failed: {error_msg}. "
                f"Observability will be disabled for this session. "
                f"Check that your Langfuse keys are valid and the LANGFUSE_HOST is reachable."
            )
            logging.debug(f"Langfuse initialization error type: {type(e).__name__}")

            # Continue without Langfuse - don't fail the session
            self.langfuse_client = None
            self.langfuse_span = None
            return False

    def track_generation(self, message: Any, model: str, turn_count: int) -> None:
        """Track Claude generation in Langfuse.

        Args:
            message: AssistantMessage from Claude SDK
            model: Model name (e.g., "claude-3-5-sonnet-20241022")
            turn_count: Current turn number
        """
        if not self.langfuse_client or not self.langfuse_span:
            return

        try:
            # Import here to avoid circular dependency
            from claude_agent_sdk import TextBlock

            # Extract text content and usage data for generation
            text_content = []
            for blk in getattr(message, "content", []) or []:
                if isinstance(blk, TextBlock):
                    text_content.append(getattr(blk, "text", ""))

            if not text_content:
                return

            # Check if message has usage data (it might not on every AssistantMessage)
            usage_data = getattr(message, "usage", None)

            generation_kwargs = {
                "name": "claude_response",
                "input": {"turn": turn_count},
                "output": {"text": "\n".join(text_content)[:1000]},  # Limit size
                "model": model,
                "metadata": {"turn": turn_count},
            }

            # Add usage_details if available (for Langfuse cost tracking)
            if usage_data and hasattr(usage_data, "__dict__"):
                usage_dict = {}
                if hasattr(usage_data, "input_tokens"):
                    usage_dict["input"] = usage_data.input_tokens
                if hasattr(usage_data, "output_tokens"):
                    usage_dict["output"] = usage_data.output_tokens
                if hasattr(usage_data, "cache_read_input_tokens"):
                    usage_dict["cache_read_input_tokens"] = (
                        usage_data.cache_read_input_tokens
                    )
                if hasattr(usage_data, "cache_creation_input_tokens"):
                    usage_dict["cache_creation_input_tokens"] = (
                        usage_data.cache_creation_input_tokens
                    )

                if usage_dict:
                    generation_kwargs["usage_details"] = usage_dict
                    logging.info(
                        f"Langfuse: Tracking generation with usage: {usage_dict}"
                    )

            generation = self.langfuse_client.start_generation(**generation_kwargs)
            generation.end()
        except Exception as e:
            logging.debug(f"Failed to create Langfuse generation: {e}")

    def track_tool_use(self, tool_name: str, tool_id: str, tool_input: dict) -> None:
        """Track tool decision in Langfuse.

        Args:
            tool_name: Name of the tool being used
            tool_id: Unique tool use ID
            tool_input: Tool input parameters
        """
        # Add Langfuse span for tool decision
        if self.langfuse_client and self.langfuse_span:
            try:
                tool_span = self.langfuse_client.start_span(
                    name=f"tool_{tool_name}",
                    input=tool_input,
                    metadata={
                        "tool_id": tool_id,
                        "tool_name": tool_name,
                    },
                )
                # Store tool span to update with result later
                self._langfuse_tool_spans[tool_id] = tool_span
            except Exception as e:
                logging.debug(f"Failed to create Langfuse tool span: {e}")

    def track_tool_result(self, tool_use_id: str, content: Any, is_error: bool) -> None:
        """Track tool result in Langfuse.

        Args:
            tool_use_id: Tool use ID from track_tool_use
            content: Tool result content
            is_error: Whether the tool execution failed
        """
        # Update Langfuse tool span with result
        if tool_use_id in self._langfuse_tool_spans:
            try:
                tool_span = self._langfuse_tool_spans[tool_use_id]
                # Truncate long results with indicator
                if content:
                    result_text = str(content)
                    if len(result_text) > 500:
                        result_text = result_text[:500] + "...[truncated]"
                else:
                    result_text = "No output"

                tool_span.end(
                    output={"result": result_text},
                    level="ERROR" if is_error else "DEFAULT",
                    metadata={"is_error": is_error or False},
                )
                del self._langfuse_tool_spans[tool_use_id]
            except Exception as e:
                logging.debug(f"Failed to update Langfuse tool span: {e}")

    def track_session_totals(self, result_payload: dict) -> None:
        """Track session-level cost and usage in Langfuse.

        Args:
            result_payload: ResultMessage payload with usage/cost data
        """
        if not self.langfuse_client or not self.langfuse_span:
            return

        try:
            usage = result_payload.get("usage")
            total_cost = result_payload.get("total_cost_usd")

            # Update trace metadata with session totals
            metadata_update = {}
            if usage and hasattr(usage, "__dict__"):
                total_tokens = getattr(usage, "total_tokens", None)
                input_tokens = getattr(usage, "input_tokens", None)
                output_tokens = getattr(usage, "output_tokens", None)

                if total_tokens:
                    metadata_update["total_tokens"] = total_tokens
                if input_tokens:
                    metadata_update["input_tokens"] = input_tokens
                if output_tokens:
                    metadata_update["output_tokens"] = output_tokens

            if total_cost is not None:
                metadata_update["total_cost_usd"] = total_cost

            if metadata_update:
                # Update span metadata (this will show in Langfuse UI)
                self.langfuse_span.update(metadata=metadata_update)
                logging.info(f"Langfuse: Session totals - {metadata_update}")
        except Exception as e:
            logging.debug(f"Failed to update Langfuse with session totals: {e}")

    async def finalize(self, result_payload: dict | None) -> None:
        """End spans and flush observability data (success path).

        Args:
            result_payload: ResultMessage payload with final metrics (may be None)
        """
        # Complete Langfuse session span with final results
        if self.langfuse_span and self.langfuse_client:
            try:
                # End the span with final output/metadata
                if result_payload:
                    self.langfuse_span.end(
                        output=result_payload,
                        metadata={
                            "num_turns": result_payload.get("num_turns", 0),
                            "total_cost_usd": result_payload.get("total_cost_usd"),
                            "duration_ms": result_payload.get("duration_ms"),
                            "subtype": result_payload.get("subtype"),
                        },
                    )
                    logging.info("Langfuse span ended with result payload")
                else:
                    # No result payload (e.g., git push operations), but still end span
                    self.langfuse_span.end()
                    logging.info("Langfuse span ended without result payload")

                # CRITICAL: Always flush, even if no result payload
                # Otherwise traces never appear in Langfuse UI!
                # Use 30s timeout to handle network latency and batch uploads
                # Rationale:
                # - Langfuse SDK batches events before HTTP upload
                # - Typical sessions: 10-50 events, flush takes 500ms-2s
                # - Large sessions: 500+ events can take 5-10s to upload
                # - Network latency: cluster-internal ~50ms, external 200-500ms
                # - 30s provides 3x-6x safety margin for worst-case scenarios
                # - If flush regularly times out, increase timeout or check network/Langfuse health
                success, _ = await with_sync_timeout(
                    self.langfuse_client.flush, 30.0, "Langfuse flush"
                )
                if success:
                    logging.info("Langfuse flush completed successfully")
                else:
                    # Error level for flush timeouts - this means observability data was lost
                    logging.error(
                        "Langfuse flush timed out after 30s - observability data may not be sent. "
                        "Check network connectivity to LANGFUSE_HOST."
                    )
            except Exception as e:
                logging.warning(f"Failed to complete Langfuse session span: {e}")
            finally:
                # Exit propagate_attributes context
                if self._propagate_ctx:
                    try:
                        self._propagate_ctx.__exit__(None, None, None)
                    except Exception as e:
                        logging.debug(
                            f"Failed to exit propagate_attributes context: {e}"
                        )

    async def cleanup_on_error(self, error: Exception) -> None:
        """End spans and flush observability data (error path).

        Args:
            error: Exception that caused the failure
        """
        # 1. End Langfuse span with error if available
        if self.langfuse_span and self.langfuse_client:
            try:
                # End span with error status
                self.langfuse_span.end(level="ERROR", status_message=str(error))
                # Flush with 30s timeout (same as success path)
                success, _ = await with_sync_timeout(
                    self.langfuse_client.flush, 30.0, "Langfuse error cleanup flush"
                )
                if not success:
                    logging.error(
                        "Langfuse error cleanup flush timed out after 30s - "
                        "error trace may not be sent."
                    )
            except Exception as cleanup_err:
                logging.debug(f"Failed to cleanup Langfuse span: {cleanup_err}")
            finally:
                # Exit propagate_attributes context
                if self._propagate_ctx:
                    try:
                        self._propagate_ctx.__exit__(None, None, None)
                    except Exception as e:
                        logging.debug(
                            f"Failed to exit propagate_attributes context: {e}"
                        )
