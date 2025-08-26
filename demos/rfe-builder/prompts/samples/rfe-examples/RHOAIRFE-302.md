# Project-Level Resource Discovery in OpenShift AI Dashboard

**RFE ID:** RHOAIRFE-302
**Strategy ID:** RHOAISTRAT-340
**Category:** User Experience
**Priority:** Critical
**Complexity:** Medium

## Description

Enable the OpenShift AI Dashboard to discover and display project-specific resources (workbench images, serving runtimes, accelerator profiles) alongside global resources in dropdown lists. Currently, users only see items from the global `redhat-ods-applications` namespace, limiting customization and self-service capabilities. This enhancement will allow users to utilize custom resources within their own projects while maintaining separation from global resources.

## Business Justification

Organizations need flexible resource management that balances standardization with customization. Current limitations force all users to see identical resource lists, preventing:

- **Self-Service Customization**: Users cannot iterate on custom images without affecting others
- **Project Isolation**: Custom resources appear globally or not at all
- **Administrative Flexibility**: Admins cannot provide project-specific resources
- **Development Agility**: Teams cannot independently develop and test custom configurations

This feature enables:
- **User Autonomy**: Self-sufficient custom image development within project boundaries
- **Administrative Control**: Targeted resource distribution to specific projects
- **Resource Isolation**: Project-specific customizations without global impact
- **Enhanced Productivity**: Faster iteration cycles for specialized workloads

## Technical Requirements

### Core Functionality

#### 1. Multi-Namespace Resource Discovery
- **Global Resources**: Continue discovering from `redhat-ods-applications` namespace
- **Project Resources**: Additionally discover from current user project namespace
- **Resource Types**: Imagestreams, serving runtime templates, accelerator profiles
- **Compatibility Validation**: Ensure project-level resources match expected schema and tagging

#### 2. Resource Identification and Labeling
- **Naming Convention**: Project-specific items prefixed with "Project-Specific: " in UI
- **Visual Distinction**: Clear differentiation between global and project resources
- **Source Indication**: Users can identify resource origin (global vs project)
- **Consistent Ordering**: Logical arrangement in dropdown lists

#### 3. Resource Validation
- **Schema Compliance**: Project resources must match global resource structure
- **Tag Validation**: Proper labeling and annotation requirements
- **Compatibility Check**: Ensure project resources function with existing workflows
- **Quality Assurance**: Prevent malformed resources from breaking user experience

### Implementation Details

#### Frontend Changes
- **Dropdown Enhancement**: Modify resource selection components to show combined lists
- **Resource Labeling**: Add visual indicators for project-specific resources
- **Error Handling**: Graceful handling of invalid project resources
- **User Feedback**: Clear messaging about resource sources and availability

#### Backend Integration
- **Multi-Namespace Queries**: Extend resource discovery to include project namespaces
- **Resource Aggregation**: Combine and deduplicate resources from multiple sources
- **Validation Logic**: Implement compatibility checking for project resources
- **API Enhancement**: Update endpoints to support multi-source resource discovery

#### Resource Types Supported

1. **Workbench Images (ImageStreams)**
   - Custom data science notebook images
   - Specialized development environments
   - Organization-specific toolchains

2. **Model Serving Runtimes**
   - Custom inference engines
   - Specialized model formats
   - Performance-optimized runtimes

3. **Accelerator Profiles**
   - Project-specific GPU configurations
   - Custom resource limits and quotas
   - Specialized hardware profiles

## Success Criteria

### Functional Success Criteria
1. **Resource Discovery**: 100% discovery rate for compatible project-level resources
2. **UI Integration**: Clear visual distinction between global and project resources
3. **Functionality**: Project resources work identically to global resources
4. **Compatibility**: Zero breaking changes to existing global resource workflows
5. **Performance**: No degradation in dropdown load times with additional resources

### User Experience Success Criteria
1. **Clarity**: Users can easily distinguish resource sources (95% comprehension in testing)
2. **Usability**: Resource selection workflow remains intuitive and efficient
3. **Error Handling**: Clear, actionable error messages for invalid project resources
4. **Documentation**: Comprehensive guidance for creating project-level resources

### Business Success Criteria
1. **Self-Service Adoption**: 40%+ increase in custom image usage within projects
2. **Administrative Efficiency**: Reduced support requests for custom resource deployment
3. **Development Velocity**: Faster iteration cycles for teams using custom resources
4. **User Satisfaction**: Improved satisfaction scores for resource customization capabilities

## Impact Assessment

**Medium-High Impact** - Significantly enhances user autonomy and administrative flexibility

### Problems Solved:
- Limited customization options for project teams
- Administrative bottlenecks for custom resource deployment
- Lack of project isolation for experimental resources
- Inflexibility in supporting diverse use cases within organizations

### Business Value:
- **Increased Agility**: Teams can develop and iterate independently
- **Reduced Administrative Overhead**: Self-service capabilities reduce support burden
- **Enhanced User Experience**: More flexible and personalized resource options
- **Better Resource Utilization**: Project-specific optimizations improve efficiency

## Use Cases

### 1. Self-Service Custom Image Development
- **Scenario**: Data science team needs specialized Python libraries
- **Current State**: Must request global image update or use workarounds
- **Future State**: Team creates custom image in their project, immediately available in UI
- **Benefit**: Independent development cycles, no impact on other users

### 2. Administrative Resource Distribution
- **Scenario**: Admin wants to provide specific resources to selected projects
- **Current State**: Resources are either global (all users) or unavailable
- **Future State**: Admin deploys resources to specific project namespaces
- **Benefit**: Targeted resource availability without global exposure

### 3. Project-Specific Accelerator Profiles
- **Scenario**: Project requires custom GPU configurations for specialized workloads
- **Current State**: Limited to global accelerator profiles
- **Future State**: Project-specific profiles appear alongside global options
- **Benefit**: Customized hardware configurations without affecting other projects

## Components Affected

### Primary:
- OpenShift AI Dashboard (Frontend)
- Resource Discovery Service
- Workbench Creation API
- Model Serving API
- Accelerator Profile Management

### Secondary:
- Project Management Interface
- Resource Validation Service
- User Permission System
- Documentation and Help System

## Dependencies

### Technical:
- OpenShift RBAC for cross-namespace resource access
- Kubernetes resource labeling and annotation standards
- Existing resource validation schemas
- Dashboard component architecture

### Organizational:
- Documentation for project resource creation
- Guidelines for resource naming and tagging
- Training materials for administrators and users
- Support procedures for project resource issues

## Risks and Mitigations

### Risks:
- **Resource Proliferation**: Uncontrolled creation of project resources
- **Compatibility Issues**: Project resources may not work correctly
- **Performance Impact**: Additional namespace queries may slow UI
- **User Confusion**: Too many resource options may overwhelm users

### Mitigations:
- Implement clear documentation and guidelines for resource creation
- Add validation checks to prevent incompatible resources from appearing
- Optimize discovery queries and implement caching strategies
- Design clear UI/UX to distinguish and organize resource types

## Testing Requirements

### Functional Testing
- Resource discovery across multiple namespaces
- UI display and selection of project-specific resources
- Workbench/model creation using project resources
- Validation of resource compatibility and tagging
- Error handling for malformed project resources

### Integration Testing
- Cross-namespace RBAC validation
- API compatibility with existing workflows
- Dashboard performance with additional resources
- Resource lifecycle management (creation, updates, deletion)

### User Experience Testing
- UI clarity and resource distinction validation
- Dropdown usability with mixed resource types
- Error message comprehension and actionability
- Workflow efficiency comparison (before/after)

## Deployment Considerations

### Rollout Strategy
- **Phase 1**: Backend infrastructure and API updates
- **Phase 2**: Frontend UI enhancements and integration
- **Phase 3**: Documentation and user training
- **Feature Flags**: Gradual rollout with administrative controls

### Operational Requirements
- Monitoring for project resource discovery and usage
- Performance metrics for multi-namespace queries
- Documentation updates for resource creation procedures
- Support process updates for project-specific resources

### Configuration Management
- Default behavior (global resources only vs mixed)
- Resource validation rules and schemas
- Performance tuning parameters for discovery queries

## Project Details

- **Estimated Effort**: 8-12 weeks
- **Story Points**: 21
- **Team Assignment**:
  - OpenShift AI Dashboard Team (Frontend)
  - OpenShift AI Platform Team (Backend)
  - Documentation Team (User Guides)

### Stakeholders

#### Primary:
- Product Management
- OpenShift AI Engineering Teams
- User Experience Team

#### Secondary:
- Customer Success (Enterprise and SMB customers)
- End Users (Data Scientists, ML Engineers)
- Platform Operations Teams

### Customer Validation:
- Organizations requiring project-level customization
- Teams with specialized toolchain requirements
- Enterprises with multi-tenant resource management needs

## Additional Context

This feature represents a significant step toward true multi-tenancy in OpenShift AI, balancing global standardization with project-level flexibility. The implementation should be designed for extensibility to support future resource types and more sophisticated discovery mechanisms.

### Key Design Principles:
- **Backwards Compatibility**: Existing workflows must continue unchanged
- **Clear Resource Attribution**: Users must always know resource sources
- **Performance Conscious**: Additional discovery must not degrade user experience
- **Extensible Architecture**: Support for future resource types and discovery patterns

### Related Initiatives:
- Node targeting and accelerator profile enhancements (RHOAIRFE-159)
- Multi-tenant resource management improvements
- User project permission and RBAC enhancements

## References

- [RFE: RHOAIRFE-302](https://issues.redhat.com/browse/RHOAIRFE-302)
- [Strategy ticket: RHOAISTRAT-340](https://issues.redhat.com/browse/RHOAISTRAT-340)
- [Related: RHOAIRFE-92 - Accelerator profile restrictions](https://issues.redhat.com/browse/RHOAIRFE-92)
- [Related: RHOAIRFE-460 - Client-side custom image management](https://issues.redhat.com/browse/RHOAIRFE-460)

---

**Metadata:**
- Created Date: 2024-08-26
- Template Version: 1.0
- Estimated Timeline: 8-12 weeks
- Business Priority: Critical
