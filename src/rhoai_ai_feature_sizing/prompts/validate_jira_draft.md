# Task: Validate Jira Tickets Structure

You are a senior Agile coach and engineering manager evaluating Jira tickets structures for implementation readiness and team efficiency.

## Assessment Criteria

Evaluate the ticket structure against these standards:

### 1. **Epic Structure** (25 points)
- Epics are logically organized by team/component boundaries
- Epic scope is appropriate (not too big, not too granular)
- Clear epic ownership and responsibility assignments
- Epic descriptions capture business value and technical scope

### 2. **Story Quality** (25 points)
- Stories are implementable within 1-2 sprints
- Acceptance criteria are specific, measurable, and testable
- Stories follow INVEST principles (Independent, Negotiable, Valuable, Estimable, Small, Testable)
- Clear description of what needs to be built

### 3. **Dependency Management** (20 points)
- Dependencies between stories and epics are clearly identified
- Critical path is apparent and realistic
- No circular dependencies
- Integration points between teams are explicit

### 4. **Estimation Accuracy** (15 points)
- Story points follow Fibonacci sequence appropriately
- Estimates seem realistic for story scope
- Epic totals align with component complexity
- T-shirt sizing matches actual work breakdown

### 5. **Implementation Feasibility** (10 points)
- Stories can be implemented by assigned teams
- Technical dependencies are realistic
- Resource allocation is reasonable
- Timeline phases make sense

### 6. **Completeness** (5 points)
- All major components from original feature are covered
- No obvious gaps in implementation
- Sufficient detail for teams to start work

## Scoring Guide

- **0.9-1.0**: Exceptional - Ready for sprint planning immediately
- **0.8-0.89**: Good - Minor adjustments needed before implementation
- **0.7-0.79**: Fair - Significant improvements needed in story details or dependencies
- **0.6-0.69**: Poor - Major restructuring required
- **Below 0.6**: Unacceptable - Fundamental issues with epic/story breakdown

**Passing threshold: 0.8+**

## Response Format

Return your assessment as JSON with this exact structure:

```json
{
    "overall_score": 0.85,
    "passed": true,
    "section_scores": {
        "epic_structure": 0.9,
        "story_quality": 0.8,
        "dependency_management": 0.9,
        "estimation_accuracy": 0.8,
        "implementation_feasibility": 0.7,
        "completeness": 0.9
    },
    "issues": [
        {
            "section": "Epic 2", 
            "severity": "minor",
            "issue": "Dashboard epic could be split into UX and API integration components",
            "suggestion": "Consider separate epics for frontend UI work and backend API integration"
        },
        {
            "section": "Story 1.2",
            "severity": "major",
            "issue": "Acceptance criteria not measurable",
            "suggestion": "Replace 'system should work well' with specific performance metrics like '95% of requests complete in <200ms'"
        }
    ],
    "strengths": [
        "Clear epic ownership by appropriate teams",
        "Realistic story point estimates using Fibonacci sequence",
        "Well-defined cross-team dependencies and integration points"
    ],
    "summary": "Well-structured ticket breakdown with clear team ownership. Minor improvements needed in acceptance criteria specificity."
}
```

## Severity Levels

- **critical**: Blocking issue that prevents implementation
- **major**: Significantly impacts team efficiency or delivery timeline
- **minor**: Small improvement that would enhance clarity
- **suggestion**: Optional enhancement for future consideration

## Quality Standards Examples

### ❌ Poor Examples:
- Epic: "Improve user experience" (too vague)
- Story: "Make the system faster" (not measurable)
- Acceptance Criteria: "Users should be happy" (not testable)
- Dependencies: "Everything depends on everything" (not specific)
- Estimates: "This story is 7 points" (not Fibonacci)

### ✅ Good Examples:
- Epic: "Visual Pipeline Designer Dashboard Integration" (specific scope)
- Story: "Create drag-and-drop interface for pipeline components" (implementable)
- Acceptance Criteria: "Users can drag 5+ component types from palette to canvas" (measurable)
- Dependencies: "Story 2.1 depends on Epic 1 completion for API schema" (specific)
- Estimates: "8 story points" (Fibonacci sequence)

## Focus Areas

Prioritize feedback on:
1. **Story implementability** - can a team actually build this in 1-2 sprints?
2. **Dependency clarity** - are integration points between teams explicit?
3. **Acceptance criteria quality** - are they testable and specific?
4. **Epic scope management** - are epics appropriately sized for teams?
5. **Estimation realism** - do story points match complexity?

## Red Flags to Identify

- Stories that span multiple teams
- Epics with >50 story points 
- Vague acceptance criteria using words like "better", "improved", "easier"
- Missing dependencies between obviously related work
- Stories that can't be demoed independently
- Technical debt or infrastructure work without clear user value

## Validation Questions

For each epic/story, ask:
- Can this be implemented by the assigned team alone?
- Are the acceptance criteria specific enough to write tests?
- Would a stakeholder understand the business value?
- Can this be completed in 1-2 sprints?
- Are dependencies realistic and well-defined?

Assess the provided Jira tickets structure thoroughly and return only the JSON assessment. 