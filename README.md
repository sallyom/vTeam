# RHOAI AI Feature Sizing

An autonomous AI agent that analyzes JIRA features and creates comprehensive implementation plans with detailed epics and stories.

## 🚀 Quick Start

```bash
# Autonomous feature planning (new CLI)
./plan-feature.sh RHOAIENG-12345

# Interactive planning
python cli_agent.py chat RHOAIENG-12345

# List available RAG stores
python cli_agent.py list-stores
```

## 📋 Overview

**RHOAI AI Feature Sizing** is an intelligent system that transforms JIRA feature requests into actionable implementation plans. Using advanced AI agents powered by Llama Stack, it autonomously:

- 📖 **Analyzes** JIRA issues and identifies affected components
- 🔍 **Researches** relevant documentation via RAG (Retrieval-Augmented Generation)
- 📝 **Creates** detailed refinement documents with technical specifications
- 🎯 **Generates** structured JIRA epics and stories with acceptance criteria
- ✅ **Validates** plan coverage and completeness
- 💾 **Persists** all artifacts in a database for team collaboration

## 🏗️ Architecture (High-Level)

The system uses a **microservices architecture** with an **autonomous agent pattern**:

```
🤖 Autonomous Agent ──► 🧠 Llama Stack ──► 🔧 Custom Tools
    │                      │                  │
    ├─ Single-prompt loop  ├─ RAG queries     ├─ Database operations
    ├─ Self-directed       ├─ JIRA fetching   ├─ Document generation
    └─ Tool integration    └─ Model inference └─ Plan validation
```

**Key Patterns:**
- **Agent-Driven**: Single autonomous loop with tool access
- **RAG-Enhanced**: Context-aware planning using internal documentation
- **Database-First**: All artifacts persisted for collaboration and iteration
- **Tool-Extensible**: Custom Llama Stack tools for specialized operations

*For detailed architecture information, see [ARCHITECTURE.md](docs/ARCHITECTURE.md)*

## 🛠️ Getting Started

### Prerequisites
- **Python 3.12+** and **uv** package manager
- **Llama Stack server** (local or remote)
- **Database** (PostgreSQL recommended, SQLite for development)
- **JIRA access** with API credentials

### Quick Setup
```bash
# Clone and install
git clone <repo-url> && cd rhoai-ai-feature-sizing
uv sync

# Configure environment
cp env.template .env
# Edit .env with your actual configuration values

# Start planning
./plan-feature.sh RHOAIENG-12345
```

*For comprehensive setup instructions, see [GETTING_STARTED.md](docs/GETTING_STARTED.md)*

## 🚀 Deployment

### Local Development
- **Docker Compose** with Ollama for local LLM inference
- **SQLite** database for quick iteration
- **Hot reload** for development

### OpenShift Production
- **Kubernetes-native** deployment with PostgreSQL
- **External LLM APIs** (OpenAI, Azure OpenAI, Mistral, etc.)
- **Horizontal scaling** and persistent storage
- **CI/CD ready** with custom Docker images

*For deployment guides, see [DEPLOYMENT.md](docs/DEPLOYMENT.md)*

## 📖 Documentation

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Detailed system architecture, patterns, and design decisions |
| [GETTING_STARTED.md](docs/GETTING_STARTED.md) | Comprehensive setup, installation, and configuration |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment guides for various environments |
| [CLI_GUIDE.md](docs/CLI_GUIDE.md) | Complete CLI reference and usage examples |

## 🎯 Key Features

### ✅ Autonomous Planning Agent
- **Single-prompt loop** that self-directs through planning phases
- **RAG integration** for context-aware feature analysis
- **Custom tools** for database persistence and document generation
- **Validation system** to ensure plan completeness

### ✅ Database-Backed Persistence
- **Session management** with unique identifiers
- **Structured storage** of refinement docs and JIRA plans
- **Normalized data** for querying epics, stories, and relationships
- **Multi-user support** with proper isolation

### ✅ Flexible CLI Interface
- **Autonomous mode**: Complete hands-off planning
- **Interactive mode**: Chat-based refinement and iteration
- **Batch operations**: Process multiple features
- **Output formats**: Markdown, JSON, and database storage

### 🚧 Planned Features
- **Web UI**: React-based interface for non-technical users
- **Team collaboration**: Comments, reviews, and approval workflows
- **Integration hooks**: Webhook support for CI/CD pipelines
- **Advanced analytics**: Feature complexity metrics and estimation accuracy

## 🔧 Technology Stack

- **Core**: Python 3.12+, FastAPI, SQLAlchemy
- **AI/ML**: Llama Stack, RAG with vector databases
- **Database**: PostgreSQL (production), SQLite (development)
- **Frontend**: React with PatternFly (planned)
- **Deployment**: Docker, Kubernetes, OpenShift
- **Tools**: uv (package management), pytest (testing)

## 🤝 Contributing

We welcome contributions! Please see our development setup in [GETTING_STARTED.md](docs/GETTING_STARTED.md#development-setup).

```bash
# Development workflow
uv sync --dev
uv run pytest
uv run ruff format src/ tests/
```

## 📞 Support

- **Documentation**: Check the docs/ directory for detailed guides
- **Issues**: Report bugs and feature requests via GitHub Issues
- **Discussions**: Join our community discussions for questions and ideas

---

**Ready to transform your feature planning process?** Start with our [Getting Started Guide](docs/GETTING_STARTED.md)! 🚀