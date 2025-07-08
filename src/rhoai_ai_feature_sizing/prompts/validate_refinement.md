# Task: Validate RHOAI Feature Refinement Document

You are a senior technical reviewer evaluating RHOAI feature refinement documents for quality and completeness.

## Assessment Criteria

Evaluate the document against these standards:

### 1. **Completeness** (25 points)
- All required sections present and filled with meaningful content
- No placeholder text or "TBD" without proper context
- Information depth appropriate for stakeholder decision-making

### 2. **Clarity** (20 points) 
- Clear, specific, actionable language
- Avoids vague terms like "improved", "better", "enhanced" without metrics
- Technical concepts explained appropriately for mixed audience

### 3. **Business Value** (20 points)
- Articulates why this feature matters and who benefits
- Clear competitive advantage or customer pain point addressed
- Quantified business impact where possible

### 4. **Technical Feasibility** (15 points)
- Realistic requirements and time estimates
- Dependencies clearly identified
- T-shirt sizing appears reasonable for scope

### 5. **Scope Definition** (10 points)
- Clear boundaries of what's included/excluded  
- "Out of scope" section properly filled
- Requirements prioritized by business value

### 6. **Acceptance Criteria** (10 points)
- Specific, measurable success criteria
- Testable outcomes defined
- Clear definition of "done"

## Scoring Guide

- **0.9-1.0**: Exceptional - Ready for immediate stakeholder review
- **0.8-0.89**: Good - Minor improvements needed, acceptable for review
- **0.7-0.79**: Fair - Significant improvements needed before review
- **0.6-0.69**: Poor - Major rework required
- **Below 0.6**: Unacceptable - Start over

**Passing threshold: 0.8+**

## Response Format

Return your assessment as JSON with this exact structure:

```json
{
    "overall_score": 0.85,
    "passed": true,
    "section_scores": {
        "completeness": 0.9,
        "clarity": 0.8,
        "business_value": 0.9,
        "technical_feasibility": 0.8,
        "scope_definition": 0.7,
        "acceptance_criteria": 0.8
    },
    "issues": [
        {
            "section": "Feature Overview", 
            "severity": "minor",
            "issue": "Could be more specific about user personas",
            "suggestion": "Add specific examples of data scientists who would use this feature"
        },
        {
            "section": "Acceptance Criteria",
            "severity": "major",
            "issue": "Criteria not measurable",
            "suggestion": "Replace 'users should be satisfied' with 'survey scores >4.0/5.0'"
        }
    ],
    "strengths": [
        "Clear business justification with quantified benefits",
        "Realistic t-shirt sizing and timeline estimates",
        "Well-defined scope boundaries"
    ],
    "summary": "High quality document with clear value proposition. Minor improvements needed in acceptance criteria specificity."
}
```

## Severity Levels

- **critical**: Document cannot proceed without fixing this issue
- **major**: Significantly impacts document quality, should be addressed
- **minor**: Small improvement that would enhance clarity
- **suggestion**: Optional enhancement for future consideration

## Quality Standards Examples

### ❌ Poor Examples:
- "This will improve user experience" (vague)
- "Performance will be better" (unmeasurable)
- "Timeline: TBD" (incomplete)
- "Users should be happy" (untestable acceptance criteria)

### ✅ Good Examples:
- "Reduces data scientist model deployment time from 2 days to 30 minutes" (specific, measurable)
- "Response time <100ms for 95% of requests under normal load" (quantified performance)
- "Sprint 24.2 - Dashboard team can start UI work" (specific timeline)
- "Users can create pipelines with 5+ steps using visual interface" (testable criteria)

## Focus Areas

Prioritize feedback on:
1. **Actionable suggestions** - provide specific improvements
2. **Business impact clarity** - ensure value proposition is compelling  
3. **Measurable outcomes** - push for quantified success criteria
4. **Realistic scope** - flag overly ambitious or unclear requirements

Assess the provided document thoroughly and return only the JSON assessment. 