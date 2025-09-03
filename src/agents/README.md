# Agent Configuration System

This directory contains YAML configuration files for AI agents in the RFE refiner system. Each agent represents a different persona with specialized knowledge and analysis capabilities.

## Agent Configuration Structure

Each agent is defined in a YAML file with schema validation for better developer experience. All agent YAML files are validated against `agent-schema.json`.

### Schema Benefits
- **IDE Support**: Autocomplete, validation, and inline documentation
- **Error Prevention**: Catches configuration errors before runtime  
- **Documentation**: Schema serves as living documentation
- **Consistency**: Ensures all agents follow the same structure

Each agent is defined in a YAML file with the following structure:

```yaml
# yaml-language-server: $schema=./agent-schema.json

name: "Display Name"           # Human-readable name
persona: "UNIQUE_KEY"          # Unique identifier (uppercase with underscores)  
role: "Role Description"       # Brief role description
isRootAgent: false             # Whether this is the primary coordinating agent

expertise:                     # List of expertise areas
  - "area-1"
  - "area-2"

systemMessage: |              # System prompt for the agent
  You are a [role] with expertise in [areas].
  Focus on [specific concerns].

dataSources:                   # RAG data source directories
  - "data-source-1"
  - "data-source-2"

analysisPrompt:
  template: |                  # Analysis prompt template
    As a [role], analyze this RFE from a [perspective] perspective:
    
    RFE: {rfe_description}
    Context: {context}
    
    [Analysis instructions...]
    
    Format your response as JSON matching this schema:
    {
      "persona": "[name]",
      "analysis": "detailed analysis",
      "concerns": ["list of concerns"],
      "recommendations": ["list of recommendations"],
      "requiredComponents": ["list of components"],
      "estimatedComplexity": "LOW|MEDIUM|HIGH|VERY_HIGH",
      "dependencies": ["list of dependencies"],
      "risks": ["list of risks"],
      "acceptanceCriteria": ["list of criteria"]
    }
  templateVars:               # Variables used in the template
    - "rfe_description"
    - "context"

tools: []                     # Future: tool configurations for the agent

sampleKnowledge: |            # Sample knowledge base content
  # Knowledge Area
  
  ## Section 1
  - Knowledge point 1
  - Knowledge point 2
```

## Creating New Agents

To create a new agent:

1. Create a new YAML file in this directory with a descriptive name (e.g., `security_expert.yaml`)
2. Add the schema reference at the top of the file:
   ```yaml
   # yaml-language-server: $schema=./agent-schema.json
   ```
3. Follow the structure above, ensuring:
   - `persona` is unique and uses UPPERCASE_WITH_UNDERSCORES
   - `name` is human-readable
   - `expertise` lists relevant knowledge areas
   - `dataSources` references directories that exist or will be created in `data/`
   - `analysisPrompt.template` includes proper JSON schema format
   - `sampleKnowledge` provides relevant sample content

4. The system will automatically discover and load your agent

## Agent Types

### Root Agent
- Set `isRootAgent: true` for the primary coordinating agent
- Currently: Product Manager (PM)
- Responsible for overall feature analysis coordination

### Specialist Agents
- Set `isRootAgent: false` for specialized analysis agents
- Focus on specific domains (UX, Backend, Frontend, etc.)
- Provide domain-specific insights and recommendations

## Current Agents

- **PM (Product Manager)** - Root agent, business analysis and coordination
- **UXD (UX Designer)** - User experience and interface design
- **BACKEND_ENG (Backend Engineer)** - Backend systems and architecture
- **FRONTEND_ENG (Frontend Engineer)** - Frontend implementation and UI
- **ARCHITECT (System Architect)** - Overall system design and architecture
- **PRODUCT_OWNER (Product Owner)** - Business value and stakeholder management
- **SME_RESEARCHER (Subject Matter Expert)** - Domain research and best practices

## Data Sources

Each agent's `dataSources` should reference directories in the `data/` folder:
- Create subdirectories matching your data source names
- Place relevant documents (.md, .txt, .pdf, etc.) in these directories
- The RAG system will index these documents for agent-specific context

## Schema Validation

### IDE Setup
For the best development experience:

**VS Code**: Schema is automatically configured via `.vscode/settings.json`
- Autocomplete for all configuration options
- Real-time validation with error highlighting
- Hover documentation for each field

**Other IDEs**: Most IDEs with YAML Language Server support will recognize the schema reference in each file.

### Runtime Validation
Validation happens automatically when agents are loaded:
- **YAML syntax** errors are caught during file parsing
- **Configuration validation** uses Zod schemas in the AgentLoader
- **Error reporting** shows specific issues with helpful messages
- **No build step required** - validation happens at startup

## Dynamic Loading

The system automatically:
- Discovers all `.yaml` files in this directory
- Validates configurations at runtime using Zod schemas
- Loads agent configurations dynamically
- Creates RAG indexes for each agent's data sources
- No code changes needed to add new agents

## Future Enhancements

- **Tools Integration**: Agents will support tool calling capabilities
- **Multi-modal Analysis**: Support for image and document analysis
- **Collaborative Workflows**: Agent-to-agent communication patterns
- **Custom Prompt Templates**: More flexible prompt engineering
- **Performance Metrics**: Agent effectiveness tracking
