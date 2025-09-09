# Epics and Stories Generation

Create detailed epics and stories based on the component team analysis.

## Input Data

**RFE:** {{rfe_description}}

**Component Teams:** {{component_teams}}

**Synthesis:** {{synthesis}}

## Task

Generate comprehensive epics and stories that:

1. Cover all required functionality
2. Have clear acceptance criteria
3. Include proper story point estimates
4. Define dependencies between stories
5. Assign to appropriate teams
6. Include technical implementation notes

## Output Format

Format as JSON:

```json
{
  "epics": [
    {
      "id": "epic-001",
      "title": "Epic Title",
      "description": "Detailed epic description",
      "componentTeam": "Frontend Team",
      "priority": "HIGH",
      "estimatedStoryPoints": 25,
      "dependencies": ["epic-002"],
      "acceptanceCriteria": ["epic acceptance criteria"],
      "stories": ["story-001", "story-002"]
    }
  ],
  "stories": [
    {
      "id": "story-001",
      "epicId": "epic-001", 
      "title": "Story Title",
      "description": "As a user, I want...",
      "acceptanceCriteria": ["story acceptance criteria"],
      "storyPoints": 5,
      "priority": "HIGH",
      "assignedTeam": "Frontend Team",
      "dependencies": ["story-002"],
      "technicalNotes": "Implementation details"
    }
  ]
}
```
