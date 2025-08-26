"""
RFE Builder - Main Streamlit Application
Phase 1: Foundation & Core Workflow
"""

from datetime import datetime

import streamlit as st

from components.chat_interface import ChatInterface
from data.rfe_models import RFEStatus, WorkflowState

# Page configuration
st.set_page_config(
    page_title="RFE Builder",
    page_icon="🏗️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Initialize session state
if "workflow_state" not in st.session_state:
    st.session_state.workflow_state = WorkflowState()


# Main application
def main():
    st.title("🏗️ RFE Builder")
    st.markdown("*AI-Powered Request for Enhancement Workflow Platform*")

    # Sidebar navigation
    st.sidebar.title("Navigation")

    # Current RFE status
    if st.session_state.workflow_state.current_rfe:
        current_rfe = st.session_state.workflow_state.current_rfe
        st.sidebar.markdown("### Current RFE")
        st.sidebar.markdown(f"**{current_rfe.title}**")
        st.sidebar.markdown(f"Status: `{current_rfe.current_status.value}`")
        st.sidebar.markdown(f"Step: {current_rfe.current_step}/7")
        agent_name = (
            current_rfe.assigned_agent.value if current_rfe.assigned_agent else "None"
        )
        st.sidebar.markdown(f"Agent: {agent_name}")
    else:
        st.sidebar.markdown("### No Active RFE")
        st.sidebar.markdown("Create a new RFE to get started")

    st.sidebar.markdown("---")

    # Page selection
    page = st.sidebar.selectbox(
        "Select View",
        [
            "🏠 Home",
            "📝 Create RFE",
            "💬 AI Chat RFE",
            "📊 Workflow Overview",
            "👥 Agent Dashboard",
            "📈 RFE List",
        ],
    )

    # Route to appropriate page
    if page == "🏠 Home":
        show_home_page()
    elif page == "📝 Create RFE":
        show_create_rfe_page()
    elif page == "💬 AI Chat RFE":
        show_ai_chat_rfe_page()
    elif page == "📊 Workflow Overview":
        show_workflow_overview()
    elif page == "👥 Agent Dashboard":
        show_agent_dashboard()
    elif page == "📈 RFE List":
        show_rfe_list()


def show_home_page():
    """Home page with overview and quick actions"""
    st.header("Welcome to RFE Builder")

    col1, col2 = st.columns(2)

    with col1:
        st.markdown(
            """
        ### 🎯 What is RFE Builder?

        RFE Builder is an AI-powered workflow platform that guides Request for 
        Enhancement (RFE) submissions through a structured 7-step council review process.

        **Key Features:**
        - 👥 Multi-agent workflow with 7 specialized roles
        - 📊 Visual workflow tracking and status updates
        - 🤖 AI-powered conversational RFE creation
        - 💬 Intelligent agent assistants with Claude AI
        - 🔄 Automated step progression and validation
        """
        )

        col1, col2 = st.columns(2)
        with col1:
            if st.button("🚀 Create New RFE", type="primary"):
                st.session_state.page = "create_rfe"
                st.rerun()
        with col2:
            if st.button("💬 Try AI Chat RFE", type="secondary"):
                st.session_state.page = "ai_chat_rfe"
                st.rerun()

    with col2:
        st.markdown("### 📋 Quick Stats")

        workflow_state = st.session_state.workflow_state
        total_rfes = len(workflow_state.rfe_list)

        # Count RFEs by status
        status_counts = {}
        for rfe in workflow_state.rfe_list:
            status = rfe.current_status.value
            status_counts[status] = status_counts.get(status, 0) + 1

        st.metric("Total RFEs", total_rfes)

        if status_counts:
            st.markdown("**By Status:**")
            for status, count in status_counts.items():
                st.markdown(f"- {status}: {count}")


def show_create_rfe_page():
    """RFE creation form"""
    st.header("📝 Create New RFE")

    with st.form("rfe_form"):
        st.markdown("### Basic Information")

        title = st.text_input(
            "RFE Title*", placeholder="Brief descriptive title for the enhancement"
        )

        description = st.text_area(
            "Description*",
            placeholder="Detailed description of the requested enhancement",
            height=150,
        )

        col1, col2 = st.columns(2)

        with col1:
            business_justification = st.text_area(
                "Business Justification",
                placeholder=(
                    "Why is this enhancement needed? "
                    "What business value does it provide?"
                ),
                height=100,
            )

        with col2:
            technical_requirements = st.text_area(
                "Technical Requirements",
                placeholder="Any specific technical constraints or requirements",
                height=100,
            )

        success_criteria = st.text_area(
            "Success Criteria",
            placeholder="How will we know this RFE has been successfully implemented?",
            height=100,
        )

        submitted = st.form_submit_button("Create RFE", type="primary")

        if submitted:
            if not title or not description:
                st.error("Title and Description are required fields")
            else:
                # Create new RFE
                workflow_state = st.session_state.workflow_state
                rfe = workflow_state.create_rfe(title, description)

                # Add optional fields
                if business_justification:
                    rfe.business_justification = business_justification
                if technical_requirements:
                    rfe.technical_requirements = technical_requirements
                if success_criteria:
                    rfe.success_criteria = success_criteria

                st.success(f"✅ RFE Created: {rfe.id}")
                st.info("Assigned to: 📊 Parker (PM) - Step 1: Prioritize RFE")

                # Show next steps
                st.markdown("### Next Steps")
                st.markdown(
                    "Your RFE has been created and assigned to the workflow. You can:"
                )
                st.markdown("- View the **Workflow Overview** to see progress")
                st.markdown("- Check the **Agent Dashboard** for current status")
                st.markdown("- Monitor updates in the **RFE List**")


def show_ai_chat_rfe_page():
    """AI-powered conversational RFE creation page"""
    chat_interface = ChatInterface()
    chat_interface.render_conversational_rfe_creator()


def show_workflow_overview():
    """Visual workflow overview with mermaid diagram"""
    st.header("📊 RFE Council Workflow Overview")

    if st.session_state.workflow_state.current_rfe:
        current_rfe = st.session_state.workflow_state.current_rfe

        st.markdown(f"### Current RFE: {current_rfe.title}")
        st.markdown(
            f"**Status:** `{current_rfe.current_status.value}` | "
            f"**Step:** {current_rfe.current_step}/7"
        )

        # Progress bar
        progress = (current_rfe.current_step - 1) / 7
        st.progress(progress, text=f"Workflow Progress: {int(progress * 100)}%")

        st.markdown("---")

        # Workflow steps
        st.markdown("### Workflow Steps")

        for i, step in enumerate(current_rfe.workflow_steps, 1):
            col1, col2, col3 = st.columns([1, 4, 2])

            with col1:
                if i < current_rfe.current_step:
                    st.success(f"✅ {i}")
                elif i == current_rfe.current_step:
                    st.info(f"🔄 {i}")
                else:
                    st.info(f"⏳ {i}")

            with col2:
                st.markdown(f"**{step.name}**")
                st.markdown(f"*{step.description}*")
                if step.status == "completed" and step.completed_at:
                    st.markdown(
                        f"Completed: {step.completed_at.strftime('%Y-%m-%d %H:%M')}"
                    )

            with col3:
                if i == current_rfe.current_step and step.responsible_agent:
                    st.markdown("**Current**")
                    st.markdown(f"Agent: {step.responsible_agent.value}")

        # Action buttons for current step
        st.markdown("---")
        st.markdown("### Actions")

        col1, col2, col3 = st.columns(3)

        with col1:
            if st.button("✅ Complete Current Step"):
                workflow_state = st.session_state.workflow_state
                workflow_state.advance_workflow_step(
                    current_rfe.id, "Step completed via workflow overview"
                )
                st.success("Step completed! Advanced to next step.")
                st.rerun()

        with col2:
            if st.button("📝 Add Notes"):
                st.session_state.show_notes_form = True

        with col3:
            if st.button("🔄 Refresh Status"):
                st.rerun()

        # Notes form
        if getattr(st.session_state, "show_notes_form", False):
            with st.form("notes_form"):
                notes = st.text_area(
                    "Add Notes", placeholder="Enter notes for this step..."
                )
                if st.form_submit_button("Save Notes"):
                    # Add notes to current step
                    current_step_idx = current_rfe.current_step - 1
                    if current_step_idx < len(current_rfe.workflow_steps):
                        current_rfe.workflow_steps[current_step_idx].notes = notes
                        current_rfe.updated_at = datetime.now()

                    st.success("Notes saved!")
                    st.session_state.show_notes_form = False
                    st.rerun()

    else:
        st.info("No active RFE. Create a new RFE to see the workflow in action.")
        if st.button("Create New RFE"):
            st.session_state.page = "create_rfe"
            st.rerun()


def show_agent_dashboard():
    """Agent-specific dashboard"""
    st.header("👥 Agent Dashboard")

    # Agent selection
    agent_roles = [
        ("📊 Parker (PM)", "parker_pm"),
        ("🏛️ Archie (Architect)", "archie_architect"),
        ("⭐ Stella (Staff Engineer)", "stella_staff_engineer"),
        ("📋 Olivia (PO)", "olivia_po"),
        ("👥 Lee (Team Lead)", "lee_team_lead"),
        ("💻 Taylor (Team Member)", "taylor_team_member"),
        ("🚀 Derek (Delivery Owner)", "derek_delivery_owner"),
    ]

    selected_agent = st.selectbox("Select Agent", [role[0] for role in agent_roles])
    agent_key = next(role[1] for role in agent_roles if role[0] == selected_agent)

    st.markdown(f"### {selected_agent} Dashboard")

    # Find RFEs assigned to this agent
    workflow_state = st.session_state.workflow_state
    assigned_rfes = []

    for rfe in workflow_state.rfe_list:
        if rfe.assigned_agent and rfe.assigned_agent.value == agent_key:
            assigned_rfes.append(rfe)

    if assigned_rfes:
        st.markdown(f"**{len(assigned_rfes)} RFE(s) assigned to this agent:**")

        for rfe in assigned_rfes:
            with st.expander(f"RFE: {rfe.title}"):
                col1, col2 = st.columns(2)

                with col1:
                    st.markdown(f"**ID:** {rfe.id}")
                    st.markdown(f"**Status:** {rfe.current_status.value}")
                    st.markdown(f"**Current Step:** {rfe.current_step}/7")

                with col2:
                    st.markdown(
                        f"**Created:** {rfe.created_at.strftime('%Y-%m-%d %H:%M')}"
                    )
                    st.markdown(
                        f"**Updated:** {rfe.updated_at.strftime('%Y-%m-%d %H:%M')}"
                    )

                st.markdown("**Description:**")
                st.markdown(rfe.description)

                # Current step info
                current_step = workflow_state.get_current_step_info(rfe.id)
                if current_step:
                    st.markdown(f"**Current Task:** {current_step.description}")

                # Action buttons
                col1, col2 = st.columns(2)

                with col1:
                    if st.button("Complete Step", key=f"complete_{rfe.id}"):
                        workflow_state.advance_workflow_step(
                            rfe.id, f"Completed by {selected_agent}"
                        )
                        st.success("Step completed!")
                        st.rerun()

                with col2:
                    if st.button("View Details", key=f"details_{rfe.id}"):
                        st.session_state.selected_rfe = rfe.id
                        st.rerun()
    else:
        st.info(f"No RFEs currently assigned to {selected_agent}")


def show_rfe_list():
    """List all RFEs with filtering and sorting"""
    st.header("📈 RFE List")

    workflow_state = st.session_state.workflow_state

    if not workflow_state.rfe_list:
        st.info("No RFEs created yet.")
        if st.button("Create First RFE"):
            st.session_state.page = "create_rfe"
            st.rerun()
        return

    # Filters
    col1, col2, col3 = st.columns(3)

    with col1:
        status_filter = st.selectbox(
            "Filter by Status", ["All"] + [status.value for status in RFEStatus]
        )

    with col2:
        sort_by = st.selectbox(
            "Sort by", ["Created Date", "Updated Date", "Title", "Status"]
        )

    with col3:
        sort_order = st.selectbox("Order", ["Descending", "Ascending"])

    # Apply filters and sorting
    filtered_rfes = workflow_state.rfe_list

    if status_filter != "All":
        filtered_rfes = [
            rfe for rfe in filtered_rfes if rfe.current_status.value == status_filter
        ]

    # Sort
    if sort_by == "Created Date":
        filtered_rfes = sorted(
            filtered_rfes,
            key=lambda x: x.created_at,
            reverse=(sort_order == "Descending"),
        )
    elif sort_by == "Updated Date":
        filtered_rfes = sorted(
            filtered_rfes,
            key=lambda x: x.updated_at,
            reverse=(sort_order == "Descending"),
        )
    elif sort_by == "Title":
        filtered_rfes = sorted(
            filtered_rfes, key=lambda x: x.title, reverse=(sort_order == "Descending")
        )
    elif sort_by == "Status":
        filtered_rfes = sorted(
            filtered_rfes,
            key=lambda x: x.current_status.value,
            reverse=(sort_order == "Descending"),
        )

    st.markdown(
        f"**Showing {len(filtered_rfes)} of {len(workflow_state.rfe_list)} RFEs**"
    )

    # Display RFEs
    for rfe in filtered_rfes:
        with st.container():
            st.markdown("---")

            col1, col2, col3, col4 = st.columns([3, 2, 1, 1])

            with col1:
                st.markdown(f"**{rfe.title}**")
                st.markdown(f"*{rfe.id}*")

            with col2:
                st.markdown(f"Status: `{rfe.current_status.value}`")
                st.markdown(f"Step: {rfe.current_step}/7")

            with col3:
                if rfe.assigned_agent:
                    st.markdown(f"**Agent:**")
                    st.markdown(f"{rfe.assigned_agent.value}")

            with col4:
                if st.button("View", key=f"view_{rfe.id}"):
                    st.session_state.workflow_state.current_rfe = rfe
                    st.rerun()

            # Description preview
            if len(rfe.description) > 100:
                st.markdown(f"{rfe.description[:100]}...")
            else:
                st.markdown(rfe.description)


if __name__ == "__main__":
    main()
