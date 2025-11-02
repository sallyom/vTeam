# BugFix Workspace

A Kubernetes-native AI-powered workflow for automated bug analysis and implementation using Claude Code.

## Overview

BugFix Workspace automates the bug fixing process through two distinct AI sessions:
1. **Bug Review** - Claude analyzes the issue and creates a detailed assessment with implementation plan
2. **Bug Implementation** - Claude implements the fix following the review assessment

All analysis is posted to GitHub as concise comments with detailed reports in GitHub Gists, keeping issue threads clean while preserving full context.

## Key Features

- **Two-phase workflow**: Separate review and implementation sessions for better quality control
- **GitHub Integration**: Works directly with GitHub Issues and creates PRs automatically
- **Gist-based reports**: Detailed analysis posted to GitHub Gists, short summaries in issue comments
- **Configurable**: Base branch, feature branch, LLM settings (model, temperature, tokens)
- **Multi-repo support**: Can work across multiple repositories simultaneously
- **Session runtime**: Configurable timeout (default: 4 hours) for long-running fixes

## Quick Start

### 1. Create BugFix Workflow

**From GitHub Issue:**
```
Implementation Repository URL: https://github.com/org/repo
Base Branch: main
Feature Branch Name: bugfix/gh-123
GitHub Issue URL: https://github.com/org/repo/issues/123
```

**From Text Description:**
- Provide bug symptoms, reproduction steps, expected/actual behavior
- System creates GitHub Issue automatically

### 2. Run Bug Review Session

- Click "Create Session" → Select "Bug Review"
- Claude analyzes the bug and creates implementation plan
- Posts Gist with detailed assessment
- Adds short summary comment to GitHub Issue with Gist link

### 3. Run Implementation Session

- Click "Create Session" → Select "Bug Implementation"
- Claude fetches the review Gist for context
- Implements the fix on feature branch
- Posts implementation summary with PR instructions

### 4. Review & Merge

- Review the feature branch locally or on GitHub
- Create PR if not auto-created
- Merge when ready

## What Happens Under the Hood

### Bug Review Session
1. Clones **base branch** (e.g., `main`)
2. Analyzes code and GitHub Issue
3. Creates detailed assessment (root cause, affected components, fix strategy)
4. Uploads assessment to **GitHub Gist** (public, under your account)
5. Posts **short summary comment** to Issue with Gist link
6. Stores Gist URL in workflow metadata

### Bug Implementation Session
1. Clones **base branch** (starts fresh)
2. Fetches bug-review **Gist content** for full context
3. Implements fix following the assessment strategy
4. Creates **feature branch** from base + changes
5. Pushes to remote feature branch
6. Posts implementation summary with PR creation instructions
7. Uploads detailed implementation report to Gist

## Configuration Options

### Session Settings
- **Interactive Mode**: Chat with Claude during session (default: batch mode)
- **Auto-push**: Automatically push changes (default: enabled)
- **LLM Settings**:
  - Model: `claude-sonnet-4-20250514` (default)
  - Temperature: `0.7` (default)
  - Max Tokens: `4000` (default)

### Workflow Settings
- **Base Branch**: Branch to start from (e.g., `main`, `develop`)
- **Feature Branch**: Target branch for fixes (e.g., `bugfix/gh-123`)
- **Session Runtime**: Max duration per session (default: 4 hours, configurable at cluster level)

## Requirements

### GitHub Personal Access Token (PAT)
Your PAT must have these scopes:
- ✅ **repo** - Full control of private repositories
- ✅ **gist** - Create and read gists

Update token in Kubernetes secret:
```bash
kubectl create secret generic ambient-runner-secrets \
  -n <your-namespace> \
  --from-literal=GIT_TOKEN=<your-token> \
  --dry-run=client -o yaml | kubectl apply -f -
```

### Project Configuration
- ProjectSettings CR must exist in namespace
- GitHub token configured in runner secrets

## Example Workflow

**Issue**: https://github.com/ambient-code/vTeam/issues/210
*"ACP gets confused when making workspace for repo with existing specs"*

**Bug Review Session** (`210-bug-review-1762118289`):
- Analyzed 8KB of context
- Posted Gist: https://gist.github.com/.../bug-review-issue-210.md
- GitHub comment: Short summary with Gist link

**Implementation Session** (`210-bug-implement-fix-1762118456`):
- Fetched bug-review Gist for full context
- Implemented fix on `bugfix/gh-210` branch
- Posted Gist: https://gist.github.com/.../implementation-issue-210.md
- GitHub comment: Summary with PR creation steps

**Result**: Clean GitHub Issue thread, comprehensive documentation in Gists, working fix ready for review.

## Tips

- **Run review first**: Implementation sessions work best with existing review context
- **Check Gists**: Full technical details are in Gists, not issue comments
- **Feature branches**: Each workflow creates one feature branch, multiple sessions update it
- **Session failures**: Check logs for permission issues, network errors, or runtime limits

## Support

- View session logs in UI or via `kubectl logs -n <namespace> <session-pod>`
- Check workflow status: `kubectl get bugfixworkflows -n <namespace> <workflow-id> -o yaml`
- Session phases: Pending → Running → Completed/Failed

---

*Generated with vTeam BugFix Workspace - Automated bug fixing powered by Claude Code*
