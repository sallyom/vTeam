# Langfuse Instrumentation Debug Notes

This document tracks all approaches attempted to fix Langfuse trace nesting and token usage tracking for the vTeam Claude Code runner.

## Goal

Create properly nested Langfuse traces with:
1. Single trace named `claude_agent_session` visible in Langfuse UI
2. All observations (generations, tool spans) nested as children under the root trace
3. Token usage and cost data visible in observations
4. Proper input/output data on all observations

## SDK Context

- **SDK Version**: Langfuse Python SDK v3 (OpenTelemetry-based)
- **Key Differences from v2**:
  - No `.generation()` or `.span()` methods (those are v2 API)
  - Uses `start_as_current_observation(as_type="generation"|"span")` instead
  - OpenTelemetry context propagation for parent-child relationships
  - Explicit parent linking via `trace_context` parameter

## Available SDK v3 Methods

From `dir(langfuse_client)`:
- `start_as_current_span()` - Create span in current OTel context
- `start_as_current_observation()` - Create typed observation (generation/span) in current context
- `start_as_current_generation()` - Create generation in current context
- `start_span()` - Create span with manual lifecycle
- `start_observation()` - Create observation with manual lifecycle
- `start_generation()` - Create generation with manual lifecycle
- `update_current_trace()` - Update trace-level metadata
- `update_current_span()` - Update current span
- `update_current_generation()` - Update current generation
- `get_current_trace_id()` - Get trace ID from OTel context
- `get_current_observation_id()` - Get observation ID from OTel context
- `propagate_attributes()` - Set user_id/session_id/tags in OTel context

**Notable absence**: No `.trace()` method exists in SDK v3

## Approaches Attempted

### Attempt 1: SDK v2 API - `.generation()` method
**Commit**: ebbbe6e (explicit parent linking attempt)
**Approach**: Used `self.langfuse_client.generation(trace_id=..., parent_observation_id=...)`
**Result**: ❌ `AttributeError: 'Langfuse' object has no attribute 'generation'`
**Root Cause**: `.generation()` is SDK v2 API, doesn't exist in v3

### Attempt 2: SDK v3 with parent_span_id
**Commit**: a3d4cbc
**Approach**:
- Root: `start_span()` to get trace_id and span id
- Children: `start_as_current_observation(trace_context={"trace_id": ..., "parent_span_id": ...})`
**Result**: ❌ Observations appeared as separate traces without nesting
**User Feedback**: "I don't see a claude_agent_session trace I only see the claude_response_turn_x listed as a trace but with no usage data!"
**Root Cause**: `parent_span_id` in trace_context doesn't properly link to root span

### Attempt 3: `.trace()` method
**Commit**: 528bd9d
**Approach**: Used `self.langfuse_client.trace()` for root container
**Result**: ❌ `AttributeError: 'Langfuse' object has no attribute 'trace'`
**Root Cause**: `.trace()` method doesn't exist in SDK v3

### Attempt 4: `start_as_current_span()` with context manager
**Commit**: ee8e56d
**Approach**:
- Root: `start_as_current_span()` with `__enter__()` to activate OTel context
- Get trace_id from `get_current_trace_id()` after entering context
- Children: `start_as_current_observation(trace_context={"trace_id": ...})`
- Cleanup: `__exit__()` on both root span and propagate_attributes contexts
**Status**: ❌ **FAILED** - Observations created separate unnamed traces
**Result**: User reported 3 traces instead of 1:
  1. First `claude_agent_session` trace (initial)
  2. Second `claude_agent_session` trace
  3. **Third UNNAMED trace** ← All new observations (turns 2+) went here
**Root Cause**: Missing `trace_context` parameter in child observation calls!
  - Lines 327-334: `track_generation()` called `start_as_current_observation()` WITHOUT trace_context
  - Lines 353-361: `track_tool_use()` called `start_as_current_observation()` WITHOUT trace_context
  - Lines 530-542: `finalize()` session_summary called `start_as_current_observation()` WITHOUT trace_context
  - Code had comments saying "Use OTel context propagation - we're already inside root span context"
  - BUT context doesn't persist across async boundaries in long-running sessions!

### Attempt 5: Explicit trace_context on ALL child observations (CURRENT)
**Commit**: TBD (this fix)
**Approach**:
- Root: Same as Attempt 4 - `start_as_current_span()` with `__enter__()`, capture trace_id
- Children: **ALWAYS** pass `trace_context={"trace_id": self._trace_id}` to ALL observation calls:
  - `track_generation()`: Line 335 - Added trace_context parameter
  - `track_tool_use()`: Line 368 - Added trace_context parameter
  - `finalize()` session_summary: Line 554 - Added trace_context parameter
- Cleanup: Same as Attempt 4
**Status**: 🔄 Testing in progress
**Expected Outcome**: All observations nest under single `claude_agent_session` trace, no unnamed traces
**Rationale**: OpenTelemetry context is NOT reliable for async/long-running sessions. Must use explicit parent linking via trace_context parameter on EVERY child observation creation.

## Previous Session Attempts (Before This Session)

The user mentioned ~500 commits of debugging across two branches. Previous attempts from earlier sessions included:

1. **OpenTelemetry context attach/detach** - Context didn't persist across async boundaries
2. **Using parent span methods** - Didn't create proper nesting
3. **Using client methods** - Various issues with trace visibility
4. **Different trace naming strategies** - Traces still appeared unnamed or separate
5. **start_as_current_span without explicit parent linking** - Observations created separate traces

## Known Issues

1. **OpenTelemetry Context Doesn't Persist**:
   - Context doesn't reliably propagate across async boundaries in long-running sessions
   - Attempting explicit parent linking via `trace_context` parameter instead

2. **Usage Field Name Transformation Required**:
   - Claude SDK format: `input_tokens`, `output_tokens`, `total_tokens`
   - Langfuse format: `input`, `output`, `total`
   - Must transform field names for cost calculation to work

3. **Trace Visibility**:
   - Even when observations are created, they often appear as separate unnamed traces
   - Root trace often doesn't appear in UI or has no name
   - Child observations don't nest under root

## Current Implementation Details

### Root Span Creation (Attempt 5 - CURRENT)
```python
# Step 1: Set user/session attributes in OTel context
self._propagate_ctx = self.langfuse_client.propagate_attributes(
    user_id=self.user_id,
    session_id=self.session_id,
    tags=["claude_agent_session"],
    metadata={...}
)
self._propagate_ctx.__enter__()

# Step 2: Create root span with context manager
self._root_span_ctx = self.langfuse_client.start_as_current_span(
    name="claude_agent_session",
    input={"prompt": prompt[:1000]},
    metadata={...}
)
self._root_span = self._root_span_ctx.__enter__()

# Step 3: Get trace_id from active context - CRITICAL for explicit parent linking!
self._trace_id = self.langfuse_client.get_current_trace_id()

# Step 4: Update root span (not trace - root span IS the trace in SDK v3)
self._root_span.update(
    name="claude_agent_session",
    input={"prompt": prompt[:1000]}
)
```

### Child Observation Creation (Attempt 5 - CURRENT)
```python
# CRITICAL: ALWAYS pass trace_context for explicit parent linking
# OTel context doesn't persist across async boundaries in long-running sessions!
trace_context = {"trace_id": self._trace_id}

with self.langfuse_client.start_as_current_observation(
    as_type="generation",
    name=f"claude_response_turn_{turn_count}",
    input=[{"role": "user", "content": f"Turn {turn_count}"}],
    model=model,
    metadata={"turn": turn_count},
    trace_context=trace_context  # ← REQUIRED! Don't rely on OTel context!
) as generation:
    generation.update(output=output_text)
```

### Tool Span Creation (Attempt 5 - CURRENT)
```python
# CRITICAL: ALWAYS pass trace_context for explicit parent linking
trace_context = {"trace_id": self._trace_id}

tool_span_ctx = self.langfuse_client.start_as_current_observation(
    as_type="span",
    name=f"tool_{tool_name}",
    input=tool_input,
    metadata={"tool_id": tool_id, "tool_name": tool_name},
    trace_context=trace_context  # ← REQUIRED! Don't rely on OTel context!
)
tool_span = tool_span_ctx.__enter__()
```

### Session Summary with Usage (Attempt 5 - CURRENT)
```python
usage_details_dict = {
    "input": usage_dict.get("input_tokens", 0),
    "output": usage_dict.get("output_tokens", 0),
    "total": usage_dict.get("total_tokens", 0),
    "cache_read_input_tokens": usage_dict.get("cache_read_input_tokens", 0),
    "cache_creation_input_tokens": usage_dict.get("cache_creation_input_tokens", 0),
}

# CRITICAL: ALWAYS pass trace_context for explicit parent linking
trace_context = {"trace_id": self._trace_id}

with self.langfuse_client.start_as_current_observation(
    as_type="generation",
    name="session_summary",
    model=model_name,
    usage=usage_details_dict,  # Note: "usage" not "usage_details"
    trace_context=trace_context  # ← REQUIRED! Don't rely on OTel context!
) as generation:
    pass
```

## Debugging Tips

1. **Check Available Methods**: Use `dir(langfuse_client)` to verify method existence before using
2. **Check Logs**: Look for "Langfuse: Root span created - trace_id=..." to verify trace_id is captured
3. **Verify Usage Data**: Check logs for "Built result_payload with usage:" to confirm data extraction
4. **Check Langfuse UI**: Look for trace name, nesting structure, and usage visibility
5. **Test Incrementally**: Test each commit separately to isolate issues

## Next Steps If Attempt 4 Fails

1. **Try Manual Trace Creation**: Create trace-level object explicitly (if SDK v3 supports it)
2. **Use SDK v2**: Downgrade to Langfuse SDK v2 which has simpler `.generation()` API
3. **Separate Traces**: Abandon nesting, create separate traces per interaction with usage data
4. **Contact Langfuse Support**: SDK v3 nesting with long-running async sessions may need SDK fixes

## References

- Langfuse SDK v3 docs: https://langfuse.com/docs/sdk/python
- Token & cost tracking: https://langfuse.com/docs/observability/features/token-and-cost-tracking
- OpenTelemetry context: https://opentelemetry.io/docs/instrumentation/python/manual/
