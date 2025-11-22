# Langfuse Trace Fragmentation Fix - Test Plan

## Overview

This test plan verifies that the explicit `trace_context` fix resolves the trace fragmentation issue where observations split across 3 separate traces instead of nesting under a single `claude_agent_session` trace.

## Prerequisites

1. Langfuse instance running and accessible
2. Langfuse secrets configured in Kubernetes:
   - `ambient-admin-langfuse-secret` with keys: `LANGFUSE_ENABLED=true`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`
3. vTeam platform deployed with operator and backend

## Test Case 1: Multi-Turn Session (Primary Test)

**Objective**: Verify all observations nest under single trace in a multi-turn session

**Steps**:
1. Create a new AgenticSession with a prompt that requires multiple Claude interactions
   ```yaml
   apiVersion: vteam.ambient-code/v1alpha1
   kind: AgenticSession
   metadata:
     name: langfuse-trace-test
     namespace: test-project
   spec:
     prompt: |
       Please analyze the following tasks and complete them in order:
       1. List all files in the current directory
       2. Read the README.md file
       3. Create a summary of the project
     repos:
       - input:
           url: https://github.com/example/test-repo
           branch: main
     interactive: false
     model: claude-3-5-sonnet-20241022
   ```

2. Wait for session to complete (check `status.phase: Completed`)

3. Open Langfuse UI and search for traces with session_id matching the AgenticSession name

**Expected Results**:
- ✅ **ONE trace** named `claude_agent_session` visible in trace list
- ✅ Trace contains nested observations:
  - `claude_response_turn_1` (generation)
  - `claude_response_turn_2` (generation)
  - `claude_response_turn_3` (generation)
  - `tool_*` spans (for file operations)
  - `session_summary` (generation)
- ✅ No unnamed traces appear
- ✅ No duplicate `claude_agent_session` traces
- ✅ All observations have the same `trace_id`

**Failure Indicators**:
- ❌ Multiple traces with same session_id
- ❌ Unnamed trace containing observations
- ❌ Observations not nested under root trace
- ❌ `session_summary` in separate trace

## Test Case 2: Tool-Heavy Session

**Objective**: Verify tool spans nest correctly under root trace

**Steps**:
1. Create AgenticSession with a prompt that triggers multiple tool uses
   ```yaml
   spec:
     prompt: |
       Please:
       1. Read all .py files in the src/ directory
       2. Search for TODO comments
       3. Write a summary to todos.md
     repos:
       - input:
           url: https://github.com/example/python-project
           branch: main
   ```

2. Wait for completion

3. Check Langfuse UI

**Expected Results**:
- ✅ Single `claude_agent_session` trace
- ✅ Multiple `tool_Read`, `tool_Grep`, `tool_Write` spans nested under root
- ✅ Each tool span shows input (tool parameters) and output (tool result)
- ✅ Tool spans appear chronologically between generations

## Test Case 3: Long-Running Interactive Session

**Objective**: Verify trace doesn't fragment in long-running async sessions

**Steps**:
1. Create interactive AgenticSession
   ```yaml
   spec:
     interactive: true
     prompt: "Start interactive session"
   ```

2. Send multiple messages via inbox file over extended period (10+ minutes)

3. Check Langfuse UI after each message

**Expected Results**:
- ✅ All observations from all turns nest under SAME trace
- ✅ Observations added to trace as they occur (real-time)
- ✅ No new traces created for subsequent turns
- ✅ `trace_id` remains consistent across all observations

## Test Case 4: Error Handling

**Objective**: Verify trace handling when session encounters errors

**Steps**:
1. Create AgenticSession that will fail (invalid repo URL)

2. Wait for error state

3. Check Langfuse UI

**Expected Results**:
- ✅ Single trace created
- ✅ Root span marked with `level: ERROR`
- ✅ Error details in trace metadata
- ✅ Partial observations (before error) still nested correctly

## Test Case 5: Usage and Cost Tracking

**Objective**: Verify usage data appears correctly in unified trace

**Steps**:
1. Create and complete a multi-turn AgenticSession

2. Open trace in Langfuse UI

3. Check usage and cost data

**Expected Results**:
- ✅ `session_summary` generation shows:
  - `input_tokens` count
  - `output_tokens` count
  - `total_tokens` count (calculated)
  - `cache_read_input_tokens` count
  - `cache_creation_input_tokens` count
- ✅ Langfuse shows auto-calculated cost (if Claude pricing configured)
- ✅ Root span metadata includes usage summary

## Verification Checklist

For each test case, verify in Langfuse UI:

### Trace List View
- [ ] Only ONE trace per session appears
- [ ] Trace name is `claude_agent_session`
- [ ] No unnamed traces

### Trace Detail View
- [ ] Tree structure shows proper nesting:
  ```
  └─ claude_agent_session (span/trace)
     ├─ claude_response_turn_1 (generation)
     │  └─ tool_Read (span)
     ├─ claude_response_turn_2 (generation)
     │  ├─ tool_Grep (span)
     │  └─ tool_Write (span)
     ├─ claude_response_turn_3 (generation)
     └─ session_summary (generation)
  ```

- [ ] All observations show same `trace_id` in metadata
- [ ] User ID and session ID visible in trace metadata
- [ ] Tags include `claude-code` and `namespace:{project}`

### Observations
- [ ] Each `claude_response_turn_X` generation has:
  - Input: Turn information
  - Output: Claude's response text
  - Model: `claude-3-5-sonnet-20241022`
  - Metadata: `turn` number

- [ ] Each `tool_*` span has:
  - Input: Tool parameters
  - Output: Tool result (truncated if >500 chars)
  - Metadata: `tool_id`, `tool_name`

- [ ] `session_summary` generation has:
  - Input: "Session usage summary"
  - Output: Completion message
  - Usage: All token counts
  - Metadata: `num_turns`, `duration_ms`

### Logs (Runner Pod)
- [ ] Log shows: `Langfuse: Creating generation for turn X with explicit trace_context={'trace_id': '...'}`
- [ ] Log shows: `Langfuse: Creating tool span for {tool} with explicit trace_context={'trace_id': '...'}`
- [ ] Log shows: `Langfuse: Creating session_summary with explicit trace_context={'trace_id': '...'}`
- [ ] No warnings about "No active span in current context"

## Debugging Failed Tests

If observations still appear in separate traces:

1. **Check logs for trace_id**:
   ```bash
   kubectl logs -n {namespace} {pod-name} | grep "trace_id="
   ```
   Verify all observations use the SAME trace_id

2. **Verify Langfuse SDK version**:
   ```bash
   kubectl exec -n {namespace} {pod-name} -- pip show langfuse
   ```
   Should be SDK v3 (OpenTelemetry-based)

3. **Check for OpenTelemetry context warnings**:
   ```bash
   kubectl logs -n {namespace} {pod-name} | grep -i "active span"
   ```
   Should NOT see "No active span in current context" warnings

4. **Verify trace_context is passed**:
   - Check observability.py lines 335, 368, 554
   - Each `start_as_current_observation()` call MUST have `trace_context` parameter

## Success Criteria

The fix is successful if:
1. ✅ All test cases pass verification checklist
2. ✅ No unnamed traces created
3. ✅ No duplicate `claude_agent_session` traces
4. ✅ All observations nest under single trace in all scenarios
5. ✅ Usage tracking works correctly with proper cost calculation

## Rollback Plan

If fix causes regressions:
1. Revert to commit before fix: `git revert HEAD`
2. Observations will split across traces (original issue)
3. Document specific failure mode for further investigation
