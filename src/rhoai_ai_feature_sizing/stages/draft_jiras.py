import logging
import os
import time
from pathlib import Path
from llama_stack_client import Agent
from rhoai_ai_feature_sizing.llama_stack_setup import get_llama_stack_client


INSTRUCTIONS = "You are a senior Agile coach and technical lead expert at breaking down RHOAI features into implementable Jira tickets. Follow the provided template and examples precisely."


def _load_validation_template() -> str:
    """Load the validation prompt template from markdown file."""
    template_path = Path(__file__).parent.parent / "prompts" / "validate_jira_draft.md"

    if not template_path.exists():
        raise FileNotFoundError(f"Validation template not found: {template_path}")

    with open(template_path, "r", encoding="utf-8") as f:
        return f.read()


def _load_draft_template() -> str:
    """Load the draft jiras prompt template from markdown file."""
    template_path = Path(__file__).parent.parent / "prompts" / "draft_jiras.md"

    if not template_path.exists():
        raise FileNotFoundError(f"Draft template not found: {template_path}")

    with open(template_path, "r", encoding="utf-8") as f:
        return f.read()


def generate_jira_structure_with_agent(
    input_content: str, soft_mode: bool = True
) -> str:
    """
    Generate a comprehensive Jira tickets structure using the Llama Stack agent.
    Uses LLM-based validation with iteration for quality improvement.

    Args:
        input_content: The content from refined or epics document
        soft_mode: If True, only generate ticket structure without creating actual Jira tickets
    """
    logger = logging.getLogger("draft_jiras")
    INFERENCE_MODEL = os.getenv("INFERENCE_MODEL")

    if not input_content or not input_content.strip():
        raise ValueError("Input content cannot be empty")

    if not INFERENCE_MODEL:
        raise ValueError("INFERENCE_MODEL environment variable must be set")

    logger.info(f"Generating Jira tickets structure (soft_mode: {soft_mode})...")

    try:
        client = get_llama_stack_client()

        # Load templates
        draft_template = _load_draft_template()
        validation_template = _load_validation_template()

        # Create generation agent
        generation_agent = Agent(
            client,
            model=INFERENCE_MODEL,
            instructions=INSTRUCTIONS,
            tools=(
                ["mcp::atlassian"] if not soft_mode else []
            ),  # Only use Jira tools if not in soft mode
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
                f"draft-jiras-iter{iteration}-{int(time.time())}"
            )
            logger.debug(
                f"Created generation session: {session_id} (iteration {iteration + 1})"
            )

            # Create prompt based on iteration
            if iteration == 0:
                # First attempt: use template with input content
                prompt = _create_initial_prompt(
                    draft_template, input_content, soft_mode
                )
            else:
                # Subsequent attempts: include validation feedback
                prompt = _create_improvement_prompt(
                    draft_template, input_content, validation_result, soft_mode
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
                f"Generated tickets structure in {duration:.2f}s (iteration {iteration + 1}, length: {len(content)} chars)"
            )

            # Validate with LLM
            validation_result = _validate_with_llm(validation_agent, content)

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
                    f"✅ Tickets structure passed validation on iteration {iteration + 1} with score {current_score:.2f}"
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
        raise RuntimeError(f"Failed to generate Jira tickets structure: {e}") from e


def _create_initial_prompt(template: str, input_content: str, soft_mode: bool) -> str:
    """Create the initial prompt for generating Jira tickets structure."""
    mode_instruction = (
        "**IMPORTANT: Use SOFT MODE - Do NOT create actual Jira tickets. Only generate the ticket structure definition.**"
        if soft_mode
        else "**Note: After generating the structure, create actual Jira tickets using the MCP tools.**"
    )

    return f"""{mode_instruction}

{template}

## Input Document

Here is the RHOAI feature document to analyze:

---
{input_content}
---

Analyze this document thoroughly and generate the complete Jira tickets structure following the template and examples above."""


def _create_improvement_prompt(
    template: str, input_content: str, validation_result: dict, soft_mode: bool
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

    mode_instruction = (
        "**IMPORTANT: Use SOFT MODE - Do NOT create actual Jira tickets. Only generate the ticket structure definition.**"
        if soft_mode
        else "**Note: After generating the structure, create actual Jira tickets using the MCP tools.**"
    )

    return f"""Based on the feedback below, please improve the Jira tickets structure.

{mode_instruction}

PREVIOUS ISSUES TO ADDRESS:
{feedback_text}

STRENGTHS TO MAINTAIN:
{', '.join(validation_result.get('strengths', []))}

{template}

## Input Document

Here is the RHOAI feature document to analyze:

---
{input_content}
---

Focus on addressing the specific issues mentioned while maintaining the structure's strengths. Ensure all tickets are implementable, well-estimated, and have clear dependencies."""


def _validate_with_llm(validation_agent: Agent, content: str) -> dict:
    """Use LLM to validate the generated Jira tickets structure quality."""
    logger = logging.getLogger("draft_jiras")

    try:
        validation_session = validation_agent.create_session(
            f"validate-jiras-{int(time.time())}"
        )

        validation_prompt = f"""Please evaluate this Jira tickets structure:

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


def _basic_fallback_validation(content: str) -> dict:
    """Basic fallback validation if LLM validation fails."""
    issues = []
    score = 0.7  # Default reasonable score

    required_sections = [
        "# Jira Tickets Structure",
        "## Epic Structure",
        "### Epic",
        "#### Child Stories:",
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

    # Check for story points in Fibonacci sequence
    if any(
        invalid_point in content
        for invalid_point in [
            "4 points",
            "6 points",
            "7 points",
            "9 points",
            "10 points",
            "11 points",
            "12 points",
        ]
    ):
        issues.append(
            {
                "section": "Estimation",
                "issue": "Non-Fibonacci story points found",
                "suggestion": "Use Fibonacci sequence: 1, 2, 3, 5, 8, 13, 21",
            }
        )
        score -= 0.1

    return {
        "overall_score": max(0, score),
        "passed": score >= 0.8,
        "issues": issues,
        "summary": "Basic validation (LLM validation unavailable)",
    }


def draft_jiras_from_file(input_file: Path, soft_mode: bool = True) -> str:
    """
    Generate Jira tickets structure from an input file.

    Args:
        input_file: Path to the input file (refined or epics document)
        soft_mode: If True, only generate ticket structure without creating actual Jira tickets

    Returns:
        Generated Jira tickets structure content
    """
    logger = logging.getLogger("draft_jiras")

    if not input_file.exists():
        raise FileNotFoundError(f"Input file not found: {input_file}")

    logger.info(f"Reading input from {input_file}")
    try:
        with open(input_file, "r", encoding="utf-8") as f:
            input_content = f.read()
    except Exception as e:
        raise RuntimeError(f"Failed to read input file: {e}") from e

    if not input_content.strip():
        raise ValueError("Input file is empty")

    return generate_jira_structure_with_agent(input_content, soft_mode)
