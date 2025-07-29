"""Pydantic models for API request and response schemas."""

import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
import json

from pydantic import BaseModel, Field
from .models import SessionStatus, Stage, MessageRole, MessageStatus


# Request schemas
class CreateSessionRequest(BaseModel):
    """Request to create a new processing session."""

    jira_key: str = Field(..., description="Jira issue key (e.g., PROJ-123)")
    soft_mode: bool = Field(
        True,
        description="If True, only generate structure without creating actual Jira tickets",
    )
    custom_prompts: Optional[Dict[str, str]] = Field(
        None,
        description="Optional custom prompts for stages. Keys should be prompt names (e.g., 'refine_feature', 'draft_jiras')",
    )


class JiraMetricsRequest(BaseModel):
    """Request to get JIRA metrics for an epic and all its children."""

    jira_key: str = Field(..., description="Jira issue key (e.g., PROJ-123)")


# Response schemas
class MessageResponse(BaseModel):
    """Chat message response."""

    id: uuid.UUID
    role: MessageRole
    content: str
    stage: Optional[Stage]
    status: MessageStatus
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
    stage: Stage
    tool_name: str
    input_data: Optional[dict] = None
    output_data: Optional[dict] = None
    timestamp: datetime
    duration_ms: Optional[int]
    success: bool
    error_message: Optional[str]

    @classmethod
    def from_model(cls, mcp_usage) -> "MCPUsageResponse":
        """Create response from model, converting JSON strings to dicts."""
        import json

        input_data = None
        output_data = None

        if mcp_usage.request_data:
            try:
                input_data = json.loads(mcp_usage.request_data)
            except json.JSONDecodeError:
                input_data = {"raw": mcp_usage.request_data}

        if mcp_usage.response_data:
            try:
                output_data = json.loads(mcp_usage.response_data)
            except json.JSONDecodeError:
                output_data = {"raw": mcp_usage.response_data}

        return cls(
            id=mcp_usage.id,
            stage=mcp_usage.stage,
            tool_name=mcp_usage.tool_name,
            input_data=input_data,
            output_data=output_data,
            timestamp=mcp_usage.timestamp,
            duration_ms=mcp_usage.duration_ms,
            success=mcp_usage.success,
            error_message=mcp_usage.error_message,
        )

    class Config:
        from_attributes = True


class SessionResponse(BaseModel):
    """Session status response."""

    id: uuid.UUID
    jira_key: str
    status: SessionStatus
    current_stage: Optional[Stage]
    soft_mode: bool
    custom_prompts: Optional[Dict[str, str]] = Field(
        None, description="Custom prompts used for this session"
    )
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error_message: Optional[str]

    @classmethod
    def from_model(cls, session):
        """Create response from model, handling JSON deserialization of custom_prompts."""
        custom_prompts = None
        if session.custom_prompts:
            try:
                # Handle both string (JSON) and dict cases
                if isinstance(session.custom_prompts, str):
                    custom_prompts = json.loads(session.custom_prompts)
                elif isinstance(session.custom_prompts, dict):
                    custom_prompts = session.custom_prompts
                else:
                    custom_prompts = None
            except json.JSONDecodeError:
                custom_prompts = None

        return cls(
            id=session.id,
            jira_key=session.jira_key,
            status=session.status,
            current_stage=session.current_stage,
            soft_mode=session.soft_mode,
            custom_prompts=custom_prompts,
            created_at=session.created_at,
            updated_at=session.updated_at,
            started_at=session.started_at,
            completed_at=session.completed_at,
            error_message=session.error_message,
        )

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


class ComponentMetrics(BaseModel):
    """Metrics for a specific component."""

    total_story_points: int = Field(
        0, description="Total story points for the component"
    )
    total_days_to_done: float = Field(
        0.0, description="Total days from earliest start to latest resolution"
    )


class JiraMetricsResponse(BaseModel):
    """Response containing JIRA metrics by component and overall totals."""

    components: Dict[str, ComponentMetrics] = Field(
        default_factory=dict, description="Metrics grouped by component name"
    )
    total_story_points: int = Field(
        0, description="Total story points across all components"
    )
    total_days_to_done: float = Field(
        0.0, description="Total days from earliest start to latest resolution"
    )
    processed_issues: int = Field(0, description="Number of issues processed")
    done_issues: int = Field(0, description="Number of issues with resolution 'Done'")
