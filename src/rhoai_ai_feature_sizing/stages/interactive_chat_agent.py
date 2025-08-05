"""Interactive chat agent that manages conversations with session context."""

import logging
import os
import json
import uuid
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
from datetime import datetime

from llama_stack_client import Agent
from ..llama_stack_setup import get_llama_stack_client
from ..api.rag_service import RAGService
from .rag_enhanced_agent import RAGEnhancedAgent
from .refine_feature import generate_refinement_with_agent_sync

# Load inference model from environment
INFERENCE_MODEL = os.getenv("INFERENCE_MODEL")

INTERACTIVE_AGENT_INSTRUCTIONS = """You are an intelligent AI assistant helping with RHOAI feature sizing and JIRA ticket generation. You work like ChatGPT or Cursor - you can directly modify documents based on user requests.

You have access to the user's current session context, including:
1. **Refined Feature Document**: The detailed feature requirements and specifications
2. **JIRA Tickets**: The generated JIRA tickets and stories
3. **Knowledge Base**: Documentation, examples, and best practices via RAG search

**Your Approach:**
- **Be direct and action-oriented** - when users request changes, make them
- **Explain what you're doing** as you work, like "I'll update the refinement document to include..."
- **Make intelligent decisions** about what needs to be updated based on the user's request
- **Provide the updated content** when you make changes

**Action Markers:**
When you determine that documents need updating, include these markers in your response:
- `ACTION_REQUIRED: UPDATE_REFINEMENT` - When the feature document needs changes
- `ACTION_REQUIRED: UPDATE_JIRAS` - When JIRA tickets need changes
- You can include both markers if both documents need updating

**Response Style:**
- Be conversational and helpful like ChatGPT
- When making changes, explain what you're doing: "I'm updating the JIRA structure to create three separate epics..."
- Show confidence in your decisions
- Ask for clarification only when the request is genuinely ambiguous

**Examples:**
User: "Split this into three epics for Platform, UXD, and Dashboard"
You: "I'll restructure the JIRA tickets to create three separate epics as you requested. This will provide better organization and allow each team to track their work independently.

ACTION_REQUIRED: UPDATE_JIRAS

The updated structure will have:
- Platform Epic: Core Kueue integration and backend work
- UXD Epic: User experience and interface design
- Dashboard Epic: Monitoring and visualization components"

Remember: You're not just planning changes - you're making them happen. Be decisive and act on user requests."""


class InteractiveChatAgent:
    """Interactive agent that can chat about and modify session context."""

    def __init__(self, rag_service: Optional[RAGService] = None):
        """Initialize the interactive chat agent."""
        self.client = get_llama_stack_client()
        self.model = INFERENCE_MODEL
        self.rag_service = rag_service or RAGService()
        self.logger = logging.getLogger("InteractiveChatAgent")
        self.rag_agent = RAGEnhancedAgent(
            model=self.model,
            instructions=INTERACTIVE_AGENT_INSTRUCTIONS,
            rag_service=self.rag_service,
        )

        # Store agent sessions for conversation continuity
        self.agent_sessions: Dict[str, str] = {}  # session_id -> agent_session_id

    async def process_chat_message(
        self,
        session_id: str,
        user_message: str,
        session_context: Dict[str, Any],
        session_service: Optional[Any] = None,
        vector_db_ids: Optional[List[str]] = None,
        custom_prompts: Optional[Dict[str, str]] = None,
    ) -> Tuple[str, List[str], List[str]]:
        """
        Process a chat message and return response with any actions taken.

        Args:
            session_id: The session ID
            user_message: User's chat message
            session_context: Current session context (jira_key, outputs, etc.)
            session_service: SessionService instance for database updates
            vector_db_ids: Vector databases for RAG
            custom_prompts: Custom prompts from session

        Returns:
            Tuple of (response_content, actions_taken, updated_outputs)
        """
        try:
            self.logger.info(
                f"Processing chat message for session {session_id}: {user_message[:100]}..."
            )

            # Build context message with session information
            context_message = self._build_context_message(session_context)

            # Create or get existing agent session for conversation continuity
            agent_session_id = await self._get_or_create_agent_session(
                session_id, vector_db_ids
            )

            # Create the full message with context
            full_message = f"{context_message}\n\n**User Message:**\n{user_message}"

            # Process with RAG context
            response = await self.rag_agent.process_with_rag_context(
                user_message=full_message,
                session_id=agent_session_id,
                vector_db_ids=vector_db_ids,
                custom_instructions=INTERACTIVE_AGENT_INSTRUCTIONS,
            )

            # Analyze response to determine if actions need to be taken
            actions_taken, updated_outputs = await self._analyze_and_execute_actions(
                session_id=session_id,
                user_message=user_message,
                agent_response=response,
                session_context=session_context,
                session_service=session_service,
                vector_db_ids=vector_db_ids,
                custom_prompts=custom_prompts,
            )

            self.logger.info(f"Chat response generated. Actions taken: {actions_taken}")
            return response, actions_taken, updated_outputs

        except Exception as e:
            self.logger.error(f"Error processing chat message: {e}")
            return f"I encountered an error processing your request: {str(e)}", [], []

    def _build_context_message(self, session_context: Dict[str, Any]) -> str:
        """Build a context message with current session information."""
        context_parts = [
            "**Current Session Context:**",
            f"- JIRA Key: {session_context.get('jira_key', 'Unknown')}",
            f"- Session Status: {session_context.get('status', 'Unknown')}",
        ]

        # Add information about available outputs
        outputs = session_context.get("outputs", [])
        if outputs:
            context_parts.append("- Available Documents:")
            for output in outputs:
                stage = output.get("stage", "unknown")
                filename = output.get("filename", "unknown")
                content_length = len(output.get("content", ""))
                context_parts.append(
                    f"  - {stage}: {filename} ({content_length} chars)"
                )

        # Add brief content snippets for context
        refinement_output = next(
            (o for o in outputs if o.get("stage") == "refine"), None
        )
        jira_output = next((o for o in outputs if o.get("stage") == "jiras"), None)

        if refinement_output:
            content = refinement_output.get("content", "")
            preview = content[:500] + "..." if len(content) > 500 else content
            context_parts.extend(
                ["", "**Current Refinement Document Preview:**", preview]
            )

        if jira_output:
            content = jira_output.get("content", "")
            preview = content[:500] + "..." if len(content) > 500 else content
            context_parts.extend(["", "**Current JIRA Tickets Preview:**", preview])

        return "\n".join(context_parts)

    async def _get_or_create_agent_session(
        self, session_id: str, vector_db_ids: Optional[List[str]]
    ) -> str:
        """Get or create an agent session for conversation continuity."""
        if session_id in self.agent_sessions:
            return self.agent_sessions[session_id]

        # Create new agent with RAG tools
        agent = await self.rag_agent.create_agent_with_rag_tools(
            vector_db_ids=vector_db_ids,
            custom_instructions=INTERACTIVE_AGENT_INSTRUCTIONS,
        )

        # Create agent session
        agent_session_id = agent.create_session(f"chat_session_{session_id}")
        self.agent_sessions[session_id] = agent_session_id

        return agent_session_id

    async def _analyze_and_execute_actions(
        self,
        session_id: str,
        user_message: str,
        agent_response: str,
        session_context: Dict[str, Any],
        session_service: Optional[Any] = None,
        vector_db_ids: Optional[List[str]] = None,
        custom_prompts: Optional[Dict[str, str]] = None,
    ) -> Tuple[List[str], List[str]]:
        """
        Analyze agent response to determine if actions should be taken based on action markers.

        Returns:
            Tuple of (actions_taken, updated_outputs)
        """
        actions_taken = []
        updated_outputs = []

        # Check if agent indicated refinement update is needed
        if "ACTION_REQUIRED: UPDATE_REFINEMENT" in agent_response:
            try:
                self.logger.info("Agent requested refinement update, executing...")
                updated_filename = await self._update_refinement(
                    session_id,
                    user_message,
                    session_context,
                    session_service,
                    vector_db_ids,
                    custom_prompts,
                )
                actions_taken.append("updated_refinement")
                updated_outputs.append(updated_filename)
            except Exception as e:
                self.logger.error(f"Failed to update refinement: {e}")

        # Check if agent indicated JIRA update is needed
        if "ACTION_REQUIRED: UPDATE_JIRAS" in agent_response:
            try:
                self.logger.info("Agent requested JIRA update, executing...")
                updated_filename = await self._update_jira_tickets(
                    session_id,
                    user_message,
                    session_context,
                    session_service,
                    vector_db_ids,
                    custom_prompts,
                )
                actions_taken.append("updated_jiras")
                updated_outputs.append(updated_filename)
            except Exception as e:
                self.logger.error(f"Failed to update JIRA tickets: {e}")

        return actions_taken, updated_outputs

    async def _update_refinement(
        self,
        session_id: str,
        user_message: str,
        session_context: Dict[str, Any],
        session_service: Optional[Any] = None,
        vector_db_ids: Optional[List[str]] = None,
        custom_prompts: Optional[Dict[str, str]] = None,
    ) -> str:
        """Update the refinement document based on user request."""
        self.logger.info(f"Updating refinement for session {session_id}")

        # Get current refinement content
        outputs = session_context.get("outputs", [])
        refinement_output = next(
            (o for o in outputs if o.get("stage") == "refine"), None
        )

        if not refinement_output:
            raise RuntimeError("No refinement document found to update")

        # Create update prompt
        update_prompt = f"""
        Please update the existing refinement document based on this request:
        
        **User Request:** {user_message}
        
        **Current Refinement Document:**
        {refinement_output.get('content', '')}
        
        Please provide an updated version that incorporates the user's requested changes while maintaining the document structure and quality.
        """

        # Use the refinement agent to generate updated content
        if custom_prompts and "refine_feature" in custom_prompts:
            template = custom_prompts["refine_feature"]
        else:
            template_path = (
                Path(__file__).parent.parent / "prompts" / "refine_feature.md"
            )
            with open(template_path, "r", encoding="utf-8") as f:
                template = f.read()

        # Generate updated refinement
        updated_content = await generate_refinement_with_agent_sync(
            session_context.get("jira_key", "unknown"),
            f"{template}\n\n{update_prompt}",
            session_id,
            custom_prompts,
            use_rag=True,
            vector_db_ids=vector_db_ids,
        )

        # Save the updated content to the database
        if session_service:
            from ..api.models import Stage
            import uuid

            filename = refinement_output.get(
                "filename", f"refined_{session_context.get('jira_key', 'unknown')}.md"
            )
            session_service.update_output(
                uuid.UUID(session_id), Stage.REFINE, filename, updated_content
            )
            self.logger.info(f"Saved updated refinement to database: {filename}")
            return filename
        else:
            self.logger.warning(
                "No session service provided, cannot save updated refinement"
            )
            return f"refined_{session_context.get('jira_key', 'unknown')}.md"

    async def _update_jira_tickets(
        self,
        session_id: str,
        user_message: str,
        session_context: Dict[str, Any],
        session_service: Optional[Any] = None,
        vector_db_ids: Optional[List[str]] = None,
        custom_prompts: Optional[Dict[str, str]] = None,
    ) -> str:
        """Update the JIRA tickets based on user request."""
        self.logger.info(f"Updating JIRA tickets for session {session_id}")

        # Get current JIRA content and refinement
        outputs = session_context.get("outputs", [])
        jira_output = next((o for o in outputs if o.get("stage") == "jiras"), None)
        refinement_output = next(
            (o for o in outputs if o.get("stage") == "refine"), None
        )

        if not jira_output and not refinement_output:
            raise RuntimeError("No JIRA tickets or refinement document found to update")

        # Create update prompt
        base_content = refinement_output.get("content", "") if refinement_output else ""
        current_jiras = jira_output.get("content", "") if jira_output else ""

        update_prompt = f"""
        Please update the JIRA tickets based on this request:
        
        **User Request:** {user_message}
        
        **Current JIRA Tickets:**
        {current_jiras}
        
        **Refinement Document for Reference:**
        {base_content[:1000]}...
        
        Please provide updated JIRA tickets that incorporate the user's requested changes.
        """

        # Generate updated JIRA tickets
        updated_content = await _draft_jiras_from_content(
            update_prompt,
            soft_mode=session_context.get("soft_mode", True),
            custom_prompts=custom_prompts,
            use_rag=True,
            vector_db_ids=vector_db_ids,
        )

        # Save the updated content to the database
        if session_service:
            from ..api.models import Stage
            import uuid

            filename = (
                jira_output.get(
                    "filename",
                    f"jiras_{session_context.get('jira_key', 'unknown')}.json",
                )
                if jira_output
                else f"jiras_{session_context.get('jira_key', 'unknown')}.json"
            )
            session_service.update_output(
                uuid.UUID(session_id), Stage.JIRAS, filename, updated_content
            )
            self.logger.info(f"Saved updated JIRA tickets to database: {filename}")
            return filename
        else:
            self.logger.warning(
                "No session service provided, cannot save updated JIRA tickets"
            )
            return f"jiras_{session_context.get('jira_key', 'unknown')}.json"

    def clear_agent_session(self, session_id: str):
        """Clear the agent session for a given session ID."""
        if session_id in self.agent_sessions:
            del self.agent_sessions[session_id]
            self.logger.info(f"Cleared agent session for {session_id}")


async def _draft_jiras_from_content(
    content: str,
    soft_mode: bool = True,
    custom_prompts: Optional[Dict[str, str]] = None,
    use_rag: bool = True,
    vector_db_ids: Optional[List[str]] = None,
) -> str:
    """Generate JIRA structure from content string."""
    # Import here to avoid circular imports
    from .draft_jiras import generate_jira_structure_with_agent

    return await generate_jira_structure_with_agent(
        content,
        soft_mode=soft_mode,
        custom_prompts=custom_prompts,
        use_rag=use_rag,
        vector_db_ids=vector_db_ids,
    )
