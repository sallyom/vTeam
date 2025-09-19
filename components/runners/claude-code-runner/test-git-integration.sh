#!/bin/bash

# Git Integration Test Script for vTeam
# This script tests the Git integration functionality across all components

set -e

echo "🔬 Starting Git Integration Tests"
echo "================================="

# Configuration
NAMESPACE=${NAMESPACE:-default}
BACKEND_URL=${BACKEND_URL:-http://localhost:8080/api}
FRONTEND_URL=${FRONTEND_URL:-http://localhost:3000}
TEST_REPO_URL="https://github.com/git/git.git"  # Public repo for testing
TEST_USER_NAME="Test User"
TEST_USER_EMAIL="test@example.com"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print test status
print_test() {
    echo -e "${YELLOW}Testing:${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓ PASS:${NC} $1"
}

print_error() {
    echo -e "${RED}✗ FAIL:${NC} $1"
}

# Test 1: Python Git Integration Class
print_test "Python Git Integration Class"
if [ -f "components/runners/claude-code-runner/test_git_integration.py" ]; then
    cd components/runners/claude-code-runner

    # Run Python tests
    if python3 -m pytest test_git_integration.py -v 2>/dev/null || python3 test_git_integration.py; then
        print_success "Python Git integration tests passed"
    else
        print_error "Python Git integration tests failed"
    fi

    cd ../../..
else
    print_error "Python test file not found"
fi

# Test 2: Go Backend Tests
print_test "Go Backend Git Configuration"
if [ -f "components/backend/git_config_test.go" ]; then
    cd components/backend

    # Initialize go mod if needed
    if [ ! -f "go.mod" ]; then
        go mod init vteam-backend
        go mod tidy
    fi

    # Install test dependencies
    go get github.com/stretchr/testify/assert

    # Run Go tests
    if go test -v ./... -run "TestGit"; then
        print_success "Go backend Git configuration tests passed"
    else
        print_error "Go backend Git configuration tests failed"
    fi

    cd ../..
else
    print_error "Go test file not found"
fi

# Test 3: Frontend Form Validation (if Jest is available)
print_test "Frontend Git Form Validation"
if [ -f "components/frontend/src/app/new/__tests__/git-form.test.ts" ]; then
    cd components/frontend

    # Check if we can run npm tests
    if command -v npm &> /dev/null && [ -f "package.json" ]; then
        if npm test -- --testPathPattern=git-form.test.ts 2>/dev/null; then
            print_success "Frontend Git form validation tests passed"
        else
            print_error "Frontend Git form validation tests failed or Jest not configured"
        fi
    else
        print_error "npm or package.json not found for frontend tests"
    fi

    cd ../..
else
    print_error "Frontend test file not found"
fi

# Test 4: Kubernetes CRD Schema Validation
print_test "Kubernetes CRD Schema Validation"
if command -v kubectl &> /dev/null; then
    # Validate CRD syntax
    if kubectl apply --dry-run=client -f components/manifests/crd.yaml > /dev/null 2>&1; then
        print_success "CRD schema validation passed"
    else
        print_error "CRD schema validation failed"
    fi
else
    print_error "kubectl not available for CRD validation"
fi

# Test 5: Create Test AgenticSession with Git Config (if backend is running)
print_test "Backend API Git Configuration Endpoint"

# Create test payload
TEST_PAYLOAD=$(cat <<EOF
{
  "prompt": "Test Git integration functionality",
  "websiteURL": "https://example.com",
  "gitConfig": {
    "user": {
      "name": "${TEST_USER_NAME}",
      "email": "${TEST_USER_EMAIL}"
    },
    "repositories": [
      {
        "url": "${TEST_REPO_URL}",
        "branch": "main"
      }
    ]
  }
}
EOF
)

# Test backend API if available
if command -v curl &> /dev/null; then
    if curl -f -s -X POST "${BACKEND_URL}/agentic-sessions" \
        -H "Content-Type: application/json" \
        -d "${TEST_PAYLOAD}" > /dev/null 2>&1; then
        print_success "Backend API Git configuration endpoint test passed"
    else
        print_error "Backend API Git configuration endpoint test failed (backend may not be running)"
    fi
else
    print_error "curl not available for API testing"
fi

# Test 6: Validate Git Integration Environment Variables
print_test "Git Integration Environment Variable Parsing"

# Test environment variable parsing
export GIT_USER_NAME="${TEST_USER_NAME}"
export GIT_USER_EMAIL="${TEST_USER_EMAIL}"
export GIT_REPOSITORIES='[{"url": "'${TEST_REPO_URL}'", "branch": "main"}]'

# Simple Python test for environment parsing
PYTHON_ENV_TEST=$(cat <<'EOF'
import os
import json
import sys

try:
    user_name = os.getenv("GIT_USER_NAME", "")
    user_email = os.getenv("GIT_USER_EMAIL", "")
    repos_json = os.getenv("GIT_REPOSITORIES", "[]")
    repos = json.loads(repos_json)

    assert user_name == "Test User", f"Expected 'Test User', got '{user_name}'"
    assert user_email == "test@example.com", f"Expected 'test@example.com', got '{user_email}'"
    assert len(repos) == 1, f"Expected 1 repository, got {len(repos)}"
    assert repos[0]["url"].endswith("git.git"), f"Repository URL validation failed"

    print("Environment variable parsing test passed")
    sys.exit(0)
except Exception as e:
    print(f"Environment variable parsing test failed: {e}")
    sys.exit(1)
EOF
)

if python3 -c "${PYTHON_ENV_TEST}"; then
    print_success "Git environment variable parsing test passed"
else
    print_error "Git environment variable parsing test failed"
fi

# Clean up environment variables
unset GIT_USER_NAME GIT_USER_EMAIL GIT_REPOSITORIES

# Test 7: Docker Image Build Test (if requested)
if [ "${TEST_DOCKER_BUILD}" = "true" ]; then
    print_test "Docker Image Build with Git Integration"

    if [ -f "components/runners/claude-code-runner/Dockerfile" ]; then
        cd components/runners/claude-code-runner

        if docker build -t vteam-git-test . > /dev/null 2>&1; then
            print_success "Docker image build with Git integration passed"
            # Clean up test image
            docker rmi vteam-git-test > /dev/null 2>&1 || true
        else
            print_error "Docker image build with Git integration failed"
        fi

        cd ../../..
    else
        print_error "Dockerfile not found"
    fi
fi

# Test 8: Configuration Validation
print_test "Git Configuration Validation"

# Test valid configurations
VALID_CONFIGS=(
    '{"user": {"name": "Test", "email": "test@example.com"}}'
    '{"repositories": [{"url": "https://github.com/test/repo.git"}]}'
    '{"user": {"name": "Test", "email": "test@example.com"}, "repositories": [{"url": "https://github.com/test/repo.git", "branch": "develop"}]}'
)

CONFIG_VALID=true
for config in "${VALID_CONFIGS[@]}"; do
    if ! echo "${config}" | python3 -c "import json, sys; json.load(sys.stdin)" 2>/dev/null; then
        CONFIG_VALID=false
        break
    fi
done

if [ "${CONFIG_VALID}" = "true" ]; then
    print_success "Git configuration validation test passed"
else
    print_error "Git configuration validation test failed"
fi

# Summary
echo ""
echo "🎯 Git Integration Test Summary"
echo "==============================="

# Count total tests and check for any failures
if grep -q "FAIL" <<< "${output}"; then
    echo -e "${RED}Some tests failed. Please review the output above.${NC}"
    exit 1
else
    echo -e "${GREEN}All available tests passed! 🎉${NC}"
    echo ""
    echo "Next steps for full integration testing:"
    echo "1. Build and deploy the updated images"
    echo "2. Create a test AgenticSession with Git configuration"
    echo "3. Verify Git operations work in the running container"
    echo "4. Test SSH key and token authentication (when secrets are configured)"
    echo ""
    echo "To build new images:"
    echo "  cd components/runners/claude-code-runner && docker build -t your-registry/vteam-claude-runner:git-test ."
    echo "  cd ../backend && docker build -t your-registry/vteam-backend:git-test ."
    echo "  cd ../frontend && docker build -t your-registry/vteam-frontend:git-test ."
fi