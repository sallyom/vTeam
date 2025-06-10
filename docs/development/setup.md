# Development Setup

This guide will help you set up a development environment for contributing to the RHOAI AI Feature Sizing project, which is built on [Llama Stack](https://llama-stack.readthedocs.io/en/latest/).

## 🏗️ Development Environment Overview

The development environment consists of:
- **Python 3.12+** application code
- **Llama Stack** for AI inference
- **Ollama** for local model serving
- **JIRA integration** (optional for development)
- **Testing framework** with pytest
- **Code quality tools** (Black, isort, flake8, mypy)

## 📋 Prerequisites

### System Requirements

- **Operating System**: Linux, macOS, or Windows (with WSL2)
- **Python**: 3.12 or higher
- **Memory**: 8GB+ RAM (16GB+ recommended for larger models)
- **Storage**: 10GB+ free space for models and dependencies
- **Network**: Internet connection for model downloads

### Required Tools

1. **Python 3.12+**
   ```bash
   # Check Python version
   python --version
   
   # Install Python 3.12 if needed (Ubuntu/Debian)
   sudo apt update
   sudo apt install python3.12 python3.12-venv python3.12-dev
   
   # macOS with Homebrew
   brew install python@3.12
   
   # Windows
   # Download from https://www.python.org/downloads/
   ```

2. **uv Package Manager**
   ```bash
   # Install uv
   curl -LsSf https://astral.sh/uv/install.sh | sh
   
   # Or with pip
   pip install uv
   
   # Verify installation
   uv --version
   ```

3. **Git**
   ```bash
   # Ubuntu/Debian
   sudo apt install git
   
   # macOS
   brew install git
   
   # Windows
   # Download from https://git-scm.com/download/win
   ```

4. **Ollama** (for local AI models)
   ```bash
   # Linux
   curl -fsSL https://ollama.com/install.sh | sh
   
   # macOS
   brew install ollama
   
   # Windows
   # Download from https://ollama.com/download
   
   # Verify installation
   ollama --version
   ```

## 🚀 Quick Setup

### 1. Clone the Repository

```bash
# Clone the main repository
git clone https://github.com/your-org/rhoai-ai-feature-sizing.git
cd rhoai-ai-feature-sizing

# Or clone your fork
git clone https://github.com/your-username/rhoai-ai-feature-sizing.git
cd rhoai-ai-feature-sizing
git remote add upstream https://github.com/your-org/rhoai-ai-feature-sizing.git
```

### 2. Set Up Python Environment

```bash
# Create and activate virtual environment with uv
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies including development tools
uv sync --all-extras

# Install the project in editable mode
uv pip install -e .
```

### 3. Configure Environment Variables

```bash
# Copy example environment file
cp .env.example .env

# Edit .env file with your configuration
cat > .env << EOF
# Llama Stack Configuration
LLAMA_STACK_BASE_URL=http://localhost:8321
LLAMA_STACK_CLIENT_LOG=debug
LLAMA_STACK_PORT=8321
LLAMA_STACK_CONFIG=ollama

# Development Settings
RHOAI_LOG_LEVEL=debug
RHOAI_AUTH_DISABLED=true
PYTHONPATH=./src:$PYTHONPATH

# Optional: JIRA Integration (for testing)
# JIRA_BASE_URL=https://your-dev-instance.atlassian.net
# JIRA_USERNAME=your-email@example.com
# JIRA_API_TOKEN=your-dev-token

# Optional: External APIs
# TAVILY_SEARCH_API_KEY=your-dev-key
# BRAVE_SEARCH_API_KEY=your-dev-key
EOF
```

### 4. Set Up Llama Stack

```bash
# Pull and run a local model with Ollama
ollama pull llama3.2:3b
ollama run llama3.2:3b --keepalive 60m

# In a new terminal, start Llama Stack server
INFERENCE_MODEL=llama3.2:3b uv run --with llama-stack llama stack build --template ollama --image-type venv --run

# Verify Llama Stack is running
curl http://localhost:8321/health
```

### 5. Run Tests

```bash
# Run all tests
uv run pytest

# Run with coverage
uv run pytest --cov=src --cov-report=html

# Run specific test categories
uv run pytest tests/unit/
uv run pytest tests/integration/
```

### 6. Verify Setup

```bash
# Test the main application
python main.py

# Test feature refinement
python -m stages.refine_feature "Add user authentication system"

# Test JIRA integration (if configured)
python -m tools.mcp_jira --test-connection
```

## 🛠️ Development Tools Setup

### Code Quality Tools

The project uses several tools to maintain code quality:

```bash
# Install pre-commit hooks
uv run pre-commit install

# Run all pre-commit hooks manually
uv run pre-commit run --all-files

# Individual tools
uv run black .                    # Code formatting
uv run isort .                    # Import sorting  
uv run flake8 .                   # Linting
uv run mypy src/                  # Type checking
```

### IDE Configuration

#### Visual Studio Code

1. **Install recommended extensions** (see `.vscode/extensions.json`):
   - Python
   - Pylance
   - Black Formatter
   - isort
   - Python Docstring Generator

2. **Configure settings** (`.vscode/settings.json`):
   ```json
   {
     "python.defaultInterpreterPath": "./.venv/bin/python",
     "python.linting.enabled": true,
     "python.linting.flake8Enabled": true,
     "python.formatting.provider": "black",
     "python.sortImports.path": "isort",
     "python.testing.pytestEnabled": true,
     "python.testing.pytestArgs": ["tests/"],
     "files.exclude": {
       "**/__pycache__": true,
       "**/.pytest_cache": true,
       "**/.*_cache": true
     }
   }
   ```

#### PyCharm

1. **Configure interpreter**: 
   - File → Settings → Project → Python Interpreter
   - Add existing virtual environment: `.venv/bin/python`

2. **Configure code style**:
   - File → Settings → Tools → External Tools
   - Add Black, isort, flake8 as external tools

3. **Configure testing**:
   - Run → Edit Configurations → Add pytest configuration
   - Working directory: project root
   - Script path: `tests/`

### Database Setup (Optional)

For development with persistent data:

```bash
# Install database dependencies
uv pip install "psycopg2-binary>=2.9.0"  # PostgreSQL
# or
uv pip install "sqlite3"  # SQLite (built-in)

# Set up database URL in .env
echo "DATABASE_URL=sqlite:///dev.db" >> .env
# or
echo "DATABASE_URL=postgresql://user:pass@localhost/rhoai_dev" >> .env

# Run database migrations (when implemented)
python -m alembic upgrade head
```

## 🔧 Development Workflow

### 1. Feature Development

```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make your changes
# ... code changes ...

# Run tests and quality checks
uv run pytest
uv run pre-commit run --all-files

# Commit changes with conventional commits
git add .
git commit -m "feat(estimation): add new complexity analysis algorithm"

# Push to your fork
git push origin feature/your-feature-name

# Create pull request
```

### 2. Testing Strategy

```bash
# Unit tests (fast, isolated)
uv run pytest tests/unit/ -v

# Integration tests (slower, requires services)
uv run pytest tests/integration/ -v

# End-to-end tests (slowest, full workflow)
uv run pytest tests/e2e/ -v

# Test specific functionality
uv run pytest tests/unit/test_refine_feature.py -v
uv run pytest -k "test_estimation" -v

# Test with different Python versions (using tox)
uv run tox
```

### 3. Debugging

```bash
# Enable debug logging
export RHOAI_LOG_LEVEL=debug
export LLAMA_STACK_LOG_FILE=debug.log

# Run with Python debugger
python -m pdb main.py

# Debug specific module
python -m pdb -m stages.refine_feature "test feature"

# Debug tests
uv run pytest --pdb tests/unit/test_refine_feature.py
```

### 4. Documentation Development

```bash
# Install documentation dependencies
uv sync --extra docs

# Build documentation locally
cd docs/
uv run make html

# Serve documentation with auto-reload
uv run sphinx-autobuild source build/html --write-all

# Open http://127.0.0.1:8000 in browser
```

## 🧪 Testing Setup

### Test Environment Configuration

```bash
# Create test-specific environment file
cat > .env.test << EOF
LLAMA_STACK_BASE_URL=http://localhost:8322
RHOAI_AUTH_DISABLED=true
RHOAI_LOG_LEVEL=warning
DATABASE_URL=sqlite:///test.db
PYTEST_CURRENT_TEST=true
EOF

# Run tests with test environment
uv run --env-file .env.test pytest
```

### Test Data Management

```bash
# Create test data directory
mkdir -p tests/data

# Generate test fixtures
python tests/fixtures/generate_test_data.py

# Clean test data
python tests/fixtures/clean_test_data.py
```

### Mock Services for Testing

```bash
# Start mock Llama Stack server for testing
uv run python tests/mocks/mock_llama_stack.py &

# Start mock JIRA server for integration tests
uv run python tests/mocks/mock_jira_server.py &

# Stop mock services
pkill -f "mock_llama_stack.py"
pkill -f "mock_jira_server.py"
```

## 🔍 Troubleshooting

### Common Issues

**1. uv sync fails**
```bash
# Clear cache and retry
uv cache clean
rm -rf .venv/
uv venv
uv sync --all-extras
```

**2. Ollama model download fails**
```bash
# Check Ollama service
ollama list
ollama ps

# Restart Ollama service
sudo systemctl restart ollama  # Linux
brew services restart ollama    # macOS

# Try different model
ollama pull llama3.2:1b  # Smaller model
```

**3. Llama Stack server won't start**
```bash
# Check port availability
lsof -i :8321

# Use different port
LLAMA_STACK_PORT=8322 uv run --with llama-stack llama stack build --template ollama --image-type venv --run

# Check logs
export LLAMA_STACK_LOG_FILE=server.log
tail -f server.log
```

**4. Import errors**
```bash
# Check Python path
python -c "import sys; print(sys.path)"

# Reinstall in editable mode
uv pip install -e .

# Check for missing dependencies
uv pip install --upgrade pip
uv sync --all-extras
```

**5. Tests failing**
```bash
# Run with verbose output
uv run pytest -v -s

# Check test environment
uv run pytest --collect-only

# Run single test with debugging
uv run pytest -v -s tests/unit/test_refine_feature.py::test_basic_refinement
```

### Performance Issues

**1. Slow model inference**
```bash
# Use smaller model for development
ollama pull llama3.2:1b
export INFERENCE_MODEL=llama3.2:1b

# Enable GPU acceleration (if available)
export CUDA_VISIBLE_DEVICES=0
```

**2. Memory issues**
```bash
# Monitor memory usage
htop
nvidia-smi  # For GPU memory

# Use smaller batch sizes
export BATCH_SIZE=1
export MAX_CONTEXT_LENGTH=2048
```

### Getting Help

1. **Check logs**:
   ```bash
   tail -f ~/.local/share/ollama/logs/server.log
   tail -f server.log  # Llama Stack logs
   ```

2. **Verify services**:
   ```bash
   curl http://localhost:8321/health  # Llama Stack
   ollama list                        # Available models
   python -c "import llama_stack_client; print('OK')"  # Client import
   ```

3. **Community support**:
   - Check GitHub issues
   - Join project discussions
   - Refer to [Llama Stack documentation](https://llama-stack.readthedocs.io/en/latest/)

## 🚀 Advanced Development Setup

### Docker Development Environment

```bash
# Build development container
docker build -f Dockerfile.dev -t rhoai-dev .

# Run development container
docker run -it --rm \
  -v $(pwd):/workspace \
  -p 8321:8321 \
  -e OLLAMA_HOST=host.docker.internal \
  rhoai-dev

# Use docker-compose for full stack
docker-compose -f docker-compose.dev.yml up
```

### Kubernetes Development

```bash
# Install development cluster (kind)
kind create cluster --name rhoai-dev

# Deploy development stack
kubectl apply -f k8s/dev/

# Port forward services
kubectl port-forward svc/llama-stack 8321:8321
kubectl port-forward svc/ollama 11434:11434
```

### GPU Development Setup

```bash
# NVIDIA GPU support
nvidia-smi  # Verify GPU available

# Install CUDA-enabled dependencies
uv pip install torch --index-url https://download.pytorch.org/whl/cu118

# Configure Ollama for GPU
systemctl edit ollama
# Add:
# [Service]
# Environment="OLLAMA_GPU_ENABLED=true"

sudo systemctl daemon-reload
sudo systemctl restart ollama
```

---

## 📚 Next Steps

Once your development environment is set up:

1. **Read the codebase**:
   - [Architecture Overview](../architecture/overview.md)
   - [Coding Standards](./standards.md)
   - [Testing Guidelines](./testing.md)

2. **Start contributing**:
   - Check open issues
   - Read [Contributing Guide](../../CONTRIBUTING.md)
   - Join project discussions

3. **Explore integrations**:
   - [API Documentation](../api/endpoints.md)
   - [JIRA Integration](../user-guide/getting-started.md#jira-integration)
   - [Llama Stack Components](https://llama-stack.readthedocs.io/en/latest/)

---

*Need help with setup? Check our [FAQ](../user-guide/faq.md) or [open an issue](https://github.com/your-repo/issues) for assistance.*