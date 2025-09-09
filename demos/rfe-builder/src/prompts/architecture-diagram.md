# Architecture Diagram Generation

Create a system architecture diagram in Mermaid format for this RFE implementation.

## Input Data

**RFE:** {{rfe_description}}

**Analysis Summary:** {{synthesis}}

**Component Teams:** {{component_teams}}

## Task

Create a comprehensive architecture diagram that shows:

1. System components and their relationships
2. Data flow and integration points
3. External dependencies and services
4. User interaction points
5. Security boundaries
6. Deployment architecture

Use Mermaid graph syntax for the diagram. Focus on clarity and completeness.

## Output Format

Format as JSON:

```json
{
  "type": "system",
  "mermaidCode": "graph TD\n    A[User] --> B[Frontend]\n    B --> C[API Gateway]...",
  "description": "System architecture showing...",
  "components": [
    {
      "name": "Frontend",
      "type": "UI Layer", 
      "responsibilities": ["user interface", "state management"]
    }
  ],
  "integrations": [
    {
      "from": "Frontend",
      "to": "API Gateway",
      "type": "HTTP/REST",
      "description": "User requests and data fetching"
    }
  ]
}
```
