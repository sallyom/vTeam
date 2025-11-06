# Refactoring Plan: sessions.go → sessions/ package

## Current State

**File**: `handlers/sessions.go`
**Size**: ~1400 lines
**Problem**: Single large file containing all session-related handlers makes it difficult to:
- Navigate and find specific functionality
- Review changes (large diffs)
- Test individual components
- Understand code organization

## Proposed Solution

Break down `sessions.go` into a `sessions/` package with multiple focused files, following the pattern established in the `bugfix/` package.

## New File Structure

```
handlers/
├── sessions/
│   ├── helpers.go         # Package-level vars, exports, shared utilities
│   ├── parsers.go         # parseSpec, parseStatus, type conversions
│   ├── auth.go            # ProvisionRunnerTokenForSession, SA/RBAC setup
│   ├── create.go          # CreateSession handler
│   ├── list.go            # ListSessions handler
│   ├── get.go             # GetSession handler
│   ├── delete.go          # DeleteSession handler
│   ├── lifecycle.go       # StartSession, StopSession, CloneSession
│   └── messages.go        # GetSessionMessages, ListContent, DownloadContent
```

## File Responsibilities

### helpers.go (~50 lines)
**Purpose**: Package-level dependencies and shared utilities

**Exports**:
- Package-level variables (set from main.go):
  - `GetAgenticSessionV1Alpha1Resource func() schema.GroupVersionResource`
  - `DynamicClient dynamic.Interface`
  - `K8sClient *kubernetes.Clientset`
  - `GetGitHubToken func(...)`
  - `DeriveRepoFolderFromURL func(string) string`
- Helper functions used across multiple handlers

**Dependencies**: None

---

### parsers.go (~100 lines)
**Purpose**: Type parsing and conversion utilities

**Functions**:
- `parseSpec(spec map[string]interface{}) types.AgenticSessionSpec`
- `parseStatus(status map[string]interface{}) types.AgenticSessionStatus`
- Helper parsing functions for nested structures

**Dependencies**: `helpers.go`

---

### auth.go (~200 lines)
**Purpose**: Authentication and authorization for session runners

**Functions**:
- `ProvisionRunnerTokenForSession(c *gin.Context, reqK8s *kubernetes.Clientset, reqDyn dynamic.Interface, project string, sessionName string) error`
  - Creates per-session ServiceAccount
  - Grants minimal RBAC permissions
  - Mints short-lived K8s token
  - Stores token in Secret
  - Annotates AgenticSession CR with secret name

**Current Location**: `sessions.go:598-744`

**Dependencies**: `helpers.go`

**Notes**:
- Already exported (capitalized) for use in bugfix package
- Self-contained authentication logic
- Uses backend service account (not user clients)

---

### create.go (~150 lines)
**Purpose**: Session creation

**Handlers**:
- `CreateSession(c *gin.Context)` - POST `/api/projects/:project/agentic-sessions`

**Current Location**: `sessions.go:280-594`

**Dependencies**:
- `helpers.go`
- `parsers.go`
- `auth.go` (calls `ProvisionRunnerTokenForSession`)

**Logic**:
1. Validate request
2. Set LLM defaults
3. Generate unique session name
4. Build CR metadata and spec
5. Handle repos, environment variables, interactive mode
6. Create AgenticSession CR
7. Provision runner token (non-fatal if fails)
8. Return created session info

---

### list.go (~50 lines)
**Purpose**: List all sessions in a project

**Handlers**:
- `ListSessions(c *gin.Context)` - GET `/api/projects/:project/agentic-sessions`

**Current Location**: `sessions.go:245-278`

**Dependencies**:
- `helpers.go`
- `parsers.go`

**Logic**:
1. Get user K8s clients
2. List AgenticSession CRs in namespace
3. Parse each session (spec + status)
4. Return array of sessions

---

### get.go (~80 lines)
**Purpose**: Retrieve a single session

**Handlers**:
- `GetSession(c *gin.Context)` - GET `/api/projects/:project/agentic-sessions/:sessionName`

**Current Location**: `sessions.go:746-790`

**Dependencies**:
- `helpers.go`
- `parsers.go`

**Logic**:
1. Extract project and session name from params
2. Get user K8s clients
3. Fetch AgenticSession CR
4. Parse spec and status
5. Return session object

---

### delete.go (~100 lines)
**Purpose**: Delete a session and cleanup resources

**Handlers**:
- `DeleteSession(c *gin.Context)` - DELETE `/api/projects/:project/agentic-sessions/:sessionName`

**Current Location**: `sessions.go:792-858`

**Dependencies**: `helpers.go`

**Logic**:
1. Extract project and session name
2. Get user K8s clients
3. Delete AgenticSession CR (cascades to Job, Pods via OwnerReferences)
4. Best-effort cleanup of:
   - Runner token secret
   - ServiceAccount
   - RoleBinding
   - Temp content pods
5. Return success

**Notes**:
- Cleanup failures are logged but non-fatal
- Kubernetes garbage collection handles owned resources

---

### lifecycle.go (~300 lines)
**Purpose**: Session lifecycle operations

**Handlers**:
- `StartSession(c *gin.Context)` - POST `/api/projects/:project/agentic-sessions/:sessionName/start`
- `StopSession(c *gin.Context)` - POST `/api/projects/:project/agentic-sessions/:sessionName/stop`
- `CloneSession(c *gin.Context)` - POST `/api/projects/:project/agentic-sessions/:sessionName/clone`

**Current Location**:
- `StartSession`: `sessions.go:860-1424`
- `StopSession`: `sessions.go:1426-1532`
- `CloneSession`: `sessions.go:1534-1639`

**Dependencies**:
- `helpers.go`
- `auth.go` (for token regeneration in StartSession)

**StartSession Logic**:
- Handles both new session start and continuation
- For continuation:
  - Regenerates runner token
  - Deletes old job
  - Updates session metadata
  - Cleans up temp content pods
- Updates session phase to "Pending" for operator pickup

**StopSession Logic**:
- Gracefully stops a running session
- Deletes Job (cascades to Pods)
- Updates session phase to "Stopped"
- Preserves workspace state

**CloneSession Logic**:
- Creates a new session from an existing one
- Copies configuration
- New workspace PVC
- Optionally copies workspace content

---

### messages.go (~200 lines)
**Purpose**: Session messages and workspace content

**Handlers**:
- `GetSessionMessages(c *gin.Context)` - GET `/api/projects/:project/agentic-sessions/:sessionName/messages`
- `ListContent(c *gin.Context)` - GET `/api/projects/:project/agentic-sessions/:sessionName/content`
- `DownloadContent(c *gin.Context)` - GET `/api/projects/:project/agentic-sessions/:sessionName/content/download`
- `GetSessionResult(c *gin.Context)` - GET `/api/projects/:project/agentic-sessions/:sessionName/result`

**Current Location**:
- `GetSessionMessages`: `sessions.go:1641-1719`
- `ListContent`: `sessions.go:1721-1830`
- `DownloadContent`: `sessions.go:1832-1973`
- `GetSessionResult`: `sessions.go:1975-2034`

**Dependencies**: `helpers.go`

**Logic**:
- Reads from session workspace PVC
- Parses message files
- Handles file listing and downloads
- Returns session results

---

## Migration Steps

### Phase 1: Setup (No Breaking Changes)
1. Create `handlers/sessions/` directory
2. Create `helpers.go` with package-level vars
3. Update `main.go` to set `sessions.VariableName` instead of `handlers.VariableName`

### Phase 2: Move Self-Contained Code
4. Create and populate `parsers.go`
   - Move `parseSpec` and `parseStatus` functions
   - Update tests
5. Create and populate `auth.go`
   - Move `ProvisionRunnerTokenForSession`
   - Update bugfix package imports: `handlers.ProvisionRunnerTokenForSession` → `sessions.ProvisionRunnerTokenForSession`

### Phase 3: Move Handlers (One at a Time)
6. Create `list.go` - simplest handler, good starting point
7. Create `get.go` - simple, no side effects
8. Create `delete.go` - moderate complexity
9. Create `create.go` - complex, depends on auth.go
10. Create `lifecycle.go` - most complex, depends on auth.go
11. Create `messages.go` - moderate complexity

### Phase 4: Cleanup
12. Update route registration in `routes.go`
    - Change: `handlers.ListSessions` → `sessions.ListSessions`
13. Update all imports throughout codebase
14. Remove empty `handlers/sessions.go`
15. Update tests to use new package structure

### Phase 5: Documentation
16. Add package-level godoc to `sessions/helpers.go`
17. Update README or architecture docs
18. Add comments to complex functions

## Benefits

### Developer Experience
✅ **Easier navigation** - Find functionality by file name
✅ **Clearer ownership** - Each file has a single responsibility
✅ **Better testing** - Test files can mirror the structure (`create_test.go`, `lifecycle_test.go`)
✅ **Smaller diffs** - Changes typically affect one focused file

### Code Quality
✅ **Enforced separation of concerns** - Package structure prevents mixing responsibilities
✅ **Easier code review** - Reviewers can focus on specific areas
✅ **Better documentation** - Each file can have focused godoc

### Build Performance
✅ **Faster incremental builds** - Only recompile changed files
✅ **Parallel compilation** - Go can compile files concurrently

### Consistency
✅ **Follows existing patterns** - Matches `bugfix/` package organization
✅ **Sets precedent** - Template for future handler packages

## Implementation Checklist

- [ ] Create `handlers/sessions/` directory
- [ ] Create `helpers.go` with package-level vars and exports
- [ ] Create `parsers.go` with parseSpec/parseStatus
- [ ] Create `auth.go` with ProvisionRunnerTokenForSession
- [ ] Create `list.go` with ListSessions handler
- [ ] Create `get.go` with GetSession handler
- [ ] Create `delete.go` with DeleteSession handler
- [ ] Create `create.go` with CreateSession handler
- [ ] Create `lifecycle.go` with Start/Stop/Clone handlers
- [ ] Create `messages.go` with message/content handlers
- [ ] Update `main.go` to set sessions package vars
- [ ] Update `routes.go` to use sessions package handlers
- [ ] Update bugfix package to import `sessions.ProvisionRunnerTokenForSession`
- [ ] Update all other imports throughout codebase
- [ ] Remove old `handlers/sessions.go`
- [ ] Update tests to match new structure
- [ ] Add package-level documentation
- [ ] Update architecture documentation

## Risks and Mitigation

### Risk: Import Cycles
**Mitigation**: Keep dependencies unidirectional (helpers → parsers → auth/handlers)

### Risk: Breaking Changes
**Mitigation**: Make changes incrementally, test after each file migration

### Risk: Merge Conflicts
**Mitigation**: Complete refactoring in a single dedicated PR, coordinate with team

### Risk: Test Failures
**Mitigation**: Run full test suite after each file migration, update tests incrementally

## Testing Strategy

1. **Unit tests**: Create `sessions/` test files mirroring source files
   - `create_test.go`, `lifecycle_test.go`, etc.
2. **Integration tests**: Verify end-to-end flows still work
3. **Contract tests**: Ensure API responses unchanged
4. **Smoke tests**: Manual testing of all session operations

## References

- **Existing Pattern**: `handlers/bugfix/` package structure
- **Go Best Practices**: [Organizing Go Code](https://go.dev/blog/organizing-go-code)
- **Project Standards**: See `CLAUDE.md` backend development standards

---

**Status**: 📋 Planning
**Priority**: Medium (code quality improvement, no urgent functional need)
**Estimated Effort**: 1-2 days (careful migration, testing)
**Target**: Future PR (after current bugfix session work is complete)
