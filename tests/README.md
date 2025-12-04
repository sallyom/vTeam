# Tests

This directory contains project-level tests for the Ambient Code Platform.

## Test Structure

- `integration/` - Integration tests requiring real Kubernetes clusters
- `test_agents_md_symlink.sh` - Validates AGENTS.md symlink for Cursor compatibility

## AGENTS.md Symlink Test

The `test_agents_md_symlink.sh` script validates that the `AGENTS.md` → `CLAUDE.md` symlink works correctly for Cursor and other AI coding tools.

### What It Tests

1. ✅ AGENTS.md exists and is a valid symlink
2. ✅ Symlink points to CLAUDE.md
3. ✅ Content is readable through symlink
4. ✅ Content matches CLAUDE.md exactly
5. ✅ File is tracked by git correctly (mode 120000)
6. ✅ Contains expected project context
7. ✅ All required documentation sections exist
8. ✅ File size is reasonable

### Running Locally

```bash
./tests/test_agents_md_symlink.sh
```

### CI Integration

The test runs automatically in GitHub Actions on PRs that modify:
- `AGENTS.md`
- `CLAUDE.md`
- `tests/test_agents_md_symlink.sh`
- `.github/workflows/test-agents-md-symlink.yml`

See `.github/workflows/test-agents-md-symlink.yml` for the CI workflow.

### Why a Symlink?

**Problem**: Claude Code uses `CLAUDE.md`, Cursor uses `AGENTS.md`

**Solution**: Symlink eliminates duplication and maintenance overhead

**Benefits**:
- Zero maintenance (single source of truth)
- No sync issues between files
- Git tracks symlinks correctly across platforms
- Works on macOS, Linux, WSL, and Windows (with symlink support)

### Cross-Platform Notes

- **macOS/Linux/WSL**: Native symlink support ✅
- **Windows**: Git for Windows handles symlinks correctly when cloned ✅
- **Git behavior**: Stores symlinks as special objects (mode 120000), content is the link target

## Component-Specific Tests

See component README files for testing details:

- Backend: `components/backend/tests/`
- Frontend: `components/frontend/` (Cypress e2e tests)
- Operator: `components/operator/` (controller tests)
- Claude Runner: `components/runners/claude-code-runner/tests/`
