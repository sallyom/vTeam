# RFE Refiner - Multi-Agent Feature Refinement System

A multi-agent system built with LlamaIndex that analyzes Request for Enhancement (RFE) descriptions using specialized AI personas with domain expertise and RAG-powered knowledge bases.

## Overview

The RFE Refiner uses 7 specialized AI agents working together to analyze feature requirements:

- **UX Designer (UXD)** - User experience, interface design, accessibility
- **Product Manager (PM)** - Business requirements, prioritization, stakeholder alignment  
- **Backend Engineer** - System architecture, APIs, database design
- **Frontend Engineer** - React implementation, TypeScript, state management
- **Architect** - Overall system design, integration patterns, scalability
- **Product Owner** - Business value, acceptance criteria, stakeholder management
- **SME/Researcher** - Domain expertise, industry best practices, research

## Current Features

- **Multi-Agent Analysis**: Each agent analyzes RFEs from their specialized perspective
- **RAG Knowledge Bases**: Agents access domain-specific knowledge from configured data sources
- **Hybrid Data Architecture**: Python pipeline for advanced data ingestion + TypeScript runtime
- **GitHub Integration**: Direct repository indexing for real documentation
- **Event-Driven Workflow**: Real-time progress tracking and state management
- **Structured Output**: JSON analysis reports with complexity estimates and recommendations

## Architecture

### Hybrid System Design
```
┌─────────────────────────────┐    ┌─────────────────────────────┐
│     Python Pipeline         │    │   TypeScript Application    │
│                             │    │                             │
│ • GitHub Repository Reader  │────│ • Agent Workflow Engine     │
│ • Vector Store Creation     │    │ • RAG Retrieval System      │
│ • Document Indexing         │    │ • Multi-Agent Coordination  │
└─────────────────────────────┘    └─────────────────────────────┘
```

### Agent Workflow
1. **RFE Input** - User submits feature description
2. **Multi-Agent Analysis** - All 7 agents analyze simultaneously 
3. **Knowledge Retrieval** - RAG system provides domain-specific context
4. **Structured Output** - JSON reports with analysis and recommendations

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
# Copy environment template
cp env.template .env

# Edit .env with your API keys
export OPENAI_API_KEY="sk-your-openai-api-key"
export GITHUB_TOKEN="github_pat_your-token"  # optional
```

### 3. Start Application
```bash
npm start
```

The application will run with sample knowledge bases. For enhanced RAG with real data, see the Python ingestion setup below.

## Enhanced RAG Setup (Optional)

### Python Pipeline for Real Data
```bash
# Set up Python environment
cd python-rag-ingestion/

# Follow setup instructions in python-rag-ingestion/README.md
# Quick version:
uv venv && source .venv/bin/activate && uv sync && uv pip install -e .

# Run ingestion for enhanced knowledge bases
rhoai-rag ingest --verbose
```

This creates vector indexes from GitHub repositories that the TypeScript application automatically loads.

## Agent Configuration

Agents are configured in YAML files in `src/agents/`. Each agent specifies:

- **Persona & Role** - Name and domain expertise
- **Data Sources** - Knowledge base directories or GitHub repositories  
- **Analysis Prompts** - Structured prompts for consistent output
- **Sample Knowledge** - Fallback knowledge when no custom data available

Example agent configuration:
```yaml
name: "Frontend Engineer"
persona: "FRONTEND_ENG"
expertise: ["react", "typescript", "ui-components"]

dataSources:
  - "frontend-patterns"
  - name: "react-docs"
    type: "github"
    source: "facebook/react"
    options:
      path: "docs/"
```

## Data Sources

### Local Directories
Place documentation in `data/` subdirectories matching agent data source names.

### GitHub Repositories  
Configure in agent YAML files. Python pipeline handles cloning and indexing.

### Hybrid Loading
1. **Python indexes** - Loaded first if available
2. **Local directories** - TypeScript fallback for simple cases
3. **Sample knowledge** - Built-in fallback for testing

## Technical Stack

- **TypeScript** - Application runtime, agent coordination, workflow management
- **Python** - Advanced data ingestion, GitHub readers, vector store creation
- **LlamaIndex** - RAG system, vector stores, document processing
- **OpenAI** - Language model and embeddings
- **YAML** - Agent configuration with JSON schema validation

## Development

```bash
# Start with hot reload
npm run dev

# Test agent configurations
node test-agents.js
```

## File Structure

```
/
├── src/agents/          # Agent YAML configurations
├── src/app/            # Core application logic
├── python-rag-ingestion/  # Python data pipeline
├── data/               # Local knowledge bases
├── output/             # Generated indexes and storage
└── components/         # UI components
```

This system provides a foundation for multi-agent feature analysis with extensible agent configurations and flexible data source integration.
