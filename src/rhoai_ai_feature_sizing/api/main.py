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

from .models import init_database, SessionStatus, Stage
from .schemas import (
    CreateSessionRequest,
    SessionResponse,
    SessionDetailResponse,
    MessageResponse,
    OutputResponse,
    MCPUsageResponse,
    HealthResponse,
    ProgressResponse,
    SessionListResponse,
    JiraMetricsRequest,
    ComponentMetrics,
    JiraMetricsResponse,
)
from .services import SessionService
from ..llama_stack_setup import get_llama_stack_client


# Global service instance
session_service = None


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
    global session_service

    # Startup
    logging.info("Initializing database...")
    init_database()

    logging.info("Creating session service...")
    session_service = SessionService()

    # Set WebSocket manager on session service
    session_service.set_websocket_manager(ws_manager)

    logging.info("API startup complete")

    yield

    # Shutdown
    logging.info("API shutdown complete")


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
            request.jira_key, request.soft_mode, request.custom_prompts
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


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: uuid.UUID):
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
