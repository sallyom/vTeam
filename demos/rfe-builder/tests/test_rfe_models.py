"""
Test suite for RFE data models and workflow state management
"""

from datetime import datetime

from data.rfe_models import RFE, AgentRole, RFEStatus, WorkflowState, WorkflowStep


class TestRFE:
    """Test RFE model functionality"""

    def test_rfe_creation(self):
        """Test basic RFE creation"""
        rfe = RFE(title="Test RFE", description="Test description")

        assert rfe.title == "Test RFE"
        assert rfe.description == "Test description"
        assert rfe.current_status == RFEStatus.DRAFT
        assert rfe.current_step == 1
        assert rfe.id.startswith("RFE-")
        assert isinstance(rfe.created_at, datetime)
        assert isinstance(rfe.updated_at, datetime)

    def test_rfe_with_optional_fields(self):
        """Test RFE creation with optional fields"""
        rfe = RFE(
            title="Test RFE",
            description="Test description",
            business_justification="Important for business",
            technical_requirements="Must use Python",
            success_criteria="Should work as expected",
        )

        assert rfe.business_justification == "Important for business"
        assert rfe.technical_requirements == "Must use Python"
        assert rfe.success_criteria == "Should work as expected"

    def test_rfe_enum_values(self):
        """Test that enum values are properly stored"""
        rfe = RFE(title="Test", description="Test")
        rfe.current_status = RFEStatus.PRIORITIZED
        rfe.assigned_agent = AgentRole.PARKER_PM

        # Should store as string values due to Config.use_enum_values
        assert rfe.current_status == RFEStatus.PRIORITIZED
        assert rfe.assigned_agent == AgentRole.PARKER_PM


class TestWorkflowStep:
    """Test WorkflowStep model functionality"""

    def test_workflow_step_creation(self):
        """Test WorkflowStep creation"""
        step = WorkflowStep(
            step_number=1,
            name="Test Step",
            description="Test description",
            responsible_agent=AgentRole.PARKER_PM,
        )

        assert step.step_number == 1
        assert step.name == "Test Step"
        assert step.description == "Test description"
        assert step.responsible_agent == AgentRole.PARKER_PM
        assert step.status == "pending"
        assert step.completed_at is None
        assert step.notes is None

    def test_workflow_step_completion(self):
        """Test WorkflowStep completion"""
        step = WorkflowStep(
            step_number=1,
            name="Test Step",
            description="Test description",
            responsible_agent=AgentRole.PARKER_PM,
        )

        # Simulate completion
        step.status = "completed"
        step.completed_at = datetime.now()
        step.notes = "Completed successfully"

        assert step.status == "completed"
        assert isinstance(step.completed_at, datetime)
        assert step.notes == "Completed successfully"


class TestWorkflowState:
    """Test WorkflowState functionality"""

    def test_workflow_state_initialization(self):
        """Test WorkflowState initialization"""
        state = WorkflowState()

        assert state.current_rfe is None
        assert len(state.rfe_list) == 0

    def test_create_rfe(self):
        """Test RFE creation through WorkflowState"""
        state = WorkflowState()
        rfe = state.create_rfe("Test RFE", "Test description")

        assert rfe.title == "Test RFE"
        assert rfe.description == "Test description"
        assert len(state.rfe_list) == 1
        assert state.current_rfe == rfe
        assert rfe.assigned_agent == AgentRole.PARKER_PM

        # Check that workflow steps are initialized
        assert len(rfe.workflow_steps) == 7
        assert rfe.workflow_steps[0].responsible_agent == AgentRole.PARKER_PM
        assert rfe.workflow_steps[1].responsible_agent == AgentRole.ARCHIE_ARCHITECT

    def test_create_multiple_rfes(self):
        """Test creating multiple RFEs"""
        state = WorkflowState()

        rfe1 = state.create_rfe("RFE 1", "Description 1")
        rfe2 = state.create_rfe("RFE 2", "Description 2")

        assert len(state.rfe_list) == 2
        assert state.current_rfe == rfe2  # Should be the last created
        assert rfe1.id != rfe2.id  # Should have different IDs

    def test_update_rfe_status(self):
        """Test updating RFE status"""
        state = WorkflowState()
        rfe = state.create_rfe("Test RFE", "Test description")

        # Update status
        state.update_rfe_status(rfe.id, RFEStatus.PRIORITIZED, "Updated by test")

        assert rfe.current_status == RFEStatus.PRIORITIZED
        assert len(rfe.history) == 1

        history_entry = rfe.history[0]
        assert history_entry["action"] == "status_change"
        assert history_entry["new_status"] == RFEStatus.PRIORITIZED
        assert history_entry["notes"] == "Updated by test"

    def test_advance_workflow_step(self):
        """Test advancing workflow steps"""
        state = WorkflowState()
        rfe = state.create_rfe("Test RFE", "Test description")

        initial_step = rfe.current_step

        # Advance to next step
        state.advance_workflow_step(rfe.id, "Step completed")

        assert rfe.current_step == initial_step + 1
        assert rfe.assigned_agent == AgentRole.ARCHIE_ARCHITECT  # Next agent

        # Check that previous step is marked as completed
        completed_step = rfe.workflow_steps[0]
        assert completed_step.status == "completed"
        assert completed_step.notes == "Step completed"
        assert isinstance(completed_step.completed_at, datetime)

        # Check history
        assert len(rfe.history) == 1
        history_entry = rfe.history[0]
        assert history_entry["action"] == "workflow_advance"
        assert history_entry["step"] == 2

    def test_advance_beyond_final_step(self):
        """Test advancing beyond the final workflow step"""
        state = WorkflowState()
        rfe = state.create_rfe("Test RFE", "Test description")

        # Advance through all steps
        for i in range(7):
            state.advance_workflow_step(rfe.id, f"Step {i+1} completed")

        # Try to advance beyond final step
        final_step = rfe.current_step
        state.advance_workflow_step(rfe.id, "Trying to advance beyond final")

        # Should not advance beyond final step
        assert rfe.current_step == final_step

    def test_get_current_step_info(self):
        """Test retrieving current step information"""
        state = WorkflowState()
        rfe = state.create_rfe("Test RFE", "Test description")

        current_step = state.get_current_step_info(rfe.id)

        assert current_step is not None
        assert current_step.step_number == 1
        assert current_step.responsible_agent == AgentRole.PARKER_PM

        # Advance and check again
        state.advance_workflow_step(rfe.id, "Advanced")
        current_step = state.get_current_step_info(rfe.id)

        assert current_step.step_number == 2
        assert current_step.responsible_agent == AgentRole.ARCHIE_ARCHITECT

    def test_get_current_step_info_invalid_id(self):
        """Test retrieving step info for non-existent RFE"""
        state = WorkflowState()

        current_step = state.get_current_step_info("invalid-id")
        assert current_step is None


class TestEnums:
    """Test enum definitions"""

    def test_rfe_status_enum(self):
        """Test RFEStatus enum values"""
        expected_statuses = [
            "draft",
            "prioritized",
            "under_review",
            "needs_info",
            "impact_assessment",
            "complete_check",
            "accepted",
            "rejected",
            "ticket_created",
        ]

        actual_statuses = [status.value for status in RFEStatus]

        for status in expected_statuses:
            assert status in actual_statuses

    def test_agent_role_enum(self):
        """Test AgentRole enum values"""
        expected_roles = [
            "parker_pm",
            "archie_architect",
            "stella_staff_engineer",
            "olivia_po",
            "lee_team_lead",
            "taylor_team_member",
            "derek_delivery_owner",
        ]

        actual_roles = [role.value for role in AgentRole]

        for role in expected_roles:
            assert role in actual_roles


class TestIntegration:
    """Integration tests for complete workflows"""

    def test_complete_workflow_simulation(self):
        """Test a complete RFE workflow from start to finish"""
        state = WorkflowState()

        # Create RFE
        rfe = state.create_rfe("Integration Test RFE", "Complete workflow test")

        assert rfe.current_step == 1
        assert rfe.assigned_agent == AgentRole.PARKER_PM

        # Step 1: Parker prioritizes
        state.advance_workflow_step(rfe.id, "Prioritized as High")
        state.update_rfe_status(rfe.id, RFEStatus.PRIORITIZED)

        assert rfe.current_step == 2
        assert rfe.assigned_agent == AgentRole.ARCHIE_ARCHITECT
        assert rfe.current_status == RFEStatus.PRIORITIZED

        # Step 2: Archie reviews
        state.advance_workflow_step(rfe.id, "Reviewed and approved")
        state.update_rfe_status(rfe.id, RFEStatus.UNDER_REVIEW)

        assert rfe.current_step == 3
        assert rfe.assigned_agent == AgentRole.STELLA_STAFF_ENGINEER

        # Continue through remaining steps
        for step in range(3, 8):
            state.advance_workflow_step(rfe.id, f"Step {step} completed")

        # Check final state
        assert rfe.current_step == 8  # Beyond final step
        assert rfe.assigned_agent is None  # No agent when beyond workflow
        assert len([s for s in rfe.workflow_steps if s.status == "completed"]) == 7

        # Check that all steps have completion times
        for step in rfe.workflow_steps:
            if step.status == "completed":
                assert step.completed_at is not None
                assert step.notes is not None

    def test_workflow_with_rejection_path(self):
        """Test workflow that follows rejection path"""
        state = WorkflowState()
        rfe = state.create_rfe("Test Rejection", "This will be rejected")

        # Advance to step 4 (acceptance criteria check)
        for i in range(3):
            state.advance_workflow_step(rfe.id, f"Step {i+1} completed")

        assert rfe.current_step == 4

        # Reject the RFE
        state.update_rfe_status(rfe.id, RFEStatus.REJECTED, "Does not meet criteria")

        assert rfe.current_status == RFEStatus.REJECTED

        # History should reflect the rejection
        rejection_entry = next(
            (
                entry
                for entry in rfe.history
                if entry.get("new_status") == RFEStatus.REJECTED
            ),
            None,
        )
        assert rejection_entry is not None
        assert "Does not meet criteria" in rejection_entry["notes"]
