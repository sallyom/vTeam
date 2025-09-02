from dotenv import load_dotenv
from typing import Dict, List, Any, Optional
import json

from llama_index.core.workflow import Event, StartEvent, StopEvent, Workflow, step
from llama_index.core.settings import Settings

from src.agents import RFEAgentManager, get_agent_personas
from src.settings import init_settings


class RFEAnalysisEvent(Event):
    rfe_description: str
    chat_history: List[Dict] = []


class AgentAnalysisCompleteEvent(Event):
    persona: str
    analysis: Dict[str, Any]


class AllAnalysesCompleteEvent(Event):
    analyses: List[Dict[str, Any]]
    rfe_description: str


class SynthesisCompleteEvent(Event):
    synthesis: Dict[str, Any]
    analyses: List[Dict[str, Any]]
    rfe_description: str


class RFEWorkflow(Workflow):
    """Multi-agent RFE analysis workflow for RHOAI"""

    def __init__(self):
        super().__init__()
        self.agent_manager = RFEAgentManager()
        self.analyses = []
        self.rfe_description = ""

    @step
    async def start_analysis(self, ev: StartEvent) -> RFEAnalysisEvent:
        """Begin RFE analysis from user input"""
        # Extract user message and chat history
        user_msg = ev.get("user_msg", "")
        chat_history = ev.get("chat_history", [])

        self.rfe_description = user_msg
        self.analyses = []  # Reset for new analysis

        print(f"🚀 Starting RFE analysis: {user_msg[:100]}...")
        return RFEAnalysisEvent(rfe_description=user_msg, chat_history=chat_history)

    @step
    async def analyze_with_agents(
        self, ev: RFEAnalysisEvent
    ) -> AgentAnalysisCompleteEvent:
        """Analyze RFE with first available agent persona"""
        print("🤖 Running agent analysis...")

        agent_personas = await get_agent_personas()

        if not agent_personas:
            print("⚠️ No agent personas found, using default analysis")
            # Create a default analysis if no agents are configured
            default_analysis = {
                "analysis": f"Technical analysis of: {ev.rfe_description}",
                "persona": "DEFAULT",
                "estimatedComplexity": "MEDIUM",
                "concerns": ["No specific agent personas configured"],
                "recommendations": ["Configure agent personas for detailed analysis"],
                "requiredComponents": ["Development team"],
                "rfe_description": ev.rfe_description,
            }
            return AgentAnalysisCompleteEvent(
                persona="DEFAULT", analysis=default_analysis
            )
        else:
            # Analyze with first configured agent for now
            persona_key = list(agent_personas.keys())[0]
            persona_config = agent_personas[persona_key]
            print(f"🔍 {persona_key} analyzing...")

            try:
                analysis = await self.agent_manager.analyze_rfe(
                    persona_key, ev.rfe_description, persona_config
                )

                # Add RFE description to analysis for later use
                analysis["rfe_description"] = ev.rfe_description

                return AgentAnalysisCompleteEvent(
                    persona=persona_key, analysis=analysis
                )
            except Exception as e:
                print(f"❌ Error with {persona_key}: {e}")
                # Create error analysis
                error_analysis = {
                    "analysis": f"Analysis failed: {str(e)}",
                    "persona": persona_key,
                    "estimatedComplexity": "UNKNOWN",
                    "concerns": [f"Agent analysis failed: {str(e)}"],
                    "recommendations": ["Manual review required"],
                    "requiredComponents": [],
                    "rfe_description": ev.rfe_description,
                }
                return AgentAnalysisCompleteEvent(
                    persona=persona_key, analysis=error_analysis
                )

    @step
    async def collect_analyses(
        self, ev: AgentAnalysisCompleteEvent
    ) -> AllAnalysesCompleteEvent:
        """Collect agent analysis"""
        analysis = {"persona": ev.persona, **ev.analysis}

        print(f"✅ Collected analysis from {ev.persona}")
        return AllAnalysesCompleteEvent(
            analyses=[analysis],
            rfe_description=ev.analysis.get("rfe_description", self.rfe_description),
        )

    @step
    async def synthesize_analyses(
        self, ev: AllAnalysesCompleteEvent
    ) -> SynthesisCompleteEvent:
        """Synthesize all analyses into comprehensive output"""
        print("🔄 Synthesizing agent analyses...")

        try:
            synthesis = await self.agent_manager.synthesize_analyses(ev.analyses)

            return SynthesisCompleteEvent(
                synthesis=synthesis,
                analyses=ev.analyses,
                rfe_description=ev.rfe_description,
            )
        except Exception as e:
            print(f"❌ Synthesis error: {e}")
            # Fallback synthesis
            fallback_synthesis = {
                "overallComplexity": "MEDIUM",
                "consensusRecommendations": ["Detailed technical analysis required"],
                "criticalRisks": ["Analysis synthesis failed"],
                "requiredCapabilities": ["Development team"],
                "estimatedTimeline": "Unknown",
                "synthesis_error": str(e),
            }

            return SynthesisCompleteEvent(
                synthesis=fallback_synthesis,
                analyses=ev.analyses,
                rfe_description=ev.rfe_description,
            )

    @step
    async def generate_deliverables(self, ev: SynthesisCompleteEvent) -> StopEvent:
        """Generate final deliverables (component teams, architecture, etc.)"""
        print("📋 Generating project deliverables...")

        try:
            # Generate component teams
            component_teams = await self.agent_manager.generate_component_teams(
                ev.synthesis
            )

            print(f"🔍 Component teams: {component_teams}")

            # Generate architecture
            architecture = await self.agent_manager.generate_architecture(ev.synthesis)

            print(f"🔍 Architecture: {architecture}")

            # Create comprehensive final output
            final_output = {
                "rfe_description": ev.rfe_description,
                "agent_analyses": ev.analyses,
                "synthesis": ev.synthesis,
                "component_teams": component_teams,
                "architecture": architecture,
                "summary": self._create_summary(ev.synthesis, ev.analyses),
                "next_steps": self._create_next_steps(ev.synthesis),
            }

            print("🎉 RFE analysis workflow complete!")
            return StopEvent(result=final_output)

        except Exception as e:
            print(f"❌ Deliverables generation error: {e}")

            # Minimal fallback output
            fallback_output = {
                "rfe_description": ev.rfe_description,
                "agent_analyses": ev.analyses,
                "synthesis": ev.synthesis,
                "summary": f"RFE Analysis Complete (with errors: {str(e)})",
                "next_steps": ["Manual review of analysis required"],
                "error": str(e),
            }

            return StopEvent(result=fallback_output)

    def _create_summary(self, synthesis: Dict, analyses: List[Dict]) -> str:
        """Create a human-readable summary"""
        complexity = synthesis.get("overallComplexity", "UNKNOWN")
        timeline = synthesis.get("estimatedTimeline", "Unknown")
        agents_count = len(analyses)

        return f"""# RFE Analysis Summary

**Complexity Level:** {complexity}
**Estimated Timeline:** {timeline}
**Agents Consulted:** {agents_count}

## Key Insights
{synthesis.get('synthesis', 'Analysis completed with multiple expert perspectives.')}

## Consensus Recommendations
{chr(10).join([f"• {rec}" for rec in synthesis.get('consensusRecommendations', [])])}

## Critical Risks
{chr(10).join([f"• {risk}" for risk in synthesis.get('criticalRisks', [])])}
"""

    def _create_next_steps(self, synthesis: Dict) -> List[str]:
        """Create actionable next steps"""
        next_steps = [
            "Review agent analyses and synthesis",
            "Validate technical requirements",
            "Plan implementation approach",
        ]

        # Add complexity-specific steps
        complexity = synthesis.get("overallComplexity", "MEDIUM")
        if complexity in ["HIGH", "VERY_HIGH"]:
            next_steps.extend(
                [
                    "Conduct detailed technical design session",
                    "Identify potential risks and mitigation strategies",
                    "Plan phased implementation approach",
                ]
            )

        if synthesis.get("criticalRisks"):
            next_steps.append("Address identified critical risks")

        return next_steps


def create_workflow() -> RFEWorkflow:
    """Initialize and return the RFE workflow"""
    load_dotenv()
    init_settings()
    return RFEWorkflow()


# Export for LlamaDeploy
workflow = create_workflow()
