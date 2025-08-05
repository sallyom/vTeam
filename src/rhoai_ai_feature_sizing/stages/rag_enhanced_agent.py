"""RAG-enhanced agent functionality for improved knowledge-based processing."""

import logging
import os
from typing import List, Dict, Any, Optional
from llama_stack_client import Agent, LlamaStackClient

from ..llama_stack_setup import get_llama_stack_client
from ..api.rag_service import RAGService
from ..api.schemas import RAGQueryRequest

# Load inference model from environment
INFERENCE_MODEL = os.getenv("INFERENCE_MODEL")

# Validate environment variables
if not INFERENCE_MODEL:
    raise ValueError("INFERENCE_MODEL environment variable must be set")


class RAGEnhancedAgent:
    """Agent with RAG capabilities for knowledge-enhanced processing."""

    def __init__(
        self,
        model: str = None,
        instructions: str = "You are a helpful assistant with access to documentation and knowledge bases.",
        rag_service: Optional[RAGService] = None,
    ):
        """
        Initialize RAG-enhanced agent.

        Args:
            model: The LLM model to use (defaults to INFERENCE_MODEL env var)
            instructions: Base instructions for the agent
            rag_service: RAG service instance for document retrieval
        """
        self.client = get_llama_stack_client()
        self.model = model or INFERENCE_MODEL
        self.base_instructions = instructions
        self.rag_service = rag_service or RAGService()
        self.logger = logging.getLogger("RAGEnhancedAgent")

        # Default vector databases to search (can be customized)
        self.default_vector_dbs = ["patternfly_docs", "rhoai_docs", "kubernetes_docs"]

    async def create_agent_with_rag_tools(
        self,
        vector_db_ids: Optional[List[str]] = None,
        custom_instructions: Optional[str] = None,
    ) -> Agent:
        """
        Create an agent with RAG tools configured.

        Args:
            vector_db_ids: Specific vector databases to use for RAG
            custom_instructions: Additional instructions for the agent

        Returns:
            Configured Agent instance with RAG capabilities
        """
        # Use provided vector DBs or defaults
        if vector_db_ids is None:
            vector_db_ids = self.default_vector_dbs

        # Combine base instructions with custom ones
        instructions = self.base_instructions
        if custom_instructions:
            instructions = (
                f"{self.base_instructions}\n\nAdditional context: {custom_instructions}"
            )

        # Create agent with RAG tool
        agent = Agent(
            self.client,
            model=self.model,
            instructions=instructions,
            tools=[
                {
                    "name": "builtin::rag/knowledge_search",
                    "args": {
                        "vector_db_ids": vector_db_ids,
                        "query_config": {
                            "chunk_size_in_tokens": 512,
                            "chunk_overlap_in_tokens": 0,
                            "chunk_template": "Result {index}\nContent: {chunk.content}\nMetadata: {metadata}\n",
                        },
                    },
                }
            ],
        )

        return agent

    async def enhance_query_with_rag(
        self,
        query: str,
        vector_db_ids: Optional[List[str]] = None,
        max_chunks: int = 3,
        session_id: Optional[str] = None,
    ) -> str:
        """
        Enhance a query with relevant context from RAG.

        Args:
            query: Original query
            vector_db_ids: Vector databases to search
            max_chunks: Maximum number of context chunks to include

        Returns:
            Enhanced query with context
        """
        try:
            # Use provided vector DBs or defaults
            if vector_db_ids is None:
                vector_db_ids = self.default_vector_dbs

            # Query RAG system for relevant context
            rag_request = RAGQueryRequest(
                vector_db_ids=vector_db_ids,
                query=query,
                max_chunks=max_chunks,
            )

            # Convert session_id string to UUID if provided
            session_uuid = None
            if session_id:
                try:
                    import uuid

                    session_uuid = uuid.UUID(session_id)
                except ValueError:
                    self.logger.warning(f"Invalid session ID format: {session_id}")

            rag_response = await self.rag_service.query_rag(rag_request, session_uuid)

            # If we got relevant context, enhance the query
            if rag_response.chunks:
                self.logger.info("=== RAG CONTEXT ENHANCEMENT ===")
                self.logger.info(f"Original query: '{query}'")
                self.logger.info(
                    f"Retrieved {len(rag_response.chunks)} chunks for context enhancement"
                )

                context_sections = []
                for i, chunk in enumerate(rag_response.chunks[:max_chunks]):
                    if isinstance(chunk, dict) and "content" in chunk:
                        content = chunk["content"]
                        chunk_metadata = chunk.get("metadata", {})
                        doc_id = chunk_metadata.get("document_id", "Unknown")
                        score = chunk_metadata.get("score", "N/A")

                        self.logger.info(
                            f"Adding context chunk {i+1} from document '{doc_id}' (score: {score})"
                        )
                        context_sections.append(f"Context {i+1}:\n{content}")
                    elif isinstance(chunk, str):
                        self.logger.info(f"Adding context chunk {i+1} (raw string)")
                        context_sections.append(f"Context {i+1}:\n{chunk}")

                if context_sections:
                    context = "\n\n".join(context_sections)
                    enhanced_query = f"""Based on the following context information, please answer this query: {query}

Context Information:
{context}

Query: {query}

Please provide a comprehensive answer based on the context provided above."""

                    self.logger.info(
                        f"Enhanced query with {len(context_sections)} context chunks from {len(rag_response.vector_dbs_searched)} vector databases"
                    )
                    self.logger.info(
                        f"Enhanced query length: {len(enhanced_query)} characters"
                    )
                    self.logger.info("=== CONTEXT ENHANCEMENT COMPLETE ===")
                    return enhanced_query

            # If no relevant context found, return original query
            self.logger.info("=== NO RAG CONTEXT FOUND ===")
            self.logger.info(f"No relevant context found for query: '{query}'")
            self.logger.info("Returning original query without enhancement")
            return query

        except Exception as e:
            self.logger.error(f"Failed to enhance query with RAG: {e}")
            return query

    async def process_with_rag_context(
        self,
        user_message: str,
        session_id: str,
        vector_db_ids: Optional[List[str]] = None,
        custom_instructions: Optional[str] = None,
    ) -> str:
        """
        Process a user message with RAG-enhanced context.

        Args:
            user_message: User's input message
            session_id: Session ID for tracking
            vector_db_ids: Vector databases to use for context
            custom_instructions: Additional instructions for the agent

        Returns:
            Agent response with RAG-enhanced knowledge
        """
        try:
            # Create RAG-enhanced agent
            agent = await self.create_agent_with_rag_tools(
                vector_db_ids=vector_db_ids, custom_instructions=custom_instructions
            )

            # Create session for the agent
            agent_session_id = agent.create_session(f"rag_session_{session_id}")

            # Process the message with RAG context
            response = agent.create_turn(
                messages=[{"role": "user", "content": user_message}],
                session_id=agent_session_id,
                stream=False,
            )

            # Extract response content
            if hasattr(response, "output_message") and response.output_message:
                return response.output_message.content
            else:
                return "No response generated"

        except Exception as e:
            self.logger.error(f"Failed to process with RAG context: {e}")
            return f"Error processing request: {str(e)}"

    async def get_available_knowledge_bases(self) -> List[Dict[str, Any]]:
        """
        Get information about available knowledge bases.

        Returns:
            List of available vector databases with their metadata
        """
        try:
            response = await self.rag_service.list_vector_databases()
            return [
                {
                    "vector_db_id": vdb.vector_db_id,
                    "name": vdb.name,
                    "description": vdb.description,
                    "use_case": vdb.use_case,
                    "document_count": vdb.document_count,
                    "total_chunks": vdb.total_chunks,
                }
                for vdb in response.vector_dbs
            ]
        except Exception as e:
            self.logger.error(f"Failed to get available knowledge bases: {e}")
            return []

    async def suggest_relevant_knowledge_bases(self, query: str) -> List[str]:
        """
        Suggest relevant knowledge bases based on query content.

        Args:
            query: User query to analyze

        Returns:
            List of suggested vector database IDs
        """
        query_lower = query.lower()
        suggestions = []

        # Simple keyword-based suggestions (could be enhanced with ML)
        if any(
            keyword in query_lower
            for keyword in ["patternfly", "pf", "ui", "component", "design"]
        ):
            suggestions.append("patternfly_docs")

        if any(
            keyword in query_lower
            for keyword in ["rhoai", "openshift", "ai", "ml", "model"]
        ):
            suggestions.append("rhoai_docs")

        if any(
            keyword in query_lower
            for keyword in ["kubernetes", "k8s", "pod", "deployment", "service"]
        ):
            suggestions.append("kubernetes_docs")

        if any(
            keyword in query_lower
            for keyword in ["github", "repository", "code", "api"]
        ):
            suggestions.append("github_repos")

        # If no specific suggestions, use all available
        if not suggestions:
            available_kbs = await self.get_available_knowledge_bases()
            suggestions = [kb["vector_db_id"] for kb in available_kbs[:3]]  # Top 3

        return suggestions


def create_rag_enhanced_jira_agent(
    rag_service: Optional[RAGService] = None,
) -> RAGEnhancedAgent:
    """
    Create a RAG-enhanced agent specifically for JIRA feature processing.

    Args:
        rag_service: RAG service instance

    Returns:
        Configured RAGEnhancedAgent for JIRA processing
    """
    instructions = """You are an expert AI assistant specializing in JIRA feature analysis and development planning. 

You have access to comprehensive documentation including:
- PatternFly design system components and patterns
- Red Hat OpenShift AI (RHOAI) documentation and best practices
- Kubernetes and OpenShift deployment patterns
- GitHub repositories with code examples and APIs

Your primary tasks are:
1. Analyze JIRA feature requirements and break them down into implementable components
2. Suggest appropriate design patterns and UI components from PatternFly
3. Recommend implementation approaches based on RHOAI and OpenShift best practices
4. Provide detailed technical specifications and acceptance criteria
5. Estimate development effort and identify dependencies

Always ground your recommendations in the available documentation and provide specific references when possible. 
If you need additional context about UI patterns, deployment strategies, or technical implementations, use your knowledge search capabilities."""

    return RAGEnhancedAgent(
        instructions=instructions,
        rag_service=rag_service,
    )


def create_rag_enhanced_refinement_agent(
    rag_service: Optional[RAGService] = None,
) -> RAGEnhancedAgent:
    """
    Create a RAG-enhanced agent for feature refinement tasks.

    Args:
        rag_service: RAG service instance

    Returns:
        Configured RAGEnhancedAgent for feature refinement
    """
    instructions = """You are a technical product manager and architect specializing in feature refinement and specification.

You have access to comprehensive technical documentation and can search for:
- Design system components and patterns
- Technical implementation examples
- Best practices and architectural patterns
- API documentation and code examples

Your role is to:
1. Take high-level feature requirements and break them into detailed, actionable specifications
2. Identify technical dependencies and integration points
3. Suggest appropriate design patterns and architectural approaches
4. Define clear acceptance criteria and testing strategies
5. Estimate complexity and effort required for implementation

Use your knowledge search capabilities to find relevant examples, patterns, and best practices to inform your recommendations.
Always provide concrete, actionable guidance backed by documentation references."""

    return RAGEnhancedAgent(
        instructions=instructions,
        rag_service=rag_service,
    )
