"""Simple RFE Builder: user input -> agents -> RFE -> artifacts -> done"""

import time
import json
import asyncio
from typing import Any, Dict, List, Literal, Optional
from enum import Enum

from llama_index.core import Settings
from llama_index.core.llms import LLM
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
from llama_index.core.chat_ui.events import UIEvent, ArtifactEvent
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from src.settings import init_settings
from src.agents import RFEAgentManager, get_agent_personas


class RFEPhase(str, Enum):
    BUILDING = "building"
    GENERATING_PHASE_1 = "generating_phase_1"
    PHASE_1_READY = "phase_1_ready"
    GENERATING_PHASE_2 = "generating_phase_2"
    COMPLETED = "completed"


class RFEArtifactType(str, Enum):
    RFE_DESCRIPTION = "rfe_description"
    FEATURE_REFINEMENT = "feature_refinement"
    ARCHITECTURE = "architecture"
    EPICS_STORIES = "epics_stories"


# Phase 1 artifacts (refinement phase)
PHASE_1_ARTIFACTS = [
    (RFEArtifactType.RFE_DESCRIPTION, "RFE Description"),
    (RFEArtifactType.FEATURE_REFINEMENT, "Feature Refinement"),
]

# Phase 2 artifacts (detailed design phase)
PHASE_2_ARTIFACTS = [
    (RFEArtifactType.ARCHITECTURE, "Architecture"),
    (RFEArtifactType.EPICS_STORIES, "Epics & Stories"),
]


class GenerateArtifactsEvent(Event):
    final_rfe: str
    context: Dict[str, Any]


class RFEBuilderUIEventData(BaseModel):
    """Simple UI event data"""

    phase: RFEPhase
    stage: str
    description: Optional[str] = None
    progress: int = 0
    agent_streaming: Optional[Dict[str, Any]] = None


def create_rfe_builder_workflow() -> Workflow:
    load_dotenv()
    init_settings()
    return RFEBuilderWorkflow(timeout=300.0)


class RFEBuilderWorkflow(Workflow):
    """Simple RFE builder: user input -> agents -> artifacts -> done"""

    def __init__(self, **kwargs: Any):
        super().__init__(**kwargs)
        self.llm: LLM = Settings.llm
        self.agent_manager = RFEAgentManager()

    @step
    async def start_rfe_builder(
        self, ctx: Context, ev: StartEvent
    ) -> GenerateArtifactsEvent:
        """Simple start: get user input and go straight to RFE building"""
        user_msg = ev.get("user_msg", "")

        # Get agent personas and build RFE
        agent_personas = await get_agent_personas()

        # Filter to only include specific agents
        filtered_agents = {
            "UX_RESEARCHER",
            "UX_FEATURE_LEAD",
            "ENGINEERING_MANAGER",
            "STAFF_ENGINEER",
            "TECHNICAL_WRITER",
            "UX_ARCHITECT",
        }

        agent_personas = {
            key: config
            for key, config in agent_personas.items()
            if key in filtered_agents
        }

        agent_insights = []

        if agent_personas:
            for persona_key, persona_config in agent_personas.items():
                try:
                    async for stream_event in self.agent_manager.analyze_rfe_streaming(
                        persona_key, user_msg, persona_config
                    ):
                        # Forward agent events to multi-agent component
                        ctx.write_event_to_stream(
                            UIEvent(
                                type="multi_agent_analysis",
                                data={
                                    "agent_key": persona_key,
                                    "agent_name": persona_config.get(
                                        "name", persona_key
                                    ),
                                    "agent_role": persona_config.get("role", "Analyst"),
                                    "stream_event": stream_event,
                                },
                            )
                        )

                        if stream_event.get("type") == "complete":
                            agent_insights.append(stream_event.get("result"))
                except Exception as e:
                    print(f"Agent {persona_key} error: {e}")

        # Small delay to ensure agent completion events are processed first
        await asyncio.sleep(0.5)

        # Summarize all agent analyses
        if agent_insights:
            await self._summarize_agent_analyses(ctx, agent_insights)

        # Build final RFE from insights
        final_rfe = await self._build_final_rfe(user_msg, agent_insights)

        return GenerateArtifactsEvent(final_rfe=final_rfe, context={})

    @step
    async def generate_phase_1_artifacts(
        self, ctx: Context, ev: GenerateArtifactsEvent
    ) -> StopEvent:
        """Generate only Phase 1 artifacts (RFE + Feature Refinement)"""

        ctx.write_event_to_stream(
            UIEvent(
                type="rfe_builder_progress",
                data=RFEBuilderUIEventData(
                    phase=RFEPhase.GENERATING_PHASE_1,
                    stage="generating_phase_1",
                    description="Generating Phase 1 artifacts (RFE & Feature Refinement)...",
                    progress=50,
                ),
            )
        )

        phase_1_artifacts = {}

        # Generate only Phase 1 artifacts
        for artifact_type, display_name in PHASE_1_ARTIFACTS:
            content = await self._generate_simple_artifact(artifact_type, ev.final_rfe)
            phase_1_artifacts[artifact_type.value] = content

            # Emit artifact
            ctx.write_event_to_stream(
                ArtifactEvent(
                    data=Artifact(
                        id=artifact_type.value,
                        type=ArtifactType.DOCUMENT,
                        created_at=int(time.time()),
                        data=DocumentArtifactData(
                            title=display_name,
                            content=content,
                            type="markdown",
                            sources=[],
                        ),
                    )
                )
            )

        # Phase 1 complete - ready for iteration and then phase transition
        ctx.write_event_to_stream(
            UIEvent(
                type="rfe_builder_progress",
                data=RFEBuilderUIEventData(
                    phase=RFEPhase.PHASE_1_READY,
                    stage="phase_1_ready",
                    description="Phase 1 artifacts ready! You can now iterate on your RFE and Feature Refinement documents. When ready, continue to Phase 2 for Architecture and Epics & Stories.",
                    progress=100,
                ),
            )
        )

        # Show Create RFE button after Phase 1 completion
        ctx.write_event_to_stream(
            UIEvent(
                type="create_rfe_ready",
                data={
                    "message": "RFE documents are ready! Create the RFE in Jira when you're satisfied with the content.",
                    "artifacts": list(phase_1_artifacts.keys()),
                    "rfe_content": phase_1_artifacts.get("rfe_description", ""),
                    "refinement_content": phase_1_artifacts.get(
                        "feature_refinement", ""
                    ),
                },
            )
        )

        return StopEvent(
            result={
                "final_rfe": ev.final_rfe,
                "phase_1_artifacts": phase_1_artifacts,
                "ready_for_rfe_creation": True,
                "message": "Phase 1 complete! You can now iterate on your documents or create the RFE in Jira.",
            }
        )

    async def _summarize_agent_analyses(
        self, ctx: Context, agent_insights: List[Dict]
    ) -> None:
        """Summarize all agent analyses and stream as plain text to UI"""

        # Create summary prompt
        insights_text = "\n\n".join(
            [
                f"**{insight.get('persona', 'Agent')}:**\n{insight.get('analysis', 'No analysis')}"
                for insight in agent_insights
                if insight
            ]
        )

        summary_prompt = f"""
        Based on the following agent analyses, provide a concise summary that highlights:
        - Key themes and patterns across all analyses
        - Critical requirements and considerations
        - Main risks or challenges identified
        - Recommended next steps
        
        Agent Analyses:
        {insights_text}
        
        Provide a clear, structured summary in markdown format.
        """

        # Stream the summary generation
        ctx.write_event_to_stream(
            UIEvent(
                type="agent_analysis_summary",
                data={
                    "status": "generating",
                    "message": "Synthesizing insights from all agent analyses...",
                    "timestamp": int(time.time() * 1000),  # milliseconds
                },
            )
        )

        try:
            # Stream the summary generation
            accumulated_text = ""
            char_count = 0

            async for chunk in self.llm.astream_complete(summary_prompt):
                accumulated_text += chunk.delta
                char_count += len(chunk.delta)

                # Stream update every 10 characters
                if char_count >= 10:
                    ctx.write_event_to_stream(
                        UIEvent(
                            type="agent_analysis_summary",
                            data={
                                "status": "streaming",
                                "summary": accumulated_text,
                                "message": "Generating analysis summary...",
                                "timestamp": int(time.time() * 1000),
                            },
                        )
                    )
                    char_count = 0

            # Send final complete event
            ctx.write_event_to_stream(
                UIEvent(
                    type="agent_analysis_summary",
                    data={
                        "status": "complete",
                        "summary": accumulated_text.strip(),
                        "message": "Agent analysis summary complete",
                        "timestamp": int(time.time() * 1000),
                    },
                )
            )
        except Exception as e:
            ctx.write_event_to_stream(
                UIEvent(
                    type="agent_analysis_summary",
                    data={
                        "status": "error",
                        "message": f"Failed to generate summary: {str(e)}",
                        "timestamp": int(time.time() * 1000),
                    },
                )
            )

    async def _build_final_rfe(
        self, user_input: str, agent_insights: List[Dict]
    ) -> str:
        """Simple RFE building from user input and agent insights"""

        insights_text = "\n".join(
            [
                f"{insight.get('persona', 'Agent')}: {insight.get('analysis', 'No analysis')}"
                for insight in agent_insights
                if insight
            ]
        )

        prompt = f"""
        Create a clear RFE (Request for Enhancement) document based on:
        
        User idea: {user_input}
        Agent analysis: {insights_text}
        
        Include:
        - Problem statement
        - Proposed solution  
        - Requirements
        - Success criteria
        """

        response = await self.llm.acomplete(prompt)
        return response.text.strip()

    async def _generate_simple_artifact(
        self, artifact_type: RFEArtifactType, final_rfe: str
    ) -> str:
        """Simple artifact generation"""

        artifact_prompts = {
            RFEArtifactType.RFE_DESCRIPTION: f"Create a detailed RFE document based on: {final_rfe}",
            RFEArtifactType.FEATURE_REFINEMENT: f"Create a feature breakdown document based on: {final_rfe}",
            RFEArtifactType.ARCHITECTURE: f"Create a system architecture document based on: {final_rfe}",
            RFEArtifactType.EPICS_STORIES: f"Create epics and user stories based on: {final_rfe}",
        }

        prompt = artifact_prompts[artifact_type]
        response = await self.llm.acomplete(prompt)
        return response.text.strip()


# Export for LlamaDeploy
rfe_builder_workflow = create_rfe_builder_workflow()
