#!/bin/bash

# Contract Tests Runner
# This script runs all RAG contract tests to verify they fail (TDD approach)

echo "=== Running RAG Contract Tests ==="
echo "Expected: All tests should FAIL since implementation hasn't started yet"
echo "This confirms we're following TDD practices"
echo ""

cd ../..  # Go to vTeam root

# Initialize Go module if needed
if [ ! -f "go.mod" ]; then
    echo "Initializing Go module..."
    go mod init github.com/ambient-computing/vteam
fi

# Get test dependencies
echo "Installing test dependencies..."
go get github.com/stretchr/testify/assert
go get github.com/stretchr/testify/require
go get github.com/gin-gonic/gin

echo ""
echo "Running contract tests..."
echo "================================"

# Run tests and capture both stdout and stderr
go test ./tests/contract -v 2>&1 | tee test_output.log

# Check exit code
TEST_EXIT_CODE=${PIPESTATUS[0]}

echo ""
echo "================================"
echo "Test Summary:"
echo "================================"

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo "⚠️  WARNING: Tests are PASSING!"
    echo "This violates TDD - tests should FAIL before implementation"
    echo "Please verify that:"
    echo "1. The router is not yet configured with RAG endpoints"
    echo "2. The handlers are not yet implemented"
else
    echo "✅ Tests are FAILING as expected!"
    echo "This confirms we're following TDD practices"
    echo ""
    echo "Failed tests:"
    grep -E "FAIL:|--- FAIL:" test_output.log | sort | uniq
fi

echo ""
echo "Next steps:"
echo "1. Implement backend handlers to make tests pass"
echo "2. Run tests again to verify implementation"
echo "3. Refactor while keeping tests green"

# Clean up
rm -f test_output.log