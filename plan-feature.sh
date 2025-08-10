#!/bin/bash
"""
Quick wrapper script for the CLI agent - plan a feature.
Usage: ./plan-feature.sh JIRA-KEY [options]
"""

# Check if JIRA key is provided
if [ -z "$1" ]; then
    echo "Usage: $0 JIRA-KEY [additional options]"
    echo "Example: $0 RHOAIENG-12345"
    echo "Example: $0 RHOAIENG-12345 --output-dir ./outputs --max-turns 15"
    exit 1
fi

# Set default environment variables if not set
if [ -z "$INFERENCE_MODEL" ]; then
    echo "⚠️  INFERENCE_MODEL not set. Using default."
    export INFERENCE_MODEL="meta-llama/Llama-3.2-3B-Instruct"
fi

echo "🚀 Planning feature: $1"
echo "📋 Model: $INFERENCE_MODEL"
echo ""

# Run the CLI agent
python3 cli_agent.py plan "$@"
