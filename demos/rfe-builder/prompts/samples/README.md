# RFE Builder Sample Prompts

This directory contains sample prompt templates and real-world examples for the RFE Builder system. These samples demonstrate best practices for structuring RFE prompts and provide templates for common use cases.

## Directory Structure

```
prompts/samples/
├── README.md                    # This file
├── rfe-examples/               # Real-world RFE examples
│   ├── RHOAIRFE-159.md        # Node targeting feature for OpenShift AI
│   ├── RHOAIRFE-302.md        # Project-level resource discovery
│   └── RHOAIRFE-390.md        # KServe model stop/restart capability
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

| RFE ID | Title | Category | Complexity | Timeline | Story Points |
|--------|-------|----------|------------|----------|--------------|
| **RHOAIRFE-159** | Enable Node Targeting for Workbench Creation | Infrastructure | High | 12-16 weeks | 34 |
| **RHOAIRFE-302** | Project-Level Resource Discovery | User Experience | Medium | 8-12 weeks | 21 |
| **RHOAIRFE-390** | Manual Model Stop/Restart for KServe | Model Serving | Medium | 10-14 weeks | 28 |

##### Detailed Sample Descriptions:

1. **RHOAIRFE-159.md** - Enable Node Targeting for Workbench Creation
   - **Category**: Infrastructure Enhancement
   - **Complexity**: High (34 story points)
   - **Timeline**: 12-16 weeks
   - **Focus**: Kubernetes node selection, hardware targeting, enterprise resource management
   - **Key Features**: GPU cluster management, business unit isolation, cost optimization

2. **RHOAIRFE-302.md** - Project-Level Resource Discovery in OpenShift AI Dashboard
   - **Category**: User Experience
   - **Complexity**: Medium (21 story points)
   - **Timeline**: 8-12 weeks
   - **Focus**: Multi-tenancy, self-service capabilities, resource customization
   - **Key Features**: Project-specific resources, administrative flexibility, workflow integration

3. **RHOAIRFE-390.md** - Manual Model Stop/Restart Capability for KServe
   - **Category**: Model Serving
   - **Complexity**: Medium (28 story points)
   - **Timeline**: 10-14 weeks
   - **Focus**: Model lifecycle management, resource optimization, operational control
   - **Key Features**: Emergency shutdown, GPU resource juggling, automated operations

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

## Template Patterns

The sample collection demonstrates three key template patterns:

### 1. Enterprise Infrastructure (`RHOAIRFE-159`)
- **Pattern**: Large-scale infrastructure changes for enterprise customers
- **Key Sections**: Administrative controls, multi-tenant considerations, scalability requirements
- **Use Cases**: Heterogeneous hardware clusters, business unit isolation, resource targeting
- **Complexity**: High - requires multiple teams and significant architectural changes

### 2. User Experience Enhancement (`RHOAIRFE-302`)
- **Pattern**: UI/UX improvements focused on user productivity and self-service
- **Key Sections**: Use cases, user experience criteria, workflow integration
- **Use Cases**: Custom image development, project-specific resources, administrative flexibility
- **Complexity**: Medium - cross-team coordination with moderate technical complexity

### 3. Model Lifecycle Management (`RHOAIRFE-390`)
- **Pattern**: Model serving and operational control features
- **Key Sections**: Resource management, API design, operational workflows
- **Use Cases**: Emergency shutdown, resource optimization, automated operations
- **Complexity**: Medium - requires deep integration with existing serving infrastructure

## Agent Integration

These samples are designed to work with the RFE Builder's AI agent system:

| Agent | Focus Areas | Relevant Sections |
|-------|-------------|------------------|
| **Parker (PM)** | Prioritization & Business Impact | Business justification, stakeholder analysis, customer validation |
| **Archie (Architect)** | Technical Feasibility | Technical requirements, dependencies, implementation details |
| **Stella (Staff Engineer)** | Completeness & Quality | Success criteria, testing requirements, risk assessment |
| **Derek (Delivery Owner)** | Project Planning | Effort estimation, team assignment, deployment planning |

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

## Sample Coverage

The current collection provides comprehensive coverage across:

### By Category
- **Infrastructure**: 1 sample (High complexity)
- **User Experience**: 1 sample (Medium complexity)
- **Model Serving**: 1 sample (Medium complexity)

### By Complexity
- **High (12-16+ weeks)**: 1 sample (34 story points)
- **Medium (8-14 weeks)**: 2 samples (21 + 28 = 49 story points)
- **Low (<8 weeks)**: None (opportunity for future samples)

### By Business Value
- All samples demonstrate **High** business value and customer impact
- Range from **Low** to **Medium** technical risk
- Cover enterprise, multi-tenant, and operational use cases

---

*Last Updated: 2025-01-26*
*Version: 1.1*
