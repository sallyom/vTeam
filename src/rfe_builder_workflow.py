"""Simple RFE Builder: user input -> agents -> RFE -> artifacts -> done"""

import time
import json
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
    GENERATING = "generating"
    EDITING = "editing"


class RFEArtifactType(str, Enum):
    RFE_DESCRIPTION = "rfe_description"
    FEATURE_REFINEMENT = "feature_refinement"
    ARCHITECTURE = "architecture"
    EPICS_STORIES = "epics_stories"


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

        # Simple progress event
        ctx.write_event_to_stream(
            UIEvent(
                type="rfe_builder_progress",
                data=RFEBuilderUIEventData(
                    phase=RFEPhase.BUILDING,
                    stage="building",
                    description="Building RFE with AI agents...",
                    progress=10,
                ),
            )
        )

        # Get agent personas and build RFE
        agent_personas = await get_agent_personas()
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

        # Build final RFE from insights
        final_rfe = await self._build_final_rfe(user_msg, agent_insights)

        return GenerateArtifactsEvent(final_rfe=final_rfe, context={})

    @step
    async def generate_artifacts(
        self, ctx: Context, ev: GenerateArtifactsEvent
    ) -> StopEvent:
        """Simple artifact generation"""

        ctx.write_event_to_stream(
            UIEvent(
                type="rfe_builder_progress",
                data=RFEBuilderUIEventData(
                    phase=RFEPhase.GENERATING,
                    stage="generating",
                    description="Generating artifacts...",
                    progress=50,
                ),
            )
        )

        artifacts = {}
        artifact_types = [
            (RFEArtifactType.RFE_DESCRIPTION, "RFE Description"),
            (RFEArtifactType.FEATURE_REFINEMENT, "Feature Refinement"),
            (RFEArtifactType.ARCHITECTURE, "Architecture"),
            (RFEArtifactType.EPICS_STORIES, "Epics & Stories"),
        ]

        for artifact_type, display_name in artifact_types:
            content = await self._generate_simple_artifact(artifact_type, ev.final_rfe)
            artifacts[artifact_type.value] = content

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

        # Done
        ctx.write_event_to_stream(
            UIEvent(
                type="rfe_builder_progress",
                data=RFEBuilderUIEventData(
                    phase=RFEPhase.EDITING,
                    stage="completed",
                    description="All artifacts generated!",
                    progress=100,
                ),
            )
        )

        return StopEvent(result={"final_rfe": ev.final_rfe, "artifacts": artifacts})

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
