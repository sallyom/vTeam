"""
RFE data models and state management for Phase 1
"""

import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class RFEStatus(str, Enum):
    """RFE workflow status enum"""

    DRAFT = "draft"
    PRIORITIZED = "prioritized"
    UNDER_REVIEW = "under_review"
    NEEDS_INFO = "needs_info"
    IMPACT_ASSESSMENT = "impact_assessment"
    COMPLETE_CHECK = "complete_check"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    TICKET_CREATED = "ticket_created"


class AgentRole(str, Enum):
    """Agent roles in the RFE workflow"""

    PARKER_PM = "parker_pm"
    ARCHIE_ARCHITECT = "archie_architect"
    STELLA_STAFF_ENGINEER = "stella_staff_engineer"
    OLIVIA_PO = "olivia_po"
    LEE_TEAM_LEAD = "lee_team_lead"
    TAYLOR_TEAM_MEMBER = "taylor_team_member"
    DEREK_DELIVERY_OWNER = "derek_delivery_owner"


class WorkflowStep(BaseModel):
    """Individual workflow step"""

    step_number: int
    name: str
    description: str
    responsible_agent: AgentRole
    status: str = "pending"
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None


class RFE(BaseModel):
    """Request for Enhancement model"""

    model_config = ConfigDict(use_enum_values=True)

    id: str = Field(default_factory=lambda: f"RFE-{uuid.uuid4().hex[:12]}")
    title: str
    description: str
    business_justification: Optional[str] = None
    technical_requirements: Optional[str] = None
    success_criteria: Optional[str] = None
    priority: Optional[str] = None
    impact_assessment: Optional[str] = None

    # Workflow state
    current_status: RFEStatus = RFEStatus.DRAFT
    current_step: int = 1
    assigned_agent: Optional[AgentRole] = None

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    # Workflow history
    workflow_steps: List[WorkflowStep] = Field(default_factory=list)
    history: List[Dict[str, Any]] = Field(default_factory=list)


class WorkflowState(BaseModel):
    """Overall workflow state manager"""

    current_rfe: Optional[RFE] = None
    rfe_list: List[RFE] = Field(default_factory=list)

    def create_rfe(self, title: str, description: str) -> RFE:
        """Create a new RFE and initialize workflow steps"""
        rfe = RFE(title=title, description=description)

        # Initialize workflow steps based on mermaid diagram
        workflow_steps = [
            WorkflowStep(
                step_number=1,
                name="Prioritize RFE",
                description="📊 Parker (PM) - Prioritize RFEs",
                responsible_agent=AgentRole.PARKER_PM,
            ),
            WorkflowStep(
                step_number=2,
                name="Review RFE",
                description="🏛️ Archie (Architect) - Review RFE",
                responsible_agent=AgentRole.ARCHIE_ARCHITECT,
            ),
            WorkflowStep(
                step_number=3,
                name="RFE Complete Check",
                description="⭐ Stella (Staff Engineer) - RFE is Complete?",
                responsible_agent=AgentRole.STELLA_STAFF_ENGINEER,
            ),
            WorkflowStep(
                step_number=4,
                name="Acceptance Criteria Check",
                description="🏛️ Archie (Architect) - RFE meets acceptance criteria?",
                responsible_agent=AgentRole.ARCHIE_ARCHITECT,
            ),
            WorkflowStep(
                step_number=5,
                name="Accept/Reject Decision",
                description="⭐ Stella (Staff Engineer) - Accept RFE",
                responsible_agent=AgentRole.STELLA_STAFF_ENGINEER,
            ),
            WorkflowStep(
                step_number=6,
                name="Communicate Assessment",
                description="📊 Parker (PM) - Communicate assessment to requester",
                responsible_agent=AgentRole.PARKER_PM,
            ),
            WorkflowStep(
                step_number=7,
                name="Create Feature Ticket",
                description="🚀 Derek (Delivery Owner) - Create Feature ticket and assign to owner",
                responsible_agent=AgentRole.DEREK_DELIVERY_OWNER,
            ),
        ]

        rfe.workflow_steps = workflow_steps
        rfe.assigned_agent = AgentRole.PARKER_PM

        self.rfe_list.append(rfe)
        self.current_rfe = rfe

        return rfe

    def update_rfe_status(
        self, rfe_id: str, new_status: RFEStatus, notes: Optional[str] = None
    ):
        """Update RFE status and add to history"""
        for rfe in self.rfe_list:
            if rfe.id == rfe_id:
                old_status = rfe.current_status
                rfe.current_status = new_status
                rfe.updated_at = datetime.now()

                # Add to history
                rfe.history.append(
                    {
                        "timestamp": datetime.now(),
                        "action": "status_change",
                        "old_status": old_status,
                        "new_status": new_status,
                        "notes": notes,
                    }
                )

                if rfe == self.current_rfe:
                    self.current_rfe = rfe
                break

    def advance_workflow_step(self, rfe_id: str, notes: Optional[str] = None):
        """Advance RFE to next workflow step"""
        for rfe in self.rfe_list:
            if rfe.id == rfe_id:
                if rfe.current_step <= len(rfe.workflow_steps):
                    # Mark current step as completed
                    current_step_idx = rfe.current_step - 1
                    if current_step_idx < len(rfe.workflow_steps):
                        rfe.workflow_steps[current_step_idx].status = "completed"
                        rfe.workflow_steps[current_step_idx].completed_at = (
                            datetime.now()
                        )
                        rfe.workflow_steps[current_step_idx].notes = notes

                    # Advance to next step
                    rfe.current_step += 1
                    rfe.updated_at = datetime.now()

                    # Update assigned agent - only if not beyond workflow
                    if rfe.current_step <= len(rfe.workflow_steps):
                        next_step_idx = rfe.current_step - 1
                        rfe.assigned_agent = rfe.workflow_steps[
                            next_step_idx
                        ].responsible_agent
                    else:
                        # Beyond workflow - no assigned agent
                        rfe.assigned_agent = None

                    # Add to history
                    rfe.history.append(
                        {
                            "timestamp": datetime.now(),
                            "action": "workflow_advance",
                            "step": rfe.current_step,
                            "notes": notes,
                        }
                    )
                break

    def get_current_step_info(self, rfe_id: str) -> Optional[WorkflowStep]:
        """Get current workflow step information"""
        for rfe in self.rfe_list:
            if rfe.id == rfe_id:
                if rfe.current_step <= len(rfe.workflow_steps):
                    return rfe.workflow_steps[rfe.current_step - 1]
        return None
