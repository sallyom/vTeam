import json
import logging
from pathlib import Path
from llama_stack_client import Agent
from llama_stack_setup import get_llama_stack_client

MODEL = "llama3.2:3b"
INSTRUCTIONS = "You are a helpful assistant. Use the available tools to fetch Jira issue details and fill out the refinement spec."


def extract_first_json(text):
    """Extract the first valid JSON object from a string."""
    import re
    from json import JSONDecodeError

    logger = logging.getLogger("refine_feature")
    matches = re.finditer(r"\{.*?\}", text, re.DOTALL)
    for match in matches:
        try:
            logger.debug(f"Trying to parse JSON: {match.group(0)}")
            return json.loads(match.group(0))
        except JSONDecodeError as e:
            logger.debug(f"Failed to parse JSON: {e}")
            continue
    logger.error(f"Could not extract valid JSON from agent output: {text}")
    raise ValueError(f"Could not extract valid JSON from agent output: {text}")


def fetch_jira_issue_with_agent(issue_key: str) -> dict:
    """Fetch Jira issue details using the Llama Stack agent with MCP Atlassian tools."""
    logger = logging.getLogger("refine_feature")
    logger.info(f"Fetching Jira issue {issue_key} with agent...")

    client = get_llama_stack_client()
    agent = Agent(
        client,
        model=MODEL,
        instructions=INSTRUCTIONS,
        tools=["mcp::atlassian"],
    )
    session_id = agent.create_session("refine-feature-session")
    logger.debug(f"Created agent session: {session_id}")

    response = agent.create_turn(
        messages=[
            {
                "role": "user",
                "content": f"Fetch the Jira issue with key {issue_key} and return its summary and description as JSON.",
            }
        ],
        session_id=session_id,
        stream=False,
    )

    content = response.output_message.content
    logger.info(f"Agent response: {content}")
    issue = extract_first_json(content)
    logger.info(f"Extracted issue: {issue}")
    return issue


def fill_template(template: str, issue: dict) -> str:
    """Fill the refinement template with issue details."""
    logger = logging.getLogger("refine_feature")

    summary = issue.get("summary", "")
    description = issue.get("description", "")
    feature_text = f"**{summary}**\n\n{description}"

    logger.debug(f"Filling template with feature_text: {feature_text}")
    return template.replace("{{feature_text}}", feature_text)
