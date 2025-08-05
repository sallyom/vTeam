"""Pydantic models for API request and response schemas."""

import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any, Union
from enum import Enum
import json

from pydantic import BaseModel, Field
from pydantic.types import UUID4
from .models import (
    SessionStatus,
    Stage,
    MessageRole,
    MessageStatus,
    EpicStatus,
    StoryStatus,
    Priority,
)


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
    vector_db_ids: Optional[List[str]] = Field(
        None,
        description="Optional list of vector database IDs to use for RAG queries in this session",
    )


class JiraMetricsRequest(BaseModel):
    """Request to get JIRA metrics for an epic and all its children."""

    jira_key: str = Field(..., description="Jira issue key (e.g., PROJ-123)")


# RAG-related schemas
class DocumentSource(BaseModel):
    """Document source configuration."""

    name: str = Field(..., description="Human-readable name for the source")
    url: str = Field(..., description="URL or path to the document source")
    mime_type: str = Field(
        default="text/plain", description="MIME type of the document"
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default_factory=dict, description="Additional metadata"
    )


class VectorDBConfig(BaseModel):
    """Vector database configuration."""

    vector_db_id: str = Field(
        ..., description="Unique identifier for the vector database"
    )
    name: str = Field(..., description="Human-readable name for the vector database")
    description: Optional[str] = Field(
        None, description="Description of the vector database purpose"
    )
    embedding_model: str = Field(
        default="all-MiniLM-L6-v2", description="Embedding model to use"
    )
    embedding_dimension: int = Field(default=384, description="Dimension of embeddings")
    use_case: str = Field(
        ...,
        description="Primary use case (e.g., 'patternfly', 'github_repos', 'documentation')",
    )


class DocumentIngestionRequest(BaseModel):
    """Request to ingest documents into a vector database."""

    vector_db_id: str = Field(..., description="Target vector database ID")
    documents: List[DocumentSource] = Field(
        ..., description="List of documents to ingest"
    )
    chunk_size_in_tokens: int = Field(
        default=512, description="Size of chunks in tokens"
    )
    chunk_overlap_in_tokens: int = Field(
        default=0, description="Overlap between chunks in tokens"
    )


class RAGQueryRequest(BaseModel):
    """Request to query RAG system."""

    vector_db_ids: List[str] = Field(..., description="Vector database IDs to search")
    query: str = Field(..., description="Query text")
    max_chunks: int = Field(
        default=5, description="Maximum number of chunks to retrieve"
    )
    chunk_template: Optional[str] = Field(
        None, description="Template for formatting retrieved chunks"
    )


class VectorDBUpdateRequest(BaseModel):
    """Request to update vector database documents."""

    vector_db_id: str = Field(..., description="Vector database ID")
    document_ids: Optional[List[str]] = Field(
        None, description="Specific document IDs to update (if None, updates all)"
    )


# RAG Response schemas
class DocumentInfo(BaseModel):
    """Information about an ingested document."""

    document_id: str
    source_url: str
    mime_type: str
    ingestion_date: datetime
    chunk_count: int
    metadata: Dict[str, Any]

    class Config:
        from_attributes = True


class VectorDBInfo(BaseModel):
    """Information about a vector database."""

    vector_db_id: str
    name: str
    description: Optional[str]
    embedding_model: str
    embedding_dimension: int
    use_case: str
    document_count: int
    total_chunks: int
    created_at: datetime
    last_updated: Optional[datetime]

    class Config:
        from_attributes = True


class RAGQueryResponse(BaseModel):
    """Response from RAG query."""

    chunks: List[Dict[str, Any]] = Field(
        ..., description="Retrieved chunks with content and metadata"
    )
    total_chunks_found: int = Field(..., description="Total number of chunks found")
    vector_dbs_searched: List[str] = Field(
        ..., description="Vector databases that were searched"
    )
    query_time_ms: float = Field(
        ..., description="Time taken for query in milliseconds"
    )


class DocumentIngestionResponse(BaseModel):
    """Response from document ingestion."""

    vector_db_id: str
    ingested_documents: List[DocumentInfo]
    total_chunks_created: int
    ingestion_time_ms: float
    errors: List[str] = Field(
        default_factory=list, description="Any errors during ingestion"
    )


class VectorDBListResponse(BaseModel):
    """Response listing all vector databases."""

    vector_dbs: List[VectorDBInfo]
    total_count: int


class DocumentListResponse(BaseModel):
    """Response listing documents in a vector database."""

    vector_db_id: str
    documents: List[DocumentInfo]
    total_count: int


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
    vector_db_ids: Optional[List[str]] = Field(
        None, description="Vector database IDs selected for this session"
    )
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error_message: Optional[str]

    @classmethod
    def from_model(cls, session):
        """Create response from model, handling JSON deserialization of custom_prompts and vector_db_ids."""
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

        vector_db_ids = None
        if session.vector_db_ids:
            try:
                # Handle both string (JSON) and list cases
                if isinstance(session.vector_db_ids, str):
                    vector_db_ids = json.loads(session.vector_db_ids)
                elif isinstance(session.vector_db_ids, list):
                    vector_db_ids = session.vector_db_ids
                else:
                    vector_db_ids = None
            except json.JSONDecodeError:
                vector_db_ids = None

        return cls(
            id=session.id,
            jira_key=session.jira_key,
            status=session.status,
            current_stage=session.current_stage,
            soft_mode=session.soft_mode,
            custom_prompts=custom_prompts,
            vector_db_ids=vector_db_ids,
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


class ChunkInfo(BaseModel):
    chunk_id: str
    content: str
    metadata: Dict[str, Any]
    document_id: Optional[str] = None
    embedding: Optional[List[float]] = None


class ChunkBrowseRequest(BaseModel):
    vector_db_id: str
    search_query: Optional[str] = None  # Optional text search within chunks
    limit: int = 20
    offset: int = 0


class ChunkBrowseResponse(BaseModel):
    chunks: List[ChunkInfo]
    total_chunks: int
    vector_db_id: str


# Background Task System for Long-Running Operations
class TaskStatus(str, Enum):
    """Status of a background task."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class BackgroundTaskInfo(BaseModel):
    """Information about a background task."""

    task_id: str
    status: TaskStatus
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    progress: float = 0.0  # 0.0 to 1.0
    current_step: Optional[str] = None
    total_items: Optional[int] = None
    processed_items: int = 0
    error_message: Optional[str] = None
    result: Optional[Dict[str, Any]] = None


class BulkIngestionTaskRequest(BaseModel):
    """Request to start a bulk ingestion background task."""

    vector_db_id: str
    documents: List[DocumentSource]
    chunk_size_in_tokens: int = 512
    chunk_overlap_in_tokens: int = 0
    use_llamaindex: bool = True


class BulkIngestionTaskResponse(BaseModel):
    """Response when starting a bulk ingestion task."""

    task_id: str
    status: TaskStatus
    message: str
    estimated_duration_minutes: Optional[int] = None


# Epic and Story schemas
class StoryCreate(BaseModel):
    """Schema for creating a story."""

    title: str = Field(..., description="Story title", max_length=500)
    description: Optional[str] = Field(
        None,
        description="Story description with markdown formatting including acceptance criteria and technical notes",
    )
    story_points: Optional[int] = Field(
        None, description="Story points (Fibonacci: 1, 2, 3, 5, 8, 13, 21)"
    )
    estimated_hours: Optional[float] = Field(
        None, description="Estimated hours for completion"
    )
    assignee: Optional[str] = Field(None, description="Assignee username or email")
    due_date: Optional[datetime] = Field(None, description="Due date")


class StoryUpdate(BaseModel):
    """Schema for updating a story."""

    title: Optional[str] = Field(None, description="Story title", max_length=500)
    description: Optional[str] = Field(
        None, description="Story description with markdown formatting"
    )
    status: Optional[StoryStatus] = Field(None, description="Story status")
    story_points: Optional[int] = Field(None, description="Story points")
    estimated_hours: Optional[float] = Field(None, description="Estimated hours")
    actual_hours: Optional[float] = Field(None, description="Actual hours worked")
    assignee: Optional[str] = Field(None, description="Assignee")
    due_date: Optional[datetime] = Field(None, description="Due date")


class StoryResponse(BaseModel):
    """Response schema for a story."""

    id: Union[UUID4, str]
    epic_id: Union[UUID4, str]
    title: str
    description: Optional[str]
    status: StoryStatus
    story_points: Optional[int]
    estimated_hours: Optional[float]
    actual_hours: float
    assignee: Optional[str]
    created_at: datetime
    updated_at: datetime
    due_date: Optional[datetime]

    class Config:
        from_attributes = True


class EpicCreate(BaseModel):
    """Schema for creating an epic."""

    title: str = Field(..., description="Epic title", max_length=500)
    description: Optional[str] = Field(None, description="Epic description")
    component_team: Optional[str] = Field(
        None, description="Team responsible for the epic", max_length=255
    )
    priority: Priority = Field(Priority.MEDIUM, description="Epic priority")
    estimated_hours: Optional[float] = Field(
        None, description="Estimated hours for completion"
    )
    due_date: Optional[datetime] = Field(None, description="Due date")
    stories: Optional[List[StoryCreate]] = Field(
        default_factory=list, description="Stories within this epic"
    )


class EpicUpdate(BaseModel):
    """Schema for updating an epic."""

    title: Optional[str] = Field(None, description="Epic title", max_length=500)
    description: Optional[str] = Field(None, description="Epic description")
    component_team: Optional[str] = Field(
        None, description="Team responsible for the epic", max_length=255
    )
    status: Optional[EpicStatus] = Field(None, description="Epic status")
    priority: Optional[Priority] = Field(None, description="Epic priority")
    estimated_hours: Optional[float] = Field(None, description="Estimated hours")
    actual_hours: Optional[float] = Field(None, description="Actual hours worked")
    completion_percentage: Optional[float] = Field(
        None, description="Completion percentage", ge=0, le=100
    )
    due_date: Optional[datetime] = Field(None, description="Due date")


class EpicResponse(BaseModel):
    """Response schema for an epic."""

    id: Union[UUID4, str]
    session_id: Union[UUID4, str]
    title: str
    description: Optional[str]
    component_team: Optional[str]
    status: EpicStatus
    priority: Priority
    estimated_hours: Optional[float]
    actual_hours: float
    completion_percentage: float
    created_at: datetime
    updated_at: datetime
    due_date: Optional[datetime]
    stories: List[StoryResponse]

    class Config:
        from_attributes = True


class EpicListResponse(BaseModel):
    """Response schema for listing epics."""

    epics: List[EpicResponse]
    total: int


class StoryListResponse(BaseModel):
    """Response schema for listing stories."""

    stories: List[StoryResponse]
    total: int
