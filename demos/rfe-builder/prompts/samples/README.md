# RFE Builder Sample Prompts

This directory contains sample prompt templates and real-world examples for the RFE Builder system. These samples demonstrate best practices for structuring RFE prompts and provide templates for common use cases.

## Directory Structure

```
prompts/samples/
├── README.md                    # This file
├── rfe-examples/               # Real-world RFE examples
│   └── RHOAIRFE-159.md        # Node targeting feature for OpenShift AI
└── templates/                  # Template examples (future)
```

## Sample Categories

### RFE Examples (`rfe-examples/`)

Real-world Request for Enhancement examples from Red Hat OpenShift AI and other products. These demonstrate:

- **Complete RFE Structure**: Full technical requirements, business justification, success criteria
- **Stakeholder Context**: Clear identification of affected teams and customers
- **Implementation Planning**: Detailed technical approach and deployment considerations
- **Risk Assessment**: Comprehensive risk analysis with mitigation strategies

#### Available Examples:

1. **RHOAIRFE-159.md** - Enable Node Targeting for Workbench Creation
   - **Category**: Infrastructure Enhancement
   - **Complexity**: High
   - **Timeline**: 12-16 weeks
   - **Focus**: Kubernetes node selection, hardware targeting, enterprise resource management

2. **RHOAIRFE-302.md** - Project-Level Resource Discovery in OpenShift AI Dashboard
   - **Category**: User Experience
   - **Complexity**: Medium
   - **Timeline**: 8-12 weeks
   - **Focus**: Multi-tenancy, self-service capabilities, resource customization

## Usage Guidelines

### For Agent Training

These samples can be used to train AI agents on:

1. **RFE Structure**: Understanding the components of a well-formed RFE
2. **Technical Depth**: Appropriate level of technical detail for different audiences
3. **Business Context**: Connecting technical features to business value
4. **Risk Assessment**: Identifying and mitigating implementation risks
5. **Success Metrics**: Defining measurable outcomes and acceptance criteria

### For Template Creation

Use these examples as references when creating new RFE templates:

- Extract common patterns and structures
- Identify reusable components (business justification formats, risk categories)
- Understand stakeholder identification patterns
- Learn effective technical requirement organization

### For RFE Analysis

When analyzing new RFEs, compare against these samples for:

- **Completeness**: Are all necessary sections present?
- **Clarity**: Is the technical approach clearly articulated?
- **Feasibility**: Are the timelines and resource estimates realistic?
- **Business Value**: Is the business justification compelling?

## Agent Integration

These samples are designed to work with the RFE Builder's AI agent system:

- **Parker (PM)**: Use business justification and stakeholder sections for prioritization analysis
- **Archie (Architect)**: Reference technical requirements and implementation details for feasibility assessment
- **Stella (Staff Engineer)**: Examine success criteria and testing requirements for completeness validation
- **Derek (Delivery Owner)**: Review project details and deployment considerations for ticket creation

## Contributing New Samples

When adding new sample RFEs:

1. **Use Real Examples**: Prefer actual RFEs over hypothetical ones
2. **Anonymize as Needed**: Remove sensitive customer or internal information
3. **Include Metadata**: Add creation date, complexity, timeline estimates
4. **Document Context**: Explain the business and technical context
5. **Structure Consistently**: Follow the established format patterns

### Sample Template

```markdown
# [Feature Title]

**RFE ID:** [ID if available]
**Category:** [Infrastructure/Feature/Enhancement]
**Priority:** [P0/P1/P2]
**Complexity:** [Low/Medium/High]

## Description
[Brief feature description]

## Business Justification
[Why this feature is needed]

## Technical Requirements
[Detailed technical specifications]

## Success Criteria
[Measurable outcomes]

## [Additional sections as needed]
```

## Feedback and Improvements

These samples are living documents that should evolve based on:

- **Agent Performance**: How well do agents analyze these examples?
- **User Feedback**: What additional context would be helpful?
- **Template Evolution**: How can we improve the structure?
- **New Use Cases**: What other scenarios should we cover?

Submit improvements via pull requests or issues in the main repository.

---

*Last Updated: 2024-08-26*
*Version: 1.0*
