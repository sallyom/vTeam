"""
Workflow visualization and management components
"""

import streamlit as st
from data.rfe_models import RFE
from streamlit_mermaid import st_mermaid


def render_workflow_diagram(current_step: int = 1):
    """Render the RFE Council workflow as a Mermaid diagram"""

    # Define step colors based on current position
    def get_step_color(step_num: int) -> str:
        if step_num < current_step:
            return "fill:#28a745,stroke:#1e7e34,color:#fff"  # Completed - green
        elif step_num == current_step:
            return "fill:#ffc107,stroke:#e0a800,color:#212529"  # Current - yellow
        else:
            return "fill:#6c757d,stroke:#545b62,color:#fff"  # Pending - gray

    # Build the mermaid diagram with dynamic styling
    mermaid_code = f"""
    flowchart TD
        Start([Start]) --> PrioritizeRFE["1️⃣ 📊 Parker (PM)<br/>Prioritize RFEs"]

        PrioritizeRFE --> ReviewRFE["2️⃣ RFE Council<br/>🏛️ Archie (Architect)<br/>Review RFE"]
        ReviewRFE -.->|2a if necessary| AssessImpact["2a 👥 Lee (Team Lead) +<br/>💻 Taylor (Team Member)<br/>Assess Impact"]
        AssessImpact -.->|return to 2️⃣| ReviewRFE

        ReviewRFE --> RFEComplete{{"3️⃣ ⭐ Stella (Staff Engineer)<br/>RFE is Complete?"}}
        RFEComplete -->|3a missing details| AddInfo["3a 📋 Olivia (PO)<br/>Add missing information"]
        AddInfo -->|return to 1️⃣| PrioritizeRFE

        RFEComplete -->|3b Yes| RFEMeets{{"4️⃣ RFE Council<br/>🏛️ Archie (Architect)<br/>RFE meets acceptance<br/>criteria?"}}

        RFEMeets -->|4a Yes| AcceptRFE["5️⃣ ⭐ Stella (Staff Engineer)<br/>Accept RFE<br/><i>(update ticket with<br/>assessment info)</i>"]
        RFEMeets -->|4b No| RejectRFE["4b RFE Council<br/>🏛️ Archie (Architect)<br/>Reject RFE<br/><i>(update ticket with<br/>assessment info)</i>"]

        RejectRFE --> CanChange{{"4c 📋 Olivia (PO)<br/>Can RFE be changed<br/>to remedy concerns?"}}
        CanChange -->|4d Yes - return to 3a| AddInfo
        CanChange -->|4e No| CommReject["6️⃣ 📊 Parker (PM)<br/>Communicate assessment<br/>to requester"]

        AcceptRFE --> CommAccept["6️⃣ 📊 Parker (PM)<br/>Communicate assessment<br/>to requester"]

        CommReject --> CreateTicket["7️⃣ 🚀 Derek (Delivery Owner)<br/>Create Feature ticket<br/>and assign to owner"]
        CommAccept --> CreateTicket

        CreateTicket --> End([End])

        %% Dynamic styling based on current step
        classDef startEnd fill:#28a745,stroke:#1e7e34,color:#fff
        classDef step1 {get_step_color(1)}
        classDef step2 {get_step_color(2)}
        classDef step3 {get_step_color(3)}
        classDef step4 {get_step_color(4)}
        classDef step5 {get_step_color(5)}
        classDef step6 {get_step_color(6)}
        classDef step7 {get_step_color(7)}

        class Start,End startEnd
        class PrioritizeRFE step1
        class ReviewRFE,AssessImpact step2
        class RFEComplete,AddInfo step3
        class RFEMeets,RejectRFE,CanChange step4
        class AcceptRFE step5
        class CommReject,CommAccept step6
        class CreateTicket step7
    """

    # Render the diagram
    st_mermaid(mermaid_code, height=600)


def render_step_progress(rfe: RFE):
    """Render step-by-step progress for an RFE"""
    st.markdown("### Workflow Progress")

    # Progress overview
    completed_steps = sum(
        1 for step in rfe.workflow_steps if step.status == "completed"
    )
    progress_percentage = (completed_steps / len(rfe.workflow_steps)) * 100

    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric("Current Step", f"{rfe.current_step}/7")

    with col2:
        st.metric("Completed Steps", completed_steps)

    with col3:
        st.metric("Progress", f"{progress_percentage:.0f}%")

    # Progress bar
    st.progress(
        progress_percentage / 100, text=f"Overall Progress: {progress_percentage:.0f}%"
    )

    st.markdown("---")

    # Detailed step breakdown
    for i, step in enumerate(rfe.workflow_steps):
        step_num = i + 1

        # Create container for this step
        with st.container():
            col1, col2, col3, col4 = st.columns([1, 3, 2, 1])

            with col1:
                # Step status indicator
                if step.status == "completed":
                    st.success(f"✅ {step_num}")
                elif step_num == rfe.current_step:
                    st.warning(f"🔄 {step_num}")
                else:
                    st.info(f"⏳ {step_num}")

            with col2:
                # Step details
                st.markdown(f"**{step.name}**")
                st.markdown(f"*{step.description}*")

                if step.notes:
                    st.markdown(f"📝 Notes: {step.notes}")

            with col3:
                # Agent and timing info
                st.markdown(f"**Agent:** {step.responsible_agent.value}")

                if step.completed_at:
                    st.markdown(
                        f"**Completed:** {step.completed_at.strftime('%Y-%m-%d %H:%M')}"
                    )
                elif step_num == rfe.current_step:
                    st.markdown("**Status:** In Progress")
                else:
                    st.markdown("**Status:** Pending")

            with col4:
                # Action button for current step
                if step_num == rfe.current_step:
                    if st.button("Complete", key=f"complete_step_{step_num}"):
                        return {"action": "complete_step", "step": step_num}

        # Add separator except for last step
        if i < len(rfe.workflow_steps) - 1:
            st.markdown("---")

    return None


def render_agent_workload():
    """Render agent workload overview"""
    st.markdown("### Agent Workload")

    # This would typically pull from actual data
    agents = [
        {"name": "📊 Parker (PM)", "active_rfes": 2, "completed_rfes": 5},
        {"name": "🏛️ Archie (Architect)", "active_rfes": 1, "completed_rfes": 8},
        {"name": "⭐ Stella (Staff Engineer)", "active_rfes": 3, "completed_rfes": 7},
        {"name": "📋 Olivia (PO)", "active_rfes": 0, "completed_rfes": 3},
        {"name": "👥 Lee (Team Lead)", "active_rfes": 1, "completed_rfes": 2},
        {"name": "💻 Taylor (Team Member)", "active_rfes": 1, "completed_rfes": 2},
        {"name": "🚀 Derek (Delivery Owner)", "active_rfes": 0, "completed_rfes": 4},
    ]

    for agent in agents:
        col1, col2, col3 = st.columns([2, 1, 1])

        with col1:
            st.markdown(f"**{agent['name']}**")

        with col2:
            st.metric("Active", agent["active_rfes"])

        with col3:
            st.metric("Completed", agent["completed_rfes"])


def render_workflow_metrics(rfe_list: list):
    """Render workflow performance metrics"""
    st.markdown("### Workflow Metrics")

    if not rfe_list:
        st.info("No data available for metrics")
        return

    # Calculate metrics
    total_rfes = len(rfe_list)
    completed_rfes = len(
        [rfe for rfe in rfe_list if rfe.current_status.value == "ticket_created"]
    )
    in_progress_rfes = len(
        [
            rfe
            for rfe in rfe_list
            if rfe.current_status.value not in ["ticket_created", "rejected"]
        ]
    )
    rejected_rfes = len(
        [rfe for rfe in rfe_list if rfe.current_status.value == "rejected"]
    )

    # Display metrics
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.metric("Total RFEs", total_rfes)

    with col2:
        st.metric("Completed", completed_rfes)

    with col3:
        st.metric("In Progress", in_progress_rfes)

    with col4:
        st.metric("Rejected", rejected_rfes)

    # Success rate
    if total_rfes > 0:
        success_rate = (completed_rfes / total_rfes) * 100
        st.progress(success_rate / 100, text=f"Success Rate: {success_rate:.1f}%")
