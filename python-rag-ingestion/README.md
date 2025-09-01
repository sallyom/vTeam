# Python RAG Ingestion Pipeline

Python-based data ingestion pipeline that processes GitHub repositories and creates vector indexes for multi-agent RAG systems.

## Quick Setup

```bash
# Install UV package manager (if not installed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Create virtual environment and install dependencies
uv venv
source .venv/bin/activate
uv sync

# Install package in editable mode
uv pip install -e .

# Set API keys
export OPENAI_API_KEY="sk-your-openai-key" 
export GITHUB_TOKEN="github_pat_your-token"

# Run ingestion using the CLI
rhoai-rag ingest --verbose
```

## Prerequisites

- Python 3.9+
- UV package manager
- OpenAI API key for embeddings
- GitHub token for repository access (optional)

## Installation

1. **Install UV Package Manager** (if not already installed):
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   # or: pip install uv
   ```

2. **Setup Environment**:
   ```bash
   # Create virtual environment
   uv venv
   source .venv/bin/activate
   
   # Install dependencies
   uv sync
   
   # Install package in editable mode
   uv pip install -e .
   ```

3. **Create Environment Configuration**:
   ```bash
   # Create .env file
   cat > .env << EOL
   # OpenAI API Key (Required)
   OPENAI_API_KEY=your_openai_api_key_here

   # GitHub Token (Required for GitHub sources)
   GITHUB_TOKEN=github_pat_your_token_here
   EOL
   ```

4. **Configure API Keys**:
   ```bash
   export OPENAI_API_KEY="sk-your-key"
   export GITHUB_TOKEN="github_pat_your-token"  # For GitHub sources
   ```

## Usage

The `rhoai-rag` CLI tool is now available after installation.

### List Available Agents
```bash
rhoai-rag list-agents
```

### Full Pipeline (All Agents)
```bash
rhoai-rag ingest --verbose
```
- Processes all configured agents
- Creates vector indexes for each agent's data sources

### Test Specific Agent
```bash
rhoai-rag ingest --agents frontend_engineer --test
```
- Processes a single agent for testing
- Includes validation and testing steps

### Get Help
```bash
rhoai-rag --help
```

## How It Works

1. **Reads Agent Configs**: Parses YAML files from `../src/agents/`
2. **Processes GitHub Sources**: Uses LlamaIndex GithubRepositoryReader
3. **Creates Vector Indexes**: Generates embeddings and FAISS vector stores
4. **Saves for TypeScript**: Outputs to `../output/python-rag/{agent}/`

## Output Structure

```
../output/python-rag/
├── frontend_eng/
│   ├── docstore.json      # Document content and metadata  
│   ├── vector_store.json  # FAISS vector embeddings
│   ├── index_store.json   # Index configuration
│   └── metadata.json      # Source info and debug data
└── [other_agents]/
```

## Agent Configuration

Edit agent YAML files in `../src/agents/` to configure data sources:

```yaml
dataSources:
  - name: "repo-docs"
    type: "github"
    source: "org/repository"
    options:
      path: "docs/"
      fileTypes: [".md"]
```

## Integration

The TypeScript application automatically detects and loads Python-generated indexes:

```typescript
// TypeScript will use Python indexes if available
import { getDataSource } from "./hybrid-data";
```

This pipeline provides the "Python heavy lifting" part of the hybrid architecture, handling advanced data sources while keeping the TypeScript application focused on runtime logic.
