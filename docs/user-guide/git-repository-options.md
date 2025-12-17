# Git Repository Options Guide

This guide explains the git repository configuration options available when adding context repositories to your Ambient Code sessions.

## Overview

When adding a repository as context, you can configure how the runner interacts with git branches and remotes. Understanding these options helps you set up the right workflow for your use case.

**Key Feature**: The backend generates working branch names **before your session starts**, so you can see the exact branch that will be used right in the UI. This provides full transparency and helps you understand where your changes will go before the session executes.

## Required vs Optional Fields

**Only ONE field is strictly required:**

- **Repository URL**: The git repository to clone (HTTPS or SSH format)

**All other fields are optional** and provide advanced git workflow capabilities:

- **Working Branch** (optional): The branch to work on (created if it doesn't exist)
- **Sync with Remote/Upstream** (optional): Keep your fork in sync with a remote or upstream repository

## Configuration Options Explained

### 1. Working Branch

**What it is**: The branch you want to work on. The runner will check out this branch, creating it if it doesn't exist.

**Default behavior**:
- If not specified, the backend automatically generates a branch name based on the session name (with spaces replaced by hyphens)
- The generated branch name is visible in the UI before the session starts
- If the branch exists remotely, it will be checked out
- If the branch doesn't exist remotely, it will be created from the repository's default branch

**When to use**:
- You want to work on a specific existing branch (e.g., `develop`, `feature/my-work`)
- You want to create a new branch for your changes (e.g., `feature/add-login`)
- You're implementing a specific feature and want a descriptive branch name

**Example scenarios**:

```yaml
# Scenario 1: Work on existing 'develop' branch
Working Branch: develop
→ Runner clones repo and checks out 'develop'
→ All work happens on 'develop'
```

```yaml
# Scenario 2: Create new feature branch
Working Branch: feature/add-login
→ If 'feature/add-login' exists remotely: checkout that branch
→ If it doesn't exist: create it from the default branch
→ All changes go to 'feature/add-login'
```

```yaml
# Scenario 3: Not specified (auto-names from session)
Working Branch: (empty)
Session Name: "Add user authentication"
→ Backend generates branch name: 'Add-user-authentication'
→ UI shows "Branch: Add-user-authentication" before session starts
→ Runner creates/checks out 'Add-user-authentication' from default branch
→ All changes go to 'Add-user-authentication'
→ Makes it clear what the session worked on
```

**Protected branch detection**: If the working branch name matches common protected branch names (`main`, `master`, `develop`, `production`, etc.), the backend automatically detects this during session creation and generates a safe working branch name. The UI shows the actual branch that will be used (see Protected Branch Behavior below).

---

### 2. Sync with Remote/Upstream (Fork Workflow)

**What it is**: Configuration for keeping your fork synchronized with a remote or upstream (parent) repository.

**Default behavior**: If not specified, no remote synchronization occurs.

**When to use**:
- You're working with a forked repository
- You want to keep your branch up-to-date with the original project
- You need to rebase your changes onto the latest remote code

**Configuration fields**:
- **Remote/Upstream Repository URL**: The original repository your fork came from (or any remote you want to sync with)
- **Remote/Upstream Branch**: The branch to sync from (typically `main`)

**Example scenarios**:

```yaml
# Forked repository workflow
Repository URL: https://github.com/yourname/project-fork
Working Branch: feature/my-contribution
Sync:
  URL: https://github.com/original/project
  Branch: main

→ Runner clones your fork
→ Adds 'upstream' remote pointing to original repo
→ Checks out or creates 'feature/my-contribution'
→ Runs: git fetch upstream && git rebase upstream/main
→ Your working branch now includes latest upstream changes
```

**What happens during sync**:
1. Adds `upstream` remote pointing to the specified URL
2. Fetches the specified remote branch
3. Rebases your working branch onto `upstream/<branch>`
4. This ensures your changes are applied on top of the latest remote code

---

## Protected Branch Behavior

The backend automatically detects when you're working with a protected branch and generates a safe working branch name **before the session starts**.

### Protected Branch Names

The following branch names are considered protected:
- `main`, `master`
- `develop`, `dev`, `development`
- `production`, `prod`
- `staging`, `stage`
- `qa`, `test`, `stable`

### Automatic Protection

**When working branch is protected:**

The backend generates a **safe working branch name** and shows it in the UI:
```
Working Branch: main (protected)

→ Backend detects 'main' is protected during session creation
→ Generates working branch: work/main/<session-id>
→ UI displays: "Branch: work/main/abc123def"
→ Runner clones repo and checks out/creates this working branch
→ All changes go to the generated working branch
→ Original 'main' remains untouched
```

**Key improvement**: You can see the exact branch name that will be used **before the session starts**, providing full transparency in the UI.

This prevents accidental commits to protected branches while still allowing you to work with the latest code.

### Overriding Protection

If you genuinely need to work directly on a protected branch, you can enable the **"Allow direct work on this protected branch"** checkbox in the UI. This sets the `allowProtectedWork` flag.

**Use with extreme caution** - this disables the safety mechanism and allows direct commits to protected branches.

---

## Common Workflow Combinations

### Simple Clone (Minimal Configuration)

```yaml
Repository URL: https://github.com/org/project
# Everything else: default

Behavior:
→ Backend generates session-named branch (e.g., 'Fix-login-bug')
→ UI displays generated branch name before session starts
→ Runner clones repository's default branch (usually 'main')
→ Runner creates working branch from default
→ All changes committed to session-named branch
```

---

### Feature Branch Development

```yaml
Repository URL: https://github.com/org/project
Working Branch: feature/issue-123

Behavior:
→ Clones repository
→ If 'feature/issue-123' exists: checks it out
→ If it doesn't exist: creates it from default branch
→ All changes committed to feature/issue-123
→ Ready for PR: feature/issue-123 → main
```

---

### Fork Contribution Workflow

```yaml
Repository URL: https://github.com/yourname/project-fork
Working Branch: feature/fix-bug-456
Sync:
  URL: https://github.com/upstream/project
  Branch: main

Behavior:
→ Clones your fork
→ Adds upstream remote
→ Checks out or creates 'feature/fix-bug-456'
→ Fetches and rebases onto upstream/main
→ Working branch now has latest upstream changes
→ Changes committed to feature/fix-bug-456
→ Ready for PR: yourname:feature/fix-bug-456 → upstream:main
```

---

### Working from Release Branch

```yaml
Repository URL: https://github.com/org/project
Working Branch: hotfix/critical-issue
Sync:
  URL: https://github.com/org/project
  Branch: release/v2.0

Behavior:
→ Clones repository
→ Creates 'hotfix/critical-issue' from default branch
→ Syncs with release/v2.0 branch
→ All changes committed to hotfix branch
→ Ready for PR: hotfix/critical-issue → release/v2.0
```

---

## What Happens Under the Hood

### Repository Initialization Sequence

1. **Backend Branch Name Generation** (before session starts)
   ```
   Backend receives request with optional workingBranch

   If workingBranch specified:
     - Use that branch (unless it's protected)

   If workingBranch is protected and allowProtectedWork is false:
     - Generate: work/<branch>/<session-id>

   If no workingBranch specified:
     - Generate from session name: <session-name-sanitized>

   Store generated branch name in session spec
   Display in UI before session starts
   ```

2. **Clone Phase** (runner execution)
   ```bash
   # Runner executes (simplified)
   git clone <url> <directory>
   ```

3. **Working Branch Checkout/Creation**
   ```bash
   # Runner reads branch name from session spec (already generated by backend)
   # Try to checkout if exists remotely
   git checkout <branch>

   # Or create it if doesn't exist
   git checkout -b <branch>
   ```

4. **Remote/Upstream Sync** (if configured)
   ```bash
   git remote add upstream <sync.url>
   git fetch upstream <sync.branch>
   git rebase upstream/<sync.branch>
   ```

5. **Ready for Work**
   - Working directory is now on the appropriate branch
   - Claude can read/modify files
   - Changes will be committed to the active branch

---

## Error Handling

The runner handles git errors gracefully:

### Authentication Failures
```
⚠️ Authentication failed for <repo> - continuing without this repository
```
**Cause**: Invalid credentials or no access to private repo
**Solution**: Check that your GitHub/GitLab token has access to the repository

### Branch Not Found
```
ℹ️ Branch 'feature-xyz' not found remotely - creating it from default branch
```
**Cause**: Specified working branch doesn't exist in remote
**Action**: Automatic - branch created from repository's default branch

### Protected Branch Handling
**UI Behavior**: When you specify a protected branch name (e.g., `main`), the UI immediately shows the generated working branch name (e.g., `work/main/<session-id>`) before you create the session.

**Action**: Automatic - safe working branch name generated by backend to protect the original branch. No runtime warnings needed since the branch name is determined and visible upfront.

---

## Best Practices

1. **Verify Branch Name in UI Before Starting Session**
   - Always check the displayed branch name in the UI before starting your session
   - Confirms you understand where your changes will go
   - Especially important for protected branch scenarios

2. **Use Descriptive Branch Names**
   - Use clear working branch names: `feature/add-user-auth`
   - Include issue numbers: `fix/issue-123`
   - Makes it clear what the session is working on

3. **Leverage Remote/Upstream Sync for Forks**
   - Always work with latest remote code
   - Reduces merge conflicts
   - Ensures compatibility with parent project

4. **Let Protected Branches Stay Protected**
   - Check the generated working branch name in the UI when working with protected branches
   - Only enable "allow protected work" if you have a specific need
   - Helps prevent accidental changes to critical branches

5. **Specify Working Branches Explicitly**
   - Instead of relying on defaults, specify your intended branch
   - If creating a new feature, use `feature/name-here`
   - If working on existing branch, specify it clearly

6. **Match Your Team's Workflow**
   - If team uses specific branch naming conventions, follow them
   - If team requires PRs from forks, configure sync
   - Align runner behavior with your git conventions

---

## Quick Reference

| Scenario | Working Branch | Sync | Result |
|----------|----------------|------|--------|
| Simple clone | _(empty)_ | _(none)_ | Creates session-named branch from default |
| Feature development | `feature/my-work` | _(none)_ | Create or checkout feature branch, work there |
| Fork contribution | `feature/contribution` | `remote: upstream/main` | Clone fork, sync with upstream, work on feature |
| Existing branch work | `develop` | _(none)_ | Checkout existing develop branch, work there |
| Protected override | `main` + allow protected | _(none)_ | Work directly on main (⚠️ caution) |

---

## Related Documentation

- [Multi-Repo Support](../adr/0003-multi-repo-support.md) - Architecture decision for multi-repository sessions
- [Runner Documentation](../CLAUDE_CODE_RUNNER.md) - Claude Code runner implementation details
- [GitLab Integration](../gitlab-integration.md) - Working with GitLab repositories
