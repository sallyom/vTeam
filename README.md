# RHOAI AI Feature Sizing

An intelligent system for analyzing and sizing AI features using Llama Stack with Ollama and Jira integration.

## 📦 Installation

### Prerequisites

1. **Python 3.12+** - Required for the CLI application
2. **uv** - Fast Python package manager
3. **Ollama** - Local LLM runtime
4. **Docker** - For containerized services
5. **Jira Access** - API token for Jira integration


### Step 1: Clone and Setup Project

```bash
# Clone the repository
git clone <repo-url>
cd rhoai-ai-feature-sizing

# Install Python dependencies with uv
uv sync

# Copy environment template
cp env.example .env
# Edit .env with your Jira credentials
```

### Step 2: Start Ollama and Pull Model

```bash
# Pull the model
ollama pull llama3.2:3b

# Start Ollama server
ollama serve
```

### Step 3: Start Services

```bash
# Start Docker services (Llama Stack + Jira MCP)
docker-compose up -d

# Verify services are running
docker-compose ps
```

## 🚀 Running the CLI

### Basic Usage

```bash
# Check available commands
uv run python -m rhoai_ai_feature_sizing.main --help
```

### Individual Stages

```bash
# 1. Refine a Jira issue into detailed spec
uv run python -m rhoai_ai_feature_sizing.main stage refine PROJ-123

# 2. Create epics from refined spec (not yet implemented)
uv run python -m rhoai_ai_feature_sizing.main stage epics refined_PROJ-123.md

# 3. Draft Jira tickets from refined spec (soft mode - no actual tickets created)
uv run python -m rhoai_ai_feature_sizing.main stage jiras refined_PROJ-123.md

# 3a. Draft Jira tickets in hard mode (creates actual Jira tickets)
uv run python -m rhoai_ai_feature_sizing.main stage jiras refined_PROJ-123.md --hard-mode

# 4. Create estimates from tickets (not yet implemented)
uv run python -m rhoai_ai_feature_sizing.main stage estimate jiras_PROJ-123.md
```

### Common Workflows

```bash
# Workflow 1: Analyze and plan feature implementation (soft mode)
uv run python -m rhoai_ai_feature_sizing.main stage refine PROJ-123
uv run python -m rhoai_ai_feature_sizing.main stage jiras refined_PROJ-123.md
# Review jiras_PROJ-123.md for epic/story breakdown and estimates

# Workflow 2: Complete feature setup with actual Jira tickets
uv run python -m rhoai_ai_feature_sizing.main stage refine PROJ-123
uv run python -m rhoai_ai_feature_sizing.main stage jiras refined_PROJ-123.md --hard-mode
# Actual epics and stories will be created in your Jira instance

# Workflow 3: Run full pipeline (currently uses soft mode by default)
uv run python -m rhoai_ai_feature_sizing.main run PROJ-123
```

### Full Pipeline

```bash
# Run complete workflow (refine + jiras stages work)
uv run python -m rhoai_ai_feature_sizing.main run PROJ-123

# Run with hard mode for actual Jira ticket creation
uv run python -m rhoai_ai_feature_sizing.main run PROJ-123 --hard-mode
```

### API Server Mode

```bash
# Start the FastAPI server
uv run python -m rhoai_ai_feature_sizing.api
```

## 🛠️ Configuration

### Environment Variables (.env file)

```bash
# Jira Configuration (Required)
JIRA_URL=https://your-company.atlassian.net
JIRA_API_TOKEN=your-jira-api-token-here

# Ollama Configuration
INFERENCE_MODEL=llama3.2:3b
OLLAMA_URL=http://host.docker.internal:11434
LLAMA_STACK_PORT=8321

# Service URLs
LLAMA_STACK_URL=http://localhost:8321
MCP_ATLASSIAN_URL=http://localhost:9000/sse

# API Configuration  
OUTPUT_DIR=./outputs
```

## 🔧 What's Currently Implemented

### ✅ Working Features

**Refine Stage** - Convert Jira issues to detailed specs:
```bash
# Fetch a Jira issue and refine it into a detailed spec
uv run python -m rhoai_ai_feature_sizing.main stage refine PROJ-123
# Output: refined_PROJ-123.md
```

**Draft Jiras Stage** - Break down features into implementable tickets:
```bash
# Generate Jira tickets structure from refined spec (soft mode - no actual tickets)
uv run python -m rhoai_ai_feature_sizing.main stage jiras refined_PROJ-123.md
# Output: jiras_PROJ-123.md

# Create actual Jira tickets (hard mode)
uv run python -m rhoai_ai_feature_sizing.main stage jiras refined_PROJ-123.md --hard-mode
```

**Soft Mode vs Hard Mode:**
- **Soft Mode** (default): Generates a structured markdown document with detailed ticket definitions including titles, descriptions, dependencies, story points, and parent-child relationships. No actual Jira tickets are created.
- **Hard Mode**: Uses the MCP Atlassian integration to create actual Jira tickets in your configured Jira instance based on the generated structure.

**API Server** - RESTful API with job management:
```bash
# Start the API server
uv run python -m rhoai_ai_feature_sizing.api

# API endpoints available at http://localhost:8000:
# POST /api/v1/stages/refine    - Refine a Jira issue
# GET  /api/v1/jobs/{job_id}    - Check job status
# GET  /api/v1/files/{filename} - Download output files
# GET  /health                  - Service health check
```

**CLI Client** - Connects to API server:
```bash
# All CLI commands work by connecting to the API server
uv run python -m rhoai_ai_feature_sizing.cli config --api-url http://localhost:8000
uv run python -m rhoai_ai_feature_sizing.cli health
uv run python -m rhoai_ai_feature_sizing.cli refine PROJ-123 --wait
```

### 🚧 Planned Features (Not Yet Implemented)

The following stages are defined but not implemented:
- **Epics Stage**: Break refined specs into epics  
- **Estimate Stage**: Add story point estimates to tickets

### 🔍 Architecture Details

**What Actually Happens:**
1. **CLI** makes HTTP requests to **API server** (FastAPI)
2. **API server** uses **Llama Stack client** to connect to **Llama Stack server**
3. **Llama Stack** uses **MCP Atlassian toolgroup** to fetch Jira issues
4. **AI model** (via Ollama) processes the issue and fills template

**File Flow:**
```
Jira Issue PROJ-123 
  ↓ (via MCP)
Jira details (JSON)
  ↓ (via LLM + template)
refined_PROJ-123.md
  ↓ (via LLM + template)
jiras_PROJ-123.md (soft mode: structure only / hard mode: actual tickets)
  ↓ (planned stages)
epics_PROJ-123.md → estimates_PROJ-123.md
```

## 🎯 Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CLI/API       │    │  Llama Stack    │    │   Jira MCP      │
│   (Python)      │───▶│   (Docker)      │───▶│   (Docker)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       ▼                       ▼
         │              ┌─────────────────┐    ┌─────────────────┐
         └─────────────▶│     Ollama      │    │   Jira API      │
                        │   (Local LLM)   │    │   (Remote)      │
                        └─────────────────┘    └─────────────────┘
```

**Key Components:**
- **CLI Client**: Python application that makes HTTP requests to API server
- **API Server**: FastAPI application with job management and file handling
- **Llama Stack**: LLM inference server with tool integration (Docker)
- **Ollama**: Local LLM runtime (llama3.2:3b) 
- **Jira MCP**: Model Context Protocol server for Jira integration (Docker)  

## 🔍 Troubleshooting

### Installation Issues

**uv not found**:
```bash
# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc  # or restart terminal
```

**Python version too old**:
```bash
# Check Python version
python --version  # Should be 3.12+

# Install Python 3.12+ if needed (macOS)
brew install python@3.12
```

**Ollama not found**:
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh
ollama serve
```

### Runtime Issues

**Model not available**:
```bash
# Pull the model manually
ollama pull llama3.2:3b

# Check available models
ollama list
```

**Services not running**:
```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs -f llama-stack
docker-compose logs -f jira-mcp

# Restart services
docker-compose restart
```

**CLI import errors**:
```bash
# Reinstall dependencies
uv sync --reinstall

# Check if services are accessible
curl http://localhost:8321/health
curl http://localhost:9000/healthz
```

### Service Health Checks

```bash
# Test Llama Stack
curl http://localhost:8321/health

# Test Jira MCP
curl http://localhost:9000/healthz

# Test Ollama
curl http://localhost:11434/api/tags

# Test CLI connectivity
uv run python -c "from rhoai_ai_feature_sizing.cli import main; print('CLI import successful')"
```

## 📚 Development

### Project Structure
```
rhoai-ai-feature-sizing/
├── src/rhoai_ai_feature_sizing/
│   ├── cli.py              # CLI commands
│   ├── api.py              # FastAPI server
│   ├── main.py             # Core logic
│   └── stages/             # Processing pipelines
├── tests/                  # Test files
├── docker-compose.yml      # Services configuration
├── pyproject.toml          # Python dependencies
└── README.md
```

### Adding New Features
1. **Add CLI commands**: Edit `src/rhoai_ai_feature_sizing/cli.py`
2. **Add processing stages**: Create files in `src/rhoai_ai_feature_sizing/stages/`
3. **Add tests**: Create test files in `tests/`
4. **Update dependencies**: Run `uv add <package>`

### Contributing
```bash
# Setup development environment
uv sync --dev

# Run tests
uv run pytest

# Format code
uv run ruff format src/ tests/

# Type checking
uv run mypy src/
```

## 🔗 Resources

- [uv Documentation](https://docs.astral.sh/uv/)
- [Ollama Models](https://ollama.com/library)
- [Llama Stack Documentation](https://llama-stack.readthedocs.io/)
- [Jira API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
- [Docker Compose](https://docs.docker.com/compose/)