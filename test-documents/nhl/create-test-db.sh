#!/bin/bash
# Script to help create a test RAG database with NHL documents

echo "NHL Test Documents for RAG Database"
echo "==================================="
echo ""
echo "This directory contains 16 comprehensive documents about NHL teams and history."
echo ""
echo "To use these documents with the vTeam RAG system:"
echo ""
echo "1. Create a new RAG database through the vTeam UI"
echo "2. Upload all .md files from this directory (excluding README.md if desired)"
echo "3. Wait for processing to complete"
echo "4. Test with queries like:"
echo "   - 'How many Stanley Cups have the Canadiens won?'"
echo "   - 'Tell me about Wayne Gretzky's records'"
echo "   - 'Compare the Original Six teams'"
echo "   - 'What is the current NHL playoff format?'"
echo ""
echo "Files in this directory:"
ls -1 *.md | grep -v README.md | nl
echo ""
echo "Total documents: $(ls -1 *.md | grep -v README.md | wc -l)"
echo "Total size: $(du -sh . | cut -f1)"