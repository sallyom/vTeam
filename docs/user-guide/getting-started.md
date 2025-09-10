# Getting Started

Get vTeam up and running in just 5 minutes! This guide walks you through everything needed to create your first AI-refined RFE.

## Prerequisites

Before starting, ensure you have:

- **Python 3.12+** (or Python 3.11+)
- **Git** for cloning the repository
- **uv** package manager ([Installation guide](https://docs.astral.sh/uv/getting-started/installation/))
- **pnpm** for TypeScript frontend (`npm i -g pnpm`)
- **OpenAI API key** for embeddings and AI features
- **Anthropic Claude API key** for conversational AI ([Get one here](https://console.anthropic.com/))
- **Internet connection** for API calls and package downloads

## Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/red-hat-data-services/vTeam.git
cd vTeam
```

### Step 2: Set Up Environment

Navigate to the RFE builder and install dependencies:

```bash
# Navigate to the RFE builder demo
cd demos/rfe-builder

# Install all dependencies (Python backend + TypeScript frontend)
uv sync
```

This will automatically:
- Create a virtual environment
- Install Python dependencies from `pyproject.toml`
- Set up the LlamaDeploy workflow system

### Step 3: Configure API Access

Set up your API keys in the environment file:

```bash
# Create environment file
cp src/.env.example src/.env  # If example exists
# OR create new file:
touch src/.env
```

Add your API credentials to `src/.env`:

```bash
# Required: OpenAI for embeddings
OPENAI_API_KEY=your-openai-api-key-here

# Required: Anthropic for conversational AI
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here

# Optional: Vertex AI support
VERTEX_PROJECT_ID=your-gcp-project-id
VERTEX_LOCATION=us-central1

# Optional: Jira integration
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_USERNAME=your-email@company.com
JIRA_API_TOKEN=your-jira-api-token
```

!!! warning "Keep Your Keys Secret"
    Never commit `src/.env` to version control. It's already in `.gitignore`.

### Step 4: Generate Knowledge Base

First, generate the document embeddings for the RAG system:

```bash
uv run generate
```

This creates vector embeddings from documents in the `./data` directory.

### Step 5: Launch the Application

Start the LlamaDeploy system in two steps:

```bash
# Terminal 1: Start the API server
uv run -m llama_deploy.apiserver

# Terminal 2: Deploy the workflow (wait for server to start)
uv run llamactl deploy deployment.yml
```

You should see output like:

```
# From Terminal 1:
INFO:     Uvicorn running on http://0.0.0.0:4501 (Press CTRL+C to quit)

# From Terminal 2:  
Deployment successful: rhoai-ai-feature-sizing
```

### Step 6: Verify Installation

1. **Open your browser** to `http://localhost:4501/deployments/rhoai-ai-feature-sizing/ui`
2. **Check the interface** - you should see the LlamaIndex chat interface
3. **Test API connection** - try sending a message like "Help me create an RFE"
4. **Verify agent loading** - check that the workflow responds with agent analysis

## First RFE Creation

Now let's create your first RFE to verify everything works:

### Using the Chat Interface

1. **In the chat interface**, describe your feature idea:
   ```
   I want to add a dark mode toggle to our application settings page
   ```
2. **The multi-agent system** will automatically:
   - Analyze your request from 7 different perspectives
   - Generate comprehensive requirements
   - Provide implementation guidance
   - Create actionable deliverables
3. **Review the results** as each agent provides their specialized analysis

## Verification Checklist

Ensure your installation is working correctly:

- [ ] LlamaDeploy API server starts without errors (port 4501)
- [ ] Workflow deploys successfully with `llamactl`
- [ ] Chat interface loads and responds to messages  
- [ ] Multi-agent analysis completes within 2-3 minutes
- [ ] No API authentication errors in logs
- [ ] Agent responses show specialized perspectives

## Common Issues

### API Key Errors

**Symptom**: "Authentication failed" or similar errors
**Solution**: 
1. Verify your API keys are correct in `src/.env`
2. Check you have available credits in both OpenAI and Anthropic accounts
3. Ensure both `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are set

### Dependency Errors

**Symptom**: `ModuleNotFoundError` or import errors
**Solution**:
1. Ensure you ran `uv sync` in the `demos/rfe-builder` directory
2. Check that `uv` is installed: `uv --version`
3. Try cleaning and reinstalling: `rm -rf .venv && uv sync`

### Port Already in Use

**Symptom**: "Port 4501 is already in use"  
**Solution**:
```bash
# Kill existing LlamaDeploy processes
pkill -f llama_deploy

# Or use a different port in deployment.yml
# Modify the apiServer.port setting
```

### Deployment Failures

**Symptom**: `llamactl deploy` fails or times out
**Solution**:
1. Ensure the API server is running first (`uv run -m llama_deploy.apiserver`)
2. Wait a few seconds between starting the server and deploying
3. Check logs for specific error messages
4. Verify all agents have valid configurations in `src/agents/`

### Slow Agent Responses

**Symptom**: Long wait times for multi-agent analysis
**Solution**:
1. Check your internet connection
2. Verify API service status at [Anthropic Status](https://status.anthropic.com/) and [OpenAI Status](https://status.openai.com/)
3. Monitor the LlamaDeploy logs for bottlenecks
4. Consider using smaller document sets during development

## What's Next?

Now that vTeam is running, you're ready to:

1. **Learn RFE best practices** → [Creating RFEs Guide](creating-rfes.md)
2. **Understand the AI agents** → [Agent Framework](agent-framework.md)  
3. **Try hands-on exercises** → [Lab 1: First RFE](../labs/basic/lab-1-first-rfe.md)
4. **Customize your setup** → [Configuration Guide](configuration.md)

## Getting Help

If you encounter issues not covered here:

- **Check the troubleshooting guide** → [Troubleshooting](troubleshooting.md)
- **Search existing issues** → [GitHub Issues](https://github.com/red-hat-data-services/vTeam/issues)  
- **Create a new issue** with your error details and environment info

Welcome to AI-assisted refinement! 🚀