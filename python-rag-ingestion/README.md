# Python RAG Ingestion Pipeline

Python-based data ingestion pipeline that processes GitHub repositories and creates vector indexes for multi-agent RAG systems.

## Quick Setup

```bash
# Run setup script
./setup.sh

# Set API keys
export OPENAI_API_KEY="sk-your-openai-key" 
export GITHUB_TOKEN="github_pat_your-token"

# Run ingestion
python simple_ingest.py
```

## Prerequisites

- Python 3.9+
- UV package manager (installed by setup.sh if not present)
- OpenAI API key for embeddings
- GitHub token for repository access (optional)

## Installation

1. **Setup Environment**:
   ```bash
   ./setup.sh
   ```
   Creates virtual environment and installs dependencies using UV.

2. **Configure API Keys**:
   ```bash
   export OPENAI_API_KEY="sk-your-key"
   export GITHUB_TOKEN="github_pat_your-token"  # For GitHub sources
   ```

## Usage

### Simple Ingestion (Recommended)
```bash
python simple_ingest.py
```
- Processes a single agent (Frontend Engineer by default)
- Uses GitHub repository reader for real documentation
- Tests with OpenDataHub Dashboard docs

### Full Pipeline
```bash
python ingest.py  
```
- Processes all configured agents
- Creates vector indexes for each agent's data sources

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
