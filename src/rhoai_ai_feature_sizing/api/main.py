"""FastAPI application for RHOAI AI Feature Sizing."""

import logging
import uuid
import asyncio
from datetime import datetime
from typing import List, Optional, Dict
from pathlib import Path

from fastapi import (
    FastAPI,
    HTTPException,
    BackgroundTasks,
    Query,
    Depends,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .models import (
    init_database,
    SessionStatus,
    Stage,
    Document,
    IngestionRequest,
    Epic,
    Story,
)
from .schemas import (
    ChunkBrowseRequest,
    ChunkBrowseResponse,
    ComponentMetrics,
    CreateSessionRequest,
    DocumentIngestionRequest,
    DocumentIngestionResponse,
    DocumentListResponse,
    EpicCreate,
    EpicUpdate,
    EpicResponse,
    EpicListResponse,
    HealthResponse,
    JiraMetricsRequest,
    JiraMetricsResponse,
    MCPUsageResponse,
    MessageResponse,
    OutputResponse,
    ProgressResponse,
    RAGQueryRequest,
    RAGQueryResponse,
    SessionDetailResponse,
    SessionListResponse,
    SessionResponse,
    StoryCreate,
    StoryUpdate,
    StoryResponse,
    StoryListResponse,
    VectorDBConfig,
    VectorDBInfo,
    VectorDBListResponse,
    VectorDBUpdateRequest,
    BackgroundTaskInfo,
    BulkIngestionTaskRequest,
    BulkIngestionTaskResponse,
)
from .services import SessionService
from .rag_service import RAGService
from .task_manager import task_manager
from ..llama_stack_setup import get_llama_stack_client


# Global service instance
session_service = None
rag_service = None


class WebSocketManager:
    """Manager for WebSocket connections."""

    def __init__(self):
        self.active_connections: Dict[uuid.UUID, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, session_id: uuid.UUID):
        """Connect a WebSocket for a specific session."""
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = []
        self.active_connections[session_id].append(websocket)

    def disconnect(self, websocket: WebSocket, session_id: uuid.UUID):
        """Disconnect a WebSocket from a session."""
        if session_id in self.active_connections:
            self.active_connections[session_id].remove(websocket)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]

    async def send_message(self, session_id: uuid.UUID, message: dict):
        """Send a message to all connected clients for a session."""
        if session_id in self.active_connections:
            disconnected = []
            for websocket in self.active_connections[session_id]:
                try:
                    await websocket.send_json(message)
                except Exception:
                    disconnected.append(websocket)

            # Remove disconnected clients
            for websocket in disconnected:
                self.disconnect(websocket, session_id)


# Global WebSocket manager
ws_manager = WebSocketManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    global session_service, rag_service

    try:
        # Initialize database
        engine = init_database()
        logging.info("Database initialized successfully")

        # Initialize services
        session_service = SessionService()
        rag_service = RAGService()

        # Setup predefined vector databases
        try:
            created_dbs = await rag_service.setup_predefined_vector_dbs()
            if created_dbs:
                logging.info(f"Created predefined vector databases: {created_dbs}")
        except Exception as e:
            logging.warning(f"Failed to setup predefined vector databases: {e}")

        # Synchronize vector databases between Application Database and Llama Stack
        try:
            sync_results = await rag_service.sync_vector_databases()
            if sync_results["cleaned_orphans"]:
                logging.info(
                    f"Cleaned up orphaned vector databases: {sync_results['cleaned_orphans']}"
                )
            if sync_results["re_registered"]:
                logging.info(
                    f"Re-registered missing vector databases: {sync_results['re_registered']}"
                )
            if (
                not sync_results["cleaned_orphans"]
                and not sync_results["re_registered"]
            ):
                logging.info("Vector databases are already in sync")
        except Exception as e:
            logging.warning(f"Failed to sync vector databases: {e}")

        logging.info("Application startup completed")
        yield

    except Exception as e:
        logging.error(f"Startup failed: {e}")
        raise
    finally:
        logging.info("Application shutdown completed")


# Create FastAPI app
app = FastAPI(
    title="RHOAI AI Feature Sizing API",
    description="API for transforming Jira features into detailed specs, epics, and estimates using AI agents",
    version="1.0.0",
    lifespan=lifespan,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_session_service() -> SessionService:
    """Dependency to get session service."""
    if session_service is None:
        raise HTTPException(status_code=503, detail="Service not initialized")
    return session_service


def get_rag_service() -> RAGService:
    """Dependency to get RAG service."""
    if rag_service is None:
        raise HTTPException(status_code=503, detail="RAG service not initialized")
    return rag_service


@app.get("/healthz", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    # Test database connection
    try:
        service = get_session_service()
        service.get_sessions(page=1, page_size=1)
        database_status = "connected"
    except Exception as e:
        database_status = f"error: {str(e)}"

    # Test Llama Stack connection
    try:
        client = get_llama_stack_client()
        # Simple test - this might need adjustment based on your client
        llama_stack_status = "connected"
    except Exception as e:
        llama_stack_status = f"error: {str(e)}"

    return HealthResponse(database=database_status, llama_stack=llama_stack_status)


@app.post("/sessions", response_model=SessionResponse)
async def create_session(
    request: CreateSessionRequest,
    service: SessionService = Depends(get_session_service),
):
    """Create a new processing session and start processing."""
    try:
        # Create session
        session_id = service.create_session(
            request.jira_key,
            request.soft_mode,
            request.custom_prompts,
            request.vector_db_ids,
        )

        # Start processing in background using asyncio.create_task
        # This ensures proper async handling without blocking the event loop
        asyncio.create_task(service.process_session(session_id))

        # Return session info
        session = service.get_session(session_id)
        return session

    except Exception as e:
        logging.error(f"Error creating session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sessions", response_model=SessionListResponse)
async def list_sessions(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    service: SessionService = Depends(get_session_service),
):
    """Get paginated list of sessions."""
    try:
        sessions, total = service.get_sessions(page, page_size)
        return SessionListResponse(
            sessions=sessions,
            total=total,
            page=page,
            page_size=page_size,
        )
    except Exception as e:
        logging.error(f"Error listing sessions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sessions/{session_id}", response_model=SessionDetailResponse)
async def get_session(
    session_id: uuid.UUID, service: SessionService = Depends(get_session_service)
):
    """Get detailed session information."""
    try:
        session = service.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Get related data
        messages = service.get_session_messages(session_id)
        outputs = service.get_session_outputs(session_id)
        mcp_usages = service.get_session_mcp_usage(session_id)

        return SessionDetailResponse(
            **session.model_dump(),
            messages=messages,
            outputs=outputs,
            mcp_usages=mcp_usages,
        )
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sessions/{session_id}/progress", response_model=ProgressResponse)
async def get_session_progress(
    session_id: uuid.UUID, service: SessionService = Depends(get_session_service)
):
    """Get session progress for polling."""
    try:
        session = service.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Calculate progress percentage based on stage
        progress_map = {
            None: 0,
            Stage.REFINE: 25,
            Stage.EPICS: 50,
            Stage.JIRAS: 75,
            Stage.ESTIMATE: 90,
        }

        progress_percentage = progress_map.get(session.current_stage, 0)
        if session.status == SessionStatus.COMPLETED:
            progress_percentage = 100
        elif session.status == SessionStatus.FAILED:
            progress_percentage = 0

        # Get latest message
        messages = service.get_session_messages(session_id, limit=1)
        latest_message = messages[-1].content if messages else None

        return ProgressResponse(
            session_id=session_id,
            status=session.status,
            current_stage=session.current_stage,
            progress_percentage=progress_percentage,
            latest_message=latest_message,
            error_message=session.error_message,
            started_at=session.started_at,
        )
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting progress for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sessions/{session_id}/messages", response_model=List[MessageResponse])
async def get_session_messages(
    session_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200, description="Maximum number of messages"),
    stage: Optional[Stage] = Query(None, description="Filter by stage"),
    service: SessionService = Depends(get_session_service),
):
    """Get session messages (chat history)."""
    try:
        session = service.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        messages = service.get_session_messages(session_id, limit)

        # Filter by stage if requested
        if stage:
            messages = [m for m in messages if m.stage == stage]

        return messages
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting messages for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sessions/{session_id}/outputs", response_model=List[OutputResponse])
async def get_session_outputs(
    session_id: uuid.UUID,
    stage: Optional[Stage] = Query(None, description="Filter by stage"),
    service: SessionService = Depends(get_session_service),
):
    """Get session outputs (markdown files)."""
    try:
        session = service.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        outputs = service.get_session_outputs(session_id)

        # Filter by stage if requested
        if stage:
            outputs = [o for o in outputs if o.stage == stage]

        return outputs
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting outputs for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sessions/{session_id}/outputs/{stage}", response_model=OutputResponse)
async def get_session_output_by_stage(
    session_id: uuid.UUID,
    stage: Stage,
    service: SessionService = Depends(get_session_service),
):
    """Get specific output by stage."""
    try:
        session = service.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        outputs = service.get_session_outputs(session_id)
        stage_output = next((o for o in outputs if o.stage == stage), None)

        if not stage_output:
            raise HTTPException(
                status_code=404, detail=f"No output found for stage {stage}"
            )

        return stage_output
    except HTTPException:
        raise
    except Exception as e:
        logging.error(
            f"Error getting output for session {session_id}, stage {stage}: {e}"
        )
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sessions/{session_id}/mcp-usage", response_model=List[MCPUsageResponse])
async def get_session_mcp_usage(
    session_id: uuid.UUID, service: SessionService = Depends(get_session_service)
):
    """Get MCP usage analytics for a session."""
    try:
        session = service.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        usages = service.get_session_mcp_usage(session_id)
        return usages
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting MCP usage for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/sessions/{session_id}")
async def delete_session(
    session_id: uuid.UUID, service: SessionService = Depends(get_session_service)
):
    """Delete a session and all related data."""
    try:
        # Attempt to delete the session
        deleted = service.delete_session(session_id)

        if not deleted:
            raise HTTPException(status_code=404, detail="Session not found")

        return {"message": "Session deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error deleting session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/prompts", response_model=List[str])
async def list_available_prompts():
    """Get list of available prompt names."""
    try:
        prompts_dir = Path(__file__).parent.parent / "prompts"
        prompt_files = [f.stem for f in prompts_dir.glob("*.md")]
        return sorted(prompt_files)
    except Exception as e:
        logging.error(f"Error listing prompts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# RAG API Endpoints


@app.get("/rag/vector-databases", response_model=VectorDBListResponse)
async def list_vector_databases(rag_service: RAGService = Depends(get_rag_service)):
    """List all vector databases."""
    try:
        return await rag_service.list_vector_databases()
    except Exception as e:
        logging.error(f"Error listing vector databases: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rag/vector-databases", response_model=VectorDBInfo)
async def create_vector_database(
    config: VectorDBConfig, rag_service: RAGService = Depends(get_rag_service)
):
    """Create a new vector database."""
    try:
        return await rag_service.create_vector_database(config)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logging.error(f"Error creating vector database: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/rag/vector-databases/{vector_db_id}", response_model=VectorDBInfo)
async def get_vector_database(
    vector_db_id: str, rag_service: RAGService = Depends(get_rag_service)
):
    """Get information about a specific vector database."""
    try:
        result = await rag_service.get_vector_database(vector_db_id)
        if not result:
            raise HTTPException(status_code=404, detail="Vector database not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting vector database {vector_db_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/rag/vector-databases/{vector_db_id}")
async def delete_vector_database(
    vector_db_id: str, rag_service: RAGService = Depends(get_rag_service)
):
    """Delete a vector database."""
    try:
        success = await rag_service.delete_vector_database(vector_db_id)
        if not success:
            raise HTTPException(status_code=404, detail="Vector database not found")
        return {"message": "Vector database deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error deleting vector database {vector_db_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rag/vector-databases/{vector_db_id}/reset")
async def reset_vector_database(
    vector_db_id: str, rag_service: RAGService = Depends(get_rag_service)
):
    """Reset a vector database by deleting and recreating it fresh, cleaning up all orphaned chunks."""
    try:
        success = await rag_service.reset_vector_database(vector_db_id)
        if not success:
            raise HTTPException(status_code=404, detail="Vector database not found")
        return {"message": "Vector database reset successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error resetting vector database {vector_db_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rag/ingest", response_model=DocumentIngestionResponse)
async def ingest_documents(
    request: DocumentIngestionRequest,
    rag_service: RAGService = Depends(get_rag_service),
):
    """Ingest documents into a vector database."""
    try:
        return await rag_service.ingest_documents(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logging.error(f"Error ingesting documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rag/ingest/llamaindex", response_model=DocumentIngestionResponse)
async def ingest_documents_with_llamaindex(
    request: DocumentIngestionRequest,
    rag_service: RAGService = Depends(get_rag_service),
):
    """Ingest documents using LlamaIndex data loaders for smarter processing."""
    try:
        return await rag_service.ingest_documents_with_llamaindex(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logging.error(f"Error during LlamaIndex document ingestion: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rag/bulk-ingest", response_model=BulkIngestionTaskResponse)
async def start_bulk_ingestion(
    request: BulkIngestionTaskRequest,
    rag_service: RAGService = Depends(get_rag_service),
):
    """Start a background bulk ingestion task."""
    try:
        # Create background task for bulk ingestion
        task_id = task_manager.create_task(
            _run_bulk_ingestion_task,
            # Pass positional arguments for the task function first
            rag_service,
            request,
            # Then keyword arguments
            task_type="ingestion",
            total_items=len(request.documents),
            task_metadata={
                "vector_db_id": request.vector_db_id,
                "source_count": len(request.documents),
                "use_llamaindex": request.use_llamaindex,
            },
        )

        # Estimate duration based on number of documents
        estimated_minutes = min(30, max(5, len(request.documents) * 2))

        return BulkIngestionTaskResponse(
            task_id=task_id,
            status="pending",
            message="Bulk ingestion task started. Use the task ID to check progress.",
            estimated_duration_minutes=estimated_minutes,
        )
    except Exception as e:
        logging.error(f"Error starting bulk ingestion task: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/rag/tasks/{task_id}", response_model=BackgroundTaskInfo)
async def get_task_status(task_id: str):
    """Get the status of a background task."""
    task_info = task_manager.get_task(task_id)
    if not task_info:
        raise HTTPException(status_code=404, detail="Task not found")
    return task_info


@app.get("/rag/tasks")
async def list_all_tasks(
    limit: int = 50,
    task_type: Optional[str] = None,
    status: Optional[str] = None,
    offset: int = 0,
):
    """List and search background tasks with filtering."""
    if status or task_type:
        tasks = task_manager.search_tasks(
            status=status, task_type=task_type, limit=limit, offset=offset
        )
    else:
        tasks = task_manager.list_tasks(limit=limit, task_type=task_type)

    return {"tasks": tasks, "total": len(tasks), "limit": limit, "offset": offset}


def _run_bulk_ingestion_task(
    rag_service: RAGService,
    request: BulkIngestionTaskRequest,
    progress_callback=None,
    task_id=None,
):
    """Background task function for bulk ingestion with enhanced tracking."""
    import uuid
    from .models import IngestionRequest, SessionLocal

    request_id = str(uuid.uuid4())
    start_time = datetime.utcnow()

    try:
        # Create ingestion request record
        with SessionLocal() as db:
            ingestion_request = IngestionRequest(
                request_id=request_id,
                task_id=task_id or "unknown",
                vector_db_id=request.vector_db_id,
                source_count=len(request.documents),
                use_llamaindex=request.use_llamaindex,
                chunk_size_in_tokens=request.chunk_size_in_tokens,
                chunk_overlap_in_tokens=request.chunk_overlap_in_tokens,
                source_urls=[doc.url for doc in request.documents],
                source_metadata=[
                    {
                        "name": doc.name,
                        "mime_type": doc.mime_type,
                        "metadata": getattr(doc, "metadata", {}),
                    }
                    for doc in request.documents
                ],
                started_at=start_time,
            )
            db.add(ingestion_request)
            db.commit()
            ingestion_request_id = ingestion_request.id

        # Enhanced progress callback that updates ingestion request
        def enhanced_progress_callback(progress, step=None, processed=None, total=None):
            if progress_callback:
                progress_callback(progress, step, processed, total)

            # Update ingestion request progress
            try:
                with SessionLocal() as db:
                    ingestion_req = db.query(IngestionRequest).get(ingestion_request_id)
                    if ingestion_req:
                        if processed is not None:
                            ingestion_req.sources_processed = processed
                        db.commit()
            except Exception as e:
                logging.error(f"Failed to update ingestion request progress: {e}")

        if request.use_llamaindex:
            # Use LlamaIndex for smart processing
            result = rag_service.ingest_documents_with_llamaindex_sync(
                request, enhanced_progress_callback
            )
        else:
            # Use basic ingestion
            result = rag_service.ingest_documents_sync(
                request, enhanced_progress_callback
            )

        # Update final results
        end_time = datetime.utcnow()
        processing_time = (end_time - start_time).total_seconds() * 1000

        with SessionLocal() as db:
            ingestion_req = db.query(IngestionRequest).get(ingestion_request_id)
            if ingestion_req:
                ingestion_req.completed_at = end_time
                ingestion_req.processing_time_ms = processing_time
                ingestion_req.total_chunks_created = result.get(
                    "total_chunks_created", 0
                )
                ingestion_req.documents_created = len(
                    result.get("ingested_documents", [])
                )
                ingestion_req.success_count = len(
                    [d for d in result.get("ingested_documents", []) if d]
                )
                ingestion_req.error_count = len(result.get("errors", []))
                ingestion_req.errors = result.get("errors", [])
                db.commit()

        return result

    except Exception as e:
        logging.error(f"Bulk ingestion task failed: {e}")

        # Update ingestion request with failure
        try:
            with SessionLocal() as db:
                ingestion_req = db.query(IngestionRequest).get(ingestion_request_id)
                if ingestion_req:
                    ingestion_req.completed_at = datetime.utcnow()
                    ingestion_req.errors = [str(e)]
                    ingestion_req.error_count = 1
                    db.commit()
        except Exception as db_error:
            logging.error(f"Failed to update ingestion request with error: {db_error}")

        raise


@app.get("/rag/ingestion-requests")
async def list_ingestion_requests(
    limit: int = 50,
    offset: int = 0,
    vector_db_id: Optional[str] = None,
    status: Optional[str] = None,
):
    """List ingestion requests with filtering options."""
    from .models import SessionLocal, BackgroundTask

    with SessionLocal() as db:
        query = db.query(IngestionRequest).join(
            BackgroundTask, IngestionRequest.task_id == BackgroundTask.task_id
        )

        if vector_db_id:
            query = query.filter(IngestionRequest.vector_db_id == vector_db_id)

        if status:
            # Filter by task status
            from .models import TaskStatus as ModelTaskStatus

            try:
                status_enum = ModelTaskStatus(status)
                query = query.filter(BackgroundTask.status == status_enum)
            except ValueError:
                pass  # Invalid status, ignore filter

        query = query.order_by(IngestionRequest.created_at.desc())
        ingestion_requests = query.offset(offset).limit(limit).all()

        results = []
        for req in ingestion_requests:
            results.append(
                {
                    "request_id": req.request_id,
                    "task_id": req.task_id,
                    "vector_db_id": req.vector_db_id,
                    "source_count": req.source_count,
                    "sources_processed": req.sources_processed,
                    "use_llamaindex": req.use_llamaindex,
                    "total_chunks_created": req.total_chunks_created,
                    "documents_created": req.documents_created,
                    "success_count": req.success_count,
                    "error_count": req.error_count,
                    "created_at": req.created_at.isoformat(),
                    "started_at": (
                        req.started_at.isoformat() if req.started_at else None
                    ),
                    "completed_at": (
                        req.completed_at.isoformat() if req.completed_at else None
                    ),
                    "processing_time_ms": req.processing_time_ms,
                    "source_urls": req.source_urls,
                    "errors": req.errors,
                    "task_status": req.task.status.value if req.task else "unknown",
                }
            )

        return {
            "ingestion_requests": results,
            "total": len(results),
            "limit": limit,
            "offset": offset,
        }


@app.get("/rag/vector-databases/{vector_db_id}/sources")
async def list_sources(vector_db_id: str, limit: int = 50, offset: int = 0):
    """List ingestion sources (aggregated by ingestion request) in a vector database."""
    from .models import SessionLocal, BackgroundTask

    with SessionLocal() as db:
        # Get all ingestion requests for this vector database with their task info
        query = (
            db.query(IngestionRequest)
            .join(BackgroundTask, IngestionRequest.task_id == BackgroundTask.task_id)
            .filter(IngestionRequest.vector_db_id == vector_db_id)
        )

        query = query.order_by(IngestionRequest.created_at.desc())
        ingestion_requests = query.offset(offset).limit(limit).all()

        sources = []
        for req in ingestion_requests:
            # Calculate totals from the stored statistics
            source_name = req.source_urls[0] if req.source_urls else "Unknown Source"

            # Get first URL for display
            primary_url = req.source_urls[0] if req.source_urls else ""

            # Determine source type from URL
            source_type = (
                "github_repository" if "github.com" in primary_url else "web_page"
            )

            sources.append(
                {
                    "source_id": req.request_id,
                    "source_name": source_name,
                    "source_type": source_type,
                    "primary_url": primary_url,
                    "all_urls": req.source_urls,
                    "document_count": req.documents_created,
                    "total_chunks": req.total_chunks_created,
                    "ingestion_method": "LlamaIndex" if req.use_llamaindex else "Basic",
                    "created_at": req.created_at.isoformat(),
                    "started_at": (
                        req.started_at.isoformat() if req.started_at else None
                    ),
                    "completed_at": (
                        req.completed_at.isoformat() if req.completed_at else None
                    ),
                    "processing_time_ms": req.processing_time_ms,
                    "task_status": req.task.status.value if req.task else "unknown",
                    "success_count": req.success_count,
                    "error_count": req.error_count,
                    "errors": req.errors or [],
                }
            )

        return {
            "vector_db_id": vector_db_id,
            "sources": sources,
            "total": len(sources),
            "limit": limit,
            "offset": offset,
        }


@app.get(
    "/rag/vector-databases/{vector_db_id}/documents",
    response_model=DocumentListResponse,
)
async def list_documents(
    vector_db_id: str, rag_service: RAGService = Depends(get_rag_service)
):
    """List documents in a vector database."""
    try:
        return await rag_service.list_documents(vector_db_id)
    except Exception as e:
        logging.error(f"Error listing documents for {vector_db_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/rag/vector-databases/{vector_db_id}/documents")
async def update_documents(
    vector_db_id: str,
    request: VectorDBUpdateRequest,
    rag_service: RAGService = Depends(get_rag_service),
):
    """Update documents in a vector database."""
    try:
        # Ensure the vector_db_id matches
        request.vector_db_id = vector_db_id
        success = await rag_service.update_documents(request)
        if not success:
            raise HTTPException(status_code=404, detail="Vector database not found")
        return {"message": "Documents updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error updating documents for {vector_db_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rag/query", response_model=RAGQueryResponse)
async def query_rag(
    request: RAGQueryRequest,
    session_id: Optional[str] = Query(
        None, description="Optional session ID for analytics"
    ),
    rag_service: RAGService = Depends(get_rag_service),
):
    """Query the RAG system."""
    try:
        session_uuid = None
        if session_id:
            try:
                session_uuid = uuid.UUID(session_id)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid session ID format")

        return await rag_service.query_rag(request, session_uuid)
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error querying RAG: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/rag/predefined-configs", response_model=List[VectorDBConfig])
async def get_predefined_vector_db_configs(
    rag_service: RAGService = Depends(get_rag_service),
):
    """Get predefined vector database configurations."""
    try:
        return await rag_service.get_predefined_vector_dbs()
    except Exception as e:
        logging.error(f"Error getting predefined configs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rag/setup-predefined-dbs")
async def setup_predefined_vector_dbs(
    rag_service: RAGService = Depends(get_rag_service),
):
    """Setup predefined vector databases."""
    try:
        created_dbs = await rag_service.setup_predefined_vector_dbs()
        return {
            "created_databases": created_dbs,
            "message": f"Created {len(created_dbs)} databases",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rag/sync-databases")
async def sync_vector_databases(
    rag_service: RAGService = Depends(get_rag_service),
):
    """
    Synchronize vector databases between Application Database and Llama Stack.

    This endpoint:
    1. Removes orphaned Llama Stack registrations (exist in LL but not in app DB)
    2. Re-registers missing Llama Stack registrations (exist in app DB but not in LL)

    Useful for fixing synchronization issues after system restarts or database resets.
    """
    try:
        sync_results = await rag_service.sync_vector_databases()
        return {
            "cleaned_orphans": sync_results["cleaned_orphans"],
            "re_registered": sync_results["re_registered"],
            "message": f"Sync completed: cleaned {len(sync_results['cleaned_orphans'])} orphans, re-registered {len(sync_results['re_registered'])} missing",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rag/vector-databases/{vector_db_id}/cleanup-orphaned-chunks")
async def cleanup_orphaned_chunks(
    vector_db_id: str,
    rag_service: RAGService = Depends(get_rag_service),
):
    """
    Clean up orphaned chunks in a vector database.

    Identifies chunks that belong to deleted/inactive documents.
    Currently only reports orphaned chunks as Llama Stack doesn't support individual chunk removal.
    """
    try:
        cleanup_results = await rag_service.cleanup_orphaned_chunks(vector_db_id)
        return {
            "vector_db_id": vector_db_id,
            "total_chunks": cleanup_results["total_chunks"],
            "orphaned_chunks": cleanup_results["orphaned_chunks"],
            "active_documents": cleanup_results["active_documents"],
            "orphaned_document_ids": cleanup_results["orphaned_document_ids"],
            "message": f"Found {cleanup_results['orphaned_chunks']} orphaned chunks out of {cleanup_results['total_chunks']} total chunks",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rag/vector-databases/{vector_db_id}/refresh-chunk-counts")
async def refresh_chunk_counts(
    vector_db_id: str, rag_service: RAGService = Depends(get_rag_service)
):
    """
    Refresh chunk counts for all documents in a vector database.

    Updates the database with actual chunk counts from Llama Stack.
    Useful for fixing incorrect chunk counts from legacy data.
    """
    try:
        # Get all active documents
        documents_response = await rag_service.list_documents(vector_db_id)
        document_ids = [doc.document_id for doc in documents_response.documents]

        if not document_ids:
            return {
                "vector_db_id": vector_db_id,
                "updated_documents": 0,
                "message": "No active documents to update",
            }

        # Get actual chunk counts
        actual_counts = await rag_service._get_actual_chunk_counts(
            vector_db_id, document_ids
        )

        # Update database
        updated_count = 0
        with rag_service.get_db_session() as db:
            for doc_id, chunk_count in actual_counts.items():
                db_doc = db.query(Document).filter_by(document_id=doc_id).first()
                if db_doc:
                    old_count = db_doc.chunk_count
                    db_doc.chunk_count = chunk_count
                    updated_count += 1
                    logging.info(
                        f"Updated {doc_id}: {old_count} -> {chunk_count} chunks"
                    )

        return {
            "vector_db_id": vector_db_id,
            "updated_documents": updated_count,
            "chunk_counts": actual_counts,
            "message": f"Updated chunk counts for {updated_count} documents",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rag/chunks/browse", response_model=ChunkBrowseResponse)
async def browse_chunks(
    request: ChunkBrowseRequest,
    rag_service: RAGService = Depends(get_rag_service),
):
    """Browse chunks in a vector database for debugging and visualization."""
    try:
        return await rag_service.browse_chunks(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/prompts/{prompt_name}")
async def get_prompt_content(prompt_name: str):
    """Get the content of a specific prompt file."""
    try:
        # Validate prompt name to prevent path traversal
        if not prompt_name.replace("_", "").replace("-", "").isalnum():
            raise HTTPException(status_code=400, detail="Invalid prompt name")

        prompts_dir = Path(__file__).parent.parent / "prompts"
        prompt_file = prompts_dir / f"{prompt_name}.md"

        if not prompt_file.exists():
            raise HTTPException(status_code=404, detail="Prompt not found")

        with open(prompt_file, "r", encoding="utf-8") as f:
            content = f.read()

        return {
            "name": prompt_name,
            "content": content,
            "file_path": f"src/rhoai_ai_feature_sizing/prompts/{prompt_name}.md",
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting prompt {prompt_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/jira/metrics", response_model=JiraMetricsResponse)
async def get_jira_metrics(
    request: JiraMetricsRequest,
    service: SessionService = Depends(get_session_service),
):
    """
    Get comprehensive metrics for a JIRA issue and all its children recursively.
    Only processes issues with resolution 'Done'.
    """
    try:
        # Run the metrics calculation in a thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, service.get_jira_metrics, request.jira_key
        )

        # Convert to response model
        components = {}
        for comp_name, comp_data in result["components"].items():
            components[comp_name] = ComponentMetrics(
                total_story_points=comp_data["total_story_points"],
                total_days_to_done=comp_data["total_days_to_done"],
            )

        return JiraMetricsResponse(
            components=components,
            total_story_points=result["total_story_points"],
            total_days_to_done=result["total_days_to_done"],
            processed_issues=result["processed_issues"],
            done_issues=result["done_issues"],
        )

    except Exception as e:
        logging.error(f"Error getting JIRA metrics for {request.jira_key}: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to calculate JIRA metrics: {str(e)}"
        )


# Epic and Story endpoints
@app.get("/sessions/{session_id}/epics", response_model=EpicListResponse)
async def get_session_epics(
    session_id: uuid.UUID,
    service: SessionService = Depends(get_session_service),
):
    """Get all epics for a session."""
    try:
        epics = service.get_session_epics(session_id)
        return EpicListResponse(epics=epics, total=len(epics))
    except Exception as e:
        logging.error(f"Error getting epics for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/sessions/{session_id}/epics", response_model=EpicResponse)
async def create_epic(
    session_id: uuid.UUID,
    epic_data: EpicCreate,
    service: SessionService = Depends(get_session_service),
):
    """Create a new epic for a session."""
    try:
        epic = service.create_epic(session_id, epic_data)
        return epic
    except Exception as e:
        logging.error(f"Error creating epic for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/epics/{epic_id}", response_model=EpicResponse)
async def get_epic(
    epic_id: uuid.UUID,
    service: SessionService = Depends(get_session_service),
):
    """Get an epic by ID."""
    try:
        epic = service.get_epic(epic_id)
        if not epic:
            raise HTTPException(status_code=404, detail="Epic not found")
        return epic
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting epic {epic_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/epics/{epic_id}", response_model=EpicResponse)
async def update_epic(
    epic_id: uuid.UUID,
    epic_data: EpicUpdate,
    service: SessionService = Depends(get_session_service),
):
    """Update an epic."""
    try:
        epic = service.update_epic(epic_id, epic_data)
        if not epic:
            raise HTTPException(status_code=404, detail="Epic not found")
        return epic
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error updating epic {epic_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/epics/{epic_id}")
async def delete_epic(
    epic_id: uuid.UUID,
    service: SessionService = Depends(get_session_service),
):
    """Delete an epic and all its stories."""
    try:
        success = service.delete_epic(epic_id)
        if not success:
            raise HTTPException(status_code=404, detail="Epic not found")
        return {"message": "Epic deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error deleting epic {epic_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/epics/{epic_id}/stories", response_model=StoryListResponse)
async def get_epic_stories(
    epic_id: uuid.UUID,
    service: SessionService = Depends(get_session_service),
):
    """Get all stories for an epic."""
    try:
        stories = service.get_epic_stories(epic_id)
        return StoryListResponse(stories=stories, total=len(stories))
    except Exception as e:
        logging.error(f"Error getting stories for epic {epic_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/epics/{epic_id}/stories", response_model=StoryResponse)
async def create_story(
    epic_id: uuid.UUID,
    story_data: StoryCreate,
    service: SessionService = Depends(get_session_service),
):
    """Create a new story for an epic."""
    try:
        story = service.create_story(epic_id, story_data)
        return story
    except Exception as e:
        logging.error(f"Error creating story for epic {epic_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stories/{story_id}", response_model=StoryResponse)
async def get_story(
    story_id: uuid.UUID,
    service: SessionService = Depends(get_session_service),
):
    """Get a story by ID."""
    try:
        story = service.get_story(story_id)
        if not story:
            raise HTTPException(status_code=404, detail="Story not found")
        return story
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting story {story_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/stories/{story_id}", response_model=StoryResponse)
async def update_story(
    story_id: uuid.UUID,
    story_data: StoryUpdate,
    service: SessionService = Depends(get_session_service),
):
    """Update a story."""
    try:
        story = service.update_story(story_id, story_data)
        if not story:
            raise HTTPException(status_code=404, detail="Story not found")
        return story
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error updating story {story_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/stories/{story_id}")
async def delete_story(
    story_id: uuid.UUID,
    service: SessionService = Depends(get_session_service),
):
    """Delete a story."""
    try:
        success = service.delete_story(story_id)
        if not success:
            raise HTTPException(status_code=404, detail="Story not found")
        return {"message": "Story deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error deleting story {story_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# WebSocket endpoint for real-time updates
@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time session updates."""
    await ws_manager.connect(websocket, session_id)
    try:
        while True:
            # Keep connection alive - we only send, don't receive
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, session_id)


if __name__ == "__main__":
    import uvicorn
    import os

    # Setup logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    # Run the application
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")

    uvicorn.run(
        "rhoai_ai_feature_sizing.api.main:app", host=host, port=port, reload=True
    )
