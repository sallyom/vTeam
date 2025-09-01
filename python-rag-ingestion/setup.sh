#!/bin/bash

# RHOAI RAG Ingestion Package Setup Script

echo "🚀 Setting up RHOAI RAG Ingestion Package with UV..."

# Check if uv is installed
if ! command -v uv &> /dev/null; then
    echo "❌ UV is not installed. Please install it first:"
    echo "   curl -LsSf https://astral.sh/uv/install.sh | sh"
    echo "   or: pip install uv"
    exit 1
fi

# Create virtual environment and install package with dependencies
echo "📦 Creating Python virtual environment and installing package..."
uv venv
source .venv/bin/activate
uv sync

echo "📝 Installing package in editable mode..."
uv pip install -e .

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "⚙️ Creating .env file..."
    cat > .env << EOL
# OpenAI API Key (Required)
OPENAI_API_KEY=your_openai_api_key_here

# GitHub Token (Required for GitHub sources)
GITHUB_TOKEN=github_pat_your_token_here

# Optional: Other API keys for extended functionality
# SLACK_BOT_TOKEN=xoxb-your-slack-token
# NOTION_INTEGRATION_TOKEN=secret_your-notion-token
EOL
    echo "📝 Please edit .env with your API keys"
else
    echo "✅ .env file already exists"
fi

# Clean up old scripts
echo "🧹 Cleaning up old individual scripts..."
if [ -f "ingest.py" ] || [ -f "enhanced_ingest.py" ] || [ -f "simple_ingest.py" ]; then
    mkdir -p old_scripts
    [ -f "ingest.py" ] && mv ingest.py old_scripts/
    [ -f "enhanced_ingest.py" ] && mv enhanced_ingest.py old_scripts/
    [ -f "simple_ingest.py" ] && mv simple_ingest.py old_scripts/
    echo "📁 Moved old scripts to old_scripts/ directory"
fi

echo "✅ Setup complete!"
echo ""
echo "🎯 The CLI tool 'rhoai-rag' is now available!"
echo ""
echo "Next steps:"
echo "1. Edit .env with your API keys"
echo "2. List available agents: rhoai-rag list-agents"
echo "3. Run ingestion: rhoai-rag ingest --verbose"
echo "4. Test specific agent: rhoai-rag ingest --agents frontend_engineer --test"
echo ""
echo "For help: rhoai-rag --help"
