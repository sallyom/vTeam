import logging
import os
import time
from pathlib import Path
from llama_stack_client import Agent
from rhoai_ai_feature_sizing.llama_stack_setup import get_llama_stack_client


INSTRUCTIONS = "You are a senior product manager expert at creating RHOAI feature refinement documents. Follow the provided template and examples precisely."


def _load_validation_template() -> str:
    """Load the validation prompt template from markdown file."""
    template_path = Path(__file__).parent.parent / "prompts" / "validate_refinement.md"

    if not template_path.exists():
        raise FileNotFoundError(f"Validation template not found: {template_path}")

    with open(template_path, "r", encoding="utf-8") as f:
        return f.read()


def generate_refinement_with_agent(issue_key: str, template: str) -> str:
    """
    Generate a comprehensive refinement document using the Llama Stack agent.
    Uses LLM-based validation with iteration for quality improvement.
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

        # Load validation template
        validation_template = _load_validation_template()

        # Create generation agent
        generation_agent = Agent(
            client,
            model=INFERENCE_MODEL,
            instructions=INSTRUCTIONS,
            tools=["mcp::atlassian"],
        )

        # Create validation agent
        validation_agent = Agent(
            client,
            model=INFERENCE_MODEL,
            instructions=validation_template,
            tools=[],
        )

        # Generate and iterate on the document
        best_content = None
        best_score = 0.0
        max_iterations = 3

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
                # First attempt: use template directly
                prompt = template.replace("{{issue_key}}", issue_key)
            else:
                # Subsequent attempts: include validation feedback
                prompt = _create_improvement_prompt(
                    issue_key, template, validation_result
                )

            # Generate content
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
                    f"✅ Document passed validation on iteration {iteration + 1} with score {current_score:.2f}"
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
    issue_key: str, template: str, validation_result: dict
) -> str:
    """Create an improvement prompt based on validation feedback."""
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
