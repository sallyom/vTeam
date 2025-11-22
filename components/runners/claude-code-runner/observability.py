"""
Observability manager for Claude Code runner - SDK v3 session-based grouping pattern.

Provides Langfuse LLM observability for Claude sessions:
- Session-based grouping via propagate_attributes() with session_id
- Each interaction creates a separate trace (not nested) with usage data
- All traces grouped in Langfuse Sessions view by session_id
- Simplified pattern focused on usage and cost tracking, not hierarchy
- Security features (secret sanitization, timeouts)

SDK v3 pattern (session-based grouping for usage tracking):
1. Enter propagate_attributes() context with user_id, session_id, tags
2. Each turn/interaction creates a separate trace via start_as_current_observation()
3. All traces automatically grouped by session_id in Langfuse Sessions tab
4. Usage data set via .update(usage_details={...}) after observation creation (SDK v3 API)
5. Summary generation at session end with total usage_details for cost calculation

This pattern is simpler and more appropriate when:
- Primary goal is usage/cost tracking, not performance analysis
- Don't need hierarchical nesting of observations
- Want to see each interaction as a separate trace with its own cost

Anthropic-specific cost tracking:
- Claude SDK only provides session-level usage in ResultMessage (no per-turn usage)
- We create a "session_summary" generation at the end with all usage data
- usage_details set via .update() method with fields: input, output, total, cache_read_input_tokens, cache_creation_input_tokens
- Langfuse automatically calculates costs using configured Claude model pricing
- Reference: https://langfuse.com/docs/observability/features/token-and-cost-tracking
"""

import os
import logging
from typing import Any
from urllib.parse import urlparse

from security_utils import sanitize_exception_message, with_sync_timeout

# Langfuse will be imported lazily only when enabled

class ObservabilityManager:
    """Manages Langfuse observability for Claude sessions.

    Handles initialization, event tracking, and cleanup for Langfuse with
    security features (secret sanitization, timeouts).

    SDK v3 pattern (session-based grouping for usage tracking):
    - propagate_attributes() context manager sets user_id/session_id/tags in OTel context
    - Each interaction creates a separate trace (not nested)
    - All traces grouped by session_id in Langfuse Sessions view
    - Usage data set via .update(usage_details={...}) after observation creation
    - Summary generation with Anthropic-specific usage_details enables auto-cost calculation

    This simplified pattern is focused on usage/cost tracking, not performance hierarchy.
    All traces for a session can be viewed together in the Sessions tab in Langfuse UI.

    Anthropic cost tracking:
    - Claude SDK only provides session-level usage (no per-turn data)
    - finalize() creates "session_summary" generation with usage_details
    - Langfuse auto-calculates costs using configured Claude model pricing
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
        self._propagate_ctx = None  # propagate_attributes() context manager (for session grouping)
        self._langfuse_tool_spans: dict[str, Any] = {}

        # Track configured model for usage_details in summary generation
        self.configured_model = None

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

        Sets up propagate_attributes() context and creates root span.

        CRITICAL: Root span is REQUIRED for SDK v3 to work correctly!
        Without an active span context, all SDK operations are silently skipped.

        Args:
            prompt: Initial prompt for the session
            namespace: Kubernetes namespace for the session

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

        # Import langfuse only when it's actually needed
        try:
            from langfuse import Langfuse
        except ImportError:
            logging.debug("Langfuse not available - continuing without LLM observability")
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
            # Import propagate_attributes for SDK v3 pattern
            from langfuse import propagate_attributes

            # Initialize Langfuse client
            self.langfuse_client = Langfuse(
                public_key=public_key, secret_key=secret_key, host=host
            )

            trace_tags = ["claude-code", f"namespace:{namespace}"]

            # SDK v3 pattern for session-based grouping (simplified for usage tracking):
            # 1. Enter propagate_attributes() context with user_id, session_id, tags
            # 2. All subsequent traces automatically grouped by session_id
            # 3. Each interaction creates a separate trace (not nested)
            # 4. View all traces together in Langfuse Sessions tab

            # Enter propagate_attributes context - this groups all traces by session_id
            self._propagate_ctx = propagate_attributes(
                user_id=self.user_id,
                session_id=self.session_id,
                tags=trace_tags,
                metadata={
                    "namespace": namespace,
                    "user_name": self.user_name,
                    "initial_prompt": prompt[:200] if len(prompt) > 200 else prompt
                }
            )
            self._propagate_ctx.__enter__()

            logging.info(f"Langfuse: Session-based grouping enabled for session {self.session_id}")
            logging.info(f"Langfuse: All traces will be grouped by session_id in Sessions view")

            if self.user_id:
                logging.info(
                    f"Langfuse: Tracking session for user {self.user_name} ({self.user_id})"
                )

            logging.info(
                f"Langfuse: propagate_attributes active - "
                f"user_id={self.user_id}, session_id={self.session_id}, tags={trace_tags}"
            )
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

            # Cleanup any partially initialized state
            if self._propagate_ctx:
                try:
                    self._propagate_ctx.__exit__(None, None, None)
                except Exception:
                    pass

            # Continue without Langfuse - don't fail the session
            self.langfuse_client = None
            self._propagate_ctx = None
            return False

    def track_generation(self, message: Any, model: str, turn_count: int) -> None:
        """Track Claude generation in Langfuse using SDK v3 start_as_current_generation().

        User_id, session_id, and tags are automatically inherited via propagate_attributes().

        NOTE: AssistantMessage does NOT contain usage data. Usage tracking happens in finalize()
        when we receive the ResultMessage with session-level usage metrics.

        Args:
            message: AssistantMessage from Claude SDK
            model: Model name (e.g., "claude-3-5-sonnet-20241022")
            turn_count: Current turn number
        """
        if not self.langfuse_client:
            logging.debug(f"Langfuse: Skipping generation tracking - client not initialized")
            return

        # Store configured model for use in summary generation
        if not self.configured_model:
            self.configured_model = model
            logging.debug(f"Langfuse: Captured configured model: {model}")

        logging.debug(f"Langfuse: track_generation called for turn {turn_count}, model={model}")
        try:
            # Import here to avoid circular dependency
            from claude_agent_sdk import TextBlock

            # Extract text content for generation
            text_content = []
            message_content = getattr(message, "content", []) or []
            logging.debug(f"Langfuse: Processing message with {len(message_content)} content blocks")
            for blk in message_content:
                if isinstance(blk, TextBlock):
                    text_content.append(getattr(blk, "text", ""))
                else:
                    logging.debug(f"Langfuse: Skipping non-TextBlock: {type(blk).__name__}")

            if not text_content:
                logging.debug(f"Langfuse: No text content found in message, skipping generation tracking")
                return

            output_text = "\n".join(text_content)
            logging.debug(f"Langfuse: Extracted {len(output_text)} chars of output text")

            # Create separate trace for this generation
            # All traces automatically grouped by session_id via propagate_attributes
            logging.debug(f"Langfuse: Creating separate trace for turn {turn_count}")

            with self.langfuse_client.start_as_current_observation(
                as_type="generation",
                name=f"claude_response_turn_{turn_count}",
                input=[{"role": "user", "content": f"Turn {turn_count}"}],
                model=model,
                metadata={"turn": turn_count}
            ) as generation:
                generation.update(output=output_text)

            logging.info(f"Langfuse: Tracked generation for turn {turn_count} with {len(output_text)} chars (usage pending)")
        except Exception as e:
            logging.error(f"Langfuse: Failed to create generation: {e}", exc_info=True)

    def track_tool_use(self, tool_name: str, tool_id: str, tool_input: dict) -> None:
        """Track tool decision in Langfuse using SDK v3 start_as_current_span().

        User_id, session_id, and tags are automatically inherited via propagate_attributes().

        Args:
            tool_name: Name of the tool being used
            tool_id: Unique tool use ID
            tool_input: Tool input parameters
        """
        if self.langfuse_client:
            try:
                # Create separate trace for this tool
                # All traces automatically grouped by session_id via propagate_attributes
                logging.debug(f"Langfuse: Creating separate trace for tool {tool_name}")

                tool_span_ctx = self.langfuse_client.start_as_current_observation(
                    as_type="span",
                    name=f"tool_{tool_name}",
                    input=tool_input,
                    metadata={
                        "tool_id": tool_id,
                        "tool_name": tool_name,
                    }
                )
                tool_span = tool_span_ctx.__enter__()
                # Store both context and span for updating with result later
                self._langfuse_tool_spans[tool_id] = (tool_span_ctx, tool_span)
                logging.debug(f"Langfuse: Created tool span for {tool_name} with explicit parent linking")
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
                tool_span_ctx, tool_span = self._langfuse_tool_spans[tool_use_id]
                # Truncate long results with indicator
                if content:
                    result_text = str(content)
                    if len(result_text) > 500:
                        result_text = result_text[:500] + "...[truncated]"
                else:
                    result_text = "No output"

                # Update span with result then exit context
                tool_span.update(
                    output={"result": result_text},
                    level="ERROR" if is_error else "DEFAULT",
                    metadata={"is_error": is_error or False}
                )
                tool_span_ctx.__exit__(None, None, None)

                del self._langfuse_tool_spans[tool_use_id]
                logging.debug(f"Langfuse: Updated and closed tool span for {tool_use_id}")
            except Exception as e:
                logging.debug(f"Failed to update Langfuse tool span: {e}")

    async def finalize(self, result_payload: dict | None) -> None:
        """Finalize trace and flush observability data (success path).

        Updates root span with final metrics, exits root span and propagate_attributes contexts.

        Args:
            result_payload: ResultMessage payload with final metrics (may be None)
                Expected structure: {
                    "num_turns": int,
                    "duration_ms": int,
                    "total_cost_usd": float,
                    "subtype": str,
                    "usage": {
                        "input_tokens": int,
                        "output_tokens": int,
                        "total_tokens": int,
                        "cache_read_input_tokens": int,
                        "cache_creation_input_tokens": int
                    }
                }
        """
        logging.info(f"Langfuse: finalize() called with result_payload present: {result_payload is not None}")

        # Cleanup and flush
        if self.langfuse_client:
            logging.info(f"Langfuse: Finalizing trace (langfuse_client active)")
            try:
                # Update trace with final metadata if we have results
                if result_payload:
                    logging.info(f"Langfuse: result_payload keys: {list(result_payload.keys())}")
                    logging.info(f"Langfuse: result_payload content (first 500 chars): {str(result_payload)[:500]}")

                    # Extract usage data from ResultMessage
                    usage_data = result_payload.get("usage")
                    logging.info(f"Langfuse: usage_data extracted: {usage_data}")
                    logging.info(f"Langfuse: usage_data type: {type(usage_data)}")

                    # Build usage dict for metadata
                    usage_dict = None
                    if usage_data and isinstance(usage_data, dict):
                        input_tokens = usage_data.get("input_tokens", 0)
                        output_tokens = usage_data.get("output_tokens", 0)
                        # CRITICAL: Claude SDK does NOT provide total_tokens - we must calculate it!
                        total_tokens = input_tokens + output_tokens

                        usage_dict = {
                            "input_tokens": input_tokens,
                            "output_tokens": output_tokens,
                            "total_tokens": total_tokens,  # Calculated, not extracted
                            "cache_read_input_tokens": usage_data.get("cache_read_input_tokens", 0),
                            "cache_creation_input_tokens": usage_data.get("cache_creation_input_tokens", 0),
                        }
                        logging.info(f"Langfuse: ✅ Extracted usage from ResultMessage for metadata: {usage_dict} (total_tokens calculated)")
                    else:
                        logging.warning(
                            f"Langfuse: ⚠️ NO USAGE DATA FOUND in result_payload! "
                            f"usage_data={usage_data}, type={type(usage_data)}. "
                            f"This means the Claude SDK's ResultMessage did not include usage information. "
                            f"Session summary generation will NOT be created, and automatic cost calculation will NOT work. "
                            f"Check if the Claude SDK version supports usage tracking."
                        )

                    # CRITICAL: Create a session summary generation with usage_details for cost tracking
                    # This enables Langfuse to automatically calculate costs using custom Claude model pricing
                    # Reference: https://langfuse.com/docs/observability/features/token-and-cost-tracking
                    if usage_dict:
                        logging.info("Langfuse: ✅ Creating session_summary generation with usage_details for auto-cost calculation")
                        try:
                            # Use the model captured from track_generation() calls
                            # Falls back to environment variable if no generations were tracked
                            model_name = self.configured_model or os.getenv('LLM_MODEL', 'claude-3-5-sonnet-20241022')
                            logging.info(f"Langfuse: Using model for session_summary: {model_name}")

                            # EXPLICIT PARENT LINKING: Use trace_context parameter with SDK v3
                            # CRITICAL: Transform Claude SDK field names to Langfuse generic format
                            # Claude SDK uses: "input_tokens", "output_tokens" (total_tokens calculated above)
                            # Langfuse expects: "input", "output", "total"
                            usage_details_dict = {
                                "input": usage_dict.get("input_tokens", 0),
                                "output": usage_dict.get("output_tokens", 0),
                                "total": usage_dict.get("total_tokens", 0),  # Calculated value (input + output)
                                "cache_read_input_tokens": usage_dict.get("cache_read_input_tokens", 0),
                                "cache_creation_input_tokens": usage_dict.get("cache_creation_input_tokens", 0),
                            }
                            logging.info(f"Langfuse: Creating session_summary with usage_details: {usage_details_dict}")

                            # Create separate trace for session summary
                            # All traces automatically grouped by session_id via propagate_attributes
                            logging.debug(f"Langfuse: Creating session_summary as separate trace")

                            with self.langfuse_client.start_as_current_observation(
                                as_type="generation",
                                name="session_summary",
                                model=model_name,
                                input=[{"role": "system", "content": "Session usage summary"}],
                                output=f"Session completed with {result_payload.get('num_turns')} turns",
                                metadata={
                                    "summary": True,
                                    "num_turns": result_payload.get("num_turns"),
                                    "duration_ms": result_payload.get("duration_ms"),
                                    "total_cost_usd": result_payload.get("total_cost_usd"),
                                }
                            ) as generation:
                                # Update with usage_details after creation (SDK v3 pattern)
                                generation.update(usage_details=usage_details_dict)
                            logging.info("Langfuse: session_summary generation created with explicit parent linking")

                            logging.info(
                                f"Langfuse: ✅ SUCCESS - Created session_summary generation with usage_details: "
                                f"input={usage_dict.get('input_tokens', 0)}, "
                                f"output={usage_dict.get('output_tokens', 0)}, "
                                f"total={usage_dict.get('total_tokens', 0)}, "
                                f"cache_read={usage_dict.get('cache_read_input_tokens', 0)}, "
                                f"cache_creation={usage_dict.get('cache_creation_input_tokens', 0)} "
                                f"for model {model_name}. "
                                f"Langfuse will automatically calculate cost using custom model pricing."
                            )
                        except Exception as gen_err:
                            logging.error(f"Langfuse: ❌ FAILED to create summary generation with usage_details: {gen_err}", exc_info=True)
                    else:
                        logging.error(
                            f"Langfuse: ❌ SKIPPING session_summary generation because usage_dict is None/empty. "
                            f"Without this generation, Langfuse CANNOT calculate costs automatically. "
                            f"Root cause: result_payload['usage'] was {usage_data} (expected dict with input_tokens, output_tokens, etc.)"
                        )

                # Exit propagate_attributes context
                if self._propagate_ctx:
                    self._propagate_ctx.__exit__(None, None, None)
                    logging.info("Langfuse propagate_attributes context exited")

                # Flush to ensure all data is sent
                # Use 30s timeout to handle network latency and batch uploads
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
                logging.error(f"Failed to complete Langfuse session trace: {e}", exc_info=True)

    async def cleanup_on_error(self, error: Exception) -> None:
        """Finalize trace on error and flush observability data (error path).

        Exits propagate_attributes context and flushes data.

        Args:
            error: Exception that caused the failure
        """
        # Cleanup and flush
        if self.langfuse_client:
            try:
                # Exit propagate_attributes context
                if self._propagate_ctx:
                    self._propagate_ctx.__exit__(None, None, None)
                    logging.info("Langfuse propagate_attributes context exited (error path)")

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
                logging.error(f"Failed to cleanup Langfuse trace: {cleanup_err}", exc_info=True)
