"""Simplified API endpoints for the unified feature sizing system."""

import logging
import asyncio
import json
from datetime import datetime
from typing import List, Optional, Dict, Any, Callable
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
    LlamaIndexProcessingType,
    IngestionSessionResponse,
    IngestionProgressResponse,
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
    SimpleSession,
    SessionStatus,
    ChatRole,
    create_session_id,
    create_chat_message,
    # Project management schemas
    ProjectStoreType,
    CreateProjectRequest,
    ProjectResponse,
    ProjectListResponse,
    ProjectIngestRequest,
    DocumentResponse,
    ProjectDocumentsResponse,
)
from ..unified_agent import UnifiedFeatureSizingAgent
from .rag_service import RAGService
from .task_manager import task_manager
from .project_service import project_service
from .schemas import VectorDBConfig

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


class StreamingLogHandler(logging.Handler):
    """Custom log handler that streams log messages to session chat."""

    def __init__(self, session_id: str, streaming_callback):
        super().__init__()
        self.session_id = session_id
        self.streaming_callback = streaming_callback

    def emit(self, record):
        """Emit a log record by streaming it."""
        try:
            # Format the log message
            message = self.format(record)

            # Stream as system message (but don't await here as this is sync)
            import asyncio

            try:
                loop = asyncio.get_event_loop()
                loop.create_task(self.streaming_callback("system", f"📋 {message}"))
            except RuntimeError:
                # If no event loop is running, skip streaming
                pass
        except Exception:
            # Don't let logging errors break the application
            pass


async def create_streaming_callback(session_id: str):
    """Create a streaming callback that adds messages to session chat."""

    async def callback(
        message_type: str, content: str, metadata: Dict[str, Any] = None
    ):
        """Stream a message to the session."""
        try:
            # Determine the role based on message type
            role = ChatRole.SYSTEM if message_type == "system" else ChatRole.AGENT

            # Add the message to session chat
            session_service.add_chat_message(session_id, role, content)

        except Exception as e:
            logger.error(f"Failed to stream message: {e}")

    return callback


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    global unified_agent, rag_service

    try:
        # Initialize database tables
        from .models import init_database

        init_database()
        logger.info("Database tables initialized")

        # Initialize services
        rag_service = RAGService()
        unified_agent = UnifiedFeatureSizingAgent()

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
@app.get("/health", response_model=HealthResponse)
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


@app.get("/sessions/{session_id}/updates")
async def get_session_updates(session_id: str, last_message_count: int = 0):
    """Get real-time session updates including new messages."""
    session = session_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get messages after the last count
    messages = (
        session.chat_history[last_message_count:]
        if last_message_count < len(session.chat_history)
        else []
    )

    return {
        "session": _session_to_response(session),
        "new_messages": messages,
        "total_messages": len(session.chat_history),
        "has_updates": len(messages) > 0,
    }


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

        # Process with agent - Note: chat method doesn't exist in current unified agent
        # For now, return a placeholder response
        agent_response = "Chat functionality not yet implemented in the unified agent."
        actions_taken = []
        updated_state = current_state

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


# Project Management (5 endpoints)
@app.get("/projects", response_model=ProjectListResponse)
async def list_projects():
    """List all active projects."""
    try:
        projects = project_service.list_projects()
        return ProjectListResponse(projects=projects, total=len(projects))
    except Exception as e:
        logger.error(f"Error listing projects: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/projects", response_model=ProjectResponse)
async def create_project(
    request: CreateProjectRequest,
    rag_service: RAGService = Depends(get_rag_service),
):
    """Create a new project with one RAG store."""
    try:
        # Create project with single store
        project_response = project_service.create_project(request)

        # Register ALL RAG stores with Llama Stack
        registration_results = []
        for store_info in project_response.stores:
            try:
                vector_db_config = VectorDBConfig(
                    vector_db_id=store_info["vector_db_id"],
                    name=store_info["name"],
                    description=store_info["description"],
                    use_case=store_info.get("store_type", "knowledge_base"),
                )
                await rag_service.create_vector_database(vector_db_config)
                logger.info(
                    f"Registered RAG store {store_info['vector_db_id']} for project {request.project_id}"
                )
                registration_results.append(f"✅ {store_info['vector_db_id']}")
            except Exception as store_error:
                logger.warning(
                    f"Failed to register RAG store {store_info['vector_db_id']}: {store_error}"
                )
                registration_results.append(
                    f"❌ {store_info['vector_db_id']}: {store_error}"
                )

        logger.info(
            f"Store registration results for project {request.project_id}: {registration_results}"
        )

        return project_response

    except Exception as e:
        logger.error(f"Error creating project: {e}")
        # Don't fail the entire project creation if only Llama Stack registration fails
        if "Connection error" in str(e) or "Failed to connect" in str(e):
            logger.warning(
                "Llama Stack connection failed, but project created successfully"
            )
            try:
                # Try to get the project that was created
                project_response = project_service.get_project(request.project_id)
                if project_response:
                    return project_response
            except:
                pass

        raise HTTPException(status_code=500, detail=str(e))


@app.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str):
    """Get project details by ID."""
    try:
        project = project_service.get_project(project_id)
        if not project:
            raise HTTPException(
                status_code=404, detail=f"Project {project_id} not found"
            )
        return project
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting project {project_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/projects/{project_id}/documents", response_model=ProjectDocumentsResponse)
async def get_project_documents(project_id: str):
    """Get documents for a specific project."""
    try:
        documents = project_service.get_project_documents(project_id)
        if documents is None:
            raise HTTPException(
                status_code=404, detail=f"Project {project_id} not found"
            )
        return documents
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting documents for project {project_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    """Delete a project and its stores."""
    try:
        success = project_service.delete_project(project_id)
        if not success:
            raise HTTPException(
                status_code=404, detail=f"Project {project_id} not found"
            )
        return {"message": f"Project {project_id} deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting project {project_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/projects/{project_id}/ingest", response_model=IngestionSessionResponse)
async def ingest_into_project(
    project_id: str,
    request: ProjectIngestRequest,
    rag_service: RAGService = Depends(get_rag_service),
):
    """Ingest documents into a project with automatic routing to appropriate stores."""
    try:
        # Verify project exists
        project = project_service.get_project(project_id)
        if not project:
            raise HTTPException(
                status_code=404, detail=f"Project {project_id} not found"
            )

        # Route documents to appropriate stores
        routed_documents = {}  # store_type -> documents

        for doc in request.documents:
            doc_url = doc.get("url", "")

            # Determine target store
            if request.override_routing and doc_url in request.override_routing:
                store_type = request.override_routing[doc_url]
            else:
                store_type = project_service._detect_store_type(
                    doc_url, doc.get("metadata", {})
                )

            # Get vector_db_id for this store type
            vector_db_id = project_service._get_store_vector_db_id(
                project_id, store_type
            )
            if not vector_db_id:
                # Create store if it doesn't exist
                logger.warning(
                    f"Store type {store_type} not found in project {project_id}, using default"
                )
                vector_db_id = project_service._get_store_vector_db_id(
                    project_id, ProjectStoreType.DEFAULT
                )

            if vector_db_id not in routed_documents:
                routed_documents[vector_db_id] = []

            # Add routing metadata
            doc_with_routing = {
                **doc,
                "metadata": {
                    **doc.get("metadata", {}),
                    "project_id": project_id,
                    "target_store_type": store_type,
                    "routing_method": (
                        "override"
                        if (
                            request.override_routing
                            and doc_url in request.override_routing
                        )
                        else "auto"
                    ),
                },
            }
            routed_documents[vector_db_id].append(doc_with_routing)

        # If all documents go to one store, use single ingestion
        if len(routed_documents) == 1:
            vector_db_id, documents = next(iter(routed_documents.items()))

            from .schemas import DocumentIngestionRequest, DocumentSource

            doc_sources = [
                DocumentSource(
                    name=doc.get("name", "Unknown"),
                    url=doc.get("url", ""),
                    mime_type=doc.get("mime_type", "text/plain"),
                    metadata=doc.get("metadata", {}),
                )
                for doc in documents
            ]

            ingestion_request = DocumentIngestionRequest(
                vector_db_id=vector_db_id,
                documents=doc_sources,
            )

            # Create background task
            task_id = task_manager.create_task(
                rag_service.ingest_documents_with_llamaindex_sync,
                ingestion_request,
                task_type=f"project_ingestion_{request.processing_type.value}",
                total_items=len(documents),
                task_metadata={
                    "project_id": project_id,
                    "processing_type": request.processing_type.value,
                    "document_count": len(documents),
                    "routed_stores": 1,
                },
            )

            return IngestionSessionResponse(
                session_id=task_id,
                store_id=vector_db_id,
                processing_type=request.processing_type,
                document_count=len(documents),
                message=f"Started project ingestion with auto-routing to {len(routed_documents)} store(s)",
            )

        else:
            # Multiple stores - need to handle batch ingestion
            # For now, return an error but we can implement batch later
            store_counts = {
                store_id: len(docs) for store_id, docs in routed_documents.items()
            }
            raise HTTPException(
                status_code=400,
                detail=f"Documents would be routed to {len(routed_documents)} stores: {store_counts}. Batch routing not yet implemented.",
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error ingesting into project {project_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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


@app.post("/rag/ingest", response_model=IngestionSessionResponse)
async def start_document_ingestion(
    request: IngestDocumentsRequest,
    rag_service: RAGService = Depends(get_rag_service),
):
    """Start document ingestion with progress tracking."""
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

        if request.enable_progress_tracking:
            # Create background task for ingestion with progress tracking
            task_id = task_manager.create_task(
                rag_service.ingest_documents_with_llamaindex_sync,
                ingestion_request,
                task_type=f"ingestion_{request.processing_type.value}",
                total_items=len(request.documents),
                task_metadata={
                    "store_id": request.store_id,
                    "processing_type": request.processing_type.value,
                    "document_count": len(request.documents),
                },
            )

            return IngestionSessionResponse(
                session_id=task_id,
                store_id=request.store_id,
                processing_type=request.processing_type,
                document_count=len(request.documents),
                message=f"Started {request.processing_type.value} ingestion with progress tracking",
            )
        else:
            # Direct ingestion without progress tracking
            result = await rag_service.ingest_documents_with_llamaindex(
                ingestion_request
            )
            return {
                "session_id": "direct",
                "store_id": request.store_id,
                "processing_type": request.processing_type,
                "document_count": len(result.ingested_documents),
                "message": "Documents ingested successfully",
            }
    except Exception as e:
        logger.error(f"Error starting document ingestion: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _convert_task_to_ingestion_response(
    task_id: str, task_info
) -> IngestionProgressResponse:
    """Convert BackgroundTaskInfo to IngestionProgressResponse."""

    # Handle datetime conversion
    def format_datetime(dt):
        if dt is None:
            return None
        if hasattr(dt, "isoformat"):
            return dt.isoformat()
        return str(dt)

    return IngestionProgressResponse(
        session_id=task_id,
        status=task_info.status,
        progress=task_info.progress,
        current_step=task_info.current_step,
        processed_items=task_info.processed_items,
        total_items=task_info.total_items,
        error_message=getattr(
            task_info, "error_message", getattr(task_info, "error", None)
        ),
        result=getattr(task_info, "result", None),
        created_at=format_datetime(getattr(task_info, "created_at", None)),
        started_at=format_datetime(getattr(task_info, "started_at", None)),
        completed_at=format_datetime(getattr(task_info, "completed_at", None)),
    )


@app.get("/rag/ingest/{session_id}/progress", response_model=IngestionProgressResponse)
async def get_ingestion_progress(session_id: str):
    """Get progress of an ongoing ingestion session."""
    try:
        task_info = task_manager.get_task(session_id)
        if not task_info:
            raise HTTPException(status_code=404, detail="Ingestion session not found")

        return _convert_task_to_ingestion_response(session_id, task_info)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting ingestion progress: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/rag/ingest/sessions", response_model=List[IngestionProgressResponse])
async def list_ingestion_sessions(
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(20, description="Maximum number of sessions to return"),
):
    """List active and recent ingestion sessions."""
    try:
        tasks = task_manager.search_tasks(
            status=status,
            task_type=None,  # Get all tasks for now since task type filtering might not work as expected
            limit=limit,
        )

        sessions = []
        for task_info in tasks:
            sessions.append(
                _convert_task_to_ingestion_response(task_info.task_id, task_info)
            )

        return sessions
    except Exception as e:
        logger.error(f"Error listing ingestion sessions: {e}")
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
            total_found=result.total_found,
            stores_searched=request.rag_store_ids,
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


@app.post("/rag/ensure-registration")
async def ensure_vector_db_registration(
    rag_service: RAGService = Depends(get_rag_service),
):
    """Ensure all local vector databases are registered with Llama Stack."""
    try:
        result = await rag_service.ensure_vector_dbs_registered()
        return {
            "message": "Vector database registration check completed",
            "registered_dbs": result,
        }
    except Exception as e:
        logger.error(f"Error checking vector database registration: {e}")
        raise HTTPException(
            status_code=500, detail=f"Registration check failed: {str(e)}"
        )


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
    # Handle jira_structure - convert list to dict if needed
    jira_structure = session.jira_structure
    if isinstance(jira_structure, list):
        # Convert list of epics to dict format
        jira_structure = {"epics": jira_structure}

    return SessionResponse(
        id=session.id,
        jira_key=session.jira_key,
        status=session.status,
        rag_store_ids=session.rag_store_ids,
        created_at=session.created_at,
        updated_at=session.updated_at,
        refinement_content=session.refinement_content,
        jira_structure=jira_structure,
        progress_message=session.progress_message,
        error_message=session.error_message,
    )


async def _process_session_background(
    session_id: str,
    request: CreateSessionRequest,
    agent: UnifiedFeatureSizingAgent,
):
    """Background task to process a session with real-time updates."""
    try:
        # Update status to processing
        session_service.update_session(
            session_id,
            status=SessionStatus.PROCESSING,
            progress_message="Processing feature with AI agent...",
        )

        # Add initial system messages
        session_service.add_chat_message(
            session_id,
            ChatRole.SYSTEM,
            f"🚀 Starting feature processing for {request.jira_key}",
        )

        if request.rag_store_ids:
            session_service.add_chat_message(
                session_id,
                ChatRole.SYSTEM,
                f"📊 Using RAG stores: {', '.join(request.rag_store_ids)}",
            )

        session_service.add_chat_message(
            session_id, ChatRole.SYSTEM, "🤖 Initializing AI agent..."
        )

        # Process with unified agent
        session_service.add_chat_message(
            session_id,
            ChatRole.SYSTEM,
            "🔍 Analyzing JIRA issue and gathering context...",
        )

        results = await agent.run_planning_loop(
            session_id=session_id,
            jira_key=request.jira_key,
            rag_store_ids=request.rag_store_ids,
            max_turns=12,
            enable_validation=True,
        )

        # Update session with results
        updates = {
            "status": SessionStatus.READY,
            "progress_message": "Feature processing completed successfully",
        }

        if results.get("refinement_content"):
            updates["refinement_content"] = results["refinement_content"]
            session_service.add_chat_message(
                session_id, ChatRole.SYSTEM, "📝 Refinement document generated"
            )

        if results.get("jira_structure"):
            updates["jira_structure"] = results["jira_structure"]
            session_service.add_chat_message(
                session_id, ChatRole.SYSTEM, "🎯 JIRA structure created"
            )

        session_service.update_session(session_id, **updates)

        # Add system message about completion
        actions = results.get("actions_taken", [])
        completion_message = f"✅ Feature processing completed. Actions taken: {', '.join(actions) if actions else 'none'}"
        session_service.add_chat_message(
            session_id, ChatRole.SYSTEM, completion_message
        )

        session_service.add_chat_message(
            session_id, ChatRole.SYSTEM, "🎉 Session processing complete!"
        )

        logger.info(f"Session {session_id} processed successfully")

    except Exception as e:
        logger.error(f"Error processing session {session_id}: {e}")

        session_service.add_chat_message(
            session_id, ChatRole.SYSTEM, f"❌ Processing failed: {str(e)}"
        )

        # Update session with error
        session_service.update_session(
            session_id,
            status=SessionStatus.ERROR,
            error_message=str(e),
            progress_message=None,
        )


if __name__ == "__main__":
    import uvicorn
    import os

    port = int(os.getenv("PORT", 8001))  # Use different port to avoid conflicts
    host = os.getenv("HOST", "0.0.0.0")

    uvicorn.run(
        "rhoai_ai_feature_sizing.api.simple_api:app", host=host, port=port, reload=True
    )
