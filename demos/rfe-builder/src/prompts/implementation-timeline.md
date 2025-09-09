# Implementation Timeline

Create an implementation timeline and project plan based on the epics, stories, and team analysis.

## Input Data

**RFE:** {{rfe_description}}

**Epics:** {{epics}}

**Stories:** {{stories}}

**Synthesis:** {{synthesis}}

## Task

Create a realistic implementation timeline that includes:

1. Development phases with dependencies
2. Duration estimates based on story points
3. Critical path analysis
4. Resource allocation across phases
5. Risk mitigation phases
6. Integration and testing phases

## Output Format

Format as JSON:

```json
{
  "phases": [
    {
      "name": "Phase 1: Foundation",
      "duration": "4 weeks",
      "dependencies": [],
      "deliverables": ["backend API", "database schema"],
      "risks": ["integration complexity"],
      "teams": ["Backend Team", "Infrastructure Team"]
    }
  ],
  "criticalPath": ["Phase 1", "Phase 2", "Phase 4"],
  "totalDuration": "16 weeks",
  "resourceAllocation": {
    "frontend": [{"phase": "Phase 2", "allocation": 2}],
    "backend": [{"phase": "Phase 1", "allocation": 2}],
    "design": [{"phase": "Phase 1", "allocation": 1}],
    "pm": [{"phase": "Phase 1", "allocation": 0.5}],
    "qa": [{"phase": "Phase 3", "allocation": 1}]
  }
}
```
