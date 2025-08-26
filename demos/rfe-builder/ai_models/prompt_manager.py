"""
Prompt Management System for RFE Builder
Hybrid approach: Enum-based mapping with workflow-aware templates
"""

import os
from pathlib import Path
from typing import Any, Dict, Optional

import yaml

from data.rfe_models import RFE, AgentRole


class PromptManager:
    """Centralized prompt template management with cost optimization"""

    def __init__(self, prompts_dir: Optional[Path] = None):
        if prompts_dir is None:
            # Default to prompts/ directory relative to this file
            self.prompts_dir = Path(__file__).parent.parent / "prompts"
        else:
            self.prompts_dir = Path(prompts_dir)

        self.templates = {}
        self._load_all_templates()

        # Workflow step to agent/task mapping
        self.workflow_step_mapping = {
            1: (AgentRole.PARKER_PM, "prioritization"),
            2: (AgentRole.ARCHIE_ARCHITECT, "technical_review"),
            3: (AgentRole.STELLA_STAFF_ENGINEER, "completeness_check"),
            4: (AgentRole.ARCHIE_ARCHITECT, "acceptance_criteria"),
            5: (AgentRole.STELLA_STAFF_ENGINEER, "final_decision"),
            6: (AgentRole.PARKER_PM, "communication"),
            7: (AgentRole.DEREK_DELIVERY_OWNER, "ticket_creation"),
        }

    def _load_all_templates(self):
        """Load all prompt templates from the prompts directory"""
        if not self.prompts_dir.exists():
            print(f"Warning: Prompts directory {self.prompts_dir} does not exist")
            return

        agents_dir = self.prompts_dir / "agents"
        if not agents_dir.exists():
            print(f"Warning: Agents directory {agents_dir} does not exist")
            return

        for agent_role in AgentRole:
            agent_name = self._get_agent_dir_name(agent_role)
            agent_dir = agents_dir / agent_name

            if agent_dir.exists():
                self.templates[agent_role] = {}
                # Load all YAML files in the agent directory
                for yaml_file in agent_dir.glob("*.yaml"):
                    task_name = yaml_file.stem
                    try:
                        with open(yaml_file, "r") as f:
                            template_data = yaml.safe_load(f)
                            self.templates[agent_role][task_name] = template_data
                    except Exception as e:
                        print(f"Error loading template {yaml_file}: {e}")

    def _get_agent_dir_name(self, agent_role: AgentRole) -> str:
        """Convert AgentRole enum to directory name"""
        return agent_role.value.lower()

    def get_agent_prompt(
        self, agent: AgentRole, context: str, rfe: Optional[RFE] = None
    ) -> Dict[str, Any]:
        """
        Get appropriate prompt template for an agent

        Args:
            agent: The agent role requesting the prompt
            context: The task context (e.g., 'prioritization', 'review')
            rfe: Optional RFE object for workflow-aware prompting

        Returns:
            Dictionary containing prompt template with system, user, and metadata
        """
        # First try workflow-aware prompting if RFE is provided
        if rfe and rfe.current_step and rfe.current_step in self.workflow_step_mapping:
            workflow_agent, workflow_task = self.workflow_step_mapping[rfe.current_step]
            if workflow_agent == agent:
                # Use workflow-specific template if available
                step_template_name = f"step{rfe.current_step}_{workflow_task}"
                if (
                    agent in self.templates
                    and step_template_name in self.templates[agent]
                ):
                    template = self.templates[agent][step_template_name].copy()
                    template["workflow_aware"] = True
                    return template

        # Fallback to general context-based template
        if agent in self.templates and context in self.templates[agent]:
            template = self.templates[agent][context].copy()
            template["workflow_aware"] = False
            return template

        # Final fallback - return a basic template structure
        return {
            "system": (
                f"You are {agent.value.replace('_', ' ').title()}, "
                "assisting with RFE workflow."
            ),
            "user": "Please help with the following RFE task: {context}",
            "context": context,
            "workflow_aware": False,
            "metadata": {"agent": agent.value, "task": context, "fallback": True},
        }

    def get_workflow_prompt(self, rfe: RFE) -> Optional[Dict[str, Any]]:
        """Get the appropriate prompt for the current workflow step"""
        if rfe.current_step not in self.workflow_step_mapping:
            return None

        agent, task = self.workflow_step_mapping[rfe.current_step]
        return self.get_agent_prompt(agent, task, rfe)

    def format_prompt(self, template: Dict[str, Any], **kwargs) -> Dict[str, str]:
        """
        Format prompt template with provided context variables

        Args:
            template: Template dictionary from get_agent_prompt
            **kwargs: Context variables for template formatting

        Returns:
            Formatted prompt with system and user messages
        """
        formatted = {}

        for key in ["system", "user"]:
            if key in template:
                try:
                    formatted[key] = template[key].format(**kwargs)
                except KeyError as e:
                    print(f"Warning: Missing template variable {e} in {key} prompt")
                    formatted[key] = template[
                        key
                    ]  # Return unformatted if variables missing

        # Include metadata
        formatted["metadata"] = template.get("metadata", {})
        formatted["workflow_aware"] = template.get("workflow_aware", False)

        return formatted

    def list_available_templates(self) -> Dict[str, list]:
        """List all available templates by agent"""
        available = {}
        for agent_role, templates in self.templates.items():
            available[agent_role.value] = list(templates.keys())
        return available

    def validate_templates(self) -> Dict[str, list]:
        """Validate all templates and return any issues"""
        issues = {}

        for agent_role, templates in self.templates.items():
            agent_issues = []
            for template_name, template_data in templates.items():
                # Check required fields
                if "system" not in template_data:
                    agent_issues.append(f"{template_name}: Missing 'system' field")
                if "user" not in template_data:
                    agent_issues.append(f"{template_name}: Missing 'user' field")

            if agent_issues:
                issues[agent_role.value] = agent_issues

        return issues
