# Refactoring Addendum: Preserving Dynamic Context Addition

## Critical Requirement Discovery

After reviewing the codebase, I discovered a **critical feature** that must be preserved:

**Users can dynamically add/remove context repositories during an active session** via WebSocket messages.

## How Dynamic Context Currently Works

1. User clicks "Add Context" in UI during active session
2. Frontend sends `repo_added` message via WebSocket to runner
3. Runner receives message in interactive loop (wrapper.py:695-704)
4. Runner clones the repository immediately using `_handle_repo_added()`
5. Runner updates `REPOS_JSON` environment variable
6. Runner requests restart (`_restart_requested = True`)
7. SDK restarts with new repository in `add_dirs`, making it accessible to Claude

**Key Files:**
- Frontend: `components/frontend/src/app/projects/[name]/sessions/[sessionName]/page.tsx`
- Backend WebSocket: `components/backend/websocket/handlers.go`
- Runner Handler: `wrapper.py:1238-1304` (`_handle_repo_added`, `_handle_repo_removed`)

## Why Original Refactoring Breaks This

The original refactoring proposal moved **ALL** git operations to an init container that runs **before** the runner starts. This breaks dynamic context because:

1. ❌ Init container runs once at pod startup, can't handle mid-session additions
2. ❌ Runner would have no git capability to clone new repos
3. ❌ No way to update workspace after session has started

## Revised Architecture: Hybrid Approach

### Option 1: Dual-Path Git Operations (Recommended)

Keep both paths:

**Init Container Path** (for session startup):
- Clones repositories specified in `spec.repos` at pod creation time
- Uses Go backend git operations
- Runs before runner starts
- Handles initial workspace setup

**Runner Path** (for dynamic additions):
- Keeps ability to clone repos during session
- Uses **Go backend git operations** via RPC/API call instead of Python code
- Handles `repo_added`, `repo_removed`, `workflow_change` messages
- Still runner-agnostic (calls Go backend, not Python git logic)

### Option 2: Init Container with Sidecar Helper

Add a sidecar container with git operations:

**Init Container**: Handles initial setup
**Git Sidecar Container**: Lightweight Go service that:
- Exposes HTTP API for git operations
- Listens on localhost:8090 (only accessible to runner)
- Runner calls `POST /clone` with repository config
- Returns success/failure
- Uses same Go backend git operations code

### Option 3: Keep Current Architecture, Extract Shared Logic

**Don't use init container at all**. Instead:
- Extract git operations to a **shared Go library** (already done!)
- Build a **Python wrapper** that calls the Go binary
- Runner uses this wrapper instead of pure Python git logic
- Still achieves code reuse, but maintains flexibility

## Recommended Solution: Option 1 (Dual-Path)

This preserves all functionality while achieving runner-agnostic goals:

### Initial Setup (Init Container)
```
Operator creates Job
  ↓
Init Container runs (Go binary)
  - Reads spec.repos
  - Clones all repositories with enhanced options
  - Sets up workspace structure
  ↓
Runner starts with pre-configured workspace
```

### Dynamic Addition (Runner with Go Backend API)
```
User adds repository via UI
  ↓
Backend sends repo_added message to runner
  ↓
Runner calls Go backend API: POST /api/internal/git/clone
  - Payload: {url, baseBranch, featureBranch, etc.}
  ↓
Go backend clones repository using CloneWithOptions
  ↓
Runner restarts SDK with new repo in add_dirs
```

## Implementation Plan

### Phase 1: Add Git Operations API to Backend

**File**: `components/backend/server/git_api.go` (new)

```go
package server

import (
    "context"
    "encoding/json"
    "net/http"
    "ambient-code-backend/git"
)

// GitCloneRequest represents a request to clone a repository
type GitCloneRequest struct {
    URL                string `json:"url"`
    BaseBranch         string `json:"baseBranch,omitempty"`
    FeatureBranch      string `json:"featureBranch,omitempty"`
    AllowProtectedWork bool   `json:"allowProtectedWork,omitempty"`
    SyncURL            string `json:"syncUrl,omitempty"`
    SyncBranch         string `json:"syncBranch,omitempty"`
    DestinationDir     string `json:"destinationDir"`
    SessionID          string `json:"sessionId"`
}

// HandleGitClone handles internal git clone requests from runner
func (s *Server) HandleGitClone(w http.ResponseWriter, r *http.Request) {
    // Only allow from localhost (runner container)
    if r.RemoteAddr != "127.0.0.1" && !strings.HasPrefix(r.RemoteAddr, "127.0.0.1:") {
        http.Error(w, "Forbidden", http.StatusForbidden)
        return
    }

    var req GitCloneRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    // Get GitHub token from runner's environment (passed via header)
    token := r.Header.Get("X-GitHub-Token")

    opts := git.CloneOptions{
        URL:                req.URL,
        BaseBranch:         req.BaseBranch,
        FeatureBranch:      req.FeatureBranch,
        AllowProtectedWork: req.AllowProtectedWork,
        SyncURL:            req.SyncURL,
        SyncBranch:         req.SyncBranch,
        Token:              token,
        DestinationDir:     req.DestinationDir,
        SessionID:          req.SessionID,
    }

    if err := git.CloneWithOptions(context.Background(), opts); err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}
```

### Phase 2: Update Runner to Use Go Backend API

**File**: `components/runners/claude-code-runner/wrapper.py`

Update `_handle_repo_added()`:

```python
async def _handle_repo_added(self, payload):
    """Clone newly added repository using Go backend API."""
    repo_url = str(payload.get('url') or '').strip()
    repo_config = payload.get('input', {})
    repo_name = str(payload.get('name') or '').strip()

    if not repo_url or not repo_name:
        logging.warning("Invalid repo_added payload")
        return

    workspace = Path(self.context.workspace_path)
    repo_dir = workspace / repo_name

    if repo_dir.exists():
        await self._send_log(f"Repository {repo_name} already exists")
        return

    # Fetch token for authentication
    token = await self._fetch_token_for_url(repo_url)

    # Prepare request for Go backend git API
    clone_request = {
        "url": repo_url,
        "baseBranch": repo_config.get('baseBranch') or repo_config.get('branch') or 'main',
        "featureBranch": repo_config.get('featureBranch', ''),
        "allowProtectedWork": repo_config.get('allowProtectedWork', False),
        "syncUrl": repo_config.get('sync', {}).get('url', ''),
        "syncBranch": repo_config.get('sync', {}).get('branch', 'main'),
        "destinationDir": str(repo_dir),
        "sessionId": self.context.session_id,
    }

    # Call Go backend API
    backend_url = os.getenv('BACKEND_API_URL', '')
    api_endpoint = f"{backend_url}/internal/git/clone"

    await self._send_log(f"📥 Cloning {repo_name} via backend API...")

    async with aiohttp.ClientSession() as session:
        headers = {"X-GitHub-Token": token} if token else {}
        async with session.post(api_endpoint, json=clone_request, headers=headers) as response:
            if response.status != 200:
                error = await response.text()
                await self._send_log(f"❌ Failed to clone {repo_name}: {error}")
                return

    await self._send_log(f"✅ Repository {repo_name} added")

    # Update REPOS_JSON env var
    repos_cfg = self._get_repos_config()
    repos_cfg.append({'name': repo_name, 'input': repo_config})
    os.environ['REPOS_JSON'] = _json.dumps(repos_cfg)

    # Request restart to update additional directories
    self._restart_requested = True
```

### Phase 3: Update Init Container to Use Same Code

The init container and the backend API both use `git.CloneWithOptions()`, ensuring consistency.

## Benefits of Revised Approach

### 1. Preserves Dynamic Context
✅ Users can add/remove repos during session
✅ Workflow changes work mid-session
✅ No regression in functionality

### 2. Runner-Agnostic Architecture
✅ Git operations in Go backend (shared code)
✅ Runner calls API, doesn't implement git logic
✅ Future runners can use same API

### 3. Consistency
✅ Init container and dynamic addition use same Go code
✅ Protected branch handling consistent
✅ Error handling consistent

### 4. Performance
✅ Initial repos cloned in init container (parallel)
✅ Dynamic repos cloned on-demand (as needed)
✅ No regression in startup time

### 5. Security
✅ Token passed via HTTP header, not stored
✅ API only accessible from localhost (runner pod)
✅ Same security model as current approach

## Migration Timeline

### Week 1: Backend API
- Implement `/internal/git/clone` endpoint
- Add authentication checks (localhost only)
- Test with curl from pod

### Week 2: Init Container
- Deploy init container (initial setup path)
- Test with various repo configurations
- Verify workspace structure

### Week 3: Runner Updates
- Update `_handle_repo_added()` to call backend API
- Update `_handle_repo_removed()` (just delete dir, same as now)
- Test dynamic addition flow

### Week 4: Integration Testing
- Test full flow: initial + dynamic additions
- Verify SDK restart works correctly
- Performance testing

### Week 5: Rollout
- Deploy to staging
- Gradual production rollout
- Monitor for issues

## Rollback Plan

Each phase is independently deployable:
- **Phase 1**: Backend API can be deployed but not used
- **Phase 2**: Init container can be deployed independently
- **Phase 3**: Runner changes can be reverted to Python git logic

## Open Questions

1. **Should we expose the git API externally?**
   - Current plan: Only localhost (runner pod)
   - Alternative: Add auth and expose for other services

2. **How to handle concurrent clone requests?**
   - Current plan: Sequential (one at a time)
   - Alternative: Queue with worker pool

3. **Should we add metrics/observability?**
   - Track clone success/failure rates
   - Track clone duration
   - Alert on high failure rates

## Conclusion

The revised approach achieves the goal of runner-agnostic architecture while preserving critical functionality:

- **Init Container**: Handles initial workspace setup (Go)
- **Backend API**: Handles dynamic additions (Go)
- **Runner**: Orchestrates via API calls (language-agnostic)

This is a **hybrid approach** that gets the best of both worlds:
- Code reuse and consistency (Go backend)
- Flexibility for dynamic operations (API)
- No regression in functionality
- Path to fully runner-agnostic future
