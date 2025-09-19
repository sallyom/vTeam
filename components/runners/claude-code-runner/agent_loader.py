#!/usr/bin/env python3

import yaml
import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)


class AgentPersona:
    """Represents a single agent persona with configuration and prompts"""

    def __init__(self, config: Dict[str, Any]):
        self.name = config.get("name", "")
        self.persona = config.get("persona", "")
        self.role = config.get("role", "")
        self.expertise = config.get("expertise", [])
        self.system_message = config.get("systemMessage", "")
        self.data_sources = config.get("dataSources", [])
        self.analysis_prompt = config.get("analysisPrompt", {})
        self.sample_knowledge = config.get("sampleKnowledge", "")
        self.tools = config.get("tools", [])

    def get_spek_kit_prompt(self, phase: str, user_input: str) -> str:
        """Generate a spec-kit specific prompt for this agent persona"""

        base_prompt = f"""You are {self.name}, {self.system_message}

Your expertise areas: {', '.join(self.expertise)}

You are working on a spec-driven development task using spek-kit.
Current phase: /{phase}
User input: {user_input}

"""

        if phase == "specify":
            return base_prompt + f"""
Please execute the /specify command with these requirements and create a comprehensive specification from your {self.role.lower()} perspective.

Focus on:
- Requirements and acceptance criteria relevant to your domain
- Technical considerations specific to your expertise
- Risks and dependencies you would identify
- Implementation recommendations from your role's viewpoint

Use the spek-kit /specify command to create the specification, then enhance it with your domain expertise.
"""

        elif phase == "plan":
            return base_prompt + f"""
Please execute the /plan command and create a detailed implementation plan from your {self.role.lower()} perspective.

Focus on:
- Technical approach and architecture decisions in your domain
- Implementation phases and dependencies you would manage
- Resource requirements and team considerations
- Risk mitigation strategies specific to your expertise

Use the spek-kit /plan command to create the plan, then enhance it with your domain-specific insights.
"""

        elif phase == "tasks":
            return base_prompt + f"""
Please execute the /tasks command and break down the work into actionable tasks from your {self.role.lower()} perspective.

Focus on:
- Granular tasks specific to your domain and expertise
- Effort estimates and dependencies you would identify
- Quality gates and acceptance criteria for your area
- Team coordination and handoffs you would manage

Use the spek-kit /tasks command to create the task breakdown, then enhance it with your role-specific considerations.
"""

        else:
            return base_prompt + f"Please help with the {phase} phase of this spec-driven development task."


class AgentLoader:
    """Loads and manages agent personas for claude-runner"""

    def __init__(self, agents_dir: Optional[Path] = None):
        if agents_dir is None:
            agents_dir = Path(__file__).parent / "agents"

        self.agents_dir = agents_dir
        self.agents: Dict[str, AgentPersona] = {}
        self.load_agents()

    def load_agents(self):
        """Load all agent configurations from YAML files"""
        if not self.agents_dir.exists():
            logger.warning(f"Agents directory not found: {self.agents_dir}")
            return

        for yaml_file in self.agents_dir.glob("*.yaml"):
            # Skip schema and README files
            if yaml_file.name.startswith("agent-schema") or yaml_file.name == "README.yaml":
                continue

            try:
                with open(yaml_file, 'r') as f:
                    config = yaml.safe_load(f)

                persona_key = config.get("persona")
                if persona_key:
                    agent = AgentPersona(config)
                    self.agents[persona_key] = agent
                    logger.info(f"✅ Loaded agent: {agent.name} ({persona_key})")
                else:
                    logger.warning(f"⚠️  No persona key found in {yaml_file}")

            except Exception as e:
                logger.error(f"❌ Failed to load agent from {yaml_file}: {e}")

    def get_agent(self, persona_key: str) -> Optional[AgentPersona]:
        """Get agent by persona key"""
        return self.agents.get(persona_key)

    def list_agents(self) -> List[Dict[str, str]]:
        """List all available agents with basic info"""
        return [
            {
                "persona": key,
                "name": agent.name,
                "role": agent.role,
                "expertise": agent.expertise
            }
            for key, agent in self.agents.items()
        ]

    def get_agent_prompt(self, persona_key: str, phase: str, user_input: str) -> Optional[str]:
        """Get spec-kit prompt for specific agent and phase"""
        agent = self.get_agent(persona_key)
        if agent:
            return agent.get_spek_kit_prompt(phase, user_input)
        return None

    @classmethod
    def get_default_agents_for_rfe(cls) -> List[str]:
        """Get recommended default agents for RFE workflows"""
        return [
            "ENGINEERING_MANAGER",    # Emma - team capacity and delivery
            "STAFF_ENGINEER",         # Stella - technical implementation
            "PRODUCT_OWNER",          # Olivia - acceptance criteria and value
            "TEAM_LEAD"               # Lee - team coordination
        ]

    @classmethod
    def persona_key_to_filename(cls, persona_key: str) -> str:
        """Convert persona key to expected filename"""
        # Convert from ENGINEERING_MANAGER to engineering_manager
        return persona_key.lower().replace("_", "_")


# Global instance for easy access
agent_loader = AgentLoader()


def get_agent_loader() -> AgentLoader:
    """Get the global agent loader instance"""
    return agent_loader


def list_available_agents() -> List[Dict[str, str]]:
    """Convenience function to list available agents"""
    return agent_loader.list_agents()


def get_agent_prompt_for_phase(persona_key: str, phase: str, user_input: str) -> Optional[str]:
    """Convenience function to get agent prompt for spec-kit phase"""
    return agent_loader.get_agent_prompt(persona_key, phase, user_input)


if __name__ == "__main__":
    # Test the agent loader
    logging.basicConfig(level=logging.INFO)

    loader = AgentLoader()

    print(f"Loaded {len(loader.agents)} agents:")
    for persona, agent in loader.agents.items():
        print(f"  - {agent.name} ({persona}): {agent.role}")

    # Test prompt generation
    if "ENGINEERING_MANAGER" in loader.agents:
        prompt = loader.get_agent_prompt(
            "ENGINEERING_MANAGER",
            "specify",
            "Build a user authentication system"
        )
        print(f"\nSample prompt for Engineering Manager /specify:\n{prompt[:200]}...")