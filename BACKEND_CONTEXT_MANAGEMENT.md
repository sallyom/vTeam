# Backend Context Management Architecture

**Issue**: #376 - Dynamic context management for AI sessions

**Status**: Phase 1 Complete - Backend API implemented and compiling

---

## Overview

This document describes the new backend-driven context management architecture that enables users to dynamically add/remove Git repositories (and eventually other context types like Jira, GoogleDrive) throughout a session's lifetime.

### Key Design Principles

1. **Backend owns all Git operations** - Runner is git-agnostic
2. **Dynamic context management** - Add/remove repos during active sessions
3. **Shared workspace access** - Backend and runner pods access same PVC
4. **Deterministic setup** - User explicitly adds context via API, no implicit cloning
5. **Future-proof** - Architecture supports multiple context types (Git, Jira, GDrive, etc.)

---

## Architecture

### Before (Issue #376 Work)
```
Runner → Clones repos on startup → Works with local git
```

**Problems:**
- Git logic tightly coupled to runner
- Cannot add/remove repos mid-session
- Session must restart to change context

### After (New Architecture)
```
User adds context → Backend API clones repos → Runner sees updated workspace
```

**Benefits:**
- ✅ Dynamic context management (add/remove anytime)
- ✅ Session pause/resume with context changes
- ✅ Runner-agnostic (no git knowledge needed)
- ✅ Real-time API feedback to frontend
- ✅ Supports multiple context types (future)

---

## Workspace Structure

Backend and session pods share workspace access:

```
/workspace (backend-state-pvc)
├── sessions/
│   ├── session-abc123/
│   │   └── workspace/
│   │       ├── repo-1/          # Git repository (cloned by backend)
│   │       ├── repo-2/          # Git repository (cloned by backend)
│   │       ├── workflows/       # Workflows directory
│   │       └── artifacts/       # Output artifacts
│   └── session-xyz789/
│       └── workspace/
│           └── ...
```

- **Backend** mounts `/workspace` from `backend-state-pvc`
- **Session pods** mount `/workspace/sessions/{sessionName}/workspace`
- Backend has write access to clone repos into session workspaces
- Runner has read/write access to work with cloned repos

---

## API Endpoints

### Add Repository to Session
```http
POST /api/projects/:projectName/agentic-sessions/:sessionName/repos

{
  "name": "my-feature-repo",
  "input": {
    "url": "https://github.com/org/repo",
    "baseBranch": "main",
    "featureBranch": "feature-xyz",
    "allowProtectedWork": false,
    "sync": {
      "url": "https://github.com/upstream/repo",
      "branch": "main"
    }
  },
  "output": {
    "url": "https://github.com/user/fork",
    "branch": "my-changes"
  }
}
```

**Response:**
```json
{
  "message": "Repository added successfully",
  "name": "my-feature-repo",
  "path": "my-feature-repo"
}
```

**What it does:**
1. Authenticates user with GitHub token
2. Clones repository to `/workspace/sessions/{sessionName}/workspace/{name}`
3. Checks out appropriate branch (feature, protected, or working branch)
4. Sets up sync remote if configured
5. Updates session CR spec.repos array
6. Notifies runner via WebSocket (if running)

### Remove Repository from Session
```http
DELETE /api/projects/:projectName/agentic-sessions/:sessionName/repos/:repoName
```

**Response:**
```json
{
  "message": "Repository removed successfully",
  "name": "my-feature-repo"
}
```

**What it does:**
1. Verifies user has access to session
2. Removes repository directory from workspace
3. Updates session CR spec.repos array
4. Notifies runner via WebSocket (if running)

### List Repositories in Session
```http
GET /api/projects/:projectName/agentic-sessions/:sessionName/repos
```

**Response:**
```json
{
  "repos": [
    {
      "name": "my-feature-repo",
      "input": {
        "url": "https://github.com/org/repo",
        "baseBranch": "main",
        "featureBranch": "feature-xyz"
      },
      "cloned": true
    }
  ]
}
```

---

## Enhanced Repository Configuration

### Repository Types

**RepositoryInput** - Source repository configuration:
- `url` (required) - Git repository URL
- `branch` - Legacy field (deprecated, use baseBranch)
- `baseBranch` - Primary branch to clone from (default: "main")
- `featureBranch` - Optional working branch to create/checkout
- `allowProtectedWork` - Allow direct work on protected branches (default: false)
- `sync` - Optional upstream repository to sync from

**RepositoryOutput** - Target repository for pushes:
- `url` - Fork or target repository URL
- `branch` - Branch to push to

**RepositorySync** - Upstream sync configuration:
- `url` - Upstream repository URL
- `branch` - Branch to sync from (default: "main")

### Protected Branch Handling

The backend automatically detects protected branches and creates working branches:

**Protected branch patterns:**
- Exact matches: `main`, `master`, `develop`, `dev`, `production`, `prod`, `staging`, `stage`, `qa`, `test`, `stable`
- Prefixes: `release/`, `releases/`, `hotfix/`, `hotfixes/`

**Automatic working branch creation:**
- Pattern: `work/{baseBranch}/{sessionID-short}`
- Example: `work/main/abc12345`
- Only created if `allowProtectedWork` is false

### Feature Branch Support

If `featureBranch` is specified:
1. Backend checks if branch exists remotely
2. If exists: Checkout existing branch
3. If not exists: Create new branch from baseBranch

### Sync/Upstream Support

If `sync` configuration is provided:
1. Add `sync-repo` remote with upstream URL
2. Fetch from `sync-repo/{syncBranch}`
3. Rebase current branch onto `sync-repo/{syncBranch}`
4. Log warnings if sync fails (non-fatal)

---

## Implementation Details

### Backend Handlers (`components/backend/handlers/context.go`)

**Key Functions:**
- `AddRepositoryToSession` - Clone repo into session workspace
- `RemoveRepositoryFromSession` - Remove repo from workspace
- `ListSessionRepositories` - List repos with clone status
- `getAgenticSession` - Helper to get session CR
- `addRepoToSessionSpec` - Update CR spec.repos array
- `removeRepoFromSessionSpec` - Remove repo from CR spec.repos
- `notifyRunnerContextChanged` - Send WebSocket notification to runner

**Authentication:**
- Uses `GetK8sClientsForRequest(c)` for user-scoped operations
- Uses `git.GetGitHubToken()` to fetch user's GitHub token
- Uses backend service account (`DynamicClient`) for CR writes

**Workspace Access:**
- Backend reads `STATE_BASE_DIR` env var (default: `/workspace`)
- Session workspace path: `{STATE_BASE_DIR}/sessions/{sessionName}/workspace`
- Verifies workspace exists before cloning

### Git Operations (`components/backend/git/operations.go`)

**New Functions:**
- `CloneWithOptions` - Enhanced git clone with all features
- `isProtectedBranch` - Detect protected branch patterns
- `addTokenToURL` - Add authentication to Git URLs

**CloneOptions Struct:**
```go
type CloneOptions struct {
    URL                string // Repository URL
    BaseBranch         string // Primary branch to clone from
    FeatureBranch      string // Optional working branch
    AllowProtectedWork bool   // Allow direct work on protected branches
    SyncURL            string // Optional upstream repository URL
    SyncBranch         string // Branch to sync from upstream
    Token              string // Authentication token
    DestinationDir     string // Where to clone the repository
    SessionID          string // Session ID for working branch naming
}
```

**Clone Logic:**
1. Validate options (URL, destination, baseBranch)
2. Check destination doesn't already exist
3. Clone repository with baseBranch
4. Configure git identity (user.name, user.email)
5. Handle feature branch or protected branch
6. Setup sync remote if configured
7. Return success or error

### Type Definitions (`components/backend/types/session.go`)

**New Types:**
- `Repository` - Complete repository configuration
- `RepositoryInput` - Enhanced input repository config
- `RepositoryOutput` - Output repository config
- `RepositorySync` - Sync/upstream repository config

---

## Session Lifecycle

### 1. Session Creation
- User creates session via API
- **NO repos are cloned automatically**
- Session starts with empty workspace (only artifacts/ directory)

### 2. Adding Context
- User explicitly adds Git repos via POST `/repos` endpoint
- Backend clones repos into workspace
- Runner is notified via WebSocket (if running)
- Runner can restart to reload additional directories (future enhancement)

### 3. Session Running
- Runner works with cloned repos
- User can add/remove repos anytime via API
- Changes are reflected in workspace immediately
- Runner receives WebSocket notifications

### 4. Session Pause
- Session pod is stopped
- Workspace persists in PVC
- User can add/remove repos while paused

### 5. Session Resume
- Session pod starts with existing workspace
- All previously cloned repos are available
- No re-cloning needed (unless removed while paused)

---

## Migration from Issue #376 Work

### What to Keep
- ✅ Frontend UI for adding repos (already implemented)
- ✅ Enhanced repository schema (baseBranch, featureBranch, sync)
- ✅ Protected branch detection logic (moved to backend)

### What to Remove
- ❌ Git operations from runner (`wrapper.py`)
- ❌ `_prepare_workspace()` git clone logic (~600 lines)
- ❌ `_handle_protected_branch()`, `_setup_sync_remote()`, etc.
- ❌ git-init-container (not needed)

### What to Change
- 🔧 Routes: Use new `AddRepositoryToSession`, `RemoveRepositoryFromSession` handlers
- 🔧 Runner: Simplify to just verify workspace exists
- 🔧 Operator: Remove git init container, keep simple directory creation

---

## Next Steps

### Phase 2: Runner Simplification
1. Remove all git clone logic from `components/runners/claude-code-runner/wrapper.py`
2. Simplify `_prepare_workspace()` to just verify directories exist
3. Update `_handle_repo_added/removed` to trigger SDK restart with updated additional_dirs

### Phase 3: Frontend Integration
1. Update frontend to call new `/repos` endpoints
2. Show real-time clone progress
3. Display clone errors with retry option
4. Add UI for sync/upstream configuration

### Phase 4: Testing
1. Test adding repo to running session
2. Test removing repo from running session
3. Test pause/resume with context changes
4. Test protected branch handling
5. Test feature branch creation
6. Test sync/upstream functionality

### Phase 5: Future Enhancements
1. Support GitLab repositories
2. Support Jira context (tickets, epics)
3. Support GoogleDrive context (docs, sheets)
4. Support URL context (fetch and parse web pages)
5. Parallel cloning for multiple repos
6. Clone progress tracking (percentage, files, etc.)

---

## Security Considerations

### Token Handling
- Tokens fetched from user's GitHub App installation or integration secrets
- Tokens injected into git URLs temporarily during clone
- Tokens NOT stored in git config or workspace
- Tokens redacted from logs

### RBAC
- User must have access to session namespace
- Backend verifies access via `GetK8sClientsForRequest`
- Backend uses elevated privileges only for CR writes
- User cannot access other users' sessions

### Protected Branches
- Automatic detection prevents accidental commits to protected branches
- User must explicitly set `allowProtectedWork: true` to override
- Working branches clearly named with session ID

### Workspace Isolation
- Each session has isolated workspace directory
- Sessions cannot access other sessions' workspaces
- Backend validates paths to prevent directory traversal

---

## Troubleshooting

### Repository Clone Fails
**Symptoms**: API returns 500, error message about clone failure

**Common Causes:**
1. Invalid GitHub token - Check integration secrets
2. Branch doesn't exist - Verify branch name
3. No access to repository - Check GitHub permissions
4. Repository URL invalid - Verify URL format

**Debug:**
```bash
# Check backend logs
kubectl logs -n {namespace} deployment/backend-api

# Look for "Failed to clone repository" errors
# Token issues: "authentication failed"
# Branch issues: "branch {name} not found"
```

### Repository Not Visible in Runner
**Symptoms**: Runner doesn't see cloned repository

**Common Causes:**
1. Workspace path mismatch
2. PVC not mounted correctly
3. Clone succeeded but directory structure wrong

**Debug:**
```bash
# Check session workspace
kubectl exec -n {namespace} {session-pod} -- ls /workspace

# Check backend workspace
kubectl exec -n {namespace} deployment/backend-api -- ls /workspace/sessions/{sessionName}/workspace

# Verify PVC
kubectl get pvc -n {namespace}
```

### WebSocket Notification Not Received
**Symptoms**: Runner doesn't restart after repo added

**Common Causes:**
1. WebSocket connection dropped
2. Runner not in interactive mode
3. Notification function not implemented

**Debug:**
```bash
# Check runner logs for WebSocket messages
kubectl logs -n {namespace} {session-pod}

# Look for "repo_added" or "repo_removed" messages
```

---

## References

- Original Issue: #376 - Session should not fail if Context Repo cloning fails
- Backend Handlers: `components/backend/handlers/context.go`
- Git Operations: `components/backend/git/operations.go`
- Type Definitions: `components/backend/types/session.go`
- Routes: `components/backend/routes.go`

---

## Contact

For questions or issues:
- File issue on GitHub
- Tag @sallyom in PR comments
- Check `#vteam-dev` Slack channel
