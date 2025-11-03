# vTeam Testing Guide

This directory contains tests for the vTeam platform, organized by component and test type.

## Test Structure

```
tests/
├── backend/
│   └── bugfix/
│       ├── handlers_test.go           # Contract tests (API behavior)
│       └── integration/              # Integration tests (E2E scenarios)
│           ├── bug_review_session_test.go
│           ├── bug_resolution_plan_session_test.go
│           ├── bug_implement_fix_session_test.go
│           ├── generic_session_test.go
│           ├── create_from_text_test.go
│           └── jira_sync_test.go
└── frontend/
    └── bugfix/
        ├── JiraSyncButton.test.tsx
        ├── SessionSelector.test.tsx
        └── WorkspaceCreator.test.tsx
```

## Backend Tests

### Prerequisites

- Go 1.23+
- Access to a Kubernetes cluster (for integration tests)
- GitHub personal access token (for integration tests)
- Jira credentials (for Jira integration tests)

### Running Backend Tests Locally

#### Contract Tests

Contract tests validate API endpoint behavior without requiring a running server. They currently serve as documentation and are skipped by default.

```bash
cd components/backend

# Run all contract tests
make test-contract

# Or run directly
go test ../../tests/backend/bugfix/handlers_test.go -v
```

**Note:** These tests are currently skipped with `t.Skip()` as they require a running API server. To enable them, remove the skip statements and set up the test server.

#### Integration Tests

Integration tests require a fully configured environment:

```bash
cd components/backend

# Validate test structure (compile without running)
go test -c ../../tests/backend/bugfix/integration/... -o /tmp/bugfix-tests

# Run integration tests (requires K8s cluster)
TEST_NAMESPACE=ambient-code-test \
CLEANUP_RESOURCES=true \
go test ../../tests/backend/bugfix/integration/... -v -timeout=5m
```

**Environment Variables:**

- `TEST_NAMESPACE`: Kubernetes namespace for test resources (default: `ambient-code-test`)
- `CLEANUP_RESOURCES`: Auto-delete resources after tests (default: `true`)
- `GITHUB_TOKEN`: GitHub personal access token for API calls
- `JIRA_URL`: Jira instance URL
- `JIRA_API_TOKEN`: Jira API token
- `JIRA_PROJECT`: Jira project key

#### Static Analysis

Validate code quality without running tests:

```bash
cd components/backend

# Run go vet on BugFix handlers
go vet ./handlers/bugfix/...
go vet ./crd/bugfix.go
go vet ./types/bugfix.go

# Run full linting
make lint
```

### Backend Test Types

#### Contract Tests (`handlers_test.go`)

Test API contract validation:

- ✅ Request validation
- ✅ Response structure
- ✅ Error handling
- ✅ Status codes

**Status:** Defined but skipped (require API server setup)

#### Integration Tests (`integration/`)

End-to-end workflow tests:

| Test File | Purpose | Status |
|-----------|---------|--------|
| `bug_review_session_test.go` | Bug analysis session lifecycle | Defined, skipped |
| `bug_resolution_plan_session_test.go` | Resolution planning session | Defined, skipped |
| `bug_implement_fix_session_test.go` | Fix implementation session | Defined, skipped |
| `generic_session_test.go` | Generic session creation | Defined, skipped |
| `create_from_text_test.go` | Workspace from text description | Defined, skipped |
| `jira_sync_test.go` | Jira synchronization flow | Defined, skipped |

**Status:** All integration tests are currently skipped pending environment setup.

**To Enable:**
1. Deploy backend API to test environment
2. Configure Kubernetes cluster access
3. Set up GitHub token in secrets
4. Configure Jira test instance
5. Remove `t.Skip()` statements

## Frontend Tests

### Prerequisites

- Node.js 20+
- npm 10+

### Running Frontend Tests Locally

#### Setup Vitest (if not configured)

Add to `components/frontend/package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  },
  "devDependencies": {
    "vitest": "^2.0.0",
    "@vitest/ui": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0"
  }
}
```

Create `components/frontend/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

#### Run Tests

```bash
cd components/frontend

# Install dependencies
npm ci

# Run all tests
npm test

# Run BugFix tests only
npm test -- tests/frontend/bugfix/

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage
```

### Frontend Test Coverage

| Component | Test File | Coverage |
|-----------|-----------|----------|
| `JiraSyncButton` | `JiraSyncButton.test.tsx` | ✅ Defined |
| `SessionSelector` | `SessionSelector.test.tsx` | ✅ Defined |
| `WorkspaceCreator` | `WorkspaceCreator.test.tsx` | ✅ Defined |

## CI/CD Integration

Tests run automatically via GitHub Actions when BugFix-related code changes:

### Workflow: `bugfix-tests.yml`

**Triggers:**
- Push to `main` branch
- Pull requests to `main`
- Manual dispatch

**Change Detection:**

The workflow uses path filtering to run tests only when relevant files change:

**Backend triggers:**
- `components/backend/handlers/bugfix/**`
- `components/backend/crd/bugfix.go`
- `components/backend/types/bugfix.go`
- `components/backend/jira/**`
- `tests/backend/bugfix/**`

**Frontend triggers:**
- `components/frontend/src/app/projects/[name]/bugfix/**`
- `components/frontend/src/components/workspaces/bugfix/**`
- `components/frontend/src/services/api/bugfix.ts`
- `components/frontend/src/services/queries/bugfix.ts`
- `tests/frontend/bugfix/**`

**Jobs:**
1. **detect-bugfix-changes** - Determines which components changed
2. **test-backend-bugfix** - Runs backend tests (contract + integration validation)
3. **test-frontend-bugfix** - Runs frontend unit tests
4. **test-summary** - Aggregates results

### Manual Workflow Execution

```bash
# Trigger via GitHub CLI
gh workflow run bugfix-tests.yml

# Or via GitHub UI:
# Actions → BugFix Workflow Tests → Run workflow
```

## Test Development Guidelines

### Adding New Backend Tests

1. Choose test type:
   - **Contract test**: Add to `handlers_test.go` for API validation
   - **Integration test**: Create new file in `integration/` for E2E scenarios

2. Follow existing patterns:
   ```go
   func TestMyFeature(t *testing.T) {
       t.Skip("Integration test - requires ...")

       // Setup
       // Execute
       // Assert
       // Cleanup
   }
   ```

3. Document requirements in skip message

### Adding New Frontend Tests

1. Create test file alongside component:
   ```
   tests/frontend/bugfix/MyComponent.test.tsx
   ```

2. Use Vitest + React Testing Library:
   ```typescript
   import { render, screen } from '@testing-library/react';
   import { vi } from 'vitest';

   describe('MyComponent', () => {
     it('should render correctly', () => {
       // Test implementation
     });
   });
   ```

## Troubleshooting

### Backend Tests

**Error: `go: cannot find main module`**
- Solution: Run tests from `components/backend/` directory

**Error: `failed to connect to Kubernetes`**
- Solution: Set up `kubeconfig` or skip integration tests

**Error: `GitHub API rate limit`**
- Solution: Set `GITHUB_TOKEN` environment variable

### Frontend Tests

**Error: `Cannot find module '@/...'`**
- Solution: Configure path aliases in `vitest.config.ts`

**Error: `ReferenceError: document is not defined`**
- Solution: Set `environment: 'jsdom'` in vitest config

**Error: `fetch is not defined`**
- Solution: Add `whatwg-fetch` polyfill or use Node 18+

## Future Improvements

- [ ] Set up test environment for integration tests
- [ ] Configure Vitest for frontend tests
- [ ] Add code coverage reporting
- [ ] Implement E2E tests with Cypress/Playwright
- [ ] Add performance benchmarks
- [ ] Set up visual regression testing
- [ ] Enable contract tests with test server
- [ ] Add mutation testing

## Resources

- [Go Testing Documentation](https://pkg.go.dev/testing)
- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [vTeam Backend Makefile](../components/backend/Makefile)
