# Langfuse Trace Fragmentation Fix - Summary

## Problem

User reported getting 3 separate traces instead of 1 unified trace:
1. First `claude_agent_session` trace (from initialization)
2. Second `claude_agent_session` trace
3. **Third UNNAMED trace** ← All subsequent observations (turn 2, 3, 4...) went here

This is a classic OpenTelemetry context propagation failure in long-running async sessions.

## Root Cause

The code was relying on OpenTelemetry context propagation for parent-child relationships, but **OTel context does NOT persist across async boundaries** in long-running sessions.

### The Broken Code Pattern

In `observability.py`, three critical observation creation points were missing the `trace_context` parameter:

1. **`track_generation()` (line 327-334)**:
   ```python
   # WRONG - relies on OTel context
   with self.langfuse_client.start_as_current_observation(
       as_type="generation",
       name=f"claude_response_turn_{turn_count}",
       # ... other params ...
   ) as generation:
   ```

2. **`track_tool_use()` (line 353-361)**:
   ```python
   # WRONG - relies on OTel context
   tool_span_ctx = self.langfuse_client.start_as_current_observation(
       as_type="span",
       name=f"tool_{tool_name}",
       # ... other params ...
   )
   ```

3. **`finalize()` session_summary (line 530-542)**:
   ```python
   # WRONG - relies on OTel context
   with self.langfuse_client.start_as_current_observation(
       as_type="generation",
       name="session_summary",
       # ... other params ...
   ) as generation:
   ```

All three had comments like:
```python
# Use OTel context propagation - we're already inside root span context
# No need for explicit trace_context since start_as_current_span created the context
```

**This assumption was WRONG for async sessions!**

## The Fix

Added explicit `trace_context` parameter to ALL child observation creation calls.

### The Correct Code Pattern

1. **`track_generation()` (line 323-337)**:
   ```python
   # CORRECT - explicit parent linking
   trace_context = {"trace_id": self._trace_id}

   with self.langfuse_client.start_as_current_observation(
       as_type="generation",
       name=f"claude_response_turn_{turn_count}",
       model=model,
       metadata={"turn": turn_count},
       trace_context=trace_context  # ← CRITICAL!
   ) as generation:
       generation.update(output=output_text)
   ```

2. **`track_tool_use()` (line 355-373)**:
   ```python
   # CORRECT - explicit parent linking
   trace_context = {"trace_id": self._trace_id}

   tool_span_ctx = self.langfuse_client.start_as_current_observation(
       as_type="span",
       name=f"tool_{tool_name}",
       input=tool_input,
       metadata={"tool_id": tool_id, "tool_name": tool_name},
       trace_context=trace_context  # ← CRITICAL!
   )
   ```

3. **`finalize()` session_summary (line 537-558)**:
   ```python
   # CORRECT - explicit parent linking
   trace_context = {"trace_id": self._trace_id}

   with self.langfuse_client.start_as_current_observation(
       as_type="generation",
       name="session_summary",
       model=model_name,
       usage=usage_details_dict,
       trace_context=trace_context  # ← CRITICAL!
   ) as generation:
       pass
   ```

## Key Insight

The `trace_id` is already captured during initialization (line 216):
```python
self._trace_id = self.langfuse_client.get_current_trace_id()
```

But it was NOT being used for explicit parent linking in child observations!

**Why this matters:**
- OpenTelemetry context is activated in `_init_langfuse()` via `self._root_span_ctx.__enter__()`
- This context is ONLY active within that specific call stack
- When async execution calls `track_generation()` later, the OTel context is GONE
- Without explicit `trace_context`, the SDK creates a NEW trace (the unnamed trace)

## Expected Outcome

After this fix:
- ✅ All observations nest under the SAME `claude_agent_session` trace
- ✅ No unnamed third trace is created
- ✅ Observations from turn 2, 3, 4... all show as children of the root span
- ✅ Token usage and cost tracking work correctly (already implemented)

## Files Changed

1. `/workspace/sessions/agentic-session-1763837634/workspace/vTeam/components/runners/claude-code-runner/observability.py`
   - Line 323-337: Added trace_context to `track_generation()`
   - Line 355-373: Added trace_context to `track_tool_use()`
   - Line 537-558: Added trace_context to `finalize()` session_summary

2. `/workspace/sessions/agentic-session-1763837634/workspace/vTeam/components/runners/claude-code-runner/LANGFUSE_DEBUG_NOTES.md`
   - Documented Attempt 4 failure
   - Added Attempt 5 with current fix
   - Updated implementation details with correct patterns

## Testing

To verify the fix works:

1. Create a new AgenticSession with Langfuse enabled
2. Let it run for multiple turns (3+)
3. Check Langfuse UI for:
   - Single trace named `claude_agent_session`
   - All `claude_response_turn_X` generations nested under the root trace
   - All tool spans nested under the root trace
   - `session_summary` generation nested under the root trace
   - No unnamed traces

## Lessons Learned

**NEVER rely on OpenTelemetry context propagation for async/long-running operations!**

When using Langfuse SDK v3 with async execution:
- ALWAYS capture `trace_id` during initialization
- ALWAYS pass `trace_context={"trace_id": self._trace_id}` to child observations
- Do NOT assume OTel context persists across async boundaries

This is a fundamental limitation of OpenTelemetry context in async Python, not a Langfuse SDK bug.
