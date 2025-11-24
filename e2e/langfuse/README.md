# Observability with Langfuse

## Overview

**Langfuse** is the observability platform for the vTeam/Ambient Code Platform. All traces are sent to Langfuse for LLM-specific observability:

- **Session context**: Propagated metadata (user, session, model) across all observations
- **Turn-level generations**: Each Claude interaction (`claude_turn_X`) with accurate token/cost tracking
- **Tool spans**: Tool executions (Read, Write, Bash, etc.) for visibility (no token/cost data)

## Prerequisites

1. **Langfuse deployed** on your cluster
   - Run: `../scripts/deploy-langfuse.sh`
   - Verify: `oc get pods -n langfuse`

2. **Langfuse API keys** generated
   - Access Langfuse UI: https://langfuse-langfuse.apps.<your-cluster>
   - Create organization and project
   - Generate API keys: Settings → API Keys

3. **OpenShift CLI** (`oc`) or **Kubernetes CLI** (`kubectl`) installed and logged in

## Quick Start

### Platform-Wide Configuration (Platform Admin Only)

**IMPORTANT**: Langfuse observability is configured by **platform administrators**, not individual workspace users. All LANGFUSE_* configuration is stored in a single secret for consistency and security.

#### Step 1: Create the Secret

Create the `ambient-admin-langfuse-secret` secret with all Langfuse configuration:

```bash
kubectl create secret generic ambient-admin-langfuse-secret \
  --from-literal=LANGFUSE_PUBLIC_KEY=pk-lf-... \
  --from-literal=LANGFUSE_SECRET_KEY=sk-lf-... \
  --from-literal=LANGFUSE_HOST=http://langfuse-web.langfuse.svc.cluster.local:3000 \
  --from-literal=LANGFUSE_ENABLED=true \
  -n ambient-code
```

#### Step 2: Restart the Operator

```bash
kubectl rollout restart deployment ambient-operator -n ambient-code
```

#### Step 3: Verify

All new sessions will automatically have Langfuse observability enabled. Check runner pod logs:

```bash
kubectl logs -n <workspace-namespace> <runner-pod> -c ambient-code-runner | grep Langfuse
```

### Per-Workspace Configuration (Not Supported)

Per-workspace Langfuse configuration is **not supported**. Observability must be consistent across the platform for proper cost tracking and compliance. All LANGFUSE_* configuration is managed by platform administrators via the `ambient-admin-langfuse-secret` secret.

If you need workspace-specific tracking, use Langfuse's built-in tagging and filtering features instead.

## How Langfuse Observability Works

```
┌─────────────────────────────────────────────────┐
│  Runner Pod                                     │
├─────────────────────────────────────────────────┤
│  Langfuse SDK v3 + propagate_attributes        │
│       ↓ creates                                 │
│  • Session context (user, session, model)       │
│  • Turn generations (claude_turn_1, 2, 3...)   │
│  • Tool spans (visibility only, no tokens)     │
│                                                 │
│  All observations ──────────────────────────────┐│
└─────────────────────────────────────────────────┼┘
                                                  ↓
                        Langfuse HTTP API
                    /api/public/ingestion
                    (HTTP/JSON with API keys)
                                                  ↓
                       Langfuse Backend
                                                  ↓
                  ┌─────────────────────────┐
                  │  Unified Trace View     │
                  ├─────────────────────────┤
                  │ Session: xyz            │ ← Grouped by session_id
                  │   ├─ claude_turn_1     │ ← First interaction (with tokens)
                  │   │   ├─ tool_Read    │ ← Tool visibility (no tokens)
                  │   │   └─ tool_Write   │ ← Tool visibility (no tokens)
                  │   ├─ claude_turn_2     │ ← Second interaction (with tokens)
                  │   └─ Total cost       │ ← Aggregated metrics
                  └─────────────────────────┘
```

### Key Points

1. **Hybrid tracking**: Turn-level generations have token/cost data, tool spans provide visibility only
2. **Model metadata**: Model information propagated to all observations via `propagate_attributes`
3. **Sequential turns**: Proper turn counting (1, 2, 3...) regardless of tool usage
4. **No double counting**: Tools don't add tokens - they're already counted in the Claude turn that uses them

## Trace Structure

### Session Context (Propagated via `propagate_attributes`)

All observations inherit these attributes:

- **user_id**: User identifier for cost allocation
- **session_id**: Kubernetes session name for grouping
- **tags**: `["claude-code", "namespace:X", "model:Y"]`
- **metadata**:
  - `namespace`: Project namespace
  - `user_name`: User display name
  - `model`: Model being used (e.g., `claude-sonnet-4-5@20250929`)
  - `initial_prompt`: First 200 chars of prompt

### Turn-Level Generations

**Name**: `claude_turn_X` (e.g., `claude_turn_1`, `claude_turn_2`, etc.)

- **Type**: Generation (with usage tracking)
- **Input**: Turn context
- **Output**: Claude's complete response for this turn
- **Model**: Specific model used (inherited from session)
- **Usage**: Canonical format for accurate cost calculation
  - `input`: Regular input tokens
  - `output`: Output tokens
  - `cache_read_input_tokens`: Cache hits (90% discount)
  - `cache_creation_input_tokens`: Cache writes (25% premium)
- **Metadata**:
  - `turn`: Turn number (sequential: 1, 2, 3...)

### Tool Spans (Visibility Only)

**Name**: `tool_{ToolName}` (e.g., `tool_Read`, `tool_Write`, `tool_Bash`)

- **Type**: Span (no usage tracking)
- **Input**: Tool parameters (full detail)
- **Output**: Tool results (truncated to 500 chars)
- **Metadata**:
  - `tool_id`: Unique ID for this tool use
  - `tool_name`: Tool name (Read, Write, etc.)
- **No Usage Data**: Tools are local operations, tokens already counted in parent turn

## Viewing Traces

1. Open Langfuse UI: https://langfuse-langfuse.apps.<your-cluster>
2. Navigate to your project
3. Filter by:
   - **Session ID**: View all turns for a specific session
   - **Model tag**: Filter by `model:claude-sonnet-4-5@20250929` etc.
   - **User**: Track usage by user_id
4. Observe:
   - **Sequential turns**: `claude_turn_1`, `claude_turn_2`, etc. in order
   - **Tool visibility**: See which tools were used (without inflating costs)
   - **Accurate costs**: Token counts only on turn generations
   - **Model metadata**: Which model was used for each session

## Configuration Details

### Platform Admin Secret (`ambient-admin-langfuse-secret`)

All Langfuse configuration is stored in a single secret managed by platform administrators:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: ambient-admin-langfuse-secret
  namespace: ambient-code  # operator's namespace
type: Opaque
stringData:
  # Credentials (sensitive)
  LANGFUSE_PUBLIC_KEY: "pk-lf-..."
  LANGFUSE_SECRET_KEY: "sk-lf-..."

  # Configuration
  LANGFUSE_HOST: "http://langfuse-web.langfuse.svc.cluster.local:3000"
  LANGFUSE_ENABLED: "true"
```

**Note**: This secret is platform-wide and cannot be overridden per-workspace. For workspace-specific tracking, use Langfuse's tags and filters.

## Updating Configuration

### Platform-Wide Update (Platform Admin Only)

```bash
# Update the secret
kubectl create secret generic ambient-admin-langfuse-secret \
  --from-literal=LANGFUSE_PUBLIC_KEY=pk-lf-new-key \
  --from-literal=LANGFUSE_SECRET_KEY=sk-lf-new-key \
  --from-literal=LANGFUSE_HOST=http://langfuse-web.langfuse.svc.cluster.local:3000 \
  --from-literal=LANGFUSE_ENABLED=true \
  -n ambient-code \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart operator to pick up changes
kubectl rollout restart deployment ambient-operator -n ambient-code
```

### Per-Project Update

1. Go to WorkspaceSettings → Settings → Observability
2. Update Langfuse keys
3. Click "Save Integration Secrets"
4. New sessions use updated config immediately

## Multi-Project Setup

**Platform-wide configuration**: All projects share the same Langfuse instance and keys.

**Per-project configuration**: Each project namespace can have its own `ambient-non-vertex-integrations` secret with different Langfuse keys for per-project isolation and cost tracking.

## Implementation Details

### Our Approach

The vTeam Langfuse integration uses a **hybrid tracking approach**:

1. **Turn-level generations** (`claude_turn_X`): Track actual API calls with token/cost data
2. **Tool spans** (`tool_*`): Provide visibility without token data (prevents double counting)
3. **Session context**: Use `propagate_attributes` to ensure consistent metadata across all observations

### Key Fixes Applied

- **Sequential turn numbering**: Fixed bug where turn count would jump (e.g., 1→30) due to incorrect tool counting
- **Model metadata tracking**: Model information now propagated at session level via tags and metadata
- **No token inflation**: Tool spans don't report usage, preventing cost duplication

## Why Langfuse?

**Benefits of Langfuse for AI observability:**

✅ **LLM-optimized**: Designed specifically for LLM observability with prompt/response tracking
✅ **Simple setup**: Only Langfuse keys needed, no additional infrastructure
✅ **Cost tracking**: Built-in token and cost calculation for Claude API usage
✅ **Rich insights**: Full tool I/O, generation content, and performance metrics
✅ **Easy debugging**: Trace view shows exact sequence of tool calls and responses
✅ **Multi-user support**: Track usage by user_id for cost allocation

## References

- Langfuse Documentation: https://langfuse.com/docs
- Langfuse Python SDK v3: https://langfuse.com/docs/sdk/python
- Ambient Code Observability: See `components/runners/claude-code-runner/observability.py`
