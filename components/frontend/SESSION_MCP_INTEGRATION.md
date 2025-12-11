# Session-Scoped MCP Integrations

This document describes the session-scoped MCP integration approach for Google Drive and other MCP services.

## Overview

Users can connect OAuth-enabled MCP services (like Google Drive) directly from the **session UI page**, creating short-lived, session-scoped credentials. This approach provides better multi-tenant security compared to global credentials.

## Architecture Decision: Session-Scoped vs Global

### Why Session-Scoped?

**Security Benefits:**
- ✅ **Multi-tenant Safe**: Credentials live only in the session's PVC, isolated per pod
- ✅ **Short-Lived**: Credentials deleted when session ends (automatic cleanup)
- ✅ **User Control**: Explicit opt-in per session (privacy-conscious)
- ✅ **No Cross-Session Access**: Impossible for credentials to leak to other sessions
- ✅ **Audit Trail**: Clear mapping of which session used which credentials

**Tradeoffs:**
- ❌ **Re-auth Per Session**: User must connect Google for each new session
- ❌ **UX Friction**: Extra step to enable integrations
- ✅ **Acceptable**: For security-first multi-tenant platform

## User Experience

### Location: Session UI Page → Left Sidebar → "MCP Integrations" Accordion

1. User creates/opens an agentic session
2. In left sidebar, expand "MCP Integrations" accordion
3. Click "Connect" button next to Google Drive
4. OAuth popup opens, user authorizes
5. Credentials stored in session's runner pod PVC
6. Agent can now use Google Drive MCP tools

### UI Components

**New Accordion**: `mcp-integrations-accordion.tsx`
- Shows available MCP integrations (currently: Google Drive)
- Connect/Disconnect buttons
- Connection status badges
- "More integrations coming soon..." placeholder

**Integration Card Structure**:
```
┌─────────────────────────────────────────────┐
│ [Google Logo]  Google Drive                │
│                Access Drive files in this   │
│                session                      │
│                                  [Connect]  │
└─────────────────────────────────────────────┘
```

## Implementation

### Frontend Components Created

**1. `components/frontend/src/app/projects/[name]/sessions/[sessionName]/components/accordions/mcp-integrations-accordion.tsx`**

```typescript
export function McpIntegrationsAccordion({
  projectName,
  sessionName,
}: McpIntegrationsAccordionProps)
```

**Key Features:**
- OAuth popup with session context in state parameter
- State includes: `{ provider, projectName, sessionName, timestamp }`
- Redirects to backend `/oauth2callback` endpoint
- Polls for popup close to update UI
- Connection status tracking

**2. Modified `page.tsx`**
- Added import for `McpIntegrationsAccordion`
- Added accordion between "Artifacts" and "File Explorer" accordions
- Passes `projectName` and `sessionName` props

### OAuth Flow

```
1. User clicks "Connect" in MCP Integrations accordion
   ↓
2. Frontend constructs OAuth URL with session context in state:
   state = btoa(JSON.stringify({
     provider: 'google',
     projectName: 'my-project',
     sessionName: 'agentic-session-123',
     timestamp: Date.now()
   }))
   ↓
3. OAuth popup opens, user authorizes in Google
   ↓
4. Google redirects to: http://localhost:8080/oauth2callback?code=xxx&state=yyy
   ↓
5. Backend exchanges code for tokens (already implemented)
   ↓
6. Backend stores tokens in Secret `oauth-callbacks` keyed by state
   ↓
7. ⚠️ TODO: Backend extracts session context from state
   ↓
8. ⚠️ TODO: Backend writes credentials to session runner pod's PVC
   ↓
9. ⚠️ TODO: Runner pod's MCP server uses credentials from PVC
```

### What's Implemented ✅

- ✅ MCP Integrations accordion UI component
- ✅ Google Drive connection button with OAuth flow
- ✅ Session context passed in OAuth state parameter
- ✅ OAuth popup window management
- ✅ Connection status UI (mocked - needs backend)
- ✅ Frontend builds successfully
- ✅ Existing OAuth backend (`/oauth2callback` endpoint)

### What's Next (TODO) ⚠️

#### 1. Backend: Parse Session Context from OAuth State

`components/backend/handlers/oauth.go`:

```go
// In HandleOAuth2Callback, after successful token exchange:
func HandleOAuth2Callback(c *gin.Context) {
    // ... existing code ...

    // Parse state to get session context
    stateData, err := parseOAuthState(state)
    if err != nil {
        log.Printf("Failed to parse OAuth state: %v", err)
        // Continue with existing flow
    }

    // If session context present, store credentials in session PVC
    if stateData.SessionName != "" && stateData.ProjectName != "" {
        err := storeCredentialsInSessionPVC(
            c.Request.Context(),
            stateData.ProjectName,
            stateData.SessionName,
            callbackData.AccessToken,
            callbackData.RefreshToken,
        )
        if err != nil {
            log.Printf("Failed to store credentials in session PVC: %v", err)
        }
    }
}

type OAuthStateData struct {
    Provider    string `json:"provider"`
    ProjectName string `json:"projectName"`
    SessionName string `json:"sessionName"`
    Timestamp   int64  `json:"timestamp"`
}

func parseOAuthState(state string) (*OAuthStateData, error) {
    decoded, err := base64.RawURLEncoding.DecodeString(state)
    if err != nil {
        return nil, err
    }

    var data OAuthStateData
    err = json.Unmarshal(decoded, &data)
    return &data, err
}
```

#### 2. Backend: Write Credentials to Session PVC

**Option A: Backend Mounts PVC (Simplest)**

```go
func storeCredentialsInSessionPVC(ctx context.Context, project, sessionName, accessToken, refreshToken string) error {
    // PVC is mounted at /workspace-proxy/{project}/{sessionName}
    // (assuming workspace proxy pattern)

    credentialsPath := fmt.Sprintf("/workspace-proxy/%s/%s/.google-oauth-credentials.json", project, sessionName)

    creds := map[string]string{
        "access_token":  accessToken,
        "refresh_token": refreshToken,
        "token_type":    "Bearer",
    }

    data, _ := json.Marshal(creds)
    return os.WriteFile(credentialsPath, data, 0600)
}
```

**Option B: Backend Uses K8s API to Write to Pod**

```go
func storeCredentialsInSessionPVC(ctx context.Context, project, sessionName, accessToken, refreshToken string) error {
    // 1. Find the runner pod for this session
    podList, err := K8sClient.CoreV1().Pods(project).List(ctx, v1.ListOptions{
        LabelSelector: fmt.Sprintf("session=%s", sessionName),
    })

    if len(podList.Items) == 0 {
        return fmt.Errorf("runner pod not found for session %s", sessionName)
    }

    podName := podList.Items[0].Name

    // 2. Exec into pod to write credentials
    creds := fmt.Sprintf(`{"access_token":"%s","refresh_token":"%s","token_type":"Bearer"}`,
        accessToken, refreshToken)

    cmd := []string{"sh", "-c", fmt.Sprintf(
        "echo '%s' > /workspace/.google-oauth-credentials.json && chmod 600 /workspace/.google-oauth-credentials.json",
        creds,
    )}

    return execInPod(ctx, project, podName, "runner", cmd)
}
```

**Option C: Create Secret, Runner Mounts It**

```go
func storeCredentialsInSessionPVC(ctx context.Context, project, sessionName, accessToken, refreshToken string) error {
    // Create session-specific Secret
    secretName := fmt.Sprintf("%s-google-oauth", sessionName)

    secret := &corev1.Secret{
        ObjectMeta: v1.ObjectMeta{
            Name:      secretName,
            Namespace: project,
            Labels: map[string]string{
                "session": sessionName,
            },
        },
        Type: corev1.SecretTypeOpaque,
        Data: map[string][]byte{
            "access_token":  []byte(accessToken),
            "refresh_token": []byte(refreshToken),
        },
    }

    _, err := K8sClient.CoreV1().Secrets(project).Create(ctx, secret, v1.CreateOptions{})
    return err
}

// Then in operator, when creating runner pod:
// Mount this Secret into the runner pod
```

#### 3. Runner: Configure MCP with Credentials

**In runner pod startup (`components/runners/claude-code-runner/wrapper.py`):**

```python
import json
import os

def configure_google_drive_mcp():
    """Configure Google Drive MCP if credentials exist"""

    creds_path = "/workspace/.google-oauth-credentials.json"

    if not os.path.exists(creds_path):
        print("No Google Drive credentials found, skipping MCP configuration")
        return

    # Read credentials
    with open(creds_path) as f:
        creds = json.load(f)

    # Configure MCP server
    mcp_config_path = os.path.expanduser("~/.mcp.json")

    mcp_config = {}
    if os.path.exists(mcp_config_path):
        with open(mcp_config_path) as f:
            mcp_config = json.load(f)

    # Add Google Workspace MCP server
    if "mcpServers" not in mcp_config:
        mcp_config["mcpServers"] = {}

    mcp_config["mcpServers"]["google_workspace"] = {
        "type": "stdio",
        "command": "uvx",
        "args": ["workspace-mcp", "--tools", "drive"],
        "env": {
            "GOOGLE_OAUTH_ACCESS_TOKEN": creds["access_token"],
            "GOOGLE_OAUTH_REFRESH_TOKEN": creds["refresh_token"],
            # Or use credentials file if MCP supports it:
            # "GOOGLE_APPLICATION_CREDENTIALS": creds_path
        }
    }

    with open(mcp_config_path, "w") as f:
        json.dump(mcp_config, f, indent=2)

    print(f"✓ Configured Google Drive MCP server with session credentials")

# Call during runner initialization
configure_google_drive_mcp()
```

#### 4. Frontend: Check Connection Status

Add backend endpoint:

```go
// GET /api/projects/:projectName/agentic-sessions/:sessionName/mcp/google/status
func GetSessionGoogleMCPStatus(c *gin.Context) {
    project := c.GetString("project")
    sessionName := c.Param("sessionName")

    // Check if credentials exist in session PVC or Secret
    hasCredentials := checkSessionGoogleCredentials(project, sessionName)

    c.JSON(http.StatusOK, gin.H{
        "connected": hasCredentials,
    })
}
```

Frontend query:

```typescript
export function useSessionGoogleMCPStatus(projectName: string, sessionName: string) {
  return useQuery({
    queryKey: ['session-google-mcp', projectName, sessionName],
    queryFn: () => apiClient.get(`/projects/${projectName}/agentic-sessions/${sessionName}/mcp/google/status`),
  });
}
```

## Security Considerations

1. **PVC Isolation**: Each session's runner pod has its own PVC
2. **Credential Lifetime**: Credentials deleted when session/PVC deleted
3. **No Global Storage**: Credentials never stored in user-scoped Secrets
4. **State Validation**: Backend should validate state signature to prevent tampering
5. **Pod-to-Pod Isolation**: K8s network policies prevent cross-pod access

## Testing

### Manual Testing Steps

1. Start frontend and backend
2. Create a new agentic session
3. In session UI, expand "MCP Integrations" accordion
4. Click "Connect" on Google Drive
5. Authorize in OAuth popup
6. Verify callback redirects to backend
7. Check backend logs for credential storage
8. Verify credentials appear in session PVC
9. Verify runner pod's MCP server can use Google Drive tools

### Backend Testing

```bash
# Check if credentials were stored
kubectl exec -it <runner-pod-name> -n <project> -- cat /workspace/.google-oauth-credentials.json

# Or check Secret if using Option C
kubectl get secret <session-name>-google-oauth -n <project> -o yaml
```

## Migration Path

**Phase 1** (Current): Frontend UI + OAuth flow
- ✅ User can click "Connect Google Drive" in session
- ✅ OAuth popup opens and completes
- ⚠️ Credentials stored in temporary `oauth-callbacks` Secret

**Phase 2** (Next): Backend PVC write
- Backend parses session context from OAuth state
- Backend writes credentials to session PVC
- Credentials available in runner pod filesystem

**Phase 3** (Future): Runner MCP configuration
- Runner startup script detects credentials
- Automatically configures Google Workspace MCP server
- Agent can use Google Drive tools

## Related Files

- Frontend accordion: `src/app/projects/[name]/sessions/[sessionName]/components/accordions/mcp-integrations-accordion.tsx`
- Session page: `src/app/projects/[name]/sessions/[sessionName]/page.tsx`
- Backend OAuth handler: `components/backend/handlers/oauth.go`
- Backend OAuth routes: `components/backend/routes.go`
- Runner wrapper: `components/runners/claude-code-runner/wrapper.py`

## Future Enhancements

1. **Multiple MCP Providers**: Add Slack, Jira, GitHub, etc.
2. **Credential Refresh**: Automatically refresh expired tokens
3. **Disconnect Handler**: Remove credentials from PVC when user disconnects
4. **Connection Indicators**: Real-time status in UI
5. **Pre-Session Connect**: Allow connecting before starting session
6. **Credential Import**: Upload existing OAuth credentials
