# Observability with Langfuse

## Overview

**Langfuse** is the observability platform for the vTeam/Ambient Code Platform. All traces are sent to Langfuse for LLM-specific observability:

- **Session spans**: Full Claude session lifecycle with cost and token metrics
- **Generation spans**: Claude's text responses with prompt/completion tracking
- **Tool spans**: Tool executions (Read, Write, Bash, etc.) with full I/O capture

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

### Platform-Wide Configuration (Recommended)

**Langfuse keys are configured once at deployment time for the entire platform.**

1. **Create the `ambient-langfuse-keys` secret** in the `ambient-code` namespace (or your operator namespace):

```bash
kubectl create secret generic ambient-langfuse-keys \
  --from-literal=LANGFUSE_PUBLIC_KEY=pk-lf-... \
  --from-literal=LANGFUSE_SECRET_KEY=sk-lf-... \
  --from-literal=LANGFUSE_HOST=http://langfuse-web.langfuse.svc.cluster.local:3000 \
  --from-literal=LANGFUSE_ENABLED=true \
  -n ambient-code
```

2. **Restart the operator** to pick up the new secret:

```bash
kubectl rollout restart deployment ambient-operator -n ambient-code
```

3. **All new sessions** will automatically have Langfuse observability enabled!

### Alternative: Per-Project Configuration

If you need per-project Langfuse keys for cost isolation:

1. **Access WorkspaceSettings** for your project:
   - Navigate to your workspace
   - Go to Settings tab
   - Expand "Observability" section

2. **Configure Langfuse keys** in the `ambient-non-vertex-integrations` secret:
   - `LANGFUSE_PUBLIC_KEY`: Add your `pk-lf-...` key
   - `LANGFUSE_SECRET_KEY`: Add your `sk-lf-...` key

Note: Per-project keys override platform-wide keys for that project only.

## How Langfuse Observability Works

```
┌─────────────────────────────────────────────────┐
│  Runner Pod                                     │
├─────────────────────────────────────────────────┤
│  Langfuse SDK v3                                │
│       ↓ creates                                 │
│  • Session span (claude_agent_session)          │
│  • Tool spans (Read, Write, Bash...)           │
│  • Generation spans (Claude responses)          │
│                                                 │
│  All spans ────────────────────────────────────┐│
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
                  │ claude_agent_session    │ ← Session span
                  │   ├─ tool_Read         │ ← Tool execution
                  │   ├─ tool_Write        │ ← Tool execution
                  │   ├─ claude_response   │ ← Claude generation
                  │   └─ Cost & tokens     │ ← Final metrics
                  └─────────────────────────┘
```

### Key Points

1. **Simple integration**: Runner uses Langfuse Python SDK (v3+) for direct HTTP API calls
2. **API Key auth**: Runner automatically adds API keys from `ambient-langfuse-keys` secret
3. **Automatic nesting**: Child spans (tools, generations) attach to parent session span via SDK context

## Trace Structure

### Session Span (Root)

**Name**: `claude_agent_session`

- **Input**: Original prompt from user
- **Output**: Final results with cost/token metrics
- **Metadata**:
  - `session_id`: Kubernetes session name
  - `namespace`: Project namespace
  - `user_id`: User identifier (for multi-user tracking)
  - `user_name`: User display name

### Tool Spans (Children)

**Name**: `tool_{ToolName}` (e.g., `tool_Read`, `tool_Write`, `tool_Bash`)

- **Input**: Tool parameters (full detail)
- **Output**: Tool results (truncated to 500 chars)
- **Metadata**:
  - `tool_id`: Unique ID for this tool use
  - `tool_name`: Tool name (Read, Write, etc.)

### Generation Spans (Children)

**Name**: `claude_response`

- **Input**: Turn number
- **Output**: Claude's text response (truncated to 1000 chars)
- **Metadata**:
  - `model`: Model name (e.g., `claude-3-5-sonnet-20241022`)
  - `turn`: Turn number in conversation
- **Usage**: Token counts for cost tracking
  - `input`: Input tokens
  - `output`: Output tokens
  - `cache_read_input_tokens`: Cache hits (if applicable)
  - `cache_creation_input_tokens`: Cache writes (if applicable)

## Viewing Traces

1. Open Langfuse UI: https://langfuse-langfuse.apps.<your-cluster>
2. Navigate to your project
3. View traces by session ID or timestamp
4. Drill down to see:
   - **Full tool I/O**: Complete input/output for each tool execution
   - **Generation content**: Claude's responses with token breakdown
   - **Cost tracking**: Total cost and per-generation costs
   - **Session metrics**: Total tokens, turns, duration

## Configuration Details

### Platform-Wide Secret (`ambient-langfuse-keys`)

Created at deployment time in the operator's namespace:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: ambient-langfuse-keys
  namespace: ambient-code
type: Opaque
stringData:
  LANGFUSE_PUBLIC_KEY: "pk-lf-..."
  LANGFUSE_SECRET_KEY: "sk-lf-..."
  LANGFUSE_HOST: "http://langfuse-web.langfuse.svc.cluster.local:3000"
  LANGFUSE_ENABLED: "true"
```

### Per-Project Secret (Optional, `ambient-non-vertex-integrations`)

For project-specific Langfuse keys:

```yaml
LANGFUSE_PUBLIC_KEY: "pk-lf-..."
LANGFUSE_SECRET_KEY: "sk-lf-..."
```

Note: `LANGFUSE_HOST` and `LANGFUSE_ENABLED` are configured platform-wide and cannot be overridden per-project.

## Updating Configuration

### Platform-Wide Update

```bash
# Update the secret
kubectl create secret generic ambient-langfuse-keys \
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
