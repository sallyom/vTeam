"""
📊 Parker (Product Manager) - Agent Dashboard
Handles RFE prioritization and communication
"""

from datetime import datetime

import streamlit as st
from components.ai_assistants import AIAssistantFactory
from components.workflow import render_step_progress
from data.rfe_models import AgentRole, RFEStatus, WorkflowState


def show_parker_dashboard():
    """Parker (PM) specific dashboard and actions"""
    st.title("📊 Parker - Product Manager Dashboard")
    st.markdown("*Responsible for RFE prioritization and stakeholder communication*")

    workflow_state = st.session_state.workflow_state

    # Find RFEs assigned to Parker
    parker_rfes = [
        rfe
        for rfe in workflow_state.rfe_list
        if rfe.assigned_agent == AgentRole.PARKER_PM
    ]

    # Summary metrics
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.metric("Assigned RFEs", len(parker_rfes))

    with col2:
        prioritization_needed = len(
            [rfe for rfe in parker_rfes if rfe.current_step == 1]
        )
        st.metric("Need Prioritization", prioritization_needed)

    with col3:
        communication_needed = len(
            [rfe for rfe in parker_rfes if rfe.current_step == 6]
        )
        st.metric("Need Communication", communication_needed)

    with col4:
        completed_today = len(
            [
                rfe
                for rfe in parker_rfes
                if rfe.updated_at.date() == datetime.now().date()
            ]
        )
        st.metric("Updated Today", completed_today)

    st.markdown("---")

    # Tab navigation
    tab1, tab2, tab3 = st.tabs(
        ["🔄 Active Tasks", "📊 Prioritization", "📢 Communication"]
    )

    with tab1:
        show_active_tasks(parker_rfes, workflow_state)

    with tab2:
        show_prioritization_interface(parker_rfes, workflow_state)

    with tab3:
        show_communication_interface(parker_rfes, workflow_state)


def show_active_tasks(parker_rfes, workflow_state):
    """Show currently active tasks for Parker"""
    st.subheader("Active Tasks")

    if not parker_rfes:
        st.info("No RFEs currently assigned to Parker")
        return

    for rfe in parker_rfes:
        with st.expander(f"🎯 {rfe.title} - Step {rfe.current_step}/7"):
            col1, col2 = st.columns([2, 1])

            with col1:
                st.markdown(f"**RFE ID:** {rfe.id}")
                st.markdown(f"**Status:** {rfe.current_status.value}")
                st.markdown(f"**Description:** {rfe.description}")

                # Show business justification if available
                if rfe.business_justification:
                    st.markdown("**Business Justification:**")
                    st.markdown(rfe.business_justification)

            with col2:
                st.markdown(f"**Created:** {rfe.created_at.strftime('%Y-%m-%d %H:%M')}")
                st.markdown(f"**Updated:** {rfe.updated_at.strftime('%Y-%m-%d %H:%M')}")

                # Current task description
                current_step = workflow_state.get_current_step_info(rfe.id)
                if current_step:
                    st.markdown("**Current Task:**")
                    st.info(current_step.description)

            # AI Assistant integration
            parker_assistant = AIAssistantFactory.create_assistant(AgentRole.PARKER_PM)
            parker_assistant.render_assistance_panel(rfe)

            # Action buttons based on current step
            if rfe.current_step == 1:  # Prioritization step
                show_prioritization_actions(rfe, workflow_state)
            elif rfe.current_step == 6:  # Communication step
                show_communication_actions(rfe, workflow_state)


def show_prioritization_interface(parker_rfes, workflow_state):
    """Interface for RFE prioritization (Step 1)"""
    st.subheader("RFE Prioritization")

    # Filter RFEs that need prioritization
    prioritization_rfes = [rfe for rfe in parker_rfes if rfe.current_step == 1]

    if not prioritization_rfes:
        st.info("No RFEs currently need prioritization")
        return

    st.markdown(f"**{len(prioritization_rfes)} RFE(s) awaiting prioritization:**")

    for rfe in prioritization_rfes:
        with st.container():
            st.markdown("---")

            col1, col2 = st.columns([3, 1])

            with col1:
                st.markdown(f"### {rfe.title}")
                st.markdown(rfe.description)

                if rfe.business_justification:
                    st.markdown("**Business Justification:**")
                    st.markdown(rfe.business_justification)

            with col2:
                st.markdown("**Priority Assessment**")

                priority = st.selectbox(
                    "Priority Level",
                    ["High", "Medium", "Low"],
                    key=f"priority_{rfe.id}",
                )

                business_impact = st.selectbox(
                    "Business Impact",
                    ["Critical", "High", "Medium", "Low"],
                    key=f"impact_{rfe.id}",
                )

                if st.button("Complete Prioritization", key=f"prioritize_{rfe.id}"):
                    # Update RFE with priority information
                    rfe.priority = f"{priority} (Impact: {business_impact})"

                    # Add notes about prioritization decision
                    notes = f"Prioritized as {priority} with {business_impact} business impact by Parker (PM)"

                    # Advance to next step
                    workflow_state.advance_workflow_step(rfe.id, notes)
                    workflow_state.update_rfe_status(
                        rfe.id, RFEStatus.PRIORITIZED, notes
                    )

                    st.success(
                        "✅ RFE prioritized and forwarded to Archie (Architect) for review"
                    )
                    st.rerun()


def show_communication_interface(parker_rfes, workflow_state):
    """Interface for stakeholder communication (Step 6)"""
    st.subheader("Stakeholder Communication")

    # Filter RFEs that need communication
    communication_rfes = [rfe for rfe in parker_rfes if rfe.current_step == 6]

    if not communication_rfes:
        st.info("No RFEs currently need communication")
        return

    st.markdown(f"**{len(communication_rfes)} RFE(s) awaiting communication:**")

    for rfe in communication_rfes:
        with st.container():
            st.markdown("---")

            col1, col2 = st.columns([2, 1])

            with col1:
                st.markdown(f"### {rfe.title}")
                st.markdown(f"**Status:** {rfe.current_status.value}")

                # Show RFE history to understand the decision
                if rfe.history:
                    st.markdown("**Decision History:**")
                    for entry in rfe.history[-3:]:  # Show last 3 entries
                        timestamp = entry["timestamp"].strftime("%Y-%m-%d %H:%M")
                        st.markdown(
                            f"- {timestamp}: {entry.get('notes', entry.get('action', 'No details'))}"
                        )

            with col2:
                st.markdown("**Communication Actions**")

                # Communication method
                comm_method = st.selectbox(
                    "Method",
                    ["Email", "Slack", "Teams", "JIRA Comment", "Meeting"],
                    key=f"method_{rfe.id}",
                )

                # Stakeholder type
                stakeholder = st.selectbox(
                    "Stakeholder",
                    [
                        "RFE Submitter",
                        "Engineering Team",
                        "Management",
                        "All Stakeholders",
                    ],
                    key=f"stakeholder_{rfe.id}",
                )

                # Message template
                message_template = st.text_area(
                    "Message",
                    value=generate_communication_template(rfe),
                    height=150,
                    key=f"message_{rfe.id}",
                )

                if st.button(f"Send Communication", key=f"communicate_{rfe.id}"):
                    notes = f"Communicated to {stakeholder} via {comm_method}. Message: {message_template[:100]}..."

                    # Advance to final step
                    workflow_state.advance_workflow_step(rfe.id, notes)

                    st.success(
                        "✅ Communication sent! RFE forwarded to Derek (Delivery Owner) for ticket creation"
                    )
                    st.rerun()


def show_prioritization_actions(rfe, workflow_state):
    """Show prioritization-specific action buttons"""
    st.markdown("**Prioritization Actions:**")

    col1, col2 = st.columns(2)

    with col1:
        if st.button("High Priority", key=f"high_pri_{rfe.id}"):
            rfe.priority = "High"
            notes = "Marked as High Priority by Parker (PM)"
            workflow_state.advance_workflow_step(rfe.id, notes)
            workflow_state.update_rfe_status(rfe.id, RFEStatus.PRIORITIZED, notes)
            st.success("RFE marked as High Priority and forwarded to Archie!")
            st.rerun()

    with col2:
        if st.button("Normal Priority", key=f"norm_pri_{rfe.id}"):
            rfe.priority = "Medium"
            notes = "Marked as Normal Priority by Parker (PM)"
            workflow_state.advance_workflow_step(rfe.id, notes)
            workflow_state.update_rfe_status(rfe.id, RFEStatus.PRIORITIZED, notes)
            st.success("RFE marked as Normal Priority and forwarded to Archie!")
            st.rerun()


def show_communication_actions(rfe, workflow_state):
    """Show communication-specific action buttons"""
    st.markdown("**Communication Actions:**")

    col1, col2 = st.columns(2)

    with col1:
        if st.button("Send Acceptance", key=f"accept_comm_{rfe.id}"):
            notes = "Acceptance communication sent to stakeholders by Parker (PM)"
            workflow_state.advance_workflow_step(rfe.id, notes)
            st.success(
                "Acceptance communicated! Forwarded to Derek for ticket creation!"
            )
            st.rerun()

    with col2:
        if st.button("Send Rejection", key=f"reject_comm_{rfe.id}"):
            notes = "Rejection communication sent to stakeholders by Parker (PM)"
            workflow_state.advance_workflow_step(rfe.id, notes)
            st.success("Rejection communicated! Process complete.")
            st.rerun()


def generate_communication_template(rfe):
    """Generate a communication message template based on RFE status"""
    if rfe.current_status in [RFEStatus.ACCEPTED]:
        return f"""Subject: RFE Accepted - {rfe.title}

Dear Stakeholder,

Your Request for Enhancement "{rfe.title}" has been reviewed by the RFE Council and has been ACCEPTED for implementation.

RFE ID: {rfe.id}
Priority: {rfe.priority or 'TBD'}

Next Steps:
- A feature ticket will be created and assigned to the appropriate development team
- You will receive updates on implementation progress
- Expected delivery timeline will be communicated separately

Thank you for your valuable contribution to our product roadmap.

Best regards,
Parker (Product Manager)"""

    elif rfe.current_status in [RFEStatus.REJECTED]:
        return f"""Subject: RFE Decision - {rfe.title}

Dear Stakeholder,

Your Request for Enhancement "{rfe.title}" has been reviewed by the RFE Council.

RFE ID: {rfe.id}

After careful consideration, this RFE has been declined for the following reasons:
- [Reason will be populated from council review]

We appreciate your input and encourage you to submit future enhancement requests.

Best regards,
Parker (Product Manager)"""

    else:
        return f"""Subject: RFE Status Update - {rfe.title}

Dear Stakeholder,

This is an update on your Request for Enhancement "{rfe.title}".

RFE ID: {rfe.id}
Current Status: {rfe.current_status.value}

We will keep you informed as the review process progresses.

Best regards,
Parker (Product Manager)"""


if __name__ == "__main__":
    show_parker_dashboard()
