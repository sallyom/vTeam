"""Unified Feature Sizing Agent - Single agent that handles the entire flow."""

import logging
import os
import json
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from llama_stack_client import Agent, AgentEventLogger
from .llama_stack_setup import get_llama_stack_client

# Load inference model from environment
INFERENCE_MODEL = os.getenv("INFERENCE_MODEL")

UNIFIED_AGENT_INSTRUCTIONS = """You are an autonomous Feature Planning Agent. Use tools judiciously to create comprehensive feature plans.

**Your Mission:**
1. Analyze JIRA issues and identify component teams
2. Research components using RAG (scoped by component) 
3. Create detailed refinement documents (Markdown)
4. Generate structured JIRA epics and stories (JSON)
5. Use planning tools to persist your work as you go

**Available Tools:**
- RAG tool: builtin::rag/knowledge_search (automatically scoped to vector_db_ids)
- Planning tools: get_refinement_doc, set_refinement_doc, get_jira_plan, set_jira_plan, patch_jira_plan

**Planning Tools Usage:**
- Always pass the jira_key and session_uuid (if known) to planning tools
- Use set_refinement_doc to save your refinement document as you write it
- Use set_jira_plan to save your complete epic/story structure
- Use patch_jira_plan for incremental updates to specific epics or stories

**Output Format:**
When you create content, immediately save it using the planning tools. Your final outputs should be:

1. Refinement Document (saved via set_refinement_doc):
```markdown
# Refinement Doc
## Problem Statement
[Clear description of the feature need]

## Implementation Plan  
[Technical approach and architecture]

## Acceptance Criteria
[Specific, testable criteria]

## Open Questions
[Items needing clarification]
```

2. JIRA Plan (saved via set_jira_plan):
```json
[
  {
    "epic": "Epic Title",
    "component": "component-team",
    "description": "Epic description", 
    "stories": [
      "Story 1: Specific actionable task",
      "Story 2: Another specific task"
    ]
  }
]
```

**Quality Standards:**
- Stories should be specific and actionable (DB changes, API updates, tests)
- Include realistic estimates and team assignments
- Consider dependencies and integration points
- Use component-specific research from RAG

When you're completely done, print: #FINAL_PLAN"""


# Custom planning tool functions
def get_refinement_doc(session_uuid: str, jira_key: str) -> str:
    """
    Get the current refinement document for a session and JIRA key.

    :param session_uuid: The session UUID (as string)
    :param jira_key: The JIRA issue key (e.g., RHOAIENG-12345)
    :return: The refinement document content as markdown text
    """
    from .tools.planning_store_db import get_refinement

    return get_refinement(session_uuid if session_uuid else None, jira_key)


def set_refinement_doc(session_uuid: str, jira_key: str, content: str) -> dict:
    """
    Save/update the refinement document for a session and JIRA key.

    :param session_uuid: The session UUID (as string, or empty string if unknown)
    :param jira_key: The JIRA issue key (e.g., RHOAIENG-12345)
    :param content: The complete refinement document as markdown text
    :return: Dictionary with success status and updated session UUID
    """
    from .tools.planning_store_db import set_refinement

    session_id, text = set_refinement(
        session_uuid if session_uuid else None, jira_key, content
    )
    return {"ok": True, "session_uuid": session_id, "content": text}


def get_jira_plan(session_uuid: str, jira_key: str) -> dict:
    """
    Get the current JIRA plan (epics and stories) for a session and JIRA key.

    :param session_uuid: The session UUID (as string)
    :param jira_key: The JIRA issue key (e.g., RHOAIENG-12345)
    :return: Dictionary containing the JIRA plan with epics and stories
    """
    from .tools.planning_store_db import get_jira_plan as _get_plan

    return {"plan": _get_plan(session_uuid if session_uuid else None, jira_key)}


def set_jira_plan(session_uuid: str, jira_key: str, plan_json: list) -> dict:
    """
    Save/update the complete JIRA plan (epics and stories) for a session and JIRA key.

    :param session_uuid: The session UUID (as string, or empty string if unknown)
    :param jira_key: The JIRA issue key (e.g., RHOAIENG-12345)
    :param plan_json: List of epics with nested stories, e.g. [{"epic": "Epic Title", "component": "team", "stories": ["Story 1", "Story 2"]}]
    :return: Dictionary with success status, updated session UUID, and the saved plan
    """
    from .tools.planning_store_db import set_jira_plan as _set_plan

    session_id, data = _set_plan(
        session_uuid if session_uuid else None, jira_key, plan_json
    )
    return {"ok": True, "session_uuid": session_id, "plan": data}


def patch_jira_plan(session_uuid: str, jira_key: str, json_patch_ops: list) -> dict:
    """
    Apply JSON patch operations to modify the JIRA plan incrementally.

    :param session_uuid: The session UUID (as string)
    :param jira_key: The JIRA issue key (e.g., RHOAIENG-12345)
    :param json_patch_ops: List of RFC6902 JSON patch operations, e.g. [{"op": "add", "path": "/0/stories/-", "value": "New Story"}]
    :return: Dictionary with success status, updated session UUID, and the modified plan
    """
    from .tools.planning_store_db import patch_jira_plan as _patch_plan

    session_id, data = _patch_plan(session_uuid, jira_key, json_patch_ops)
    return {"ok": True, "session_uuid": session_id, "plan": data}


class UnifiedFeatureSizingAgent:
    """Single agent that handles the entire feature sizing flow."""

    def __init__(self):
        """Initialize the unified agent."""
        self.client = get_llama_stack_client()
        self.model = INFERENCE_MODEL
        self.logger = logging.getLogger("UnifiedFeatureSizingAgent")

        if not self.model:
            raise ValueError("INFERENCE_MODEL environment variable must be set")

    async def process_feature(
        self,
        session_id: str,
        jira_key: str,
        rag_store_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Main entry point: Process a feature using the autonomous planning loop.

        Args:
            session_id: Unique session identifier
            jira_key: JIRA issue key to process
            rag_store_ids: Vector databases to use for context

        Returns:
            Dict with generated/updated artifacts
        """
        self.logger.info(f"Processing feature {jira_key} for session {session_id}")

        try:
            # Run the autonomous planning loop
            results = await self.run_planning_loop(
                session_id=session_id,
                jira_key=jira_key,
                rag_store_ids=rag_store_ids,
                max_turns=12,
                enable_validation=True,
            )
            return results

        except Exception as e:
            self.logger.error(f"Error processing feature {jira_key}: {e}")
            raise

    async def run_planning_loop(
        self,
        session_id: str,
        jira_key: str,
        rag_store_ids: Optional[List[str]] = None,
        max_turns: int = 12,
        enable_validation: bool = True,
        streaming_callback: Optional[callable] = None,
    ) -> Dict[str, Any]:
        """
        Run the autonomous planning loop with the agent.

        Args:
            session_id: Session identifier
            jira_key: JIRA issue key
            rag_store_ids: Vector databases for context
            max_turns: Maximum number of agent turns
            enable_validation: Whether to run final validation

        Returns:
            Dict with final refinement and JIRA plan
        """
        self.logger.info(f"Starting planning loop for {jira_key}")

        agent = await self._create_agent_with_tools(rag_store_ids)
        agent_session_id = agent.create_session(f"unified_session_{session_id}")

        # Fetch JIRA data for context
        jira_data = await self._fetch_jira_hierarchy(jira_key)
        seed_components = self._derive_components_from_jira(jira_data)

        # Build initial prompt
        init_msg = self._build_single_loop_prompt(jira_key, jira_data, seed_components)

        # First turn with user message
        try:
            self.logger.info(f"Creating agent turn...")
            if streaming_callback:
                await streaming_callback("system", f"🤖 Creating agent turn for {jira_key}")
            
            turn = agent.create_turn(
                session_id=agent_session_id,
                messages=[{"role": "user", "content": init_msg}],
            )
            
            # Monitor each step of execution with streaming
            step_count = 0
            for log in AgentEventLogger().log(turn):
                log.print()  # Still print to console
                
                # Stream agent execution steps
                if streaming_callback:
                    step_count += 1
                    log_content = str(log)
                    
                    # Determine step type based on log content
                    if "tool_call" in log_content.lower() or "calling" in log_content.lower():
                        step_type = "tool_execution"
                        await streaming_callback("agent", f"🔧 Tool Execution: {log_content}", {"step_type": step_type, "step": step_count})
                    elif "inference" in log_content.lower() or "generating" in log_content.lower():
                        step_type = "inference"
                        await streaming_callback("agent", f"🧠 AI Inference: {log_content}", {"step_type": step_type, "step": step_count})
                    elif "completion" in log_content.lower() or "response" in log_content.lower():
                        step_type = "completion"
                        await streaming_callback("agent", f"✅ Step Complete: {log_content}", {"step_type": step_type, "step": step_count})
                    else:
                        step_type = "execution"
                        await streaming_callback("agent", f"⚙️ Execution: {log_content}", {"step_type": step_type, "step": step_count})

            self.logger.debug(f"Turn object type: {type(turn)}")
            if streaming_callback:
                await streaming_callback("system", f"📊 Turn completed - type: {type(turn).__name__}")

            # Log turn details
            if hasattr(turn, "turn_id"):
                self.logger.debug(f"Turn ID: {turn.turn_id}")
                if streaming_callback:
                    await streaming_callback("system", f"🆔 Turn ID: {turn.turn_id}")
                    
            if hasattr(turn, "completed_at"):
                self.logger.info(f"Turn completed at: {turn.completed_at}")
                if streaming_callback:
                    await streaming_callback("system", f"⏰ Turn completed at: {turn.completed_at}")
                    
            if hasattr(turn, "steps"):
                steps_count = len(turn.steps) if turn.steps else 0
                self.logger.info(f"Agent executed {steps_count} steps")
                if streaming_callback:
                    await streaming_callback("system", f"📈 Agent executed {steps_count} steps total")

            # The Turn object itself contains the response, no need to await
            response = turn
            self.logger.debug(f"Turn response type: {type(response)}")
            self.logger.debug(f"Turn response attributes: {dir(response)}")

            # Log response details at debug level
            if hasattr(response, "content"):
                self.logger.debug(f"Response has content: {bool(response.content)}")
                if response.content:
                    self.logger.debug(
                        f"Response content type: {type(response.content)}"
                    )
                    if isinstance(response.content, list):
                        self.logger.debug(
                            f"Response content length: {len(response.content)}"
                        )
                        for i, item in enumerate(response.content):
                            self.logger.debug(f"Content item {i} type: {type(item)}")
                            if hasattr(item, "text"):
                                self.logger.debug(
                                    f"Content item {i} text preview: {item.text[:200]}..."
                                )
                            if hasattr(item, "tool_call"):
                                self.logger.debug(
                                    f"Content item {i} tool_call: {item.tool_call}"
                                )

            if hasattr(response, "tool_calls"):
                self.logger.debug(f"Response tool_calls: {response.tool_calls}")

            if hasattr(response, "events"):
                self.logger.debug(
                    f"Response events count: {len(response.events) if response.events else 0}"
                )
                if response.events:
                    for i, event in enumerate(response.events):
                        self.logger.debug(f"Event {i}: {type(event)} - {event}")

        except Exception as e:
            self.logger.error(f"Error during turn creation: {e}")
            import traceback

            self.logger.error(f"Full traceback: {traceback.format_exc()}")
            raise

        refinement_doc = None
        jira_plan = None
        turn_count = 1
        completed = False

        # Multi-turn conversation loop
        current_response = response

        while turn_count <= max_turns and not completed:
            text = self._extract_response_content(current_response)

            # Parse outputs from agent response
            if doc := self._parse_refinement_markdown(text):
                refinement_doc = doc
            if plan := self._parse_jira_json_from_content(text):
                jira_plan = plan

            # Check for completion signal
            if self._has_final_plan_marker(text):
                self.logger.info(f"Agent completed planning in {turn_count} turn(s)")
                completed = True
                break

            # If not completed and we haven't hit max turns, continue the conversation
            if turn_count < max_turns:
                self.logger.info(
                    f"Agent turn {turn_count} completed, continuing conversation..."
                )

                # Continue the conversation - the agent should continue from where it left off
                try:
                    turn_count += 1
                    next_turn = agent.create_turn(
                        session_id=agent_session_id,
                        messages=[
                            {
                                "role": "user",
                                "content": "Please continue with your work.",
                            }
                        ],
                    )

                    # Monitor each step of execution
                    for log in AgentEventLogger().log(next_turn):
                        log.print()

                    current_response = next_turn

                except Exception as e:
                    self.logger.error(f"Error during turn {turn_count}: {e}")
                    break
            else:
                self.logger.warning(
                    f"Reached maximum turns ({max_turns}) without completion"
                )
                break

        # Get final state from database (agent should have saved via tools)
        try:
            from .tools.planning_store_db import get_refinement, get_jira_plan

            final_refinement = get_refinement(session_id, jira_key)
            final_plan = get_jira_plan(session_id, jira_key)

            # Use DB state if available, otherwise use parsed content
            refinement_doc = final_refinement or refinement_doc
            jira_plan = final_plan or jira_plan

        except Exception as e:
            self.logger.warning(f"Could not fetch final state from DB: {e}")

        # Optional validation
        validation_notes = None
        if enable_validation and refinement_doc and jira_plan:
            try:
                validation_notes = await self._validate_plan_coverage(
                    agent, agent_session_id, refinement_doc, jira_plan
                )
            except Exception as e:
                self.logger.warning(f"Validation failed: {e}")

        return {
            "refinement_content": refinement_doc or "",
            "jira_structure": jira_plan or {},
            "validation_notes": validation_notes,
            "actions_taken": ["looped_planning"],
        }

    def _build_single_loop_prompt(
        self, jira_key: str, jira_data: Dict[str, Any], components: List[str]
    ) -> str:
        """Build the initial prompt for the autonomous planning loop."""
        main_issue = jira_data["main_issue"]
        summary = main_issue.get("fields", {}).get("summary", "")
        description = main_issue.get("fields", {}).get("description", "")

        return f"""
Please analyze and create a complete feature plan for JIRA issue {jira_key}.

**JIRA Details:**
- Summary: {summary}
- Description: {description[:1000]}{"..." if len(description) > 1000 else ""}
- Potential Components: {components}

**Your Task:**
1. Analyze the JIRA issue details provided in the context
2. Create a comprehensive refinement document covering the problem, implementation approach, and acceptance criteria
3. Generate a structured JIRA plan with epics and actionable stories
4. Save your work using the planning tools as you go (pass session_uuid="" initially, then use the returned session_uuid)
5. When completely finished, print #FINAL_PLAN

**IMPORTANT INSTRUCTIONS:**
- This is a multi-turn conversation. Take your time and work step by step.
- ACTUALLY USE THE TOOLS - don't just describe what you would do, DO IT.
- Start by calling get_refinement_doc() and get_jira_plan() to see if any work already exists.
- Use set_refinement_doc() and set_jira_plan() to save your work as you create it.
- You can use RAG search to research components if needed.
- Only print #FINAL_PLAN when you have actually completed and saved all your work.

**Remember:** Use the planning tools to save your refinement document and JIRA plan. Pass session_uuid="" initially, then use the returned session_uuid for subsequent calls.

Begin your analysis now by first checking what work already exists.
        """.strip()

    def _derive_components_from_jira(self, jira_data: Dict[str, Any]) -> List[str]:
        """Extract potential component teams from JIRA data."""
        main_issue = jira_data["main_issue"]
        comps = main_issue.get("components", []) or []
        labels = main_issue.get("labels", []) or []
        return list(dict.fromkeys([*comps, *labels]))[:8]

    def _parse_refinement_markdown(self, content: str) -> Optional[str]:
        """Extract refinement document from agent response."""
        import re

        m = re.search(r"(?ms)^#\s*Refinement Doc\s*\n(.*?)(?=^\s*#\s|\Z)", content)
        return m.group(1).strip() if m else None

    def _parse_jira_json_from_content(self, content: str) -> Optional[Any]:
        """Extract JIRA plan JSON from agent response."""
        import re

        m = re.search(r"```json\s*(\[[\s\S]*?\]|\{[\s\S]*?\})\s*```", content)
        if m:
            try:
                return json.loads(m.group(1))
            except:
                return None
        try:
            return json.loads(content)
        except:
            return None

    def _has_final_plan_marker(self, content: str) -> bool:
        """Check if content contains the completion marker."""
        return "#FINAL_PLAN" in content

    async def _validate_plan_coverage(
        self, agent: Agent, agent_session_id: str, refinement_doc: str, jira_json: Any
    ) -> str:
        """Run validation to check coverage between refinement and plan."""
        prompt = f"""Please validate the coverage between the refinement document and JIRA plan. List any gaps or missing elements.

**Refinement Document:**
{refinement_doc[:2000]}

**JIRA Plan:**
{json.dumps(jira_json, indent=2)[:2000]}

Provide a brief assessment of completeness and any recommendations.
"""
        response = agent.create_turn(
            session_id=agent_session_id,
            messages=[{"role": "user", "content": prompt}],
            stream=False,
        )
        return self._extract_response_content(response)

    async def _fetch_jira_hierarchy(self, jira_key: str) -> Dict[str, Any]:
        """Fetch JIRA issue and its child hierarchy using MCP tools."""
        self.logger.info(f"Fetching JIRA hierarchy for {jira_key}")

        try:
            # Get main issue
            main_issue_response = self.client.tool_runtime.invoke_tool(
                tool_name="jira_get_issue",
                kwargs={
                    "issue_key": jira_key,
                    "fields": "summary,description,status,issuetype,components,priority,labels,created,updated",
                },
            )

            if main_issue_response.error_message:
                raise RuntimeError(
                    f"Failed to fetch {jira_key}: {main_issue_response.error_message}"
                )

            # Parse main issue data
            main_issue_data = self._parse_mcp_response(main_issue_response)
            self.logger.debug(
                f"Main issue data keys: {list(main_issue_data.keys()) if main_issue_data else 'None'}"
            )
            if main_issue_data and "fields" in main_issue_data:
                fields = main_issue_data["fields"]
                self.logger.info(f"Main issue: {fields.get('summary', 'N/A')}")
                self.logger.debug(
                    f"Issue type: {fields.get('issuetype', {}).get('name', 'N/A')}"
                )
                self.logger.debug(
                    f"Components: {[c.get('name') for c in fields.get('components', [])]}"
                )

            # Search for child issues (epics and stories)
            children_response = self.client.tool_runtime.invoke_tool(
                tool_name="jira_search",
                kwargs={
                    "jql": f'"Parent Link" = {jira_key}',
                    "fields": "summary,description,status,issuetype,components,priority,labels,parent,customfield_12310243",
                    "limit": 100,
                },
            )

            children_data = []
            if not children_response.error_message:
                children_data = self._parse_mcp_response(children_response).get(
                    "issues", []
                )
                self.logger.info(f"Found {len(children_data)} existing child issues")
            else:
                self.logger.debug(
                    f"Child search error: {children_response.error_message}"
                )

            return {
                "main_issue": main_issue_data,
                "child_issues": children_data,
                "jira_key": jira_key,
            }

        except Exception as e:
            self.logger.error(f"Error fetching JIRA hierarchy: {e}")
            raise

    async def _create_agent_with_tools(
        self, rag_store_ids: Optional[List[str]] = None
    ) -> Agent:
        """Create an agent with RAG, MCP, and custom planning tools."""
        # Default RAG stores if none provided - use "default" for now since specific stores may not exist
        if rag_store_ids is None:
            rag_store_ids = ["default"]

        # Build tools list with proper format from documentation
        tools = [
            # Custom planning tools as functions
            get_refinement_doc,
            set_refinement_doc,
            get_jira_plan,
            set_jira_plan,
            patch_jira_plan,
            # RAG tool with vector DB configuration
            {
                "name": "builtin::rag/knowledge_search",
                "args": {"vector_db_ids": rag_store_ids},
            },
        ]

        # Create agent with proper tool configuration
        agent = Agent(
            self.client,
            model=self.model,
            instructions=UNIFIED_AGENT_INSTRUCTIONS,
            tools=tools,
        )

        return agent

    def _parse_mcp_response(self, response) -> Dict[str, Any]:
        """Parse MCP tool response into structured data."""
        try:
            if hasattr(response, "content") and response.content:
                content = response.content
                if isinstance(content, list) and content:
                    content = content[0]

                if hasattr(content, "text"):
                    return json.loads(content.text)

            return {}
        except (json.JSONDecodeError, AttributeError) as e:
            self.logger.error(f"Error parsing MCP response: {e}")
            return {}

    def _extract_response_content(self, response) -> str:
        """Extract text content from agent response (Turn object)."""
        try:
            # Handle Turn object
            if hasattr(response, "output_message") and response.output_message:
                output_msg = response.output_message
                self.logger.debug(f"Output message type: {type(output_msg)}")

                if hasattr(output_msg, "content") and output_msg.content:
                    content = output_msg.content
                    if isinstance(content, list) and content:
                        # Get the first content item
                        content_item = content[0]
                        if hasattr(content_item, "text"):
                            text_length = len(content_item.text)
                            self.logger.debug(f"Extracted text length: {text_length}")
                            return content_item.text
                        elif isinstance(content_item, str):
                            return content_item
                    elif isinstance(content, str):
                        return content

                # Try to get text directly from output_message
                if hasattr(output_msg, "text"):
                    return output_msg.text

            # Fallback to old method for backwards compatibility
            if hasattr(response, "content") and response.content:
                content = response.content
                if isinstance(content, list) and content:
                    content = content[0]

                if hasattr(content, "text"):
                    return content.text
                elif isinstance(content, str):
                    return content

            return str(response)
        except Exception as e:
            self.logger.error(f"Error extracting response content: {e}")
            return f"Error extracting response: {str(e)}"
