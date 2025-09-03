"""
Artifact Editor Workflow

This workflow handles the editing phase where users can chat to make adjustments
to any of the generated RFE artifacts.
"""

import re
import time
from typing import Any, Dict, List, Literal, Optional

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

from src.artifact_utils import get_last_artifact
from src.settings import init_settings
from pydantic import BaseModel, Field
from dotenv import load_dotenv


def create_artifact_editor_workflow() -> Workflow:
    load_dotenv()
    init_settings()
    return ArtifactEditorWorkflow(timeout=120.0)


class ArtifactEditRequest(BaseModel):
    artifact_type: str = Field(description="Type of artifact to edit")
    edit_instruction: str = Field(description="What changes to make")
    current_content: str = Field(description="Current artifact content")


class EditAnalysisEvent(Event):
    edit_request: ArtifactEditRequest
    analysis: str


class EditGenerationEvent(Event):
    edit_request: ArtifactEditRequest
    analysis: str
    updated_content: str


class ArtifactEditorUIEventData(BaseModel):
    """UI event data for artifact editing"""

    stage: Literal["analyzing", "editing", "completed"] = Field(
        description="Current editing stage"
    )
    artifact_type: Optional[str] = Field(
        default=None, description="Artifact being edited"
    )
    description: Optional[str] = Field(default=None, description="Stage description")
    streaming_type: Optional[Literal["reasoning", "writing"]] = Field(
        default=None, description="Type of streaming content"
    )


class ArtifactEditorWorkflow(Workflow):
    """
    Workflow for editing RFE artifacts based on user chat requests.
    Analyzes the edit request, determines what changes to make, and updates the artifact.
    """

    def __init__(self, **kwargs: Any):
        super().__init__(**kwargs)
        self.llm: LLM = Settings.llm

    @step
    async def analyze_edit_request(
        self, ctx: Context, ev: StartEvent
    ) -> EditAnalysisEvent:
        """Analyze the user's edit request to understand what changes are needed"""
        user_msg = ev.get("user_msg", "")
        chat_history = ev.get("chat_history", [])
        artifacts = ev.get("artifacts", {})

        # Parse the edit request to identify target artifact and changes
        edit_request = await self._parse_edit_request(user_msg, artifacts)

        ctx.write_event_to_stream(
            UIEvent(
                type="artifact_editor_progress",
                data=ArtifactEditorUIEventData(
                    stage="analyzing",
                    artifact_type=edit_request.artifact_type,
                    description=f"Analyzing your request to edit {edit_request.artifact_type.replace('_', ' ')}...",
                    streaming_type="reasoning",
                ),
            )
        )

        # Analyze what specific changes need to be made
        analysis = await self._analyze_changes(edit_request)

        return EditAnalysisEvent(edit_request=edit_request, analysis=analysis)

    @step
    async def generate_edited_artifact(
        self, ctx: Context, ev: EditAnalysisEvent
    ) -> EditGenerationEvent:
        """Generate the updated artifact based on the analysis"""

        ctx.write_event_to_stream(
            UIEvent(
                type="artifact_editor_progress",
                data=ArtifactEditorUIEventData(
                    stage="editing",
                    artifact_type=ev.edit_request.artifact_type,
                    description=f"Applying changes to {ev.edit_request.artifact_type.replace('_', ' ')}...",
                    streaming_type="writing",
                ),
            )
        )

        # Generate the updated content
        updated_content = await self._generate_updated_content(
            ev.edit_request, ev.analysis
        )

        return EditGenerationEvent(
            edit_request=ev.edit_request,
            analysis=ev.analysis,
            updated_content=updated_content,
        )

    @step
    async def finalize_edit(self, ctx: Context, ev: EditGenerationEvent) -> StopEvent:
        """Finalize the edit and emit the updated artifact"""

        # Create artifact title mapping
        title_map = {
            "rfe_description": "RFE Description",
            "feature_refinement": "Feature Refinement Document",
            "architecture": "Architecture Document",
            "epics_stories": "Epics and Stories",
        }

        title = title_map.get(ev.edit_request.artifact_type, "Document")

        # Emit the updated artifact
        ctx.write_event_to_stream(
            ArtifactEvent(
                data=Artifact(
                    type=ArtifactType.DOCUMENT,
                    created_at=int(time.time()),
                    data=DocumentArtifactData(
                        title=title,
                        content=ev.updated_content,
                        type="markdown",
                    ),
                ),
            )
        )

        ctx.write_event_to_stream(
            UIEvent(
                type="artifact_editor_progress",
                data=ArtifactEditorUIEventData(
                    stage="completed",
                    artifact_type=ev.edit_request.artifact_type,
                    description=f"Successfully updated {title}!",
                ),
            )
        )

        # Create response message
        response_message = f"""I've updated the **{title}** based on your request.

**Changes made:**
{ev.analysis}

The updated document is now available in the artifacts panel. You can continue making edits by describing what you'd like to change."""

        return StopEvent(
            result={
                "message": response_message,
                "updated_artifact": {
                    "type": ev.edit_request.artifact_type,
                    "content": ev.updated_content,
                },
            }
        )

    async def _parse_edit_request(
        self, user_msg: str, artifacts: Dict[str, str]
    ) -> ArtifactEditRequest:
        """Parse the user's message to identify which artifact to edit and what changes to make"""

        # Create a prompt to identify the target artifact and edit intent
        artifact_list = "\n".join(
            [f"- {key}: {key.replace('_', ' ').title()}" for key in artifacts.keys()]
        )

        prompt = PromptTemplate(
            """
            The user wants to edit one of their RFE artifacts. Analyze their request and identify:
            1. Which artifact they want to edit
            2. What changes they want to make

            Available artifacts:
            {artifacts}

            User request: "{user_msg}"

            Respond in JSON format:
            {{"artifact_type": "artifact_key", "edit_instruction": "clear description of what to change"}}

            If the request is ambiguous about which artifact, choose the most relevant one based on context.
            """
        ).format(artifacts=artifact_list, user_msg=user_msg)

        response = await self.llm.acomplete(prompt)

        try:
            # Extract JSON from response
            json_match = re.search(r"\{.*\}", response.text, re.DOTALL)
            if json_match:
                import json

                parsed = json.loads(json_match.group())
                artifact_type = parsed.get(
                    "artifact_type",
                    list(artifacts.keys())[0] if artifacts else "rfe_description",
                )
                edit_instruction = parsed.get("edit_instruction", user_msg)
            else:
                # Fallback: assume they want to edit the first artifact
                artifact_type = (
                    list(artifacts.keys())[0] if artifacts else "rfe_description"
                )
                edit_instruction = user_msg
        except:
            # Fallback on parsing error
            artifact_type = (
                list(artifacts.keys())[0] if artifacts else "rfe_description"
            )
            edit_instruction = user_msg

        current_content = artifacts.get(artifact_type, "")

        return ArtifactEditRequest(
            artifact_type=artifact_type,
            edit_instruction=edit_instruction,
            current_content=current_content,
        )

    async def _analyze_changes(self, edit_request: ArtifactEditRequest) -> str:
        """Analyze what specific changes need to be made"""

        prompt = PromptTemplate(
            """
            You need to analyze an edit request for a document and plan the specific changes.

            Document type: {artifact_type}
            Edit request: {edit_instruction}
            
            Current content preview:
            {content_preview}

            Analyze the request and describe specifically what changes need to be made.
            Consider:
            - What sections need to be added, modified, or removed
            - What new information needs to be included
            - How the changes fit with the existing structure
            - Any potential impacts on other sections

            Provide a clear analysis of the required changes.
            """
        ).format(
            artifact_type=edit_request.artifact_type.replace("_", " ").title(),
            edit_instruction=edit_request.edit_instruction,
            content_preview=edit_request.current_content[:500]
            + ("..." if len(edit_request.current_content) > 500 else ""),
        )

        response = await self.llm.acomplete(prompt)
        return response.text.strip()

    async def _generate_updated_content(
        self, edit_request: ArtifactEditRequest, analysis: str
    ) -> str:
        """Generate the updated content based on the edit request and analysis"""

        prompt = PromptTemplate(
            """
            You are an expert technical writer updating a document based on specific edit requirements.

            Document type: {artifact_type}
            Edit request: {edit_instruction}
            Change analysis: {analysis}

            Current document:
            {current_content}

            Generate the updated document that incorporates all the requested changes.
            
            Guidelines:
            - Maintain the document structure and formatting
            - Keep existing content that wasn't meant to be changed
            - Make the requested modifications precisely
            - Ensure the document remains coherent and well-organized
            - Use markdown formatting consistently

            Return only the updated document content, no other text.
            """
        ).format(
            artifact_type=edit_request.artifact_type.replace("_", " ").title(),
            edit_instruction=edit_request.edit_instruction,
            analysis=analysis,
            current_content=edit_request.current_content,
        )

        response = await self.llm.acomplete(prompt)
        return response.text.strip()


# Export for LlamaDeploy
artifact_editor_workflow = create_artifact_editor_workflow()
