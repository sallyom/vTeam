"""
Multi-phase RFE Builder Workflow System

This system provides:
1. Interactive RFE building (human + multi-agent collaboration)
2. Automated artifact generation (RFE, refinement, architecture, epics/stories)
3. Interactive artifact editing mode
"""

import re
import time
import json
from typing import Any, Dict, List, Literal, Optional, Union
from enum import Enum

from llama_index.core import Settings
from llama_index.core.llms import LLM, ChatMessage
from llama_index.core.memory import ChatMemoryBuffer
from llama_index.core.prompts import PromptTemplate
from llama_index.core.workflow import (
    Context,
    Event,
    StartEvent,
    StopEvent,
    Workflow,
    step,
)
from llama_index.core.chat_ui.models.artifact import (
    Artifact,
    ArtifactType,
    DocumentArtifactData,
)
from llama_index.core.chat_ui.events import (
    UIEvent,
    ArtifactEvent,
)

# from src.artifact_utils import get_last_artifact  # Not used in this workflow
from src.settings import init_settings
from src.agents import RFEAgentManager, get_agent_personas
from pydantic import BaseModel, Field
from dotenv import load_dotenv


class RFEPhase(str, Enum):
    BUILDING = "building"
    GENERATING = "generating"
    EDITING = "editing"


class RFEArtifactType(str, Enum):
    RFE_DESCRIPTION = "rfe_description"
    FEATURE_REFINEMENT = "feature_refinement"
    ARCHITECTURE = "architecture"
    EPICS_STORIES = "epics_stories"


# Events
class PhaseTransitionEvent(Event):
    phase: RFEPhase
    context: Dict[str, Any]


class InteractiveRFEEvent(Event):
    user_input: str
    current_rfe: Optional[str] = None
    iteration_count: int = 0


class GenerateArtifactsEvent(Event):
    final_rfe: str
    context: Dict[str, Any]


class EditArtifactEvent(Event):
    artifact_type: RFEArtifactType
    edit_request: str
    current_content: str


class ArtifactReadyEvent(Event):
    artifact_type: RFEArtifactType
    content: str
    reasoning: str


class RFEBuilderUIEventData(BaseModel):
    """UI event data for RFE builder workflow"""

    phase: RFEPhase = Field(description="Current workflow phase")
    stage: str = Field(description="Current stage within phase")
    description: Optional[str] = Field(default=None, description="Stage description")
    artifact_type: Optional[RFEArtifactType] = Field(
        default=None, description="Current artifact being worked on"
    )
    progress: int = Field(default=0, description="Overall progress percentage")
    streaming_type: Optional[Literal["reasoning", "writing"]] = Field(
        default=None, description="Type of streaming content"
    )
    # Agent-specific fields
    agent_name: Optional[str] = Field(
        default=None, description="Name of the agent currently working"
    )
    agent_persona: Optional[str] = Field(
        default=None, description="Persona code of the agent"
    )
    agent_role: Optional[str] = Field(
        default=None, description="Role description of the agent"
    )


def create_rfe_builder_workflow() -> Workflow:
    load_dotenv()
    init_settings()
    return RFEBuilderWorkflow(timeout=300.0)


class RFEBuilderWorkflow(Workflow):
    """
    Master workflow orchestrating the entire RFE building process:
    1. Interactive RFE building with human collaboration
    2. Multi-artifact generation
    3. Interactive editing mode
    """

    def __init__(self, **kwargs: Any):
        super().__init__(**kwargs)
        self.llm: LLM = Settings.llm
        self.agent_manager = RFEAgentManager()
        self.current_phase: RFEPhase = RFEPhase.BUILDING
        self.artifacts: Dict[RFEArtifactType, str] = {}
        self.rfe_context: Dict[str, Any] = {}

    @step
    async def start_rfe_builder(
        self, ctx: Context, ev: StartEvent
    ) -> InteractiveRFEEvent:
        """Initialize the RFE building process"""
        user_msg = ev.get("user_msg", "")
        chat_history = ev.get("chat_history", [])

        await ctx.set("user_msg", user_msg)
        await ctx.set("chat_history", chat_history)

        # Emit UI event for starting interactive phase
        ctx.write_event_to_stream(
            UIEvent(
                type="rfe_builder_progress",
                data=RFEBuilderUIEventData(
                    phase=RFEPhase.BUILDING,
                    stage="initializing",
                    description="Starting interactive RFE building session...",
                    progress=5,
                ),
            )
        )

        return InteractiveRFEEvent(
            user_input=user_msg, current_rfe=None, iteration_count=0
        )

    @step
    async def interactive_rfe_building(
        self, ctx: Context, ev: InteractiveRFEEvent
    ) -> Union[InteractiveRFEEvent, GenerateArtifactsEvent]:
        """Interactive RFE building with multi-agent collaboration"""

        ctx.write_event_to_stream(
            UIEvent(
                type="rfe_builder_progress",
                data=RFEBuilderUIEventData(
                    phase=RFEPhase.BUILDING,
                    stage="collaborating",
                    description=f"Working with agents to refine your RFE (iteration {ev.iteration_count + 1})",
                    progress=10 + (ev.iteration_count * 15),
                    streaming_type="reasoning",
                ),
            )
        )

        # Get agent personas for collaboration
        agent_personas = await get_agent_personas()

        # Build conversation context
        context_prompt = self._build_collaboration_prompt(
            ev.user_input, ev.current_rfe, ev.iteration_count
        )

        # Get agent insights and suggestions from all agents
        agent_insights = []
        if agent_personas and isinstance(agent_personas, dict):
            total_agents = len(agent_personas)
            for i, (persona_key, persona_config) in enumerate(
                agent_personas.items(), 1
            ):
                # Emit agent-specific progress event
                ctx.write_event_to_stream(
                    UIEvent(
                        type="rfe_builder_progress",
                        data=RFEBuilderUIEventData(
                            phase=RFEPhase.BUILDING,
                            stage="agent_analysis",
                            description=f"Consulting with {persona_config.get('name', persona_key)}...",
                            progress=15
                            + (
                                10 * i // total_agents
                            ),  # Progress 15-25 during agent analysis
                            streaming_type="reasoning",
                            agent_name=persona_config.get("name", persona_key),
                            agent_persona=persona_key,
                            agent_role=persona_config.get("role", "Analyst"),
                        ),
                    )
                )

                try:
                    insight = await self.agent_manager.analyze_rfe(
                        persona_key, context_prompt, persona_config
                    )
                    agent_insights.append(insight)
                except Exception as e:
                    print(f"Agent {persona_key} insight error: {e}")
                    # Continue with other agents even if one fails

        # Generate refined RFE
        ctx.write_event_to_stream(
            UIEvent(
                type="rfe_builder_progress",
                data=RFEBuilderUIEventData(
                    phase=RFEPhase.BUILDING,
                    stage="refining",
                    description="Refining RFE based on agent insights...",
                    progress=15 + (ev.iteration_count * 15),
                    streaming_type="writing",
                ),
            )
        )

        refined_rfe = await self._refine_rfe(
            ev.user_input, ev.current_rfe, agent_insights
        )

        # Check if user is satisfied (simplified - in real implementation this would be interactive)
        # For now, we'll do 3 iterations then move to artifact generation
        if ev.iteration_count >= 2:
            # User is satisfied, move to artifact generation
            ctx.write_event_to_stream(
                UIEvent(
                    type="rfe_builder_progress",
                    data=RFEBuilderUIEventData(
                        phase=RFEPhase.BUILDING,
                        stage="completed",
                        description="RFE building complete. Starting artifact generation...",
                        progress=50,
                    ),
                )
            )

            return GenerateArtifactsEvent(
                final_rfe=refined_rfe, context=self.rfe_context
            )
        else:
            # Continue refining
            return InteractiveRFEEvent(
                user_input=ev.user_input,
                current_rfe=refined_rfe,
                iteration_count=ev.iteration_count + 1,
            )

    @step
    async def generate_artifacts(
        self, ctx: Context, ev: GenerateArtifactsEvent
    ) -> StopEvent:
        """Generate all RFE artifacts"""

        artifacts = {}
        artifact_types = [
            (RFEArtifactType.RFE_DESCRIPTION, "RFE Description"),
            (RFEArtifactType.FEATURE_REFINEMENT, "Feature Refinement Document"),
            (RFEArtifactType.ARCHITECTURE, "Architecture Document"),
            (RFEArtifactType.EPICS_STORIES, "Epics and Stories"),
        ]

        for i, (artifact_type, display_name) in enumerate(artifact_types):
            progress = 50 + ((i + 1) / len(artifact_types)) * 40

            # Research phase
            ctx.write_event_to_stream(
                UIEvent(
                    type="rfe_builder_progress",
                    data=RFEBuilderUIEventData(
                        phase=RFEPhase.GENERATING,
                        stage="researching",
                        description=f"Researching and analyzing for {display_name}...",
                        artifact_type=artifact_type,
                        progress=int(progress - 10),
                        streaming_type="reasoning",
                    ),
                )
            )

            # Writing phase
            ctx.write_event_to_stream(
                UIEvent(
                    type="rfe_builder_progress",
                    data=RFEBuilderUIEventData(
                        phase=RFEPhase.GENERATING,
                        stage="writing",
                        description=f"Writing {display_name}...",
                        artifact_type=artifact_type,
                        progress=int(progress),
                        streaming_type="writing",
                    ),
                )
            )

            # Generate the artifact
            content = await self._generate_artifact_content(
                artifact_type, ev.final_rfe, ev.context
            )

            artifacts[artifact_type.value] = content

            # Create and emit artifact
            ctx.write_event_to_stream(
                ArtifactEvent(
                    data=Artifact(
                        type=ArtifactType.DOCUMENT,
                        created_at=int(time.time()),
                        data=DocumentArtifactData(
                            title=display_name,
                            content=content,
                            type="markdown",
                            sources=[],
                        ),
                    ),
                )
            )

        # Final completion
        ctx.write_event_to_stream(
            UIEvent(
                type="rfe_builder_progress",
                data=RFEBuilderUIEventData(
                    phase=RFEPhase.EDITING,
                    stage="completed",
                    description="All artifacts generated! You can now chat to edit any document.",
                    progress=100,
                ),
            )
        )

        return StopEvent(
            result={
                "final_rfe": ev.final_rfe,
                "artifacts": artifacts,
                "phase": "editing_ready",
                "message": "RFE and all artifacts have been generated. You can now chat to make edits to any document.",
            }
        )

    def _build_collaboration_prompt(
        self, user_input: str, current_rfe: Optional[str], iteration: int
    ) -> str:
        """Build prompt for agent collaboration"""
        if current_rfe is None:
            return f"""
            The user has this initial idea for an RFE: {user_input}
            
            Help them flesh out this idea into a comprehensive RFE by asking clarifying questions
            and providing suggestions for technical requirements, scope, and implementation considerations.
            """
        else:
            return f"""
            We're refining this RFE (iteration {iteration + 1}):
            
            Current RFE: {current_rfe}
            
            Original user input: {user_input}
            
            Provide feedback and suggestions to improve the RFE. Consider:
            - Technical feasibility
            - Scope clarity  
            - Missing requirements
            - Implementation complexity
            """

    async def _refine_rfe(
        self, user_input: str, current_rfe: Optional[str], agent_insights: List[Dict]
    ) -> str:
        """Refine the RFE based on agent insights"""

        insights_text = "\n\n".join(
            [
                f"Agent {insight.get('persona', 'Unknown')}: {insight.get('analysis', 'No analysis')}"
                for insight in agent_insights
            ]
        )

        prompt = PromptTemplate(
            """
            You are an expert at writing detailed RFEs (Request for Enhancement).
            
            User's original idea: {user_input}
            Current RFE draft: {current_rfe}
            Agent insights: {insights}
            
            Create an improved RFE that incorporates the agent insights and addresses any gaps.
            
            Format as a clear, detailed RFE document with:
            - Problem statement
            - Proposed solution
            - Technical requirements
            - Scope and limitations
            - Success criteria
            
            Return only the RFE content, no other text.
            """
        ).format(
            user_input=user_input,
            current_rfe=current_rfe or "No current draft",
            insights=insights_text or "No agent insights available",
        )

        response = await self.llm.acomplete(prompt)
        return response.text.strip()

    async def _generate_artifact_content(
        self, artifact_type: RFEArtifactType, final_rfe: str, context: Dict[str, Any]
    ) -> str:
        """Generate content for a specific artifact type"""

        prompts = {
            RFEArtifactType.RFE_DESCRIPTION: """
                Create a comprehensive RFE description document in markdown format.
                Based on: {rfe}
                
                Include:
                - Executive Summary
                - Problem Statement  
                - Detailed Requirements
                - Technical Specifications
                - Acceptance Criteria
                - Timeline Considerations
            """,
            RFEArtifactType.FEATURE_REFINEMENT: """
                Create a feature refinement document in markdown format.
                Based on: {rfe}
                
                Include:
                - Feature Breakdown
                - User Stories
                - Edge Cases
                - Performance Requirements
                - Security Considerations
                - Testing Strategy
            """,
            RFEArtifactType.ARCHITECTURE: """
                Create an architecture document in markdown format.
                Based on: {rfe}
                
                Include:
                - System Architecture Overview
                - Component Design
                - Data Flow
                - Technology Stack
                - Deployment Considerations
                - Scalability and Performance
            """,
            RFEArtifactType.EPICS_STORIES: """
                Create an epics and stories document in markdown format.
                Based on: {rfe}
                
                Include:
                - Epic Breakdown
                - User Stories with Acceptance Criteria
                - Story Point Estimates
                - Dependencies
                - Sprint Planning Considerations
            """,
        }

        prompt = PromptTemplate(prompts[artifact_type]).format(rfe=final_rfe)
        response = await self.llm.acomplete(prompt)
        return response.text.strip()


# Export for LlamaDeploy
rfe_builder_workflow = create_rfe_builder_workflow()
