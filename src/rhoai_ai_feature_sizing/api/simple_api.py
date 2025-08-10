"""Simplified API endpoints for the unified feature sizing system."""

import logging
import asyncio
import json
from datetime import datetime
from typing import List, Optional, Dict, Any
from pathlib import Path

from fastapi import FastAPI, HTTPException, BackgroundTasks, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .simple_schemas import (
    CreateSessionRequest,
    ChatMessageRequest,
    RAGQueryRequest,
    CreateRAGStoreRequest,
    IngestDocumentsRequest,
    SessionResponse,
    SessionDetailResponse,
    SessionListResponse,
    ChatResponse,
    RAGStoreListResponse,
    RAGQueryResponse,
    RefinementResponse,
    JiraStructureResponse,
    EstimatesResponse,
    HealthResponse,
    ErrorResponse,
    SimpleSession,
    SessionStatus,
    ChatRole,
    create_session_id,
    create_chat_message,
)
from ..unified_agent import UnifiedFeatureSizingAgent
from .rag_service import RAGService

# Global services
unified_agent = None
rag_service = None
sessions_storage = {}  # In-memory storage for now - replace with database later

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SimpleAPI")


class SimpleSessionService:
    """Simple session management service."""

    def __init__(self):
        self.sessions = sessions_storage

    def create_session(self, request: CreateSessionRequest) -> SimpleSession:
        """Create a new session."""
        session_id = create_session_id()
        session = SimpleSession(
            id=session_id,
            jira_key=request.jira_key,
            status=SessionStatus.PENDING,
            rag_store_ids=request.rag_store_ids or [],
            refinement_content=request.existing_refinement,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        self.sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[SimpleSession]:
        """Get session by ID."""
        return self.sessions.get(session_id)

    def update_session(self, session_id: str, **updates) -> Optional[SimpleSession]:
        """Update session fields."""
        session = self.sessions.get(session_id)
        if not session:
            return None

        for key, value in updates.items():
            if hasattr(session, key):
                setattr(session, key, value)

        session.updated_at = datetime.utcnow()
        return session

    def list_sessions(
        self, page: int = 1, page_size: int = 20
    ) -> tuple[List[SimpleSession], int]:
        """List sessions with pagination."""
        sessions = list(self.sessions.values())
        sessions.sort(key=lambda s: s.created_at, reverse=True)

        start = (page - 1) * page_size
        end = start + page_size

        return sessions[start:end], len(sessions)

    def delete_session(self, session_id: str) -> bool:
        """Delete a session."""
        if session_id in self.sessions:
            del self.sessions[session_id]
            return True
        return False

    def add_chat_message(
        self,
        session_id: str,
        role: ChatRole,
        content: str,
        actions: Optional[List[str]] = None,
    ) -> bool:
        """Add a chat message to session."""
        session = self.sessions.get(session_id)
        if not session:
            return False

        message = create_chat_message(role, content, actions)
        session.chat_history.append(message)
        session.updated_at = datetime.utcnow()
        return True


# Global session service
session_service = SimpleSessionService()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    global unified_agent, rag_service

    try:
        # Initialize services
        rag_service = RAGService()
        unified_agent = UnifiedFeatureSizingAgent(rag_service)

        # Setup predefined RAG stores
        try:
            await rag_service.setup_predefined_vector_dbs()
            logger.info("RAG service initialized successfully")
        except Exception as e:
            logger.warning(f"Failed to setup predefined RAG stores: {e}")

        logger.info("Simple API startup completed")
        yield

    except Exception as e:
        logger.error(f"Startup failed: {e}")
        raise
    finally:
        logger.info("Simple API shutdown completed")


# Create FastAPI app
app = FastAPI(
    title="RHOAI Feature Sizing API (Simplified)",
    description="Simplified API for transforming JIRA features into detailed specs using AI",
    version="2.0.0",
    lifespan=lifespan,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_unified_agent() -> UnifiedFeatureSizingAgent:
    """Get the unified agent instance."""
    if unified_agent is None:
        raise HTTPException(status_code=503, detail="Unified agent not initialized")
    return unified_agent


def get_rag_service() -> RAGService:
    """Get the RAG service instance."""
    if rag_service is None:
        raise HTTPException(status_code=503, detail="RAG service not initialized")
    return rag_service


# Health Check
@app.get("/healthz", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    services = {}

    # Check unified agent
    try:
        agent = get_unified_agent()
        services["unified_agent"] = "connected"
    except Exception as e:
        services["unified_agent"] = f"error: {str(e)}"

    # Check RAG service
    try:
        rag = get_rag_service()
        services["rag_service"] = "connected"
    except Exception as e:
        services["rag_service"] = f"error: {str(e)}"

    overall_status = (
        "healthy"
        if all("error" not in status for status in services.values())
        else "degraded"
    )

    return HealthResponse(status=overall_status, services=services)


# Session Management (3 endpoints)
@app.post("/sessions", response_model=SessionResponse)
async def create_session(
    request: CreateSessionRequest,
    background_tasks: BackgroundTasks,
    agent: UnifiedFeatureSizingAgent = Depends(get_unified_agent),
):
    """Create a new session and start processing the feature."""
    try:
        # Create session
        session = session_service.create_session(request)

        # Start processing in background
        background_tasks.add_task(
            _process_session_background, session.id, request, agent
        )

        return _session_to_response(session)

    except Exception as e:
        logger.error(f"Error creating session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sessions/{session_id}", response_model=SessionDetailResponse)
async def get_session(session_id: str):
    """Get detailed session information."""
    session = session_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    response = _session_to_response(session)
    return SessionDetailResponse(
        **response.model_dump(), chat_history=session.chat_history
    )


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a session."""
    success = session_service.delete_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"message": "Session deleted successfully"}


# Chat Interface (2 endpoints)
@app.post("/sessions/{session_id}/chat", response_model=ChatResponse)
async def send_chat_message(
    session_id: str,
    request: ChatMessageRequest,
    agent: UnifiedFeatureSizingAgent = Depends(get_unified_agent),
):
    """Send a chat message and get agent response."""
    session = session_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        # Add user message to session
        session_service.add_chat_message(session_id, ChatRole.USER, request.message)

        # Get current session state
        current_state = {
            "jira_key": session.jira_key,
            "refinement_content": session.refinement_content,
            "jira_structure": session.jira_structure,
        }

        # Process with agent
        agent_response, actions_taken, updated_state = await agent.chat(
            session_id=session_id,
            user_message=request.message,
            current_state=current_state,
            rag_store_ids=session.rag_store_ids,
        )

        # Add agent response to session
        agent_message_id = session_service.add_chat_message(
            session_id, ChatRole.AGENT, agent_response, actions_taken
        )

        # Update session state if content was modified
        updates = {}
        updated_content = {}

        if updated_state.get("refinement_content") != session.refinement_content:
            updates["refinement_content"] = updated_state.get("refinement_content")
            updated_content["refinement"] = True

        if updated_state.get("jira_structure") != session.jira_structure:
            updates["jira_structure"] = updated_state.get("jira_structure")
            updated_content["jiras"] = True

        if updates:
            session_service.update_session(session_id, **updates)

        return ChatResponse(
            message_id=(
                session.chat_history[-2].id
                if len(session.chat_history) >= 2
                else "unknown"
            ),
            agent_message_id=session.chat_history[-1].id,
            agent_response=agent_response,
            actions_taken=actions_taken,
            updated_content=updated_content,
        )

    except Exception as e:
        logger.error(f"Error processing chat message: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sessions/{session_id}/messages")
async def get_session_messages(
    session_id: str, limit: int = Query(50, description="Maximum number of messages")
):
    """Get chat history for a session."""
    session = session_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Return recent messages (newest first)
    messages = session.chat_history[-limit:] if limit > 0 else session.chat_history
    return {"messages": messages}


# Content Endpoints (3 endpoints)
@app.get("/sessions/{session_id}/refinement", response_model=RefinementResponse)
async def get_refinement(session_id: str):
    """Get the refinement document for a session."""
    session = session_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.refinement_content:
        raise HTTPException(status_code=404, detail="No refinement document found")

    word_count = len(session.refinement_content.split())

    return RefinementResponse(
        content=session.refinement_content,
        last_updated=session.updated_at,
        word_count=word_count,
    )


@app.get("/sessions/{session_id}/jiras", response_model=JiraStructureResponse)
async def get_jira_structure(session_id: str):
    """Get the JIRA structure for a session."""
    session = session_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.jira_structure:
        raise HTTPException(status_code=404, detail="No JIRA structure found")

    structure = session.jira_structure
    epic_count = len(structure.get("epics", [])) if isinstance(structure, dict) else 0
    story_count = (
        len(structure.get("stories", [])) if isinstance(structure, dict) else 0
    )

    return JiraStructureResponse(
        structure=structure,
        last_updated=session.updated_at,
        epic_count=epic_count,
        story_count=story_count,
    )


@app.get("/sessions/{session_id}/estimates", response_model=EstimatesResponse)
async def get_estimates(session_id: str):
    """Get estimates for a session."""
    session = session_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Extract estimates from JIRA structure
    estimates = {"total_story_points": 0, "total_hours": 0.0}

    if session.jira_structure and isinstance(session.jira_structure, dict):
        stories = session.jira_structure.get("stories", [])
        for story in stories:
            if isinstance(story, dict):
                estimates["total_story_points"] += story.get("story_points", 0)
                estimates["total_hours"] += story.get("estimated_hours", 0.0)

    return EstimatesResponse(
        estimates=estimates,
        total_story_points=estimates["total_story_points"],
        total_hours=estimates["total_hours"],
        last_updated=session.updated_at,
    )


# RAG Management (5 endpoints)
@app.get("/rag/stores", response_model=RAGStoreListResponse)
async def list_rag_stores(rag_service: RAGService = Depends(get_rag_service)):
    """List available RAG stores."""
    try:
        stores_response = await rag_service.list_vector_databases()
        stores = [
            {
                "store_id": store.vector_db_id,
                "name": store.name,
                "description": store.description,
                "document_count": store.document_count,
                "created_at": store.created_at,
            }
            for store in stores_response.vector_dbs
        ]

        return RAGStoreListResponse(stores=stores, total=len(stores))
    except Exception as e:
        logger.error(f"Error listing RAG stores: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rag/stores")
async def create_rag_store(
    request: CreateRAGStoreRequest,
    rag_service: RAGService = Depends(get_rag_service),
):
    """Create a new RAG store."""
    try:
        from .schemas import VectorDBConfig

        config = VectorDBConfig(
            vector_db_id=request.store_id,
            name=request.name,
            description=request.description or "",
            use_case="custom",
        )

        result = await rag_service.create_vector_database(config)
        return {
            "store_id": result.vector_db_id,
            "name": result.name,
            "message": "RAG store created successfully",
        }
    except Exception as e:
        logger.error(f"Error creating RAG store: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rag/ingest")
async def ingest_documents(
    request: IngestDocumentsRequest,
    rag_service: RAGService = Depends(get_rag_service),
):
    """Ingest documents into a RAG store."""
    try:
        from .schemas import DocumentIngestionRequest, DocumentSource

        # Convert documents to proper format
        doc_sources = []
        for doc in request.documents:
            doc_source = DocumentSource(
                name=doc.get("name", "Unknown"),
                url=doc.get("url", ""),
                mime_type=doc.get("mime_type", "text/plain"),
                metadata=doc.get("metadata", {}),
            )
            doc_sources.append(doc_source)

        ingestion_request = DocumentIngestionRequest(
            vector_db_id=request.store_id,
            documents=doc_sources,
        )

        result = await rag_service.ingest_documents(ingestion_request)
        return {
            "store_id": request.store_id,
            "documents_processed": len(result.ingested_documents),
            "chunks_created": result.total_chunks_created,
            "message": "Documents ingested successfully",
        }
    except Exception as e:
        logger.error(f"Error ingesting documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rag/query", response_model=RAGQueryResponse)
async def query_rag_stores(
    request: RAGQueryRequest,
    rag_service: RAGService = Depends(get_rag_service),
):
    """Query RAG stores."""
    try:
        from .schemas import RAGQueryRequest as RAGQuery

        rag_query = RAGQuery(
            vector_db_ids=request.rag_store_ids,
            query=request.query,
            max_chunks=request.max_results,
        )

        result = await rag_service.query_rag(rag_query)

        return RAGQueryResponse(
            results=result.chunks,
            total_found=result.total_chunks_found,
            stores_searched=result.vector_dbs_searched,
            query_time_ms=result.query_time_ms,
        )
    except Exception as e:
        logger.error(f"Error querying RAG stores: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/rag/stores/{store_id}")
async def delete_rag_store(
    store_id: str,
    rag_service: RAGService = Depends(get_rag_service),
):
    """Delete a RAG store."""
    try:
        success = await rag_service.delete_vector_database(store_id)
        if not success:
            raise HTTPException(status_code=404, detail="RAG store not found")

        return {"message": "RAG store deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting RAG store: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Utilities (2 endpoints)
@app.get("/sessions", response_model=SessionListResponse)
async def list_sessions(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
):
    """List all sessions."""
    sessions, total = session_service.list_sessions(page, page_size)

    return SessionListResponse(
        sessions=[_session_to_response(s) for s in sessions],
        total=total,
        page=page,
        page_size=page_size,
    )


@app.post("/rag/setup-predefined")
async def setup_predefined_rag_stores(
    rag_service: RAGService = Depends(get_rag_service),
):
    """Setup predefined RAG stores with default document sources."""
    try:
        result = await rag_service.setup_predefined_vector_dbs()
        return {"message": "Predefined RAG stores setup completed", "details": result}
    except Exception as e:
        logger.error(f"Error setting up predefined RAG stores: {e}")
        raise HTTPException(status_code=500, detail=f"Setup failed: {str(e)}")


@app.get("/prompts")
async def list_prompts():
    """List available prompt templates."""
    try:
        prompts_dir = Path(__file__).parent.parent / "prompts"
        if not prompts_dir.exists():
            return {"prompts": []}

        prompt_files = [f.stem for f in prompts_dir.glob("*.md")]
        return {"prompts": sorted(prompt_files)}
    except Exception as e:
        logger.error(f"Error listing prompts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Helper Functions
def _session_to_response(session: SimpleSession) -> SessionResponse:
    """Convert session model to response."""
    return SessionResponse(
        id=session.id,
        jira_key=session.jira_key,
        status=session.status,
        rag_store_ids=session.rag_store_ids,
        created_at=session.created_at,
        updated_at=session.updated_at,
        refinement_content=session.refinement_content,
        jira_structure=session.jira_structure,
        progress_message=session.progress_message,
        error_message=session.error_message,
    )


async def _process_session_background(
    session_id: str,
    request: CreateSessionRequest,
    agent: UnifiedFeatureSizingAgent,
):
    """Background task to process a session."""
    try:
        # Update status to processing
        session_service.update_session(
            session_id,
            status=SessionStatus.PROCESSING,
            progress_message="Processing feature with AI agent...",
        )

        # Process with unified agent
        results = await agent.process_feature(
            session_id=session_id,
            jira_key=request.jira_key,
            rag_store_ids=request.rag_store_ids,
            existing_refinement=request.existing_refinement,
            custom_prompts=request.custom_prompts,
        )

        # Update session with results
        updates = {
            "status": SessionStatus.READY,
            "progress_message": "Feature processing completed successfully",
        }

        if results.get("refinement_content"):
            updates["refinement_content"] = results["refinement_content"]

        if results.get("jira_structure"):
            updates["jira_structure"] = results["jira_structure"]

        session_service.update_session(session_id, **updates)

        # Add system message about completion
        actions = results.get("actions_taken", [])
        completion_message = f"✅ Feature processing completed. Actions taken: {', '.join(actions) if actions else 'none'}"
        session_service.add_chat_message(
            session_id, ChatRole.SYSTEM, completion_message
        )

        logger.info(f"Session {session_id} processed successfully")

    except Exception as e:
        logger.error(f"Error processing session {session_id}: {e}")

        # Update session with error
        session_service.update_session(
            session_id,
            status=SessionStatus.ERROR,
            error_message=str(e),
            progress_message=None,
        )

        # Add error message to chat
        session_service.add_chat_message(
            session_id, ChatRole.SYSTEM, f"❌ Processing failed: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    import os

    port = int(os.getenv("PORT", 8001))  # Use different port to avoid conflicts
    host = os.getenv("HOST", "0.0.0.0")

    uvicorn.run(
        "rhoai_ai_feature_sizing.api.simple_api:app", host=host, port=port, reload=True
    )
