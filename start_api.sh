#!/bin/bash
# Startup script for RHOAI Feature Sizing API
# This ensures environment variables are properly loaded

set -e

# Change to script directory
cd "$(dirname "$0")"

# Load environment variables
if [ -f .env ]; then
    echo "📋 Loading environment variables from .env..."
    set -a  # automatically export all variables
    source .env
    set +a  # stop automatically exporting
    echo "✅ Environment variables loaded"
else
    echo "⚠️  No .env file found. Using environment defaults."
fi

# Verify critical environment variables
if [ -z "$GITHUB_ACCESS_TOKEN" ] || [ "$GITHUB_ACCESS_TOKEN" = "your_token_here" ]; then
    echo "⚠️  GITHUB_ACCESS_TOKEN not set or using placeholder value"
    echo "   GitHub repository ingestion may fail"
fi

if [ -z "$INFERENCE_MODEL" ]; then
    echo "❌ INFERENCE_MODEL not set. Please configure your model in .env"
    exit 1
fi

echo "🚀 Starting RHOAI Feature Sizing API..."
echo "   Model: $INFERENCE_MODEL"
echo "   GitHub Token: ${GITHUB_ACCESS_TOKEN:0:20}..." 
echo ""

# Start the API server
python run_simple_api.py
