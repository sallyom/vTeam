import logging
import os
import time
from pathlib import Path
from llama_stack_client import Agent, AgentEventLogger
from rhoai_ai_feature_sizing.llama_stack_setup import get_llama_stack_client
from typing import Optional, Dict, List

from .rag_enhanced_agent import create_rag_enhanced_refinement_agent
from ..api.rag_service import RAGService


def _filter_session_id_from_tool_calls(tool_calls):
    """Filter out session_id from tool call arguments to prevent MCP validation errors."""
    if not tool_calls:
        return tool_calls

    filtered_calls = []
    for call in tool_calls:
        if isinstance(call, dict) and "arguments" in call:
            # Remove session_id from arguments
            filtered_args = {
                k: v for k, v in call["arguments"].items() if k != "session_id"
            }
            filtered_call = call.copy()
            filtered_call["arguments"] = filtered_args
            filtered_calls.append(filtered_call)
        else:
            filtered_calls.append(call)

    return filtered_calls


INSTRUCTIONS = """You are a senior product manager expert at creating RHOAI feature refinement documents. 

You will be provided with real Jira issue data. Use this data to create a comprehensive refinement document following the provided template and examples precisely.

CRITICAL: Do not make up or assume any information about the issue. Use only the provided Jira data.

Create a comprehensive refinement document following the provided template and examples precisely."""


def _load_validation_template() -> str:
    """Load the validation prompt template from markdown file."""
    template_path = Path(__file__).parent.parent / "prompts" / "validate_refinement.md"

    if not template_path.exists():
        raise FileNotFoundError(f"Validation template not found: {template_path}")

    with open(template_path, "r", encoding="utf-8") as f:
        return f.read()


async def generate_refinement_with_agent(
    issue_key: str,
    template: str,
    session_id=None,
    custom_prompts: Optional[Dict[str, str]] = None,
    use_rag: bool = True,
    vector_db_ids: Optional[List[str]] = None,
) -> str:
    """
    Generate a comprehensive refinement document using RAG-enhanced agent.
    Uses LLM-based validation with iteration for quality improvement.

    Args:
        issue_key: JIRA issue key to refine
        template: Refinement template to use
        session_id: Optional session ID for tracking
        custom_prompts: Optional custom prompts dictionary
        use_rag: Whether to use RAG-enhanced agent (default: True)
        vector_db_ids: Specific vector databases to use for RAG context

    Returns:
        Generated refinement document with RAG-enhanced insights
    """
    logger = logging.getLogger("refine_feature")
    INFERENCE_MODEL = os.getenv("INFERENCE_MODEL")

    if not issue_key or not issue_key.strip():
        raise ValueError("Issue key cannot be empty")

    if not template or not template.strip():
        raise ValueError("Template cannot be empty")

    if not INFERENCE_MODEL:
        raise ValueError("INFERENCE_MODEL environment variable must be set")

    logger.info(f"Generating refinement document for Jira issue {issue_key}...")

    try:
        client = get_llama_stack_client()

        # Get Jira data directly through the client
        response = client.tool_runtime.invoke_tool(
            tool_name="jira_get_issue", kwargs={"issue_key": issue_key}
        )

        if response.error_message:
            raise RuntimeError(
                f"Failed to retrieve Jira issue data: {response.error_code} - {response.error_message}"
            )

        try:

            # Llama Stack sometimes returns an array even if the type says otherwise.
            content = response.content
            if isinstance(content, list):
                if not content:
                    raise RuntimeError("Jira response content is an empty list")
                content = content[0]

            # Now extract the text attribute as before
            jira_data = getattr(content, "text", None)
            if jira_data is None:
                raise RuntimeError(
                    "Jira response content does not have a 'text' attribute"
                )
        except Exception as e:
            logger.error(f"Failed to retrieve Jira issue data: {e}")
            raise RuntimeError(f"Failed to retrieve Jira issue data: {e}") from e

        logger.info(
            f"Fetched Jira issue {issue_key}: {jira_data[:500]}{'...' if len(jira_data) > 500 else ''}"
        )

        # Load validation template - use custom prompt if available
        if custom_prompts and "validate_refinement" in custom_prompts:
            validation_template = custom_prompts["validate_refinement"]
            logger.info("Using custom validate_refinement prompt")
        else:
            validation_template = _load_validation_template()

        # Create RAG-enhanced generation agent or fallback to basic agent
        if use_rag:
            logger.info(
                f"Using RAG-enhanced refinement agent with vector DBs: {vector_db_ids or 'default'}"
            )
            rag_service = RAGService()
            rag_agent = create_rag_enhanced_refinement_agent(rag_service)
            generation_agent = await rag_agent.create_agent_with_rag_tools(
                vector_db_ids=vector_db_ids, custom_instructions=INSTRUCTIONS
            )
        else:
            logger.info("Using basic agent (RAG disabled)")
            generation_agent = Agent(
                client,
                model=INFERENCE_MODEL,
                instructions=INSTRUCTIONS,
            )

        # Create validation agent
        validation_agent = Agent(
            client,
            model=INFERENCE_MODEL,
            instructions=validation_template,
        )

        # Generate and iterate on the document
        best_content = None
        best_score = 0.0
        max_iterations = 3
        validation_result = None

        for iteration in range(max_iterations):
            start_time = time.time()

            session_id = generation_agent.create_session(
                f"refine-{issue_key}-iter{iteration}-{int(time.time())}"
            )
            logger.debug(
                f"Created generation session: {session_id} (iteration {iteration + 1})"
            )

            # Create prompt based on iteration
            if iteration == 0:
                # First attempt: use template with Jira data
                prompt = f"""Here is the Jira issue data:
                        ---
                        {jira_data}
                        ---
                        {template.replace("{{issue_key}}", issue_key)}"""
            else:
                # Subsequent attempts: include validation feedback
                prompt = _create_improvement_prompt(
                    issue_key, template, validation_result, jira_data
                )

            # Generate content
            try:
                response = generation_agent.create_turn(
                    messages=[
                        {
                            "role": "user",
                            "content": prompt,
                        }
                    ],
                    session_id=session_id,
                    stream=False,
                )

            except Exception as e:
                logger.error(f"Error creating turn: {e}")
                # Try to continue with next iteration
                continue

            content = response.output_message.content

            duration = time.time() - start_time

            logger.info(
                f"Generated content in {duration:.2f}s (iteration {iteration + 1}, length: {len(content)} chars)"
            )

            # Validate with LLM
            validation_result = _validate_with_llm(validation_agent, content, issue_key)

            logger.info(
                f"Validation score: {validation_result.get('overall_score', 0):.2f}"
            )

            # Track best result
            current_score = validation_result.get("overall_score", 0)
            if current_score > best_score:
                best_score = current_score
                best_content = content

            # Check if we have a passing result
            if validation_result.get("passed", False) and current_score >= 0.8:
                logger.info(
                    f"Document passed validation on iteration {iteration + 1} with score {current_score:.2f}"
                )
                return content

            # Log issues for next iteration
            issues = validation_result.get("issues", [])
            if issues:
                logger.info(
                    f"📋 Found {len(issues)} issues to address in next iteration"
                )
                for issue in issues[:3]:  # Log top 3 issues
                    logger.info(
                        f"  - {issue.get('section', 'General')}: {issue.get('issue', 'N/A')}"
                    )

        # If we didn't get a passing result, return the best attempt
        logger.warning(
            f"⚠️  No iteration achieved passing score. Returning best attempt (score: {best_score:.2f})"
        )
        return best_content or content

    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise RuntimeError(f"Failed to generate refinement document: {e}") from e


def _validate_with_llm(validation_agent: Agent, content: str, issue_key: str) -> dict:
    """Use LLM to validate the generated content quality."""
    logger = logging.getLogger("refine_feature")

    try:
        validation_session = validation_agent.create_session(
            f"validate-{issue_key}-{int(time.time())}"
        )

        validation_prompt = f"""Please evaluate this RHOAI feature refinement document:
                                ---
                                {content}
                                ---
                                Provide your assessment as JSON following the specified format."""

        response = validation_agent.create_turn(
            messages=[{"role": "user", "content": validation_prompt}],
            session_id=validation_session,
            stream=False,
        )

        validation_content = response.output_message.content

        # Extract JSON from response
        result = _extract_validation_json(validation_content)
        logger.debug(f"Validation result: {result}")

        return result

    except Exception as e:
        logger.error(f"LLM validation failed: {e}")
        # Fallback to basic validation
        return _basic_fallback_validation(content)


def _extract_validation_json(content: str) -> dict:
    """Extract JSON validation result from LLM response."""
    import json
    import re

    # Try to find JSON in the response
    json_pattern = r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}"
    matches = re.findall(json_pattern, content, re.DOTALL)

    for match in matches:
        try:
            return json.loads(match)
        except json.JSONDecodeError:
            continue

    # Fallback if no valid JSON found
    return {
        "overall_score": 0.5,
        "passed": False,
        "issues": [
            {"section": "General", "issue": "Could not parse validation response"}
        ],
        "summary": "Validation parsing failed",
    }


def _create_improvement_prompt(
    issue_key: str, template: str, validation_result: dict, jira_data: str
) -> str:
    """Create an improvement prompt based on validation feedback."""
    if validation_result is None:
        # If validation failed, return a basic improvement prompt
        return f"""
Please improve and refine the following document to make it more comprehensive and detailed.

JIRA Issue: {issue_key}
Template: {template}

Original JIRA Data:
{jira_data}

Focus on:
- Adding more technical detail and implementation specifics
- Expanding acceptance criteria and test scenarios
- Including relevant architectural considerations
- Providing clearer business value and user impact descriptions
"""

    issues = validation_result.get("issues", [])

    feedback_text = "\n".join(
        [
            f"- {issue.get('section', 'General')}: {issue.get('issue', 'N/A')}"
            + (f" Suggestion: {issue['suggestion']}" if issue.get("suggestion") else "")
            for issue in issues[:5]  # Top 5 issues
        ]
    )

    return f"""Based on the feedback below, please improve the RHOAI feature refinement document for issue {issue_key}.

            PREVIOUS ISSUES TO ADDRESS:
            {feedback_text}

            STRENGTHS TO MAINTAIN:
            {', '.join(validation_result.get('strengths', []))}

            Here is the Jira issue data:

            ---
            {jira_data}
            ---

            {template.replace("{{issue_key}}", issue_key)}

            Focus on addressing the specific issues mentioned while maintaining the document's strengths. Ensure all content is specific, actionable, and follows the examples provided."""


def _basic_fallback_validation(content: str) -> dict:
    """Basic fallback validation if LLM validation fails."""
    issues = []
    score = 0.7  # Default reasonable score

    required_sections = [
        "# RHOAI Feature Refinement",
        "## **Feature Overview**",
        "## **The Why**",
        "## **Acceptance Criteria**",
    ]

    missing_sections = [
        section for section in required_sections if section not in content
    ]
    if missing_sections:
        issues.extend(
            [
                {"section": section, "issue": "Section missing"}
                for section in missing_sections
            ]
        )
        score -= 0.1 * len(missing_sections)

    return {
        "overall_score": max(0, score),
        "passed": score >= 0.8,
        "issues": issues,
        "summary": "Basic validation (LLM validation unavailable)",
    }


# Synchronous wrapper for backward compatibility
def generate_refinement_with_agent_sync(
    issue_key: str,
    template: str,
    session_id=None,
    custom_prompts: Optional[Dict[str, str]] = None,
    use_rag: bool = True,
    vector_db_ids: Optional[List[str]] = None,
) -> str:
    """
    Synchronous wrapper for RAG-enhanced refinement generation.

    Args:
        issue_key: JIRA issue key to refine
        template: Refinement template to use
        session_id: Optional session ID for tracking
        custom_prompts: Optional custom prompts dictionary
        use_rag: Whether to use RAG-enhanced agent (default: True)
        vector_db_ids: Specific vector databases to use for RAG context

    Returns:
        Generated refinement document with RAG-enhanced insights
    """
    import asyncio

    return asyncio.run(
        generate_refinement_with_agent(
            issue_key, template, session_id, custom_prompts, use_rag, vector_db_ids
        )
    )
