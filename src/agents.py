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

    async def analyze_rfe(
        self, persona: str, rfe_description: str, config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Analyze RFE with specific agent persona"""
        print(f"🔍 {persona} analyzing RFE...")

        # Get relevant context from agent's knowledge base
        index = await self.get_agent_index(persona)
        context = "No specific knowledge base available."

        if index:
            try:
                retriever = index.as_retriever(similarity_top_k=5)
                nodes = retriever.retrieve(rfe_description)
                if nodes:
                    context = "\n\n".join([node.node.get_content() for node in nodes])
                    print(f"📚 Retrieved {len(nodes)} relevant documents for {persona}")
            except Exception as e:
                print(f"❌ Error retrieving context for {persona}: {e}")

        # Use the persona's analysis prompt or fallback
        analysis_prompt_config = config.get("analysisPrompt", {})
        if analysis_prompt_config and "template" in analysis_prompt_config:
            # Use the agent's custom prompt template
            template = analysis_prompt_config["template"]
            prompt = template.replace("{rfe_description}", rfe_description).replace(
                "{context}", context
            )
        else:
            # Use fallback prompt
            prompt = get_prompt(
                PROMPT_NAMES.AGENT_ANALYSIS,
                {
                    "rfe_description": rfe_description,
                    "context": context,
                    "persona": config.get("name", persona),
                },
            )

        try:
            # Create PromptTemplate for structured prediction
            if analysis_prompt_config and "template" in analysis_prompt_config:
                # Use the agent's custom prompt template
                prompt_template = PromptTemplate(analysis_prompt_config["template"])
                response = await Settings.llm.astructured_predict(
                    RFEAnalysis,
                    prompt_template,
                    rfe_description=rfe_description,
                    context=context,
                    persona=persona,
                )
            else:
                # Use fallback prompt template
                prompt_template = PromptTemplate(prompt)
                response = await Settings.llm.astructured_predict(
                    RFEAnalysis, prompt_template
                )

            # Ensure we have a proper RFEAnalysis object and handle validation errors
            if isinstance(response, str):
                # If response is a string, create an RFEAnalysis object
                fallback = RFEAnalysis(
                    analysis=response,
                    persona=persona,
                    estimatedComplexity="UNKNOWN",
                    concerns=[],
                    recommendations=[],
                    requiredComponents=[],
                )
                response = fallback
            elif hasattr(response, "persona"):
                # Ensure persona is set correctly
                response.persona = persona

                # Fix list fields if they came back as strings (common LLM issue)
                if isinstance(response.concerns, str):
                    # Split by bullet points or lines and clean up
                    response.concerns = [
                        line.strip().lstrip("- ").lstrip("• ").strip()
                        for line in response.concerns.split("\n")
                        if line.strip() and line.strip() not in ["- ", "• ", "-", "•"]
                    ]

                if isinstance(response.recommendations, str):
                    response.recommendations = [
                        line.strip().lstrip("- ").lstrip("• ").strip()
                        for line in response.recommendations.split("\n")
                        if line.strip() and line.strip() not in ["- ", "• ", "-", "•"]
                    ]

                if isinstance(response.requiredComponents, str):
                    response.requiredComponents = [
                        line.strip().lstrip("- ").lstrip("• ").strip()
                        for line in response.requiredComponents.split("\n")
                        if line.strip() and line.strip() not in ["- ", "• ", "-", "•"]
                    ]

            print(f"✅ {persona} analysis complete")
            # Convert Pydantic model to dict for backward compatibility
            return response.model_dump()

        except Exception as e:
            print(f"❌ Error generating analysis for {persona}: {e}")
            # Return structured fallback using the Pydantic model
            fallback = RFEAnalysis(
                analysis=f"Error during analysis: {str(e)}",
                persona=persona,
                estimatedComplexity="UNKNOWN",
                concerns=[f"Analysis failed: {str(e)}"],
                recommendations=["Manual review required"],
                requiredComponents=[],
            )
            return fallback.model_dump()

    async def analyze_rfe_streaming(
        self, persona: str, rfe_description: str, config: Dict[str, Any]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream RFE analysis with progress updates"""
        print(f"🔍 {persona} starting streaming analysis...")

        # Yield initial progress
        yield {
            "type": "progress",
            "persona": persona,
            "stage": "initializing",
            "message": f"Starting {config.get('name', persona)} analysis...",
            "progress": 0,
        }

        # Get relevant context from agent's knowledge base
        yield {
            "type": "progress",
            "persona": persona,
            "stage": "searching",
            "message": "Searching knowledge base for relevant context...",
            "progress": 20,
        }

        index = await self.get_agent_index(persona)
        context = "No specific knowledge base available."

        if index:
            try:
                retriever = index.as_retriever(similarity_top_k=5)
                nodes = retriever.retrieve(rfe_description)
                if nodes:
                    context = "\n\n".join([node.node.get_content() for node in nodes])
                    print(f"📚 Retrieved {len(nodes)} relevant documents for {persona}")
                    yield {
                        "type": "progress",
                        "persona": persona,
                        "stage": "context_found",
                        "message": f"Found {len(nodes)} relevant documents",
                        "progress": 40,
                    }
            except Exception as e:
                print(f"❌ Error retrieving context for {persona}: {e}")
                yield {
                    "type": "error",
                    "persona": persona,
                    "message": f"Error retrieving context: {e}",
                    "progress": 30,
                }

        # Yield thinking stage
        yield {
            "type": "progress",
            "persona": persona,
            "stage": "analyzing",
            "message": "Analyzing RFE from specialized perspective...",
            "progress": 60,
            "streaming_type": "reasoning",
        }

        # Use the persona's analysis prompt or fallback
        analysis_prompt_config = config.get("analysisPrompt", {})
        if analysis_prompt_config and "template" in analysis_prompt_config:
            # Use the agent's custom prompt template
            template = analysis_prompt_config["template"]
            prompt = template.replace("{rfe_description}", rfe_description).replace(
                "{context}", context
            )
        else:
            # Use fallback prompt
            prompt = get_prompt(
                PROMPT_NAMES.AGENT_ANALYSIS,
                {
                    "rfe_description": rfe_description,
                    "context": context,
                    "persona": config.get("name", persona),
                },
            )

        # Yield writing stage
        yield {
            "type": "progress",
            "persona": persona,
            "stage": "writing",
            "message": "Writing analysis and recommendations...",
            "progress": 80,
            "streaming_type": "writing",
        }

        try:
            # Create PromptTemplate for structured prediction
            if analysis_prompt_config and "template" in analysis_prompt_config:
                # Use the agent's custom prompt template
                prompt_template = PromptTemplate(analysis_prompt_config["template"])
                response = await Settings.llm.astructured_predict(
                    RFEAnalysis,
                    prompt_template,
                    rfe_description=rfe_description,
                    context=context,
                    persona=persona,
                )
            else:
                # Use fallback prompt template
                prompt_template = PromptTemplate(prompt)
                response = await Settings.llm.astructured_predict(
                    RFEAnalysis, prompt_template
                )

                # Ensure we have a proper RFEAnalysis object and handle validation errors
            if isinstance(response, str):
                # If response is a string, create an RFEAnalysis object
                fallback = RFEAnalysis(
                    analysis=response,
                    persona=persona,
                    estimatedComplexity="UNKNOWN",
                    concerns=[],
                    recommendations=[],
                    requiredComponents=[],
                )
                response = fallback
            elif hasattr(response, "persona"):
                # Ensure persona is set correctly
                response.persona = persona

                # Fix list fields if they came back as strings (common LLM issue)
                if isinstance(response.concerns, str):
                    # Split by bullet points or lines and clean up
                    response.concerns = [
                        line.strip().lstrip("- ").lstrip("• ").strip()
                        for line in response.concerns.split("\n")
                        if line.strip() and line.strip() not in ["- ", "• ", "-", "•"]
                    ]

                if isinstance(response.recommendations, str):
                    response.recommendations = [
                        line.strip().lstrip("- ").lstrip("• ").strip()
                        for line in response.recommendations.split("\n")
                        if line.strip() and line.strip() not in ["- ", "• ", "-", "•"]
                    ]

                if isinstance(response.requiredComponents, str):
                    response.requiredComponents = [
                        line.strip().lstrip("- ").lstrip("• ").strip()
                        for line in response.requiredComponents.split("\n")
                        if line.strip() and line.strip() not in ["- ", "• ", "-", "•"]
                    ]

            print(f"✅ {persona} analysis complete")

            # Yield completion with full analysis
            yield {
                "type": "complete",
                "persona": persona,
                "stage": "completed",
                "message": "Analysis complete",
                "progress": 100,
                "result": response.model_dump(),
            }

        except Exception as e:
            print(f"❌ Error generating analysis for {persona}: {e}")
            # Return structured fallback using the Pydantic model
            fallback = RFEAnalysis(
                analysis=f"Error during analysis: {str(e)}",
                persona=persona,
                estimatedComplexity="UNKNOWN",
                concerns=[f"Analysis failed: {str(e)}"],
                recommendations=["Manual review required"],
                requiredComponents=[],
            )

            # Yield error completion
            yield {
                "type": "error",
                "persona": persona,
                "stage": "failed",
                "message": f"Analysis failed: {str(e)}",
                "progress": 100,
                "result": fallback.model_dump(),
            }

    async def synthesize_analyses(self, analyses: List[Dict]) -> Dict[str, Any]:
        """Synthesize multiple agent analyses"""
        print("🔄 Synthesizing agent analyses...")

        # Format analyses for synthesis
        analyses_text = "\n\n".join(
            [
                f"**{a['persona']}:**\n"
                f"Analysis: {a.get('analysis', 'No analysis')}\n"
                f"Complexity: {a.get('estimatedComplexity', 'UNKNOWN')}\n"
                f"Concerns: {', '.join(a.get('concerns', []))}\n"
                f"Recommendations: {', '.join(a.get('recommendations', []))}"
                for a in analyses
            ]
        )

        # Use synthesis prompt
        synthesis_prompt = get_prompt(
            PROMPT_NAMES.SYNTHESIS,
            {
                "rfe_description": analyses[0].get("rfe_description", "RFE analysis"),
                "agent_analyses": analyses_text,
            },
        )

        try:
            # Create PromptTemplate for structured prediction
            prompt_template = PromptTemplate(synthesis_prompt)
            response = await Settings.llm.astructured_predict(
                Synthesis, prompt_template
            )

            # Ensure we have a proper Synthesis object
            if isinstance(response, str):
                # If response is a string, create a Synthesis object
                fallback = Synthesis(
                    overallComplexity="UNKNOWN",
                    consensusRecommendations=[],
                    criticalRisks=[],
                    requiredCapabilities=[],
                    estimatedTimeline="Unknown",
                    synthesis=response,
                )
                response = fallback

            print("✅ Synthesis complete")
            return response.model_dump()

        except Exception as e:
            print(f"❌ Synthesis error: {e}")
            # Return structured fallback using the Pydantic model
            fallback = Synthesis(
                overallComplexity="UNKNOWN",
                consensusRecommendations=[],
                criticalRisks=[f"Analysis error: {str(e)}"],
                requiredCapabilities=[],
                estimatedTimeline="Unknown",
                synthesis=f"Error during synthesis: {str(e)}",
            )
            return fallback.model_dump()

    async def generate_component_teams(self, synthesis: Dict) -> List[Dict]:
        """Generate component teams from synthesis"""
        try:
            prompt = get_prompt(
                PROMPT_NAMES.COMPONENT_TEAMS,
                {
                    "rfe_description": "Feature implementation",
                    "synthesis": json.dumps(synthesis, indent=2),
                    "agent_analyses": "Based on agent recommendations",
                },
            )

            # Create PromptTemplate for structured prediction
            prompt_template = PromptTemplate(prompt)
            response = await Settings.llm.astructured_predict(
                ComponentTeamsList, prompt_template
            )

            # Ensure we have a proper ComponentTeamsList object
            if isinstance(response, str):
                # If response is a string, create a ComponentTeamsList object with a fallback team
                fallback_team = ComponentTeam(
                    teamName="Development Team",
                    components=["Implementation"],
                    responsibilities=["Feature development"],
                    epicTitle="Feature Implementation",
                    epicDescription="Implement the requested feature",
                )
                response = ComponentTeamsList(teams=[fallback_team])

            # Convert to list of dicts for backward compatibility
            return [team.model_dump() for team in response.teams]

        except Exception as e:
            print(f"❌ Component teams generation error: {e}")
            # Return structured fallback using the Pydantic model
            fallback_team = ComponentTeam(
                teamName="Development Team",
                components=["Implementation"],
                responsibilities=["Feature development"],
                epicTitle="Feature Implementation",
                epicDescription="Implement the requested feature",
            )
            return [fallback_team.model_dump()]

    async def generate_architecture(self, synthesis: Dict) -> Dict:
        """Generate architecture diagram from synthesis"""
        try:
            prompt = get_prompt(
                PROMPT_NAMES.ARCHITECTURE_DIAGRAM,
                {
                    "rfe_description": "System architecture",
                    "synthesis": json.dumps(synthesis, indent=2),
                    "component_teams": "Development teams",
                },
            )

            # Create PromptTemplate for structured prediction
            prompt_template = PromptTemplate(prompt)
            response = await Settings.llm.astructured_predict(
                Architecture, prompt_template
            )

            # Ensure we have a proper Architecture object
            if isinstance(response, str):
                # If response is a string, create an Architecture object
                fallback = Architecture(
                    type="system",
                    mermaidCode="graph TD\n    A[User] --> B[System]\n    B --> C[Database]",
                    description=response,
                    components=[],
                    integrations=[],
                )
                response = fallback

            return response.model_dump()

        except Exception as e:
            print(f"❌ Architecture generation error: {e}")
            # Return structured fallback using the Pydantic model
            fallback = Architecture(
                type="system",
                mermaidCode="graph TD\n    A[User] --> B[System]\n    B --> C[Database]",
                description="Basic system architecture",
                components=[],
                integrations=[],
            )
            return fallback.model_dump()


async def get_agent_personas() -> Dict[str, Dict]:
    """Get all available agent personas"""
    manager = RFEAgentManager()
    return manager.agent_configs
