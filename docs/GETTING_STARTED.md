# Getting Started Guide

This comprehensive guide will help you set up and run the RHOAI AI Feature Sizing system in various environments, from local development to production deployments.

## 🎯 Prerequisites

Before you begin, ensure you have the following installed and configured:

### Required Software

| Component | Version | Purpose | Installation |
|-----------|---------|---------|--------------|
| **Python** | 3.12+ | Core runtime | [python.org](https://python.org) or `brew install python@3.12` |
| **uv** | Latest | Package manager | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| **Docker** | 20.10+ | Container runtime | [docker.com](https://docker.com) |
| **Git** | 2.30+ | Version control | `brew install git` or system package manager |

### External Services

| Service | Required For | Setup Guide |
|---------|--------------|-------------|
| **JIRA Instance** | Issue fetching | [JIRA API Setup](#jira-api-setup) |
| **LLM Provider** | AI inference | [LLM Provider Setup](#llm-provider-setup) |
| **Database** | Data persistence | [Database Setup](#database-setup) |

### Optional Components

| Component | Use Case | Installation |
|-----------|----------|--------------|
| **PostgreSQL** | Production database | `brew install postgresql` |
| **Ollama** | Local LLM inference | `curl -fsSL https://ollama.com/install.sh \| sh` |

## 🚀 Quick Start (5 Minutes)

For the fastest setup, use our automated CLI with default configurations:

```bash
# 1. Clone and setup
git clone <repo-url>
cd rhoai-ai-feature-sizing
uv sync

# 2. Configure environment (minimal)
export INFERENCE_MODEL="meta-llama/Llama-3.2-3B-Instruct"
export JIRA_URL="https://your-company.atlassian.net"
export JIRA_API_TOKEN="your-token-here"

# 3. Start planning immediately
./plan-feature.sh RHOAIENG-12345
```

This will use default configurations and SQLite for immediate testing.

## 🔧 Detailed Setup

### Step 1: Project Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd rhoai-ai-feature-sizing

# Install dependencies
uv sync

# Verify installation
uv run python --version  # Should be 3.12+
uv run python -c "import rhoai_ai_feature_sizing; print('✅ Package installed')"
```

### Step 2: Environment Configuration

Create your environment configuration file:

```bash
# Copy template
cp .env.example .env

# Edit with your settings
nano .env  # or your preferred editor
```

#### Environment Variables Reference

**Core Configuration:**
```bash
# Model and inference
INFERENCE_MODEL="meta-llama/Llama-3.2-3B-Instruct"
LLAMA_STACK_URL="http://localhost:8321"

# JIRA integration
JIRA_URL="https://your-company.atlassian.net"
JIRA_API_TOKEN="your-api-token"
JIRA_USERNAME="your-email@company.com"

# MCP Atlassian service
MCP_ATLASSIAN_URL="ws://localhost:3001/mcp"
CONFIGURE_TOOLGROUPS="true"
```

**Database Configuration:**
```bash
# For development (SQLite)
SQLITE_DB_PATH="./rhoai_sessions.db"

# For production (PostgreSQL)
DATABASE_URL="postgresql://user:password@localhost:5432/rhoai_db"
```

**RAG and Document Processing:**
```bash
# GitHub integration (for ingesting private repos)
GITHUB_ACCESS_TOKEN="your-github-token"

# Default RAG stores to use
DEFAULT_RAG_STORES="default,github_repos"
```

**Optional Settings:**
```bash
# Output directory for CLI results
OUTPUT_DIR="./outputs"

# API server configuration
API_HOST="0.0.0.0"
API_PORT="8001"

# Logging level
LOG_LEVEL="INFO"
```

### Step 3: Service Dependencies

Choose your deployment approach:

#### Option A: Docker Compose (Recommended for Local Development)

```bash
# Start all services
docker-compose up -d

# Verify services
docker-compose ps
curl http://localhost:8321/health  # Llama Stack
curl http://localhost:9000/health  # MCP Atlassian
```

#### Option B: Manual Service Setup

**Llama Stack Server:**
```bash
# Install Llama Stack
pip install llama-stack

# Configure and start
llama stack build --template local --name my-stack
llama stack run my-stack
```

**MCP Atlassian Server:**
```bash
# Clone MCP Atlassian
git clone https://github.com/modelcontextprotocol/servers
cd servers/atlassian

# Install and run
npm install
npm start
```

### Step 4: Database Setup

#### SQLite (Development)
```bash
# Automatic - database created on first run
python cli_agent.py plan TEST-123
```

#### PostgreSQL (Production)
```bash
# Create database
createdb rhoai_db

# Set environment variable
export DATABASE_URL="postgresql://user:password@localhost:5432/rhoai_db"

# Run migrations (automatic on first use)
python cli_agent.py plan TEST-123
```

### Step 5: RAG Store Setup (Optional)

Set up knowledge bases for enhanced context during planning:

```bash
# List available RAG stores
python cli_agent.py list-stores

# Setup predefined stores (creates default and github_repos stores)
python run_simple_api.py &  # Start API server
curl -X POST http://localhost:8001/rag/setup-predefined

# Or manually create and populate stores via web UI:
# 1. Open http://localhost:8001
# 2. Navigate to RAG Manager
# 3. Create new stores and ingest documents
```

### Step 6: Verification

Test your complete setup:

```bash
# Test CLI functionality
python cli_agent.py --help

# Test service connections
python cli_agent.py list-stores

# Test API server
python run_simple_api.py &
curl http://localhost:8001/health

# Test end-to-end planning (with a real JIRA issue)
python cli_agent.py plan YOUR-JIRA-KEY

# Test web UI (if frontend is built)
# Open http://localhost:8001 in browser
```

## 🔑 Service Setup Guides

### JIRA API Setup

1. **Create API Token:**
   - Go to https://id.atlassian.com/manage-profile/security/api-tokens
   - Click "Create API token"
   - Give it a name (e.g., "RHOAI Feature Sizing")
   - Copy the token

2. **Find Your JIRA URL:**
   - Your JIRA URL is typically: `https://your-company.atlassian.net`
   - Or your custom domain if you have one

3. **Test Access:**
   ```bash
   curl -u your-email@company.com:your-api-token \
     https://your-company.atlassian.net/rest/api/2/myself
   ```

### LLM Provider Setup

#### Option 1: Local Ollama (Development)

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama
ollama serve

# Pull model
ollama pull llama3.2:3b

# Test
curl http://localhost:11434/api/tags
```

#### Option 2: OpenAI API

```bash
# Get API key from https://platform.openai.com/api-keys
export INFERENCE_MODEL="gpt-4o-mini"
export LLAMA_STACK_URL="https://api.openai.com/v1"
export OPENAI_API_KEY="your-api-key"
```

#### Option 3: Azure OpenAI

```bash
export INFERENCE_MODEL="gpt-4o-mini"
export LLAMA_STACK_URL="https://your-resource.openai.azure.com/"
export AZURE_OPENAI_API_KEY="your-api-key"
export AZURE_DEPLOYMENT_NAME="your-deployment-name"
```

#### Option 4: Other Providers

Any OpenAI-compatible API works:
```bash
# Mistral, Anthropic, etc.
export INFERENCE_MODEL="your-model"
export LLAMA_STACK_URL="https://your-api-endpoint/v1"
export API_KEY="your-api-key"
```

### Database Setup

#### Development: SQLite

No setup required - database file created automatically.

```bash
# Default location
ls -la ./feature_sizing.db
```

#### Production: PostgreSQL

```bash
# Install PostgreSQL
brew install postgresql  # macOS
# or apt-get install postgresql  # Ubuntu

# Start service
brew services start postgresql

# Create database and user
createdb rhoai_db
psql -d rhoai_db -c "CREATE USER rhoai WITH PASSWORD 'secure_password';"
psql -d rhoai_db -c "GRANT ALL PRIVILEGES ON DATABASE rhoai_db TO rhoai;"

# Set connection string
export DATABASE_URL="postgresql://rhoai:secure_password@localhost:5432/rhoai_db"
```

## 🏃‍♂️ Running the System

### CLI Usage

#### Autonomous Planning
```bash
# Basic feature planning
python cli_agent.py plan RHOAIENG-12345

# With custom options
python cli_agent.py plan RHOAIENG-12345 \
  --rag-stores rhoai_docs patternfly_docs \
  --max-turns 15 \
  --output-dir ./outputs

# Disable validation
python cli_agent.py plan RHOAIENG-12345 --no-validation
```

#### Interactive Mode
```bash
# Start interactive session
python cli_agent.py chat RHOAIENG-12345

# Continue existing session
python cli_agent.py chat RHOAIENG-12345 --session-id cli-20241201-143022
```

#### Utility Commands
```bash
# List available RAG stores
python cli_agent.py list-stores

# Get help
python cli_agent.py --help
python cli_agent.py plan --help
```

### Quick Wrapper Script

```bash
# Make executable
chmod +x plan-feature.sh

# Use wrapper for quick planning
./plan-feature.sh RHOAIENG-12345
./plan-feature.sh RHOAIENG-12345 --max-turns 20 --output-dir ./custom-output
```

### API Server and Web UI

```bash
# Start the API server (includes web UI)
python run_simple_api.py

# API server runs on http://localhost:8001
# Test API endpoints
curl http://localhost:8001/health
curl http://localhost:8001/rag/stores

# Web UI available at http://localhost:8001 (if frontend is built)
# Interactive API docs at http://localhost:8001/docs
```

### Web UI Development

```bash
# For frontend development (separate terminal)
cd frontend
npm install
npm run dev

# Frontend dev server runs on http://localhost:3000
# API calls will be proxied to http://localhost:8001
```

## 🔍 Troubleshooting

### Common Issues

#### 1. Import Errors
```bash
# Problem: ModuleNotFoundError
# Solution: Ensure you're in project root and dependencies installed
cd /path/to/rhoai-ai-feature-sizing
uv sync
python cli_agent.py --help
```

#### 2. Environment Variable Issues
```bash
# Problem: Missing required environment variables
# Solution: Check and set all required variables
env | grep -E "(INFERENCE_MODEL|JIRA_|LLAMA_STACK)"
```

#### 3. Service Connection Issues
```bash
# Problem: Cannot connect to Llama Stack or MCP services
# Solution: Verify services are running
curl http://localhost:8321/health
curl http://localhost:9000/health
docker-compose ps
```

#### 4. Database Issues
```bash
# Problem: Database connection errors
# Solution: Check database configuration and permissions
python -c "
from sqlalchemy import create_engine
import os
url = os.getenv('DATABASE_URL', 'sqlite:///./feature_sizing.db')
engine = create_engine(url)
with engine.connect() as conn:
    print('Database connection successful')
"
```

#### 5. JIRA Authentication Issues
```bash
# Problem: JIRA API authentication failures
# Solution: Test JIRA credentials
curl -u your-email:your-token \
  https://your-company.atlassian.net/rest/api/2/myself
```

### Debug Mode

Enable verbose logging for troubleshooting:

```bash
# Set log level
export LOG_LEVEL="DEBUG"

# Run with debugging
python cli_agent.py plan JIRA-KEY 2>&1 | tee debug.log
```

### Performance Issues

#### Slow Planning
- Increase `--max-turns` if agent needs more time
- Check LLM provider response times
- Verify RAG store performance

#### Memory Issues
- Monitor memory usage during planning
- Consider using lighter models for development
- Check for memory leaks in long-running sessions

## 🏗️ Development Setup

### Development Environment

```bash
# Install development dependencies
uv sync --dev

# Install pre-commit hooks
uv run pre-commit install

# Run tests
uv run pytest

# Format code
uv run ruff format src/ tests/

# Type checking
uv run mypy src/
```

### Development Workflow

```bash
# Create feature branch
git checkout -b feature/your-feature

# Make changes and test
uv run pytest tests/
python cli_agent.py plan TEST-123

# Format and lint
uv run ruff format .
uv run ruff check .
uv run mypy src/

# Commit and push
git add .
git commit -m "Add your feature"
git push origin feature/your-feature
```

### Testing

```bash
# Run all tests
uv run pytest

# Run specific test file
uv run pytest tests/test_unified_agent.py

# Run with coverage
uv run pytest --cov=src/rhoai_ai_feature_sizing

# Integration tests (requires services)
uv run pytest tests/integration/
```

### Adding New Features

1. **Create new modules** in `src/rhoai_ai_feature_sizing/`
2. **Add tests** in `tests/`
3. **Update CLI** in `cli_agent.py` if needed
4. **Update documentation** in `docs/`
5. **Run full test suite** before committing

## 🚀 Production Deployment

### Docker Deployment

```bash
# Build image
docker build -t rhoai-feature-sizing:latest .

# Run container
docker run -d \
  --name rhoai-feature-sizing \
  -p 8000:8000 \
  -e INFERENCE_MODEL="gpt-4o-mini" \
  -e JIRA_URL="https://company.atlassian.net" \
  -e JIRA_API_TOKEN="token" \
  -e DATABASE_URL="postgresql://..." \
  rhoai-feature-sizing:latest
```

### OpenShift Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for comprehensive OpenShift deployment instructions.

### Environment-Specific Configurations

#### Development
```bash
# .env.development
INFERENCE_MODEL="llama3.2:3b"
LLAMA_STACK_URL="http://localhost:11434"
SQLITE_DB_PATH="./dev.db"
LOG_LEVEL="DEBUG"
```

#### Staging
```bash
# .env.staging
INFERENCE_MODEL="gpt-4o-mini"
LLAMA_STACK_URL="https://api.openai.com/v1"
DATABASE_URL="postgresql://staging-db/rhoai"
LOG_LEVEL="INFO"
```

#### Production
```bash
# .env.production
INFERENCE_MODEL="gpt-4o"
LLAMA_STACK_URL="https://api.openai.com/v1"
DATABASE_URL="postgresql://prod-db/rhoai"
LOG_LEVEL="WARNING"
```

## 📊 Monitoring and Maintenance

### Health Checks

```bash
# System health
python cli_agent.py list-stores  # RAG health
curl http://localhost:8000/health  # API health

# Database health
python -c "
from rhoai_ai_feature_sizing.tools.planning_store_db import _db
with _db() as db:
    print('Database connection: OK')
"
```

### Log Management

```bash
# View logs
tail -f server.log

# Rotate logs
logrotate /etc/logrotate.d/rhoai-feature-sizing
```

### Backup and Recovery

```bash
# Backup SQLite
cp feature_sizing.db feature_sizing_backup_$(date +%Y%m%d).db

# Backup PostgreSQL
pg_dump rhoai_db > rhoai_backup_$(date +%Y%m%d).sql

# Restore PostgreSQL
psql rhoai_db < rhoai_backup_20241201.sql
```

## 🤝 Getting Help

### Documentation
- [Architecture Guide](ARCHITECTURE.md) - System design and patterns
- [CLI Reference](CLI_GUIDE.md) - Complete CLI documentation
- [Deployment Guide](DEPLOYMENT.md) - Production deployment

### Community
- **GitHub Issues**: Bug reports and feature requests
- **Discussions**: Questions and community support
- **Wiki**: Additional tips and community contributions

### Support Channels
- **Internal Teams**: Slack #rhoai-feature-sizing
- **Documentation**: Check docs/ directory first
- **Troubleshooting**: Follow debug steps above

---

**Ready to start planning features?** Try your first autonomous planning session:
```bash
python cli_agent.py plan YOUR-JIRA-KEY
```
