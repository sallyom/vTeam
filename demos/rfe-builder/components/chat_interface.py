"""
Conversational Chat Interface for RFE Builder
Uses Anthropic Claude API for natural language RFE creation and agent assistance
"""

import json
import time
from datetime import datetime
from typing import Any, Dict, Optional

import streamlit as st
import yaml
from ai_models.cost_tracker import CostTracker
from ai_models.prompt_manager import PromptManager
from anthropic import Anthropic
from data.rfe_models import RFE, AgentRole


class ChatInterface:
    """Main chat interface for conversational RFE creation and agent assistance"""

    def __init__(self):
        self.prompt_manager = PromptManager()
        self.cost_tracker = CostTracker()

        # Initialize Anthropic client if API key is available
        self.anthropic_client = None
        self._initialize_anthropic()

        # Session state keys for chat
        if "chat_history" not in st.session_state:
            st.session_state.chat_history = []
        if "current_rfe_draft" not in st.session_state:
            st.session_state.current_rfe_draft = {}

    def _initialize_anthropic(self):
        """Initialize Anthropic client with API key from environment or secrets"""
        try:
            # Try to get API key from Streamlit secrets first
            if hasattr(st, "secrets") and "ANTHROPIC_API_KEY" in st.secrets:
                api_key = st.secrets["ANTHROPIC_API_KEY"]
                self.anthropic_client = Anthropic(api_key=api_key)
            else:
                # Fallback to environment variable
                import os

                api_key = os.getenv("ANTHROPIC_API_KEY")
                if api_key:
                    self.anthropic_client = Anthropic(api_key=api_key)
                else:
                    st.warning(
                        "⚠️ Anthropic API key not found. Please set "
                        "ANTHROPIC_API_KEY in secrets.toml or environment variables."
                    )
        except Exception as e:
            st.error(f"Failed to initialize Anthropic client: {e}")

    def render_conversational_rfe_creator(self):
        """Render the main conversational RFE creation interface"""
        st.header("💬 Create RFE - Conversational Assistant")
        st.markdown(
            "*Describe your enhancement idea naturally - "
            "I'll help you create a complete RFE*"
        )

        # Display API provider and model information
        self._render_model_info()

        # Check if we have API access
        if not self.anthropic_client:
            st.error(
                "🚫 Cannot create conversational interface without Anthropic API access"
            )
            self._render_fallback_form()
            return

        # Chat container
        chat_container = st.container()

        # Display chat history
        with chat_container:
            self._render_chat_history()

        # Chat input
        self._render_chat_input()

        # RFE draft status
        if st.session_state.current_rfe_draft:
            self._render_rfe_draft_status()

    def _render_model_info(self):
        """Display API provider and model information"""
        # Get current model configuration
        model = getattr(st.secrets, "ANTHROPIC_MODEL", "claude-4-sonnet-20250514")

        # Connection status
        status_icon = "🟢" if self.anthropic_client else "🔴"
        status_text = "Connected" if self.anthropic_client else "Disconnected"

        # Format model name for display
        model_display = model.replace("-", " ").title()

        # Render info bar
        # Build the info bar HTML in parts to avoid line length issues
        div_style = (
            "background-color: #f0f2f6; padding: 8px 12px; border-radius: 6px; "
            "font-size: 0.85em; color: #666; margin-bottom: 16px;"
        )
        status_span = (
            f"<span style='margin-right: 12px;'>{status_icon} "
            f"<strong>API Status:</strong> {status_text}</span>"
        )
        provider_span = (
            "<span style='margin-right: 12px;'>🤖 "
            "<strong>Provider:</strong> Anthropic Claude</span>"
        )
        model_span = f"<span>📋 <strong>Model:</strong> {model_display}</span>"

        info_html = (
            f"<div style='{div_style}'>{status_span}{provider_span}{model_span}</div>"
        )

        st.markdown(info_html, unsafe_allow_html=True)

    def _render_chat_history(self):
        """Render the conversation history"""
        for i, message in enumerate(st.session_state.chat_history):
            if message["role"] == "user":
                with st.chat_message("user"):
                    st.write(message["content"])
            elif message["role"] == "assistant":
                with st.chat_message("assistant"):
                    st.write(message["content"])

                    # Show any structured data if available
                    if "structured_data" in message and message["structured_data"]:
                        with st.expander("📋 Extracted Information"):
                            try:
                                st.json(message["structured_data"])
                            except Exception as e:
                                st.error(f"Could not display extracted data: {e}")
                                st.text(f"Raw data: {message['structured_data']}")

    def _render_chat_input(self):
        """Render chat input and handle user messages"""
        user_input = st.chat_input(
            "Describe your enhancement idea or ask me questions..."
        )

        if user_input:
            self._handle_user_message(user_input)

    def _handle_user_message(self, user_input: str):
        """Process user message and generate AI response"""
        # Add user message to history
        st.session_state.chat_history.append(
            {"role": "user", "content": user_input, "timestamp": datetime.now()}
        )

        # Generate AI response
        try:
            response = self._generate_ai_response(user_input)

            # Add assistant response to history
            st.session_state.chat_history.append(
                {
                    "role": "assistant",
                    "content": response["content"],
                    "timestamp": datetime.now(),
                    "structured_data": response.get("structured_data"),
                    "usage": response.get("usage"),
                }
            )

            # Update RFE draft if structured data was extracted
            if response.get("structured_data"):
                self._update_rfe_draft(response["structured_data"])

        except Exception as e:
            st.error(f"Error generating response: {e}")
            # Add error message to chat
            st.session_state.chat_history.append(
                {
                    "role": "assistant",
                    "content": (
                        f"I apologize, but I encountered an error: {e}. "
                        "Please try again."
                    ),
                    "timestamp": datetime.now(),
                    "error": True,
                }
            )

        # Trigger rerun to show new messages
        st.rerun()

    def _generate_ai_response(self, user_input: str) -> Dict[str, Any]:
        """Generate AI response using Claude API"""
        # Get conversational RFE creation prompt
        prompt_template = self._load_conversational_template()

        # Format prompt with context
        context = {
            "user_input": user_input,
            "current_rfe_draft": (
                json.dumps(st.session_state.current_rfe_draft, indent=2)
                if st.session_state.current_rfe_draft
                else "None"
            ),
            "conversation_history": self._get_conversation_context(),
        }

        formatted_prompt = self.prompt_manager.format_prompt(prompt_template, **context)

        # Check cache first
        cache_key = self.cost_tracker.generate_cache_key(
            AgentRole.PARKER_PM,  # Use PM as default for RFE creation
            "rfe_creation",
            {"input": user_input[:100]},  # Use first 100 chars for cache key
        )

        cached_response = self.cost_tracker.check_cache(cache_key)
        if cached_response:
            return cached_response["response"]

        # Make API call
        start_time = time.time()

        try:
            # Get model from secrets or use default
            model = getattr(st.secrets, "ANTHROPIC_MODEL", "claude-4-sonnet-20250514")

            response = self.anthropic_client.messages.create(
                model=model,
                max_tokens=1000,
                system=formatted_prompt["system"],
                messages=[{"role": "user", "content": formatted_prompt["user"]}],
            )

            response_time = time.time() - start_time

            # Extract response content
            response_content = response.content[0].text

            # Try to extract structured data if present
            structured_data = self._extract_structured_data(response_content)

            # Log usage
            prompt_tokens = self.cost_tracker.count_tokens(
                formatted_prompt["system"] + formatted_prompt["user"]
            )
            completion_tokens = self.cost_tracker.count_tokens(response_content)

            usage = self.cost_tracker.log_usage(
                AgentRole.PARKER_PM,
                "rfe_creation",
                prompt_tokens,
                completion_tokens,
                response_time,
            )

            result = {
                "content": response_content,
                "structured_data": structured_data,
                "usage": {
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "cost_estimate": usage.cost_estimate,
                    "response_time": response_time,
                },
            }

            # Cache the result
            self.cost_tracker.cache_response(
                cache_key, result, ttl_seconds=1800
            )  # 30 min cache

            return result

        except Exception as e:
            st.error(f"API call failed: {e}")
            # Return fallback response
            return {
                "content": (
                    "I'm having trouble connecting to the AI service. "
                    "Could you please rephrase your request?"
                ),
                "error": True,
            }

    def _load_conversational_template(self) -> Dict[str, Any]:
        """Load conversational RFE creation template"""
        try:
            template_path = (
                self.prompt_manager.prompts_dir / "conversational_rfe_creation.yaml"
            )
            with open(template_path, "r") as f:
                return yaml.safe_load(f)
        except Exception:
            # Fallback template
            return {
                "system": (
                    "You are an AI assistant helping create RFE submissions. "
                    "Guide users through the process naturally."
                ),
                "user": "Help me create an RFE based on this input: {user_input}",
                "metadata": {"fallback": True},
            }

    def _get_conversation_context(self) -> str:
        """Get relevant conversation context for the AI"""
        if not st.session_state.chat_history:
            return "No previous conversation"

        # Get last few messages for context
        recent_messages = st.session_state.chat_history[-4:]  # Last 2 exchanges
        context_parts = []

        for msg in recent_messages:
            role = "User" if msg["role"] == "user" else "Assistant"
            context_parts.append(
                f"{role}: {msg['content'][:200]}..."
            )  # Truncate for cost

        return "\n".join(context_parts)

    def _extract_structured_data(
        self, response_content: str
    ) -> Optional[Dict[str, Any]]:
        """Extract structured RFE data from AI response"""
        try:
            # Look for JSON blocks in the response
            import re

            json_pattern = r"```json\n(.*?)\n```"
            json_matches = re.findall(json_pattern, response_content, re.DOTALL)

            if json_matches:
                try:
                    return json.loads(json_matches[0])
                except json.JSONDecodeError as e:
                    print(f"JSON parsing error: {e}")
                    return None

            # Look for structured sections
            structured_data = {}
            patterns = {
                "title": r"Title:\s*(.+)",
                "description": r"Description:\s*(.+)",
                "business_justification": r"Business Justification:\s*(.+)",
                "technical_requirements": r"Technical Requirements:\s*(.+)",
                "success_criteria": r"Success Criteria:\s*(.+)",
            }

            for field, pattern in patterns.items():
                match = re.search(pattern, response_content, re.IGNORECASE)
                if match:
                    structured_data[field] = match.group(1).strip()

            return structured_data if structured_data else None

        except Exception:
            return None

    def _update_rfe_draft(self, structured_data: Dict[str, Any]):
        """Update the current RFE draft with extracted data"""
        if not st.session_state.current_rfe_draft:
            st.session_state.current_rfe_draft = {}

        # Update draft with new information
        for key, value in structured_data.items():
            if value and value.strip():  # Only update if there's actual content
                st.session_state.current_rfe_draft[key] = value.strip()

    def _render_rfe_draft_status(self):
        """Show current RFE draft status and completion"""
        st.markdown("---")
        st.subheader("📝 Current RFE Draft")

        col1, col2 = st.columns([3, 1])

        with col1:
            # Show draft content
            draft = st.session_state.current_rfe_draft

            completion_status = self._calculate_completion_status(draft)
            progress = completion_status["percentage"] / 100

            st.progress(
                progress, text=f"RFE Completion: {completion_status['percentage']:.0f}%"
            )

            # Show what we have so far
            for field in [
                "title",
                "description",
                "business_justification",
                "technical_requirements",
                "success_criteria",
            ]:
                if field in draft and draft[field]:
                    st.text_area(
                        field.replace("_", " ").title(),
                        value=draft[field],
                        height=60,
                        disabled=True,
                        key=f"draft_{field}",
                    )

        with col2:
            st.markdown("**Missing:**")
            for missing_field in completion_status["missing_fields"]:
                st.markdown(f"• {missing_field.replace('_', ' ').title()}")

            # Create RFE button if complete enough
            if completion_status["percentage"] >= 80:  # 80% complete threshold
                if st.button("✅ Create RFE", type="primary"):
                    self._create_rfe_from_draft()

    def _calculate_completion_status(self, draft: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate how complete the RFE draft is"""
        required_fields = [
            "title",
            "description",
            "business_justification",
            "technical_requirements",
            "success_criteria",
        ]

        completed_fields = [
            field
            for field in required_fields
            if field in draft and draft[field] and draft[field].strip()
        ]
        missing_fields = [
            field for field in required_fields if field not in completed_fields
        ]

        percentage = (len(completed_fields) / len(required_fields)) * 100

        return {
            "percentage": percentage,
            "completed_fields": completed_fields,
            "missing_fields": missing_fields,
            "total_fields": len(required_fields),
        }

    def _create_rfe_from_draft(self):
        """Create actual RFE from the draft"""
        try:
            draft = st.session_state.current_rfe_draft
            workflow_state = st.session_state.workflow_state

            # Create RFE
            rfe = workflow_state.create_rfe(
                title=draft.get("title", "Untitled RFE"),
                description=draft.get("description", "No description provided"),
            )

            # Add optional fields
            if draft.get("business_justification"):
                rfe.business_justification = draft["business_justification"]
            if draft.get("technical_requirements"):
                rfe.technical_requirements = draft["technical_requirements"]
            if draft.get("success_criteria"):
                rfe.success_criteria = draft["success_criteria"]

            # Clear the draft
            st.session_state.current_rfe_draft = {}
            st.session_state.chat_history = []

            st.success(f"🎉 RFE Created Successfully: {rfe.id}")
            st.info("Your RFE has been assigned to Parker (PM) for prioritization")

            # Switch to workflow view
            time.sleep(1)  # Brief pause to show success message
            st.rerun()

        except Exception as e:
            st.error(f"Failed to create RFE: {e}")

    def _render_fallback_form(self):
        """Fallback form-based RFE creation when AI is not available"""
        st.warning("💡 AI assistant unavailable - using standard form")

        with st.form("fallback_rfe_form"):
            title = st.text_input("RFE Title*", placeholder="Brief descriptive title")
            description = st.text_area(
                "Description*", placeholder="Detailed description", height=150
            )

            col1, col2 = st.columns(2)
            with col1:
                business_justification = st.text_area(
                    "Business Justification", height=100
                )
            with col2:
                technical_requirements = st.text_area(
                    "Technical Requirements", height=100
                )

            success_criteria = st.text_area("Success Criteria", height=100)

            if st.form_submit_button("Create RFE", type="primary"):
                if not title or not description:
                    st.error("Title and Description are required")
                else:
                    # Use existing RFE creation logic from main app
                    workflow_state = st.session_state.workflow_state
                    rfe = workflow_state.create_rfe(title, description)

                    if business_justification:
                        rfe.business_justification = business_justification
                    if technical_requirements:
                        rfe.technical_requirements = technical_requirements
                    if success_criteria:
                        rfe.success_criteria = success_criteria

                    st.success(f"✅ RFE Created: {rfe.id}")

    def render_agent_assistant(self, agent_role: AgentRole, rfe: RFE):
        """Render AI assistant for specific agent role and RFE"""
        st.subheader(
            f"🤖 AI Assistant for {agent_role.value.replace('_', ' ').title()}"
        )

        if not self.anthropic_client:
            st.warning("AI assistant requires Anthropic API access")
            return

        # Get agent-specific prompt
        prompt_template = self.prompt_manager.get_agent_prompt(
            agent_role, "assistance", rfe
        )

        # Simple chat interface for agent assistance
        if st.button("Get AI Recommendation"):
            with st.spinner("Getting AI assistance..."):
                recommendation = self._get_agent_recommendation(
                    agent_role, rfe, prompt_template
                )
                st.markdown("### 💡 AI Recommendation")
                st.write(recommendation)

    def _get_agent_recommendation(
        self, agent_role: AgentRole, rfe: RFE, prompt_template: Dict[str, Any]
    ) -> str:
        """Get AI recommendation for agent"""
        try:
            # Format prompt with RFE context
            context = {
                "title": rfe.title,
                "description": rfe.description,
                "business_justification": rfe.business_justification or "Not provided",
                "technical_requirements": rfe.technical_requirements or "Not provided",
                "success_criteria": rfe.success_criteria or "Not provided",
                "current_step": rfe.current_step,
                "rfe_id": rfe.id,
            }

            formatted_prompt = self.prompt_manager.format_prompt(
                prompt_template, **context
            )

            response = self.anthropic_client.messages.create(
                model="claude-3-haiku-20240307",
                max_tokens=500,
                system=formatted_prompt["system"],
                messages=[{"role": "user", "content": formatted_prompt["user"]}],
            )

            return response.content[0].text

        except Exception as e:
            return f"Error getting AI recommendation: {e}"
