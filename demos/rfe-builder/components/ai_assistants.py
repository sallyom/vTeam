"""
AI-powered assistants for each RFE workflow agent
Provides role-specific guidance and decision support
"""

from typing import Any, Dict, List, Optional

import streamlit as st
from ai_models.cost_tracker import CostTracker
from ai_models.prompt_manager import PromptManager
from anthropic import Anthropic, AnthropicVertex
from data.rfe_models import RFE, AgentRole


class AgentAIAssistant:
    """Base class for agent-specific AI assistants"""

    def __init__(self, agent_role: AgentRole):
        self.agent_role = agent_role
        self.prompt_manager = PromptManager()
        self.cost_tracker = CostTracker()

        # Initialize Anthropic client
        self.anthropic_client = self._get_anthropic_client()

    def _get_anthropic_client(self) -> Optional[Anthropic]:
        """Get Anthropic client with error handling"""
        try:
            import os

            # Check for Vertex AI configuration first
            if os.getenv("CLAUDE_CODE_USE_VERTEX") == "1":
                project_id = os.getenv("ANTHROPIC_VERTEX_PROJECT_ID")
                region = os.getenv("CLOUD_ML_REGION")
                if project_id and region:
                    return AnthropicVertex(
                        project_id=project_id,
                        region=region
                    )
            
            # Fallback to direct API key
            if hasattr(st, "secrets") and "ANTHROPIC_API_KEY" in st.secrets:
                return Anthropic(api_key=st.secrets["ANTHROPIC_API_KEY"])
            else:
                api_key = os.getenv("ANTHROPIC_API_KEY")
                if api_key:
                    return Anthropic(api_key=api_key)
        except Exception:
            pass
        return None

    def render_assistance_panel(
        self, rfe: RFE, context: Optional[Dict[str, Any]] = None
    ):
        """Render the AI assistance panel for this agent"""
        if not self.anthropic_client:
            st.warning("🤖 AI assistant requires Anthropic API key configuration")
            return

        with st.expander("🤖 AI Assistant", expanded=False):
            self._render_assistant_interface(rfe, context)

    def _render_assistant_interface(
        self, rfe: RFE, context: Optional[Dict[str, Any]] = None
    ):
        """Render the specific assistant interface (to be overridden)"""
        st.info("AI assistant available for this agent")

        if st.button(f"Get {self.agent_role.value.replace('_', ' ').title()} Guidance"):
            with st.spinner("Getting AI guidance..."):
                guidance = self.get_agent_guidance(rfe, context)
                st.markdown("### 💡 AI Guidance")
                st.write(guidance)

    def get_agent_guidance(
        self, rfe: RFE, context: Optional[Dict[str, Any]] = None
    ) -> str:
        """Get AI guidance for this agent and RFE"""
        if not self.anthropic_client:
            return "AI guidance unavailable - missing API configuration"

        try:
            # Get appropriate prompt template
            prompt_template = self.prompt_manager.get_agent_prompt(
                self.agent_role, self._get_task_context(rfe), rfe
            )

            # Format prompt with RFE and context data
            prompt_context = self._build_prompt_context(rfe, context)
            formatted_prompt = self.prompt_manager.format_prompt(
                prompt_template, **prompt_context
            )

            # Get model from environment or use default
            import os
            model = os.getenv("ANTHROPIC_SMALL_FAST_MODEL", "claude-3-haiku-20240307")

            # Make API call
            response = self.anthropic_client.messages.create(
                model=model,
                max_tokens=800,
                system=formatted_prompt["system"],
                messages=[{"role": "user", "content": formatted_prompt["user"]}],
            )

            return response.content[0].text

        except Exception as e:
            return f"Error getting AI guidance: {e}"

    def _get_task_context(self, rfe: RFE) -> str:
        """Get the current task context for this agent (to be overridden)"""
        return "general_assistance"

    def _build_prompt_context(
        self, rfe: RFE, additional_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Build context dictionary for prompt formatting"""
        context = {
            "title": rfe.title,
            "description": rfe.description,
            "business_justification": rfe.business_justification or "Not provided",
            "technical_requirements": rfe.technical_requirements or "Not provided",
            "success_criteria": rfe.success_criteria or "Not provided",
            "current_step": rfe.current_step,
            "rfe_id": rfe.id,
            "priority": getattr(rfe, "priority", "Not set"),
            "current_status": rfe.current_status.value,
        }

        # Add RFE history context
        if rfe.history:
            recent_history = []
            for entry in rfe.history[-3:]:  # Last 3 history entries
                timestamp = entry["timestamp"].strftime("%Y-%m-%d %H:%M")
                action = entry.get("action", "Unknown action")
                notes = entry.get("notes", "")
                recent_history.append(f"{timestamp}: {action} - {notes}")
            context["decision_history"] = "\n".join(recent_history)
        else:
            context["decision_history"] = "No previous decisions recorded"

        # Add additional context if provided
        if additional_context:
            context.update(additional_context)

        return context


class ParkerAIAssistant(AgentAIAssistant):
    """AI Assistant for Parker (Product Manager)"""

    def __init__(self):
        super().__init__(AgentRole.PARKER_PM)

    def _get_task_context(self, rfe: RFE) -> str:
        """Get Parker's current task context"""
        if rfe.current_step == 1:
            return "step1_prioritization"
        elif rfe.current_step == 6:
            return "step6_communication"
        else:
            return "general_pm_guidance"

    def _render_assistant_interface(
        self, rfe: RFE, context: Optional[Dict[str, Any]] = None
    ):
        """Parker-specific assistant interface"""
        if rfe.current_step == 1:
            st.markdown("**🎯 Prioritization Assistant**")
            st.markdown("I can help you assess business priority and impact.")

            col1, col2 = st.columns(2)
            with col1:
                if st.button("📊 Analyze Business Impact"):
                    guidance = self.get_business_impact_analysis(rfe)
                    st.markdown("### Business Impact Analysis")
                    st.write(guidance)

            with col2:
                if st.button("🎯 Suggest Priority Level"):
                    guidance = self.get_priority_recommendation(rfe)
                    st.markdown("### Priority Recommendation")
                    st.write(guidance)

        elif rfe.current_step == 6:
            st.markdown("**📢 Communication Assistant**")
            st.markdown("I can help draft stakeholder communications.")

            stakeholder_type = st.selectbox(
                "Stakeholder Type",
                ["RFE Submitter", "Engineering Team", "Management", "All Stakeholders"],
            )

            if st.button("✉️ Draft Communication"):
                context_update = {"stakeholder_type": stakeholder_type}
                guidance = self.get_agent_guidance(rfe, context_update)
                st.markdown("### Draft Communication")
                st.write(guidance)
        else:
            super()._render_assistant_interface(rfe, context)

    def get_business_impact_analysis(self, rfe: RFE) -> str:
        """Get specific business impact analysis"""
        context = {"analysis_type": "business_impact"}
        return self.get_agent_guidance(rfe, context)

    def get_priority_recommendation(self, rfe: RFE) -> str:
        """Get priority level recommendation"""
        context = {"analysis_type": "priority_recommendation"}
        return self.get_agent_guidance(rfe, context)


class ArchieAIAssistant(AgentAIAssistant):
    """AI Assistant for Archie (Architect)"""

    def __init__(self):
        super().__init__(AgentRole.ARCHIE_ARCHITECT)

    def _get_task_context(self, rfe: RFE) -> str:
        """Get Archie's current task context"""
        if rfe.current_step == 2:
            return "step2_technical_review"
        elif rfe.current_step == 4:
            return "step4_acceptance_criteria"
        else:
            return "general_architecture_guidance"

    def _render_assistant_interface(
        self, rfe: RFE, context: Optional[Dict[str, Any]] = None
    ):
        """Archie-specific assistant interface"""
        if rfe.current_step == 2:
            st.markdown("**🏛️ Technical Review Assistant**")

            col1, col2 = st.columns(2)
            with col1:
                if st.button("🔍 Assess Feasibility"):
                    guidance = self.get_feasibility_assessment(rfe)
                    st.markdown("### Technical Feasibility")
                    st.write(guidance)

            with col2:
                if st.button("🏗️ Architecture Impact"):
                    guidance = self.get_architecture_impact(rfe)
                    st.markdown("### Architecture Impact")
                    st.write(guidance)

        elif rfe.current_step == 4:
            st.markdown("**✅ Acceptance Criteria Assistant**")

            if st.button("📋 Evaluate Acceptance Criteria"):
                guidance = self.get_agent_guidance(rfe)
                st.markdown("### Acceptance Criteria Evaluation")
                st.write(guidance)
        else:
            super()._render_assistant_interface(rfe, context)

    def get_feasibility_assessment(self, rfe: RFE) -> str:
        """Get technical feasibility assessment"""
        context = {"analysis_type": "feasibility"}
        return self.get_agent_guidance(rfe, context)

    def get_architecture_impact(self, rfe: RFE) -> str:
        """Get architecture impact analysis"""
        context = {"analysis_type": "architecture_impact"}
        return self.get_agent_guidance(rfe, context)


class StellaAIAssistant(AgentAIAssistant):
    """AI Assistant for Stella (Staff Engineer)"""

    def __init__(self):
        super().__init__(AgentRole.STELLA_STAFF_ENGINEER)

    def _get_task_context(self, rfe: RFE) -> str:
        """Get Stella's current task context"""
        if rfe.current_step == 3:
            return "step3_completeness_check"
        elif rfe.current_step == 5:
            return "step5_final_decision"
        else:
            return "general_engineering_guidance"

    def _render_assistant_interface(
        self, rfe: RFE, context: Optional[Dict[str, Any]] = None
    ):
        """Stella-specific assistant interface"""
        if rfe.current_step == 3:
            st.markdown("**📋 Completeness Check Assistant**")

            if st.button("🔍 Check RFE Completeness"):
                guidance = self.get_completeness_analysis(rfe)
                st.markdown("### Completeness Analysis")
                st.write(guidance)

        elif rfe.current_step == 5:
            st.markdown("**⚖️ Final Decision Assistant**")

            if st.button("🎯 Final Decision Analysis"):
                guidance = self.get_agent_guidance(rfe)
                st.markdown("### Final Decision Analysis")
                st.write(guidance)
        else:
            super()._render_assistant_interface(rfe, context)

    def get_completeness_analysis(self, rfe: RFE) -> str:
        """Get RFE completeness analysis"""
        context = {"analysis_type": "completeness"}
        return self.get_agent_guidance(rfe, context)


class DerekAIAssistant(AgentAIAssistant):
    """AI Assistant for Derek (Delivery Owner)"""

    def __init__(self):
        super().__init__(AgentRole.DEREK_DELIVERY_OWNER)

    def _get_task_context(self, rfe: RFE) -> str:
        """Get Derek's current task context"""
        if rfe.current_step == 7:
            return "step7_ticket_creation"
        else:
            return "general_delivery_guidance"

    def _render_assistant_interface(
        self, rfe: RFE, context: Optional[Dict[str, Any]] = None
    ):
        """Derek-specific assistant interface"""
        if rfe.current_step == 7:
            st.markdown("**🎫 Ticket Creation Assistant**")

            col1, col2 = st.columns(2)
            with col1:
                if st.button("📝 Generate Epic Template"):
                    guidance = self.get_epic_template(rfe)
                    st.markdown("### JIRA Epic Template")
                    st.code(guidance)

            with col2:
                if st.button("📋 Break Down Tasks"):
                    guidance = self.get_task_breakdown(rfe)
                    st.markdown("### Development Task Breakdown")
                    st.write(guidance)
        else:
            super()._render_assistant_interface(rfe, context)

    def get_epic_template(self, rfe: RFE) -> str:
        """Get JIRA epic template"""
        context = {"output_type": "epic_template"}
        return self.get_agent_guidance(rfe, context)

    def get_task_breakdown(self, rfe: RFE) -> str:
        """Get development task breakdown"""
        context = {"output_type": "task_breakdown"}
        return self.get_agent_guidance(rfe, context)


class AIAssistantFactory:
    """Factory class to create appropriate AI assistants"""

    _assistants = {
        AgentRole.PARKER_PM: ParkerAIAssistant,
        AgentRole.ARCHIE_ARCHITECT: ArchieAIAssistant,
        AgentRole.STELLA_STAFF_ENGINEER: StellaAIAssistant,
        AgentRole.DEREK_DELIVERY_OWNER: DerekAIAssistant,
    }

    @classmethod
    def create_assistant(cls, agent_role: AgentRole) -> AgentAIAssistant:
        """Create AI assistant for the specified agent role"""
        assistant_class = cls._assistants.get(agent_role, AgentAIAssistant)
        if assistant_class == AgentAIAssistant:
            return AgentAIAssistant(agent_role)  # Fallback for other agents
        else:
            return assistant_class()  # Specialized classes call super().__init__()

    @classmethod
    def get_available_agents(cls) -> List[AgentRole]:
        """Get list of agents with AI assistants"""
        return list(cls._assistants.keys())
