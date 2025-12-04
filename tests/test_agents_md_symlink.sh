#!/bin/bash

# Test that AGENTS.md symlink works for Cursor and other AI tools
# This validates that:
# 1. AGENTS.md exists and is a valid symlink
# 2. It points to CLAUDE.md
# 3. Content is readable and identical to CLAUDE.md
# 4. File is tracked by git correctly

set -e

echo "Testing AGENTS.md symlink..."

# Test 1: Check that AGENTS.md exists
echo -n "✓ Checking AGENTS.md exists... "
if [ ! -e AGENTS.md ]; then
    echo "FAILED"
    echo "Error: AGENTS.md does not exist"
    exit 1
fi
echo "OK"

# Test 2: Check that AGENTS.md is a symlink
echo -n "✓ Checking AGENTS.md is a symlink... "
if [ ! -L AGENTS.md ]; then
    echo "FAILED"
    echo "Error: AGENTS.md is not a symlink"
    exit 1
fi
echo "OK"

# Test 3: Check that symlink points to CLAUDE.md
echo -n "✓ Checking symlink target is CLAUDE.md... "
TARGET=$(readlink AGENTS.md)
if [ "$TARGET" != "CLAUDE.md" ]; then
    echo "FAILED"
    echo "Error: AGENTS.md points to '$TARGET', expected 'CLAUDE.md'"
    exit 1
fi
echo "OK"

# Test 4: Check that CLAUDE.md exists (symlink target)
echo -n "✓ Checking CLAUDE.md exists... "
if [ ! -f CLAUDE.md ]; then
    echo "FAILED"
    echo "Error: CLAUDE.md (symlink target) does not exist"
    exit 1
fi
echo "OK"

# Test 5: Check that content is readable through symlink
echo -n "✓ Checking AGENTS.md content is readable... "
if ! cat AGENTS.md > /dev/null 2>&1; then
    echo "FAILED"
    echo "Error: Cannot read content through AGENTS.md symlink"
    exit 1
fi
echo "OK"

# Test 6: Check that content is identical to CLAUDE.md
echo -n "✓ Checking AGENTS.md content matches CLAUDE.md... "
if ! diff -q AGENTS.md CLAUDE.md > /dev/null 2>&1; then
    echo "FAILED"
    echo "Error: AGENTS.md content does not match CLAUDE.md"
    exit 1
fi
echo "OK"

# Test 7: Check that file is tracked by git
echo -n "✓ Checking AGENTS.md is tracked by git... "
if ! git ls-files --error-unmatch AGENTS.md > /dev/null 2>&1; then
    echo "WARNING"
    echo "Warning: AGENTS.md is not tracked by git (will be added in commit)"
else
    echo "OK"
fi

# Test 8: Validate that symlink contains expected project context
echo -n "✓ Checking AGENTS.md contains project context... "
if ! grep -q "Ambient Code Platform" AGENTS.md; then
    echo "FAILED"
    echo "Error: AGENTS.md does not contain expected project context"
    exit 1
fi
echo "OK"

# Test 9: Validate key sections exist
echo -n "✓ Checking key sections exist... "
REQUIRED_SECTIONS=(
    "Project Overview"
    "Development Commands"
    "Key Architecture Patterns"
    "Backend and Operator Development Standards"
    "Frontend Development Standards"
)

for section in "${REQUIRED_SECTIONS[@]}"; do
    if ! grep -q "$section" AGENTS.md; then
        echo "FAILED"
        echo "Error: Section '$section' not found in AGENTS.md"
        exit 1
    fi
done
echo "OK"

# Test 10: Check file size is reasonable (should match CLAUDE.md)
echo -n "✓ Checking file size is reasonable... "
SIZE=$(wc -c < AGENTS.md)
if [ "$SIZE" -lt 1000 ]; then
    echo "FAILED"
    echo "Error: AGENTS.md content is too small ($SIZE bytes), symlink may be broken"
    exit 1
fi
echo "OK (${SIZE} bytes)"

echo ""
echo "✅ All tests passed! AGENTS.md symlink is working correctly."
echo "   - Symlink: AGENTS.md -> CLAUDE.md"
echo "   - Content size: ${SIZE} bytes"
echo "   - Cursor and other AI tools can use AGENTS.md"
echo ""
