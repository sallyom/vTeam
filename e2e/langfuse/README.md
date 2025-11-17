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
2. **API Key auth**: Runner automatically receives all LANGFUSE_* config from `ambient-admin-langfuse-secret` secret
3. **Automatic nesting**: Child spans (tools, generations) attach to parent session span via SDK context

## Trace Structure

### Session Span (Root)

**Name**: `claude_agent_session`

- **Input**: Original prompt from user
- **Output**: Final results with cost/token metrics
- **Trace-level attributes** (filterable):
  - `user_id`: User identifier (for cost allocation, may be `None`)
  - `session_id`: Kubernetes session name
  - `tags`: `["ambient-code", "agentic-session:{session_id}"]`
- **Metadata** (contextual):
  - `namespace`: Project namespace
  - `user_name`: User display name (if available)

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

## User Tracking

### Overview

Langfuse 3.0 SDK automatically tracks user context for **cost allocation** and **usage analytics** across multi-user environments. User tracking is **optional** and gracefully degrades when user information is unavailable.

### How User ID is Added to Traces

User information flows through the platform as follows:

```
OAuth Proxy (OpenShift)
    ↓ X-Forwarded-User header
Backend Middleware
    ↓ Extracts to Gin context
Session Creation Handler
    ↓ Adds to spec.userContext.userId
Operator
    ↓ Sets USER_ID env var in runner pod
Runner Pod (wrapper.py)
    ↓ Sanitizes and validates
ObservabilityManager
    ↓ Sets trace-level user_id
Langfuse Trace (filterable by user)
```

### Trace-Level User Attributes

The implementation uses **Langfuse 3.0 SDK patterns** with `propagate_attributes()` for proper user tracking:

```python
# observability.py:140-150
# CRITICAL: Use propagate_attributes to ensure ALL child spans inherit user context
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

# All child spans created after this will automatically inherit these attributes
```

**Key Features:**
- ✅ **Attribute propagation**: Uses `propagate_attributes()` context manager to ensure inheritance
- ✅ **Automatic inheritance**: ALL child spans/generations inherit user_id, session_id, tags
- ✅ **Observation-level filtering**: Individual spans are filterable by user_id and session_id
- ✅ **Tags for filtering**: `ambient-code` and `agentic-session:{session_id}` tags on all spans
- ✅ **Graceful degradation**: Passes `None` when user_id is unavailable (no errors)

### When User ID is Available

**Scenario 1: OpenShift with OAuth Proxy**
- ✅ `X-Forwarded-User` header present (e.g., `user@example.com`)
- ✅ Backend extracts to `c.Set("userID", ...)`
- ✅ Operator sets `USER_ID` env var in runner pod
- ✅ **Result**: Full user tracking in Langfuse UI

**Scenario 2: Direct API Access (Token-based)**
- ✅ User ID extracted from JWT token claims
- ✅ Backend sets user context from token
- ✅ **Result**: Full user tracking in Langfuse UI

### When User ID is NOT Available

**Scenario 1: Direct API calls (no OAuth proxy)**
- ❌ No `X-Forwarded-User` header
- ❌ `USER_ID` env var not set in pod
- ✅ **Result**: Trace created with `user_id=None`, session still tracked by `session_id`

**Scenario 2: ServiceAccount/Bot access**
- ❌ ServiceAccount tokens don't contain user identity
- ❌ `USER_ID` env var not set
- ✅ **Result**: Trace created with `user_id=None`, session still tracked by `session_id`

**Scenario 3: Non-OpenShift deployments**
- ❌ No OAuth proxy infrastructure
- ❌ `USER_ID` env var not set
- ✅ **Result**: Trace created with `user_id=None`, session still tracked by `session_id`

### Security & Validation

User input is **sanitized** before being added to traces:

```python
# wrapper.py:58
def _sanitize_user_context(user_id: str, user_name: str) -> tuple[str, str]:
    # Validate user_id: alphanumeric, dash, underscore, at sign only
    # Max 255 characters (email addresses can be up to 254 chars)
    sanitized_id = re.sub(r"[^a-zA-Z0-9@._-]", "", user_id)
    # ... removes control characters from user_name
    return sanitized_id, sanitized_name
```

**Protection against:**
- ✅ Trace poisoning attacks
- ✅ Log injection
- ✅ XSS via user input
- ✅ Buffer overflow (255 char limit)

### Filtering Traces by User

In the Langfuse UI or API, you can filter traces by user:

**By User ID:**
```python
traces = langfuse.api.trace.list(user_id="user@example.com")
```

**By Session ID:**
```python
traces = langfuse.api.trace.list(session_id="session-abc-123")
```

**By Tags:**
```python
# All ambient platform traces
traces = langfuse.api.trace.list(tags=["ambient-code"])

# Specific session
traces = langfuse.api.trace.list(tags=["agentic-session:session-abc-123"])
```

### Cost Allocation

With user tracking enabled, you can:

1. **View per-user usage** in Langfuse User Explorer
2. **Track token consumption** by user
3. **Calculate costs** per user or team
4. **Monitor activity** across users

### Summary

| Environment | USER_ID Value | Langfuse Behavior |
|-------------|---------------|-------------------|
| **OpenShift with OAuth** | `user@example.com` | ✅ Full user tracking |
| **OpenShift without OAuth** | `""` (empty) | ✅ Trace created, `user_id=None` |
| **Non-OpenShift** | Not set | ✅ Trace created, `user_id=None` |
| **ServiceAccount** | `""` (empty) | ✅ Trace created, `user_id=None` |

**All scenarios work correctly** - user tracking is an enhancement, not a requirement.

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
