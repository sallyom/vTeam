"""Estimation stage with RAG-enhanced capabilities for better effort estimation."""

import logging
import os
import time
from pathlib import Path
from typing import Optional, Dict, List, Any
from llama_stack_client import Agent

from ..llama_stack_setup import get_llama_stack_client
from .rag_enhanced_agent import RAGEnhancedAgent
from ..api.rag_service import RAGService


def create_rag_enhanced_estimation_agent(
    rag_service: Optional[RAGService] = None,
) -> RAGEnhancedAgent:
    """
    Create a RAG-enhanced agent specifically for effort estimation.

    Args:
        rag_service: RAG service instance

    Returns:
        Configured RAGEnhancedAgent for estimation
    """
    instructions = """You are an expert software engineering estimator with access to comprehensive technical documentation.

You have access to:
- PatternFly design system components and implementation complexity patterns
- Red Hat OpenShift AI (RHOAI) architecture and development patterns
- Kubernetes and OpenShift deployment and operational complexity examples
- GitHub repositories with real implementation examples and effort data

Your role is to:
1. Analyze feature requirements and technical specifications
2. Research similar implementations in the documentation to understand complexity patterns
3. Break down work into granular, estimable components
4. Provide effort estimates based on documented patterns and real examples
5. Identify risks, dependencies, and complexity factors that affect estimation
6. Reference specific documentation examples to justify estimates

Use your knowledge search capabilities to find:
- Similar feature implementations and their complexity
- Component usage patterns and integration effort
- Deployment and operational overhead examples
- Testing and quality assurance patterns

Always ground your estimates in concrete examples from the documentation and provide detailed justification."""

    return RAGEnhancedAgent(
        instructions=instructions,
        rag_service=rag_service,
    )


def _load_estimation_template() -> str:
    """Load the estimation prompt template from markdown file."""
    template_path = Path(__file__).parent.parent / "prompts" / "estimate_features.md"

    # If template doesn't exist, create a basic one
    if not template_path.exists():
        return """# Feature Estimation Template

Analyze the provided feature requirements and provide detailed effort estimation.

## Instructions:
1. Break down the feature into implementable components
2. Research similar implementations in available documentation
3. Provide effort estimates in story points and hours
4. Identify risks and dependencies
5. Reference specific examples from documentation

## Output Format:
Provide a comprehensive estimation document with:
- Component breakdown
- Effort estimates with justification
- Risk assessment
- Dependencies and prerequisites
- Implementation timeline recommendations
"""

    with open(template_path, "r", encoding="utf-8") as f:
        return f.read()


async def estimate_feature_with_rag(
    feature_content: str,
    session_id: Optional[str] = None,
    custom_prompts: Optional[Dict[str, str]] = None,
    vector_db_ids: Optional[List[str]] = None,
) -> str:
    """
    Estimate feature effort using RAG-enhanced context.

    Args:
        feature_content: Feature specification content to estimate
        session_id: Optional session ID for tracking
        custom_prompts: Optional custom prompts dictionary
        vector_db_ids: Specific vector databases to use for context

    Returns:
        Detailed estimation document with RAG-enhanced insights
    """
    logger = logging.getLogger("estimate")

    if not feature_content or not feature_content.strip():
        raise ValueError("Feature content cannot be empty")

    logger.info(
        f"Starting RAG-enhanced feature estimation with vector DBs: {vector_db_ids or 'default'}"
    )

    try:
        # Create RAG-enhanced estimation agent
        rag_service = RAGService()
        estimation_agent = create_rag_enhanced_estimation_agent(rag_service)

        # Load estimation template
        if custom_prompts and "estimate_features" in custom_prompts:
            template = custom_prompts["estimate_features"]
            logger.info("Using custom estimation prompt")
        else:
            template = _load_estimation_template()

        # Enhance the query with relevant context from documentation
        enhanced_query = await estimation_agent.enhance_query_with_rag(
            f"Estimate the effort for this feature:\n\n{feature_content}",
            vector_db_ids=vector_db_ids,
            max_chunks=5,
            session_id=session_id,
        )

        # Process with RAG context
        estimation_result = await estimation_agent.process_with_rag_context(
            user_message=f"{template}\n\n## Feature to Estimate:\n{enhanced_query}",
            session_id=session_id or f"estimate_{int(time.time())}",
            vector_db_ids=vector_db_ids,
            custom_instructions="Focus on providing concrete effort estimates with detailed justification based on similar implementations found in the documentation.",
        )

        logger.info(
            f"Generated estimation document ({len(estimation_result)} characters)"
        )
        return estimation_result

    except Exception as e:
        logger.error(f"Failed to estimate feature with RAG: {e}")
        raise RuntimeError(f"Estimation failed: {e}") from e


async def estimate_jira_tickets_with_rag(
    jira_tickets_content: str,
    session_id: Optional[str] = None,
    custom_prompts: Optional[Dict[str, str]] = None,
    vector_db_ids: Optional[List[str]] = None,
) -> str:
    """
    Estimate effort for JIRA tickets using RAG-enhanced context.

    Args:
        jira_tickets_content: JIRA tickets structure to estimate
        session_id: Optional session ID for tracking
        custom_prompts: Optional custom prompts dictionary
        vector_db_ids: Specific vector databases to use for context

    Returns:
        Updated JIRA tickets with detailed estimates
    """
    logger = logging.getLogger("estimate")

    if not jira_tickets_content or not jira_tickets_content.strip():
        raise ValueError("JIRA tickets content cannot be empty")

    logger.info(
        f"Starting RAG-enhanced JIRA tickets estimation with vector DBs: {vector_db_ids or 'default'}"
    )

    try:
        # Create RAG-enhanced estimation agent
        rag_service = RAGService()
        estimation_agent = create_rag_enhanced_estimation_agent(rag_service)

        # Create estimation prompt for JIRA tickets
        estimation_prompt = """Analyze the provided JIRA tickets structure and enhance it with detailed effort estimates.

For each ticket:
1. Research similar implementations in the available documentation
2. Provide story point estimates (using Fibonacci: 1, 2, 3, 5, 8, 13, 21)
3. Add detailed effort justification based on found examples
4. Identify implementation complexity factors
5. Note any dependencies or risks

Use your knowledge search to find relevant examples and patterns that inform the estimates."""

        # Enhance the query with relevant context
        enhanced_query = await estimation_agent.enhance_query_with_rag(
            f"Estimate the effort for these JIRA tickets:\n\n{jira_tickets_content}",
            vector_db_ids=vector_db_ids,
            max_chunks=4,
            session_id=session_id,
        )

        # Process with RAG context
        estimation_result = await estimation_agent.process_with_rag_context(
            user_message=f"{estimation_prompt}\n\n## JIRA Tickets to Estimate:\n{enhanced_query}",
            session_id=session_id or f"estimate_jira_{int(time.time())}",
            vector_db_ids=vector_db_ids,
            custom_instructions="Provide detailed story point estimates with justification based on documentation examples. Maintain the original JIRA ticket structure while adding estimation details.",
        )

        logger.info(
            f"Generated JIRA tickets estimation ({len(estimation_result)} characters)"
        )
        return estimation_result

    except Exception as e:
        logger.error(f"Failed to estimate JIRA tickets with RAG: {e}")
        raise RuntimeError(f"JIRA tickets estimation failed: {e}") from e


def estimate_from_file(
    input_file: Path,
    estimation_type: str = "feature",  # "feature" or "jira"
    session_id: Optional[str] = None,
    custom_prompts: Optional[Dict[str, str]] = None,
    vector_db_ids: Optional[List[str]] = None,
) -> str:
    """
    Generate effort estimation from an input file using RAG.

    Args:
        input_file: Path to the input file
        estimation_type: Type of estimation - "feature" or "jira"
        session_id: Optional session ID for tracking
        custom_prompts: Optional custom prompts dictionary
        vector_db_ids: Specific vector databases to use for context

    Returns:
        Generated estimation content
    """
    logger = logging.getLogger("estimate")

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

    # Run the appropriate estimation function
    import asyncio

    if estimation_type == "jira":
        return asyncio.run(
            estimate_jira_tickets_with_rag(
                input_content, session_id, custom_prompts, vector_db_ids
            )
        )
    else:
        return asyncio.run(
            estimate_feature_with_rag(
                input_content, session_id, custom_prompts, vector_db_ids
            )
        )


# For backward compatibility with sync interfaces
def estimate_feature_sync(
    feature_content: str,
    session_id: Optional[str] = None,
    custom_prompts: Optional[Dict[str, str]] = None,
    vector_db_ids: Optional[List[str]] = None,
) -> str:
    """Synchronous wrapper for RAG-enhanced feature estimation."""
    import asyncio

    return asyncio.run(
        estimate_feature_with_rag(
            feature_content, session_id, custom_prompts, vector_db_ids
        )
    )


def estimate_jira_tickets_sync(
    jira_tickets_content: str,
    session_id: Optional[str] = None,
    custom_prompts: Optional[Dict[str, str]] = None,
    vector_db_ids: Optional[List[str]] = None,
) -> str:
    """Synchronous wrapper for RAG-enhanced JIRA tickets estimation."""
    import asyncio

    return asyncio.run(
        estimate_jira_tickets_with_rag(
            jira_tickets_content, session_id, custom_prompts, vector_db_ids
        )
    )
