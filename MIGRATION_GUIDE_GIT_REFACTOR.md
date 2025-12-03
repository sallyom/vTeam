# Migration Guide: Git Operations Refactoring

## Overview

This guide documents the refactoring of git operations from the Python runner to the Go backend, making the architecture runner-agnostic.

**Issue**: #376 - Session should not fail if Context Repo cloning fails & other Git Operation Issues

**Goal**: Move git clone logic from Python runner to Go init container, so any runner can work with pre-configured workspaces.

## Architecture Changes

### Before (Current)
```
Operator → Creates Job → Runner starts → Runner clones repos (Python) → Runner executes code
```

Problems:
- Git logic tightly coupled to Python runner
- Other runners (future: Node, Rust, etc.) must reimplement git operations
- Session fails if git clone fails in runner

### After (Refactored)
```
Operator → Creates Job → Init Container clones repos (Go) → Runner starts → Runner executes code
```

Benefits:
- Git logic centralized in Go backend
- Runner-agnostic: any runner can use pre-configured workspace
- Graceful error handling before runner starts
- Protected branch detection happens in init container
- Sync/upstream repository support in one place

## Components Modified

### 1. Backend Git Operations (`components/backend/git/operations.go`)

**Added Functions:**
- `CloneWithOptions(ctx, opts)` - Enhanced clone with branch management
- `setupSyncRemote(ctx, repoDir, syncURL, syncBranch, token)` - Configure upstream sync
- `configureGitIdentity(ctx, repoDir)` - Set git user.name/email
- `DetectAvailableBaseBranches(ctx, repoURL, token)` - List available branches
- `CheckBranchExistsRemote(ctx, repoURL, branchName, token)` - Check if branch exists
- Enhanced `IsProtectedBranch(branchName)` - More comprehensive protected branch detection

**CloneOptions struct:**
```go
type CloneOptions struct {
    URL                string
    BaseBranch         string // Primary branch to clone from (default: main)
    FeatureBranch      string // Optional working branch
    AllowProtectedWork bool   // Allow direct work on protected branch
    SyncURL            string // Optional upstream/sync repository URL
    SyncBranch         string // Branch to sync from upstream (default: main)
    Token              string // Authentication token
    DestinationDir     string // Where to clone the repository
    SessionID          string // Session ID for working branch naming
}
```

### 2. Git Init Container (`components/git-init-container/`)

**New Component:**
- `main.go` - Init container entry point
- `Dockerfile` - Container image build
- `go.mod` - Go module configuration
- `README.md` - Documentation

**Responsibilities:**
1. Parse `REPOS_JSON` environment variable
2. Clone each repository with enhanced options
3. Handle protected branches (create working branches)
4. Setup sync remotes and rebase if configured
5. Configure git identity
6. Create artifacts directory

### 3. Operator Changes (Pending)

**File**: `components/operator/internal/handlers/sessions.go`

**Current Init Container:**
```go
InitContainers: []corev1.Container{
    {
        Name:  "init-workspace",
        Image: "registry.access.redhat.com/ubi8/ubi-minimal:latest",
        Command: []string{
            "sh", "-c",
            fmt.Sprintf("mkdir -p /workspace/sessions/%s/workspace && chmod 777 /workspace/sessions/%s/workspace && echo 'Workspace initialized'", name, name),
        },
        VolumeMounts: []corev1.VolumeMount{
            {Name: "workspace", MountPath: "/workspace"},
        },
    },
},
```

**New Init Container (Proposed):**
```go
InitContainers: []corev1.Container{
    {
        Name:            "git-init",
        Image:           appConfig.GitInitContainerImage, // e.g., "ghcr.io/ambient-code/git-init:latest"
        ImagePullPolicy: appConfig.ImagePullPolicy,
        Env: []corev1.EnvVar{
            {Name: "WORKSPACE_PATH", Value: fmt.Sprintf("/workspace/sessions/%s/workspace", name)},
            {Name: "SESSION_ID", Value: name},
            // Pass REPOS_JSON from spec.repos
            {Name: "REPOS_JSON", Value: func() string {
                if spec, ok := currentObj.Object["spec"].(map[string]interface{}); ok {
                    if repos, ok := spec["repos"].([]interface{}); ok && len(repos) > 0 {
                        b, _ := json.Marshal(repos)
                        return string(b)
                    }
                }
                return ""
            }()},
            // Pass legacy single-repo configuration as fallback
            {Name: "INPUT_REPO_URL", Value: inputRepo},
            {Name: "INPUT_BRANCH", Value: inputBranch},
            // Pass GitHub token for authentication
            {Name: "GITHUB_TOKEN", ValueFrom: &corev1.EnvVarSource{
                SecretKeyRef: &corev1.SecretKeySelector{
                    LocalObjectReference: corev1.LocalObjectReference{Name: integrationSecretsName},
                    Key:                  "GITHUB_TOKEN",
                    Optional:             boolPtr(true),
                },
            }},
        },
        VolumeMounts: []corev1.VolumeMount{
            {Name: "workspace", MountPath: "/workspace"},
        },
    },
},
```

**Config Changes:**
Add to `components/operator/internal/config/config.go`:
```go
type Config struct {
    // ... existing fields ...
    GitInitContainerImage string `envconfig:"GIT_INIT_CONTAINER_IMAGE" default:"ghcr.io/ambient-code/git-init:latest"`
}
```

### 4. Runner Changes (Pending)

**File**: `components/runners/claude-code-runner/wrapper.py`

**Current `_prepare_workspace()` method**: ~250 lines of git clone logic

**Simplified `_prepare_workspace()` method**:
```python
async def _prepare_workspace(self):
    """Verify workspace is ready (git operations already done by init container)."""
    workspace = Path(self.context.workspace_path)

    # Verify workspace directory exists
    if not workspace.exists():
        raise RuntimeError(f"Workspace directory does not exist: {workspace}")

    logging.info(f"Workspace ready at {workspace}")

    # Verify repositories were cloned successfully
    repos_cfg = self._get_repos_config()
    if repos_cfg:
        for r in repos_cfg:
            name = (r.get('name') or '').strip()
            if name:
                repo_dir = workspace / name
                if not (repo_dir / ".git").exists():
                    logging.warning(f"Repository {name} not found in workspace, may have failed during init")

    # Create artifacts directory if it doesn't exist (belt-and-suspenders)
    artifacts_dir = workspace / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)
```

**Functions to Remove:**
- `_handle_protected_branch()` - Now in Go backend
- `_is_protected_branch()` - Now in Go backend
- `_prompt_create_branch()` - Now in Go backend
- `_setup_sync_remote()` - Now in Go backend
- `_setup_repository_with_options()` - Now in Go backend
- All git clone logic in `_prepare_workspace()` - Now in init container

**Total Lines Removed**: ~600 lines of Python git logic

## Migration Steps

### Phase 1: Build and Deploy Init Container

1. **Build init container image**:
   ```bash
   cd components/git-init-container
   docker build -f Dockerfile -t ghcr.io/ambient-code/git-init:latest ../..
   docker push ghcr.io/ambient-code/git-init:latest
   ```

2. **Update operator configuration**:
   ```bash
   # In operator deployment manifest
   kubectl set env deployment/ambient-operator \
     GIT_INIT_CONTAINER_IMAGE=ghcr.io/ambient-code/git-init:latest
   ```

### Phase 2: Update Operator

1. **Modify `sessions.go`** to use new init container (see above)
2. **Test with existing sessions** to ensure backward compatibility
3. **Verify init container logs** show successful git operations

### Phase 3: Simplify Runner

1. **Remove git clone logic** from wrapper.py
2. **Simplify `_prepare_workspace()`** to just verify directories exist
3. **Test runner** with pre-configured workspace
4. **Verify all workflows** still work correctly

### Phase 4: Testing

1. **Test scenarios**:
   - Single repository (legacy mode)
   - Multiple repositories
   - Protected branch handling
   - Feature branch creation
   - Sync/upstream repository
   - Non-existent branch handling
   - Authentication failures

2. **Verify graceful error handling**:
   - Session should not crash if git init fails
   - Errors should be visible in init container logs
   - Runner should start even if some repos fail

### Phase 5: Cleanup

1. **Remove unused Python functions** from wrapper.py
2. **Update documentation** to reflect new architecture
3. **Archive old git logic** for reference

## Backward Compatibility

The refactoring maintains full backward compatibility:

1. **Legacy single-repo mode** still works (`INPUT_REPO_URL`, `INPUT_BRANCH`)
2. **Multi-repo mode** works with both old and new schemas
3. **Existing sessions** can be resumed without changes
4. **Frontend changes** already shipped in PR #376 are compatible

## Testing Checklist

- [ ] Init container builds successfully
- [ ] Init container runs in operator-created pods
- [ ] Single repository clones correctly
- [ ] Multiple repositories clone correctly
- [ ] Protected branches create working branches
- [ ] Feature branches are checked out correctly
- [ ] Sync/upstream repositories fetch and rebase
- [ ] Git identity is configured (user.name, user.email)
- [ ] Artifacts directory is created
- [ ] Runner starts with pre-configured workspace
- [ ] Runner can read/write to repositories
- [ ] Sessions can be resumed with existing workspaces
- [ ] Error messages are clear and actionable

## Rollback Plan

If issues are encountered:

1. **Revert operator** to use simple init container
2. **Restore runner** with full git clone logic
3. **Keep frontend changes** (they work with both approaches)
4. **Debug init container** in isolation
5. **Gradual rollout** to subset of users first

## Performance Improvements

Expected improvements:

1. **Faster Runner Startup**: Repos already cloned when runner starts
2. **Parallel Cloning**: Init container can clone repos in parallel (future optimization)
3. **Better Error Messages**: Git errors visible in init container logs, not buried in runner output
4. **Reduced Runner Image Size**: No git-specific dependencies needed in runner

## Security Considerations

1. **Token Handling**: Init container receives GITHUB_TOKEN via secretKeyRef, not exposed in pod spec
2. **Workspace Permissions**: Init container creates workspace with correct permissions for runner
3. **Git Credentials**: Tokens are injected into URLs, not stored in git config
4. **Protected Branch Safety**: Working branches automatically created for protected branches

## Future Enhancements

1. **Parallel Cloning**: Clone multiple repos concurrently
2. **Sparse Checkout**: Clone only specific directories
3. **Shallow Clone**: Use `--depth 1` for faster cloning
4. **GitLab Support**: Add GitLab-specific token handling
5. **Bitbucket Support**: Extend to Bitbucket repositories
6. **Git LFS**: Handle large file storage
7. **Submodule Support**: Initialize git submodules

## Questions and Answers

**Q: Why not keep git logic in runner?**
A: We want the platform to support multiple runner types (Node, Rust, etc.). Each would need to reimplement git operations. Centralizing in Go makes it runner-agnostic.

**Q: What if init container fails?**
A: The pod will remain in Init phase, visible in kubectl/UI. Session status will show "Creating" until init completes or times out.

**Q: Can we still use the old runner?**
A: Yes, the old runner with git logic still works. This refactoring is about having the option to use simpler runners.

**Q: Performance impact?**
A: Positive. Repos are cloned before runner starts, so runner startup is faster.

**Q: What about session resumption?**
A: Init container checks if repos already exist (from parent session) and skips cloning, just verifies directory structure.

## References

- Issue #376: https://github.com/ambient-code/platform/issues/376
- Original PR: (issue-376 branch)
- Go backend git package: `components/backend/git/operations.go`
- Init container: `components/git-init-container/`
- Operator session handler: `components/operator/internal/handlers/sessions.go`

## Contact

For questions or issues during migration:
- File issue on GitHub: https://github.com/ambient-code/platform/issues
- Tag relevant team members in PR comments
