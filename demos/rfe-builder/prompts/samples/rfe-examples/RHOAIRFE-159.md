# Enable Node Targeting for Workbench Creation in OpenShift AI Dashboard

**RFE ID:** RHOAIRFE-159
**Strategy ID:** RHOAISTRAT-269
**Category:** Infrastructure
**Priority:** P0 (High)
**Complexity:** High

## Description

Enable Red Hat OpenShift AI users to target specific worker nodes based on hardware configurations when creating workbenches, model servers, and other workloads. This feature addresses the limitations of current accelerator profiles, taints, and tolerations by providing guaranteed node placement capabilities across diverse hardware environments.

## Business Justification

Organizations with heterogeneous hardware clusters need precise control over workload placement to optimize resource utilization and cost efficiency. Current solutions using accelerator profiles with taints/tolerations don't guarantee placement on intended nodes if some nodes lack appropriate taints. This feature enables:

- Guaranteed workload placement on nodes with specific hardware (GPU types, CPU-only, memory configs)
- Support for business unit isolation ("BU xyz workloads only on their paid nodes")
- Optimal resource allocation in mixed GPU/CPU environments
- Enhanced user experience through predictable workload scheduling
- Cost optimization through precise hardware targeting

## Technical Requirements

### P0 Requirements (Must Have)

#### 1. Node Selection for Workbenches
- **Capability**: Users can select specific worker nodes based on hardware configuration
- **Scope**: Accelerator types, CPU-only configurations, memory specifications
- **Interface**: User-friendly UI in workbench creation workflow
- **Guarantee**: Selected workload lands on chosen node type

#### 2. Integration with Existing Cluster Management
- **Metadata Support**: Work with existing labels and annotations for node identification
- **Compatibility**: Seamless integration with current cluster management practices
- **Standards**: Leverage Kubernetes-native node selection mechanisms (NodeSelectors, Affinity)

#### 3. Accelerator Profile Integration
- **Standalone Mode**: Feature works independently of accelerator profiles
- **Combined Mode**: Feature works in conjunction with accelerator profiles
- **Node Filtering**: Available nodes filtered based on selected accelerator (e.g., A100 selection shows only A100 nodes)
- **Backwards Compatibility**: No disruption to existing accelerator profile functionality

#### 4. Error Handling and User Feedback
- **Clear Messaging**: User-friendly error messages for failed scheduling
- **Actionable Feedback**: Users can understand and respond to scheduling failures
- **Status Visibility**: Real-time feedback on node availability and selection status

#### 5. Administrative Controls
- **Feature Toggle**: Admins control whether node selection options are available to users
- **UI Customization**: Prevent UI clutter when feature isn't needed for organization
- **Permission Management**: Integrate with existing admin controls (similar to accelerator profiles)

### P1 Requirements (Should Have)

#### 6. Extended Workload Support
- **Model Servers**: Node targeting for model serving workloads
- **Pipeline Servers**: Node selection for pipeline execution
- **Model Deployment**: Hardware targeting for model deployment
- **Future**: Distributed workloads support (TBD)

### Implementation Details

#### Frontend Components
- Enhanced workbench creation wizard with node selection interface
- Hardware specification display for available nodes
- Real-time node availability status
- Integration with accelerator profile selection
- Administrative configuration interface

#### Backend Services
- Node discovery and classification service
- Hardware metadata management (GPU types, CPU specs, memory)
- Node selector API for workload scheduling
- Integration with Kubernetes scheduler
- Administrative policy enforcement

#### Node Identification Strategy
- Leverage existing Kubernetes labels and annotations
- Support custom organizational node grouping
- Automatic hardware detection and labeling
- Business unit and cost center node tagging

## Success Criteria

### Functional Success Criteria
1. **Guaranteed Placement**: 95%+ success rate for workload placement on selected nodes
2. **Hardware Support**: Support for all major GPU types (A100, H100, LS40s, V100) and CPU-only configs
3. **UI Usability**: Users can complete node selection in < 30 seconds with clear hardware visibility
4. **Error Handling**: Clear, actionable error messages for 100% of scheduling failures
5. **Admin Control**: Administrators can enable/disable feature per organization requirements

### Performance Success Criteria
1. **Response Time**: Node discovery and display complete within 3 seconds
2. **Scalability**: Support clusters with 100+ heterogeneous nodes
3. **Compatibility**: Zero impact on existing workbench creation performance
4. **Integration**: Seamless operation with existing accelerator profiles

### Business Success Criteria
1. **Resource Utilization**: 20%+ improvement in hardware utilization efficiency
2. **User Satisfaction**: Reduced support tickets related to workload placement issues
3. **Cost Optimization**: Measurable cost savings through precise resource targeting
4. **Adoption**: 60%+ of organizations with heterogeneous clusters enable the feature

## Impact Assessment

**High Impact** - Addresses critical gap in enterprise OpenShift AI deployments

### Problems Solved:
- Unpredictable workload scheduling in mixed hardware environments
- Resource waste from suboptimal hardware allocation
- User frustration with lack of control over workload placement
- Inefficient utilization of expensive GPU resources

### Business Value:
- Enables precise cost control and resource optimization
- Supports business unit isolation and chargeback models
- Improves user experience and reduces operational overhead
- Essential for large-scale enterprise AI/ML deployments

## Components Affected

### Primary:
- OpenShift AI Dashboard (Frontend)
- Workbench Creation Service
- Node Management APIs
- Scheduler Integration Service

### Secondary:
- Model Serving Infrastructure (P1)
- Pipeline Services (P1)
- Administrative Configuration System
- Monitoring and Alerting Systems

## Dependencies

### Technical:
- Kubernetes NodeSelector and Affinity APIs
- Existing accelerator profile infrastructure
- Cluster node labeling and annotation system
- OpenShift cluster management APIs

### Organizational:
- Hardware inventory and labeling standards
- Business unit node allocation policies
- Administrative access controls and permissions

## Risks and Mitigations

### Risks:
- **Resource Contention**: Multiple users targeting same nodes
- **Scheduling Complexity**: Conflicts with existing cluster policies
- **UI Complexity**: Feature could overwhelm users in large clusters
- **Performance Impact**: Node discovery overhead in large environments

### Mitigations:
- Implement intelligent resource reservation and queuing
- Provide conflict resolution and fallback scheduling options
- Design progressive disclosure UI with smart filtering
- Cache node metadata and implement efficient discovery algorithms

## Testing Requirements

### Functional Testing
- Node selection accuracy across all supported hardware types
- Integration testing with accelerator profiles
- Administrative control validation
- Error handling and user feedback testing
- Cross-workload type testing (workbenches, model servers, pipelines)

### Performance Testing
- UI responsiveness with large node clusters (100+ nodes)
- Node discovery performance and caching effectiveness
- Concurrent user selection and scheduling performance
- Impact testing on existing workbench creation workflows

### Integration Testing
- Kubernetes scheduler integration validation
- Existing cluster management tool compatibility
- Multi-tenant environment testing
- Business unit isolation verification

### User Experience Testing
- Usability testing for node selection interface
- Administrative configuration workflow testing
- Error message clarity and actionability validation

## Deployment Considerations

### Rollout Strategy
- **Phase 1**: Core workbench node selection (P0)
- **Phase 2**: Extended workload support and advanced features (P1)
- **Feature Flags**: Gradual rollout with administrative controls
- **Backwards Compatibility**: Zero disruption to existing workflows

### Operational Requirements
- Node metadata management and maintenance procedures
- Monitoring dashboards for placement success rates
- Documentation updates for users and administrators
- Training materials for cluster administrators

### Configuration Management
- Default feature state (enabled/disabled)
- Node grouping and labeling best practices
- Integration with existing organizational policies

## Project Details

- **Estimated Effort**: 12-16 weeks
- **Story Points**: 34
- **Team Assignment**:
  - OpenShift AI Dashboard Team (Frontend)
  - OpenShift AI Platform Team (Backend)
  - SRE Team (Integration)

### Stakeholders

#### Primary:
- Product Management
- OpenShift AI Engineering Teams
- Customer Success (Enterprise customers)

#### Secondary:
- Cluster Operations Teams
- End Users (Data Scientists, ML Engineers)
- Sales Engineering (Competitive differentiation)

### Customer Validation:
- Enterprise customers with heterogeneous GPU clusters
- Organizations requiring business unit isolation
- Cost-conscious deployments needing precise resource control

## Additional Context

This feature represents a strategic capability for OpenShift AI in enterprise environments. The solution must be designed for extensibility to support future hardware types and advanced scheduling requirements. Consider integration with future distributed workload capabilities and multi-cluster scenarios.

### Key Design Principles:
- Leverage existing Kubernetes primitives and cluster management practices
- Maintain simplicity while providing powerful targeting capabilities
- Ensure administrative control and organizational policy enforcement
- Design for scale and performance in large heterogeneous environments

## References

- [RFE: RHOAIRFE-159](https://issues.redhat.com/browse/RHOAIRFE-159)
- [Feature kickoff recording](https://drive.google.com/file/d/1Dv5RuIQLPYs6tOgE9t5lH-EJB7asXcXT/view)
- [Refinement ticket: RHOAISTRAT-269](https://issues.redhat.com/browse/RHOAISTRAT-269)

---

**Metadata:**
- Created Date: 2024-08-26
- Template Version: 1.0
- Estimated Timeline: 12-16 weeks
- Business Priority: P0
