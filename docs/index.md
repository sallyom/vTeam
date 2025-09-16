# vTeam: Refinement Agent Team System

> AI-powered automation system to reduce engineering refinement time and improve ticket quality

## Components

### Ambient Agentic Runner
- [Setup Guide](ambient-runner/SETUP.md) - Complete setup and deployment guide
- [API Documentation](ambient-runner/API.md) - REST API reference  
- [Enhancement Proposals](ambient-runner/proposals/README.md) - Feature proposals and architectural changes

## Overview

The **vTeam** repository contains a dual-purpose AI automation platform:

1. **Refinement Agent Team System** - A production-ready multi-agent AI automation platform built on LlamaDeploy and @llamaindex/server that dramatically reduces the time engineering teams spend in refinement meetings through a 7-step agent council workflow
2. **vTeam Shared Configs** - A Python package for managing shared Claude Code configuration across development teams

The Refinement Agent Team system transforms Request for Enhancement (RFE) submissions into well-refined, implementation-ready tickets through intelligent AI agent collaboration, enabling engineering teams to start work immediately with comprehensive context and clear acceptance criteria.

## Quick Start

Get started in 5 minutes:

1. **Clone the repository**
   ```bash
   git clone https://github.com/red-hat-data-services/vTeam.git
   cd vTeam
   ```

2. **Set up environment**
   ```bash
   cd demos/rfe-builder
   uv sync
   ```

3. **Configure API access**
   Set up your API keys in `src/.env`:
   ```bash
   OPENAI_API_KEY=your-openai-api-key-here
   ANTHROPIC_API_KEY=your-anthropic-api-key-here
   ```

4. **Start the system**
   ```bash
   # Start LlamaDeploy API server
   uv run -m llama_deploy.apiserver
   
   # In another terminal, deploy the workflow
   uv run llamactl deploy deployment.yml
   ```

Visit `http://localhost:4501/deployments/rhoai-ai-feature-sizing/ui` to start creating RFEs with AI assistance.

## Key Features

- **💬 Conversational RFE Creation**: Natural language interface with real-time structured data extraction
- **🤖 Multi-Agent Workflow**: 7 specialized AI agents model realistic software team dynamics  
- **📊 Visual Progress Tracking**: Step-by-step workflow status with agent interactions
- **💰 Cost Management**: Built-in API usage tracking and response caching
- **🔗 Jira Integration**: Automated Epic creation from refined RFEs
- **👥 Agent Dashboard**: Role-specific views for different team members

## Success Metrics

- 🎯 **90% ticket readiness** for immediate engineering execution
- ⏱️ **50% reduction** in refinement meeting duration  
- 🚀 **25% improvement** in engineering velocity
- 📊 **Measurable time savings** in refinement hours per ticket

## What's Next?

- **New to vTeam?** → Start with our [Getting Started Guide](user-guide/getting-started.md)
- **Want to learn by doing?** → Try our [First RFE Lab](labs/basic/lab-1-first-rfe.md)
- **Developer looking to contribute?** → Check the [Developer Setup](developer-guide/setup.md)
- **Need technical details?** → Explore the [Architecture Guide](developer-guide/architecture.md)

## Agent Council Workflow

The system implements a 7-step refinement process with specialized AI agents:

1. **Parker (PM)** - RFE Prioritization and business value assessment
2. **Archie (Architect)** - Technical feasibility and design review
3. **Stella (Staff Engineer)** - Implementation completeness validation
4. **Archie (Architect)** - Acceptance criteria refinement
5. **Stella (Staff Engineer)** - Final accept/reject decision
6. **Parker (PM)** - Stakeholder communication and updates
7. **Derek (Delivery Owner)** - Feature ticket creation and planning

Each agent brings specialized expertise and realistic team dynamics to ensure comprehensive RFE refinement.

## Community & Support

- **Documentation Issues**: [GitHub Issues](https://github.com/red-hat-data-services/vTeam/issues)
- **Feature Requests**: Submit through our [RFE creation workflow](user-guide/creating-rfes.md)
- **Questions**: Check our [Troubleshooting Guide](user-guide/troubleshooting.md)
- **Contributing**: See our [Contribution Guidelines](developer-guide/contributing.md)