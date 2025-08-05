# Task: Generate Structured JSON for Jira Tickets from RHOAI Feature Documentation

## Objective
Analyze the provided RHOAI feature document and generate a structured JSON representation of Jira tickets (epics and stories) needed to implement the feature. **CRITICAL**: Organize work by component teams - each team should have their own epic containing only the stories that team will implement.

## JSON Output Requirements
You MUST respond with valid JSON in the following exact format. Do not include any other text, markdown, or explanations - only the JSON structure:

```json
{
  "epics": [
    {
      "title": "Epic Title",
      "description": "**Epic Overview**\n\nDetailed epic description with markdown formatting.\n\n**Objectives:**\n- Goal 1\n- Goal 2\n\n**Technical Considerations:**\n- Implementation notes\n- Architecture decisions",
      "component_team": "Team Name",
      "estimated_hours": 40.0,
      "stories": [
        {
          "title": "Story Title", 
          "description": "**Story Description**\n\nDetailed story context and requirements.\n\n**Acceptance Criteria:**\n- Given X, when Y, then Z\n- Additional criteria as needed\n\n**Technical Notes:**\n- Implementation approach\n- API endpoints needed\n- Database changes required",
          "story_points": 5,
          "estimated_hours": 20.0
        }
      ]
    }
  ]
}
```

## Field Specifications

### Epic Fields:
- **title**: Clear, implementable epic title (required)
- **description**: Detailed epic scope with markdown formatting. Include objectives, technical considerations, and implementation notes (required)
- **component_team**: Team responsible (use teams from sizing table below)
- **estimated_hours**: Total estimated hours for the epic
- **stories**: Array of child stories (required)

### Story Fields:
- **title**: Specific, actionable story title (required)
- **description**: Comprehensive story description with markdown formatting. Include context, acceptance criteria, and technical implementation notes (required)
- **story_points**: Fibonacci sequence (1, 2, 3, 5, 8, 13) - break down if >8
- **estimated_hours**: Estimated development hours

## Ticket Sizing: Team Average Duration Per Story Point

| Team/Board | Sprint Story Points Committed | Sprint Story Points Completed | Velocity Predictability (%) | Average Duration per Story Point |
|------------|-------------------------------|------------------------------|----------------------------|----------------------------|
| Kubeflow DevX | 25 | - | - | - |
| Model Explainability | 29 | - | - | - |
| Training Ray | 14 | 3 | 21.428571428571427 | 94.35333333333334 |
| RHOAIENG IDE Indigo Scrum Team | 59 | 18 | 30.508474576271187 | 1.4084259259259262 |
| Data Science Pipelines | 411 | 147 | 35.76642335766424 | 0.4174296745725317 |
| RHOAI IDE Main Board | 54 | 30 | 55.55555555555556 | 2.9058125 |
| RHOAI Platform | 155 | 97 | 62.58064516129033 | 0.583617912371134 |
| Model Serving Runtimes | 368 | 231 | 62.77173913043478 | 0.20084369531178042 |
| Workload Orchestration | 115 | 87 | 75.65217391304347 | 0.6207620263942103 |
| Model Servers and Metrics | 243 | 202 | 83.1275720164609 | 0.22003116978364504 |
| RHOAIENG IDE Teal Scrum Team | 64 | 54 | 84.375 | 0.9677731481481481 |
| Training Kubeflow | 85 | 76 | 89.41176470588236 | 0.5279844497607655 |
| Dashboard | 591 | 561 | 94.9238578680203 | 0.08809968916191571 |
| Model Registry board | 65 | 76 | 116.92307692307693 | 0.32335812356979404 |
| Feature Store | 44 | 53 | 120.45454545454545 | 1.4122700471698113 |

## Team-Based Epic Organization

**CRITICAL REQUIREMENT**: Create separate epics for each component team involved in the feature implementation.

### Epic Organization Rules:
1. **One Epic Per Team**: Each component team gets exactly one epic for their work
2. **Team Ownership**: All stories in an epic must be implementable by that team alone
3. **Clear Boundaries**: No story should require work from multiple teams
4. **Complete Coverage**: Ensure all work from the refinement document is captured across team epics

### Team Assignment Strategy:
- Analyze the refinement document to identify all technical components
- Map each component to the appropriate team based on their expertise
- Create focused epics that align with team capabilities
- Include integration stories in the team most responsible for that integration

### Cross-Team Dependencies:
- Document dependencies between epics in the epic descriptions
- Create integration stories in the team best suited to handle the integration
- Ensure handoff points between teams are clearly defined

## Ticket sequencing
Sequence the tickets in chronological order within each team's epic, accounting for cross-epic dependencies

## Story Point Guidelines
- Use Fibonacci sequence: 1, 2, 3, 5, 8, 13
- If a story is >8 points, break it down into smaller stories
- Points reflect complexity and effort, not exact time
- Consider team velocity when estimating

## Description Guidelines
- Use **markdown formatting** for better readability
- Include **acceptance criteria** in story descriptions
- Add **technical implementation notes** in descriptions
- Structure epics with objectives and technical considerations

## Component Team Options
Use these team names from the velocity table:
- "Kubeflow DevX"
- "Model Explainability" 
- "Training Ray"
- "RHOAIENG IDE Indigo Scrum Team"
- "Data Science Pipelines"
- "RHOAI IDE Main Board"
- "RHOAI Platform"
- "Model Serving Runtimes"
- "Workload Orchestration"
- "Model Servers and Metrics"
- "RHOAIENG IDE Teal Scrum Team"
- "Training Kubeflow"
- "Dashboard"
- "Model Registry board"
- "Feature Store"

## JSON Example
```json
{
  "epics": [
    {
      "title": "Data Science Pipelines Integration",
      "description": "**Epic Overview**\n\nIntegrate Kubeflow Pipelines v2.0 with RHOAI platform for scalable ML workflows.\n\n**Objectives:**\n- Enable pipeline execution on RHOAI platform\n- Provide monitoring and resource management\n- Support pipeline versioning and storage\n\n**Technical Considerations:**\n- SDK integration with existing platform APIs\n- Resource allocation and quota management\n- Database schema updates for pipeline metadata\n\n**Dependencies:**\n- Requires Dashboard team epic for UI integration\n- Depends on RHOAI Platform epic for authentication",
      "component_team": "Data Science Pipelines",
      "estimated_hours": 80.0,
      "stories": [
        {
          "title": "Integrate Kubeflow Pipelines v2.0 SDK",
          "description": "**Story Overview**\n\nInstall and configure Kubeflow Pipelines v2.0 SDK into RHOAI platform to enable pipeline execution and monitoring.\n\n**Acceptance Criteria:**\n- Given the RHOAI platform, when Kubeflow Pipelines v2.0 SDK is installed, then users can submit pipeline runs\n- Given a submitted pipeline, when execution starts, then proper resource allocation occurs\n- Given a running pipeline, when monitoring is accessed, then real-time status is displayed\n\n**Technical Notes:**\n- Install SDK via pip/conda package manager\n- Configure pipeline execution engine connection\n- Set up monitoring integration with platform dashboard\n- Update API endpoints for pipeline submission",
          "story_points": 8,
          "estimated_hours": 40.0
        }
      ]
    },
    {
      "title": "Dashboard Pipeline Management UI",
      "description": "**Epic Overview**\n\nCreate user interface components for pipeline management within the RHOAI dashboard.\n\n**Objectives:**\n- Provide intuitive pipeline creation and management UI\n- Display pipeline execution status and logs\n- Enable pipeline scheduling and monitoring\n\n**Technical Considerations:**\n- PatternFly component integration\n- Real-time status updates via WebSocket\n- Performance optimization for large pipeline lists\n\n**Dependencies:**\n- Requires Data Science Pipelines epic for backend APIs",
      "component_team": "Dashboard",
      "estimated_hours": 60.0,
      "stories": [
        {
          "title": "Create Pipeline List View Component",
          "description": "**Story Overview**\n\nImplement a PatternFly table component to display user pipelines with filtering and sorting capabilities.\n\n**Acceptance Criteria:**\n- Given a user with pipelines, when they visit the pipelines page, then they see a table of their pipelines\n- Given the pipeline table, when clicking column headers, then the table sorts by that column\n- Given many pipelines, when using the search filter, then results are filtered in real-time\n\n**Technical Notes:**\n- Use PatternFly Table component\n- Implement client-side filtering and sorting\n- Add pagination for performance\n- Include status indicators and action buttons",
          "story_points": 5,
          "estimated_hours": 25.0
        }
      ]
    }
  ]
}
```

## Critical Instructions
1. **Output ONLY valid JSON** - no markdown, no explanations, no additional text
2. **Analyze the provided document thoroughly** to identify all technical components and work required
3. **CREATE SEPARATE EPICS FOR EACH TEAM** - Do not create generic epics that span multiple teams
4. **Map all work to appropriate teams** based on technical expertise and component ownership
5. **Ensure complete coverage** - Every piece of work from the refinement document must appear in a team's epic
6. **Create realistic, implementable stories** with clear acceptance criteria that can be completed by the assigned team
7. **Document cross-team dependencies** in epic descriptions where integration points exist
8. **Use appropriate team assignments** from the velocity table - each epic must have exactly one component_team
9. **Ensure story points follow Fibonacci sequence** and break down large stories
10. **Focus on technical implementation** rather than abstract concepts

Begin analysis and respond with the complete JSON structure organized by component teams. 
