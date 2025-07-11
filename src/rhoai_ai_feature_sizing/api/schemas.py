"""Pydantic models for API request and response schemas."""

import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any

from pydantic import BaseModel, Field
from .models import SessionStatus, Stage, MessageRole


# Request schemas
class CreateSessionRequest(BaseModel):
    """Request to create a new processing session."""

    jira_key: str = Field(..., description="Jira issue key (e.g., PROJ-123)")
    soft_mode: bool = Field(
        True,
        description="If True, only generate structure without creating actual Jira tickets",
    )


# Response schemas
class MessageResponse(BaseModel):
    """Chat message response."""

    id: uuid.UUID
    role: MessageRole
    content: str
    stage: Optional[Stage]
    timestamp: datetime
    message_metadata: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class OutputResponse(BaseModel):
    """Output file response."""

    id: uuid.UUID
    stage: Stage
    filename: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class MCPUsageResponse(BaseModel):
    """MCP usage tracking response."""

    id: uuid.UUID
    tool_name: str
    timestamp: datetime
    duration_ms: Optional[int]
    success: bool
    error_message: Optional[str]

    class Config:
        from_attributes = True


class SessionResponse(BaseModel):
    """Session status response."""

    id: uuid.UUID
    jira_key: str
    status: SessionStatus
    current_stage: Optional[Stage]
    soft_mode: bool
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error_message: Optional[str]

    class Config:
        from_attributes = True


class SessionDetailResponse(SessionResponse):
    """Detailed session response with related data."""

    messages: List[MessageResponse] = []
    outputs: List[OutputResponse] = []
    mcp_usages: List[MCPUsageResponse] = []


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = "healthy"
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    version: str = "1.0.0"
    database: str = "connected"
    llama_stack: str = "unknown"


class ProgressResponse(BaseModel):
    """Progress update response."""

    session_id: uuid.UUID
    status: SessionStatus
    current_stage: Optional[Stage]
    progress_percentage: int = Field(ge=0, le=100)
    latest_message: Optional[str] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    estimated_completion: Optional[datetime] = None


class SessionListResponse(BaseModel):
    """List of sessions response."""

    sessions: List[SessionResponse]
    total: int
    page: int
    page_size: int


class StageProgressUpdate(BaseModel):
    """Internal model for stage progress updates."""

    stage: Stage
    status: str
    message: str
    progress_percentage: int = 0
    metadata: Optional[Dict[str, Any]] = None
