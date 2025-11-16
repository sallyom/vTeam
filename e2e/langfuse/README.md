# Observability with Langfuse

## Overview

**Langfuse** is the observability platform for the vTeam/Ambient Code Platform. All traces are sent to Langfuse and appear in a unified trace hierarchy:

- **Langfuse SDK spans**: LLM-specific observability (prompts, responses, generations, tool executions with full I/O)
- **OpenTelemetry spans**: System-level distributed tracing (session lifecycle, performance metrics, costs)

Both span types automatically nest together in Langfuse because **Langfuse SDK v3 is OpenTelemetry-native**.

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

### Using WorkspaceSettings UI (Recommended)

**All observability configuration is managed via the WorkspaceSettings UI.**

1. **Access WorkspaceSettings** for your project:
   - Navigate to your workspace
   - Go to Settings tab
   - Expand "Observability (Langfuse + OpenTelemetry)" section

2. **Configure Langfuse** (pre-populated with defaults):
   - `LANGFUSE_ENABLED`: `true` (already set)
   - `LANGFUSE_HOST`: `http://langfuse-web.langfuse.svc.cluster.local:3000` (already set)
   - `LANGFUSE_PUBLIC_KEY`: Add your `pk-lf-...` key
   - `LANGFUSE_SECRET_KEY`: Add your `sk-lf-...` key

3. **Save Integration Secrets** - All keys saved to `ambient-non-vertex-integrations`

## How Langfuse Observability Works

```
┌─────────────────────────────────────────────────┐
│  Runner Pod                                     │
├─────────────────────────────────────────────────┤
│  Langfuse SDK v3 (OTEL-native)                 │
│       ↓ creates                                 │
│  • Session span (Langfuse API)                  │
│  • Tool spans (Read, Write, Bash...)           │
│  • Generation spans (Claude responses)          │
│                                                 │
│  OpenTelemetry SDK                              │
│       ↓ creates                                 │
│  • Session span (system-level)                  │
│  • Tool decision events                         │
│  • Performance metrics                          │
│                                                 │
│  Both span sources ──────────────────────────┐ │
└──────────────────────────────────────────────┼─┘
                                               ↓
                    Langfuse OTLP Endpoint
                /api/public/otel/v1/traces
                (HTTP/protobuf + Basic Auth)
                                               ↓
                         Langfuse Backend
                                               ↓
                    ┌─────────────────────────┐
                    │  Unified Trace View     │
                    ├─────────────────────────┤
                    │ claude_agent_session    │ ← Main span
                    │   ├─ tool_Read         │ ← Langfuse SDK
                    │   ├─ tool_Write        │ ← Langfuse SDK
                    │   ├─ claude_response   │ ← Langfuse SDK
                    │   └─ Performance data  │ ← OTEL SDK
                    └─────────────────────────┘
```

### Key Points

1. **Auto-configuration**: Runner automatically derives OTLP endpoint from `LANGFUSE_HOST`
2. **Basic Auth**: Runner automatically adds `Authorization: Basic {base64(public_key:secret_key)}` header
3. **Protocol**: HTTP/protobuf (Langfuse's OTLP ingestion endpoint)
4. **Context propagation**: OpenTelemetry automatically nests spans within same trace

## Trace Structure

### Langfuse SDK Spans

1. **Session Span** - Main span for entire Claude session
   - Input: Original prompt
   - Output: Final results with cost/token metrics
   - Metadata: session ID, namespace

2. **Tool Spans** - Child spans for each tool execution
   - Input: Tool parameters (full detail)
   - Output: Tool results (truncated to 500 chars)
   - Metadata: tool name, ID, turn number

3. **Generation Spans** - Claude's text responses
   - Input: Turn number
   - Output: Claude text (truncated to 1000 chars)
   - Metadata: Model, turn number

### OpenTelemetry Spans

1. **Session Span** - System-level span matching session
   - Attributes: session ID, namespace, prompt length
   - Final attributes: cost, tokens, turns, duration, subtype

2. **Tool Events** - Events on session span
   - `claude_code.tool_decision`: tool name, tool ID
   - `claude_code.tool_result`: tool use ID, error status

## Viewing Traces

1. Open Langfuse UI: https://langfuse-langfuse.apps.<your-cluster>
2. Navigate to your project
3. View traces by session ID
4. Drill down to see:
   - **Langfuse spans**: Full tool I/O, generation content
   - **OTEL spans**: Performance metrics, costs, tokens
   - All in one unified hierarchy!

## Configuration Details

All environment variables are stored in the `ambient-non-vertex-integrations` secret:

### Required Keys

```yaml
LANGFUSE_PUBLIC_KEY: "pk-lf-..."
LANGFUSE_SECRET_KEY: "sk-lf-..."
```

### Pre-configured (Optional to Override)

```yaml
LANGFUSE_ENABLED: "true"
LANGFUSE_HOST: "http://langfuse-web.langfuse.svc.cluster.local:3000"
OTEL_SERVICE_NAME: "claude-code-runner"  # Dynamically set to claude-{session-id}
```

## Updating Configuration

To update your observability settings:

1. Go to WorkspaceSettings → Settings → Observability
2. Update Langfuse keys or other settings
3. Click "Save Integration Secrets"
4. New sessions use updated config immediately

## Multi-Project Setup

Each project namespace can have its own `ambient-non-vertex-integrations` secret with different Langfuse keys for per-project isolation and cost tracking.

## Why Langfuse?

**Benefits of Langfuse for AI observability:**

✅ **Single source of truth**: All traces in one unified platform
✅ **Automatic correlation**: Langfuse SDK and OTEL spans auto-nest via context propagation
✅ **Simple setup**: Only Langfuse keys needed, no additional infrastructure
✅ **LLM-optimized UI**: Designed specifically for LLM observability with prompt/response tracking
✅ **Cost efficiency**: Built-in OTLP ingestion, no separate collector needed
✅ **Rich insights**: Combines LLM-specific data (prompts, tokens, costs) with system-level tracing

## References

- Langfuse Documentation: https://langfuse.com/docs
- Langfuse OTLP Integration: https://langfuse.com/integrations/native/opentelemetry
- Langfuse Python SDK v3: https://langfuse.com/changelog/2025-05-23-otel-based-python-sdk
- Ambient Code Observability: See `components/runners/claude-code-runner/wrapper.py`
