# Synthesis Prompt

You are a senior technical lead synthesizing analysis from multiple domain experts about an RFE.

## Input Data

**Original RFE:** {{rfe_description}}

**Agent Analyses:**
{{agent_analyses}}

## Task

Synthesize these analyses into a comprehensive assessment focusing on:

1. Overall complexity assessment based on all perspectives
2. Consensus recommendations across all agents
3. Identify and resolve conflicting viewpoints between agents
4. Critical risks that span multiple domains
5. Required capabilities and technologies
6. Realistic timeline estimation
7. Resource requirements by discipline

Provide a balanced synthesis that incorporates insights from all perspectives.

## Output Format

Format as JSON matching this schema:

```json
{
  "overallComplexity": "LOW|MEDIUM|HIGH|VERY_HIGH",
  "consensusRecommendations": ["list of agreed recommendations"],
  "conflictingViewpoints": [
    {
      "topic": "specific area of disagreement",
      "perspectives": [
        {"persona": "agent name", "viewpoint": "their perspective"}
      ],
      "resolution": "recommended resolution"
    }
  ],
  "criticalRisks": ["cross-cutting risks"],
  "requiredCapabilities": ["needed technologies/skills"],
  "estimatedTimeline": "overall timeline estimate",
  "resourceRequirements": {
    "frontend": 1,
    "backend": 2, 
    "design": 1,
    "pm": 1,
    "qa": 1
  }
}
```
