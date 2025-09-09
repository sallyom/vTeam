import yaml
import json
import asyncio
from pathlib import Path
from typing import Dict, List, Any, Optional, Union, AsyncGenerator

from pydantic import BaseModel, Field
from llama_index.core import VectorStoreIndex
from llama_index.core.storage import StorageContext
from llama_index.core.indices import load_index_from_storage
from llama_index.core.settings import Settings
from llama_index.core.prompts import PromptTemplate

from src.prompts import get_prompt, PROMPT_NAMES


# Simple streaming helper - returns final result directly
async def stream_structured_predict(
    output_cls, prompt_template, persona: str, **prompt_args
):
    """Simple streaming with UI events every 50 chars"""
    stream_generator = await Settings.llm.astream_structured_predict(
        output_cls, prompt_template, **prompt_args
    )

    accumulated_text = ""
    char_count = 0
    final_response = None

    async for partial_response in stream_generator:
        # Get text content
        current_text = (
            getattr(partial_response, "analysis", "")
            or getattr(partial_response, "synthesis", "")
            or str(partial_response)
        )

        if len(current_text) > len(accumulated_text):
            char_count += len(current_text) - len(accumulated_text)
            accumulated_text = current_text

        final_response = partial_response

    return final_response


# Streaming helper that yields events
async def stream_structured_predict_with_events(
    output_cls, prompt_template, persona: str, **prompt_args
):
    """Streaming version that yields UI events"""
    stream_generator = await Settings.llm.astream_structured_predict(
        output_cls, prompt_template, **prompt_args
    )

    accumulated_text = ""
    char_count = 0
    final_response = None

    async for partial_response in stream_generator:
        # Get text content
        current_text = (
            getattr(partial_response, "analysis", "")
            or getattr(partial_response, "synthesis", "")
            or str(partial_response)
        )

        if len(current_text) > len(accumulated_text):
            char_count += len(current_text) - len(accumulated_text)
            accumulated_text = current_text

            # UI event every 50 chars
            if char_count >= 50:
                yield {
                    "type": "streaming",
                    "persona": persona,
                    "partial_content": accumulated_text,
                    "streaming_type": "writing",
                }
                char_count = 0

        final_response = partial_response

    # Yield final result
    yield {
        "type": "complete",
        "persona": persona,
        "result": final_response.model_dump(),
    }


# Pydantic models for structured outputs
class RFEAnalysis(BaseModel):
    """Structure for agent RFE analysis output"""

    analysis: str = Field(
        description="Detailed analysis of the RFE from the agent's perspective"
    )
    persona: str = Field(description="The agent persona that performed this analysis")
    estimatedComplexity: str = Field(
        description="Complexity estimate: LOW, MEDIUM, HIGH, or UNKNOWN"
    )
    concerns: List[str] = Field(description="List of concerns or risks identified")
    recommendations: List[str] = Field(
        description="List of recommendations for implementation"
    )
    requiredComponents: List[str] = Field(
        description="List of required components or systems"
    )


class Synthesis(BaseModel):
    """Structure for synthesized multi-agent analysis"""

    overallComplexity: str = Field(
        description="Overall complexity assessment: LOW, MEDIUM, HIGH, or UNKNOWN"
    )
    consensusRecommendations: List[str] = Field(
        description="Agreed-upon recommendations from all agents"
    )
    criticalRisks: List[str] = Field(
        description="Critical risks identified across agents"
    )
    requiredCapabilities: List[str] = Field(
        description="Required capabilities or skills needed"
    )
    estimatedTimeline: str = Field(description="Estimated timeline for implementation")
    synthesis: str = Field(
        description="Overall synthesis and summary of all agent inputs"
    )


class ComponentTeam(BaseModel):
    """Structure for a component team definition"""

    teamName: str = Field(description="Name of the component team")
    components: List[str] = Field(
        description="List of components this team is responsible for"
    )
    responsibilities: List[str] = Field(
        description="List of responsibilities for this team"
    )
    epicTitle: str = Field(description="Title of the epic for this team")
    epicDescription: str = Field(description="Description of the epic for this team")


class ComponentTeamsList(BaseModel):
    """Structure for list of component teams"""

    teams: List[ComponentTeam] = Field(
        description="List of component teams with their responsibilities"
    )


class Architecture(BaseModel):
    """Structure for architecture diagram output"""

    type: str = Field(
        description="Type of architecture diagram (e.g., 'system', 'component', 'flow')"
    )
    mermaidCode: str = Field(description="Mermaid diagram code for the architecture")
    description: str = Field(description="Description of the architecture")
    components: List[str] = Field(description="List of architectural components")
    integrations: List[str] = Field(
        description="List of system integrations or connections"
    )


class RFEAgentManager:
    """Manages multi-agent RFE analysis"""

    def __init__(self):
        self.indices: Dict[str, VectorStoreIndex] = {}
        self.agent_configs: Dict[str, Dict] = {}
        self.load_agent_configurations()

    def load_agent_configurations(self):
        """Load agent configs from YAML files"""
        # Get agents directory relative to this file's location
        agents_dir = Path(__file__).parent / "agents"

        if not agents_dir.exists():
            print(f"Warning: Agents directory not found at {agents_dir}")
            return

        for yaml_file in agents_dir.glob("*.yaml"):
            if yaml_file.name.startswith("agent-schema"):
                continue

            try:
                with open(yaml_file, "r") as f:
                    config = yaml.safe_load(f)

                persona = config.get("persona")
                if persona:
                    self.agent_configs[persona] = config
                    print(f"✅ Loaded agent config: {persona}")
            except Exception as e:
                print(f"❌ Error loading {yaml_file}: {e}")

    async def get_agent_index(self, persona: str) -> Optional[VectorStoreIndex]:
        """Get or load index for agent persona"""
        if persona in self.indices:
            return self.indices[persona]

        # Try to load from Python RAG storage first
        storage_dir = Path(f"../output/python-rag/{persona.lower()}")
        if storage_dir.exists():
            try:
                storage_context = StorageContext.from_defaults(
                    persist_dir=str(storage_dir)
                )
                index = load_index_from_storage(storage_context)
                self.indices[persona] = index
                print(f"🐍 Loaded Python index for {persona}")
                return index
            except Exception as e:
                print(f"❌ Failed to load Python index for {persona}: {e}")

        # Fallback to LlamaCloud storage
        llamacloud_dir = Path(f"../output/llamacloud/{persona.lower()}")
        if llamacloud_dir.exists():
            try:
                storage_context = StorageContext.from_defaults(
                    persist_dir=str(llamacloud_dir)
                )
                index = load_index_from_storage(storage_context)
                self.indices[persona] = index
                print(f"☁️ Loaded LlamaCloud index for {persona}")
                return index
            except Exception as e:
                print(f"❌ Failed to load LlamaCloud index for {persona}: {e}")

        print(f"⚠️  No index found for {persona}")
        return None

    async def analyze_rfe_streaming(
        self, persona: str, rfe_description: str, config: Dict[str, Any]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Simple streaming RFE analysis"""
        print(f"🔍 {persona} starting streaming analysis...")

        prompt = get_prompt(
            PROMPT_NAMES.AGENT_ANALYSIS,
            {
                "rfe_description": rfe_description,
                "context": "No specific knowledge base available.",
                "persona": config.get("name", persona),
            },
        )

        prompt_template = PromptTemplate(prompt)

        # Stream the analysis with events
        async for stream_event in stream_structured_predict_with_events(
            RFEAnalysis, prompt_template, persona
        ):
            yield stream_event

    async def synthesize_analyses(self, analyses: List[Dict]) -> Dict[str, Any]:
        """Simple synthesis"""
        analyses_text = "\n".join(
            [f"{a['persona']}: {a.get('analysis', '')}" for a in analyses]
        )

        prompt = get_prompt(
            PROMPT_NAMES.SYNTHESIS,
            {
                "rfe_description": "RFE analysis",
                "agent_analyses": analyses_text,
            },
        )

        prompt_template = PromptTemplate(prompt)
        response = await stream_structured_predict(
            Synthesis, prompt_template, "SYNTHESIZER"
        )
        return response.model_dump()

    async def generate_component_teams(self, synthesis: Dict) -> List[Dict]:
        """Simple component teams generation"""
        prompt = get_prompt(
            PROMPT_NAMES.COMPONENT_TEAMS,
            {
                "rfe_description": "Feature implementation",
                "synthesis": json.dumps(synthesis, indent=2),
                "agent_analyses": "Based on agent recommendations",
            },
        )

        prompt_template = PromptTemplate(prompt)
        response = await stream_structured_predict(
            ComponentTeamsList, prompt_template, "TEAM_PLANNER"
        )
        return [team.model_dump() for team in response.teams]

    async def generate_architecture(self, synthesis: Dict) -> Dict:
        """Simple architecture generation"""
        prompt = get_prompt(
            PROMPT_NAMES.ARCHITECTURE_DIAGRAM,
            {
                "rfe_description": "System architecture",
                "synthesis": json.dumps(synthesis, indent=2),
                "component_teams": "Development teams",
            },
        )

        prompt_template = PromptTemplate(prompt)
        response = await stream_structured_predict(
            Architecture, prompt_template, "ARCHITECT"
        )
        return response.model_dump()


async def get_agent_personas() -> Dict[str, Dict]:
    """Get all available agent personas"""
    manager = RFEAgentManager()
    return manager.agent_configs
