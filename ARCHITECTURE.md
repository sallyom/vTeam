# RFE Refiner - System Architecture

## Overview

The RFE Refiner implements a hybrid architecture combining Python-based data ingestion with TypeScript-based application runtime, designed for scalable multi-agent analysis workflows.

## Architecture Principles

- **Separation of Concerns**: Data processing (Python) separate from application logic (TypeScript)
- **Graceful Fallback**: Works with or without Python pipeline
- **Event-Driven**: Asynchronous agent coordination
- **Schema Validation**: Type-safe configurations and data flow

## System Components

### Python Ingestion Pipeline

**Purpose**: Batch processing of external data sources into vector indexes

```
┌─────────────────────────────────────────┐
│             PYTHON PIPELINE            │
│                                         │
│ 📥 Data Readers                        │  
│   • GithubRepositoryReader             │
│   • SimpleDirectoryReader              │
│   • Built-in LlamaIndex readers        │
│                                         │
│ 🔄 Processing                          │
│   • Document chunking                  │
│   • Embedding generation               │
│   • Metadata extraction                │
│                                         │
│ 💾 Storage Creation                    │
│   • Vector stores (FAISS)              │
│   • Document stores                    │
│   • Index metadata                     │
└─────────────────────────────────────────┘
```

**Key Files**:
- `python-rag-ingestion/simple_ingest.py` - Main ingestion script
- `python-rag-ingestion/setup.sh` - Environment setup

**Output**: Vector indexes saved to `output/python-rag/{agent_name}/`

### TypeScript Application

**Purpose**: Real-time agent coordination and user interaction

```
┌─────────────────────────────────────────┐
│           TYPESCRIPT APPLICATION        │
│                                         │
│ 📖 Storage Loading                     │
│   • Python index detection             │
│   • Fallback to local data             │
│   • Agent configuration parsing        │
│                                         │
│ 🤖 Agent System                       │
│   • Multi-agent coordination           │
│   • RAG retrieval                      │
│   • Workflow orchestration             │
│                                         │
│ 🔍 Runtime Services                    │
│   • Vector similarity search           │
│   • Context generation                 │
│   • Event management                   │
└─────────────────────────────────────────┘
```

**Key Files**:
- `src/app/agents.ts` - Agent coordination
- `src/app/hybrid-data.ts` - Data source management
- `src/app/workflow.ts` - Workflow orchestration

## Data Flow

### Ingestion Phase (Python)

1. **Agent Config Reading**: Parse YAML configurations from `src/agents/`
2. **Source Processing**: Clone GitHub repositories, read local directories
3. **Document Processing**: Chunk text, generate embeddings via OpenAI
4. **Index Creation**: Build FAISS vector stores with metadata
5. **Persistence**: Save indexes to shared filesystem location

### Runtime Phase (TypeScript)

1. **Index Loading**: Check for Python indexes, fall back to TypeScript generation
2. **Agent Initialization**: Load configurations and RAG contexts
3. **Query Processing**: User RFE input → multi-agent analysis
4. **Context Retrieval**: Similarity search across agent knowledge bases
5. **Response Generation**: Structured JSON output with analysis

## Component Communication

### Shared Storage Schema

Python and TypeScript communicate via filesystem:

```
output/python-rag/{agent_persona}/
├── docstore.json       # Document content and metadata
├── vector_store.json   # FAISS vector embeddings
├── index_store.json    # Index configuration
└── metadata.json       # Debug info and statistics
```

### Agent Configuration Schema

Agents are defined in YAML with JSON Schema validation:

```yaml
# yaml-language-server: $schema=./agent-schema.json
name: "Agent Display Name"
persona: "UNIQUE_IDENTIFIER"
role: "Role description"

dataSources:
  - "local-directory"
  - name: "github-source"
    type: "github"
    source: "org/repo"
    options:
      path: "docs/"
      fileTypes: [".md"]

analysisPrompt:
  template: "Analysis prompt with {rfe_description} variables"
  templateVars: ["rfe_description", "context"]
```

## Agent System Architecture

### Agent Personas

Each agent represents a specialized role with:
- **Domain Expertise**: Configured areas of knowledge
- **RAG Context**: Dedicated vector stores for domain-specific retrieval
- **Analysis Prompt**: Structured template for consistent output
- **Sample Knowledge**: Fallback knowledge base

### Multi-Agent Coordination

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│     PM      │    │    UXD       │    │ BACKEND_ENG │
│   (Root)    │────│              │    │             │
└─────────────┘    └──────────────┘    └─────────────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│FRONTEND_ENG │    │  ARCHITECT   │    │PRODUCT_OWNER│
│             │    │              │    │             │
└─────────────┘    └──────────────┘    └─────────────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                  ┌──────────────┐
                  │SME_RESEARCHER│
                  │              │
                  └──────────────┘
```

### Workflow Execution

1. **Parallel Analysis**: All agents analyze RFE simultaneously
2. **Context Retrieval**: Each agent queries its specialized RAG store
3. **Structured Output**: JSON responses with analysis, concerns, recommendations
4. **Event Coordination**: Progress tracking and state management

## Storage Architecture

### Vector Store Strategy

**FAISS (Facebook AI Similarity Search)**:
- Efficient similarity search for document retrieval
- Serializable to JSON for Python/TypeScript compatibility
- Memory-efficient for production deployment

### Hybrid Loading Strategy

```typescript
// Priority-based loading
async function loadAgentData(agent: Agent) {
  // 1. Try Python-generated index
  const pythonIndex = await tryLoadPythonIndex(agent.persona);
  if (pythonIndex) return pythonIndex;
  
  // 2. Fall back to local directory
  const localData = await tryLoadLocalDirectory(agent.dataSources);
  if (localData) return localData;
  
  // 3. Use sample knowledge
  return createSampleIndex(agent.sampleKnowledge);
}
```

## Event System

### Workflow Events

- `rfe:submitted` - User submits RFE for analysis
- `agents:analyzing` - Multi-agent analysis phase begins
- `agent:complete` - Individual agent completes analysis
- `synthesis:complete` - All agents completed, synthesis begins
- `workflow:complete` - Full analysis pipeline complete

### State Management

- **Stateful Middleware**: Maintains context across workflow steps
- **Progress Tracking**: Real-time updates to UI
- **Error Handling**: Graceful degradation and recovery

## Scalability Considerations

### Performance Optimizations

- **Parallel Agent Execution**: All agents analyze simultaneously
- **Cached Embeddings**: Vector stores persist across restarts
- **Lazy Loading**: Agents load data sources on-demand
- **Batch Operations**: Efficient bulk document processing

### Production Deployment

```bash
# Scheduled data ingestion (nightly/weekly)
0 2 * * * cd /app/python-rag-ingestion && python simple_ingest.py

# Continuous TypeScript application
npm start
```

## Development Workflow

### Adding New Agents

1. Create YAML configuration in `src/agents/`
2. Add data sources to `data/` directory or configure GitHub sources
3. Run Python ingestion (optional): `python simple_ingest.py`
4. Restart application: `npm start`

### Updating Knowledge Bases

1. **Local Sources**: Update files in `data/` directories
2. **GitHub Sources**: Re-run Python ingestion to pull latest
3. **Agent Config**: Modify YAML files and restart application

## Integration Points

### External Systems

- **OpenAI API**: Language model and embedding generation
- **GitHub API**: Repository access and documentation retrieval
- **File System**: Shared storage for Python/TypeScript communication

### Extension Capabilities

- **Custom Readers**: Add new data source types in Python pipeline
- **Agent Specializations**: Create domain-specific agent configurations
- **Workflow Customization**: Extend event system and state management
- **UI Integration**: Connect to front-end frameworks

This architecture provides a robust foundation for multi-agent feature analysis with clear separation of concerns and extensible component design.
