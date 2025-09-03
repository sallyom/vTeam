# Component Teams Identification

Based on the RFE analysis and synthesis, identify the component teams that will be involved and create epics for each.

## Input Data

**RFE:** {{rfe_description}}

**Synthesized Analysis:** {{synthesis}}

**Agent Recommendations:**
{{agent_analyses}}

## Task

Identify component teams and create epics based on:

1. Required components and services identified by agents
2. Team boundaries and responsibilities
3. Dependencies between teams
4. Epic scope and deliverables
5. Story breakdown for each epic

Common component teams might include: Frontend, Backend API, Data Services, Infrastructure, Mobile, Integration, etc.

## Output Format

Format as JSON array of team objects:

```json
[
  {
    "teamName": "Frontend Team",
    "components": ["user interface", "dashboard"],
    "responsibilities": ["UI development", "user experience"],
    "epicTitle": "User Interface Implementation",
    "epicDescription": "Develop user interface components and experiences",
    "stories": [
      {
        "title": "User story title",
        "description": "As a user, I want...",
        "acceptanceCriteria": ["criteria 1", "criteria 2"],
        "storyPoints": 5,
        "priority": "HIGH"
      }
    ]
  }
]
```
