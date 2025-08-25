"""Simplified schemas for the unified feature sizing API."""

import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any, Union
from enum import Enum

from pydantic import BaseModel, Field


class SessionStatus(str, Enum):
    """Simplified session status."""

    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    ERROR = "error"


class ChatRole(str, Enum):
    """Chat message roles."""

    USER = "user"
    AGENT = "agent"
    SYSTEM = "system"


# Request Schemas
class CreateSessionRequest(BaseModel):
    """Request to create a new session."""

    jira_key: str = Field(..., description="JIRA issue key to process")
    rag_store_ids: Optional[List[str]] = Field(
        None, description="Vector database IDs to use for context"
    )
    existing_refinement: Optional[str] = Field(
        None, description="Optional existing refinement document"
    )
    custom_prompts: Optional[Dict[str, str]] = Field(
        None, description="Optional custom prompts to use"
    )


class ChatMessageRequest(BaseModel):
    """Request to send a chat message."""

    message: str = Field(..., description="User's message")


class RAGQueryRequest(BaseModel):
    """Request to query RAG stores."""

    query: str = Field(..., description="Search query")
    rag_store_ids: List[str] = Field(..., description="RAG stores to search")
    max_results: int = Field(default=5, description="Maximum results to return")


class CreateRAGStoreRequest(BaseModel):
    """Request to create a new RAG store."""

    store_id: str = Field(..., description="Unique identifier")
    name: str = Field(..., description="Human-readable name")
    description: Optional[str] = Field(None, description="Description")


class LlamaIndexProcessingType(str, Enum):
    """LlamaIndex processing types."""

    WEB_SCRAPING = "web_scraping"
    GITHUB_REPO = "github_repo"
    GITHUB_FILE = "github_file"
    PDF_DOCUMENT = "pdf_document"
    TEXT_DOCUMENT = "text_document"
    API_DOCUMENTATION = "api_documentation"
    MARKDOWN = "markdown"


class IngestDocumentsRequest(BaseModel):
    """Request to ingest documents into a RAG store."""

    store_id: str = Field(..., description="RAG store ID")
    documents: List[Dict[str, Any]] = Field(..., description="Documents to ingest")
    processing_type: LlamaIndexProcessingType = Field(
        ..., description="Type of LlamaIndex processing to use"
    )
    enable_progress_tracking: bool = Field(
        default=True, description="Enable progress tracking and session creation"
    )


class IngestionSessionResponse(BaseModel):
    """Response for starting an ingestion session."""

    session_id: str = Field(..., description="Background task session ID")
    store_id: str = Field(..., description="RAG store ID")
    processing_type: LlamaIndexProcessingType = Field(
        ..., description="Processing type being used"
    )
    document_count: int = Field(..., description="Number of documents being processed")
    message: str = Field(..., description="Status message")


class IngestionProgressResponse(BaseModel):
    """Response for ingestion progress updates."""

    session_id: str = Field(..., description="Session ID")
    status: str = Field(
        ..., description="Task status (pending, running, completed, failed)"
    )
    progress: float = Field(..., description="Progress as a decimal (0.0 to 1.0)")
    current_step: Optional[str] = Field(None, description="Current processing step")
    processed_items: Optional[int] = Field(None, description="Items processed so far")
    total_items: Optional[int] = Field(None, description="Total items to process")
    error_message: Optional[str] = Field(None, description="Error message if failed")
    result: Optional[Dict[str, Any]] = Field(
        None, description="Result data if completed"
    )
    created_at: str = Field(..., description="Session creation time")
    started_at: Optional[str] = Field(None, description="Processing start time")
    completed_at: Optional[str] = Field(None, description="Processing completion time")


# Response Schemas
class ChatMessage(BaseModel):
    """Chat message."""

    id: str = Field(..., description="Message ID")
    role: ChatRole = Field(..., description="Message role")
    content: str = Field(..., description="Message content")
    timestamp: datetime = Field(..., description="Message timestamp")
    actions: Optional[List[str]] = Field(
        default_factory=list, description="Actions taken (for agent messages)"
    )


class SessionResponse(BaseModel):
    """Session information."""

    id: str = Field(..., description="Session ID")
    jira_key: str = Field(..., description="JIRA key being processed")
    status: SessionStatus = Field(..., description="Current status")
    rag_store_ids: List[str] = Field(
        default_factory=list, description="RAG stores being used"
    )
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    # Content fields
    refinement_content: Optional[str] = Field(
        None, description="Current refinement document"
    )
    jira_structure: Optional[Dict[str, Any]] = Field(
        None, description="Current JIRA structure (JSON)"
    )

    # Progress info
    progress_message: Optional[str] = Field(
        None, description="Current progress message"
    )
    error_message: Optional[str] = Field(
        None, description="Error message if status is ERROR"
    )


class ChatResponse(BaseModel):
    """Response from chat interaction."""

    message_id: str = Field(..., description="ID of user's message")
    agent_message_id: str = Field(..., description="ID of agent's response")
    agent_response: str = Field(..., description="Agent's response content")
    actions_taken: List[str] = Field(
        default_factory=list, description="Actions performed by agent"
    )
    updated_content: Dict[str, bool] = Field(
        default_factory=dict,
        description="Which content was updated (refinement, jiras, etc.)",
    )


class RAGStoreInfo(BaseModel):
    """RAG store information."""

    store_id: str = Field(..., description="Store ID")
    name: str = Field(..., description="Store name")
    description: Optional[str] = Field(None, description="Store description")
    document_count: int = Field(default=0, description="Number of documents")
    created_at: datetime = Field(..., description="Creation timestamp")


class RAGQueryResponse(BaseModel):
    """Response from RAG query."""

    results: List[Dict[str, Any]] = Field(..., description="Search results")
    total_found: int = Field(..., description="Total results found")
    stores_searched: List[str] = Field(..., description="Stores that were searched")
    query_time_ms: float = Field(..., description="Query time in milliseconds")


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = Field(default="healthy", description="Overall status")
    timestamp: datetime = Field(
        default_factory=datetime.utcnow, description="Check time"
    )
    services: Dict[str, str] = Field(
        default_factory=dict, description="Status of individual services"
    )


# Detailed Response Schemas
class SessionDetailResponse(SessionResponse):
    """Detailed session response with chat history."""

    chat_history: List[ChatMessage] = Field(
        default_factory=list, description="Recent chat messages"
    )


class SessionListResponse(BaseModel):
    """List of sessions response."""

    sessions: List[SessionResponse] = Field(..., description="Session list")
    total: int = Field(..., description="Total number of sessions")
    page: int = Field(default=1, description="Current page")
    page_size: int = Field(default=20, description="Items per page")


class RAGStoreListResponse(BaseModel):
    """List of RAG stores response."""

    stores: List[RAGStoreInfo] = Field(..., description="RAG store list")
    total: int = Field(..., description="Total number of stores")


# Content Response Schemas
class RefinementResponse(BaseModel):
    """Refinement document response."""

    content: str = Field(..., description="Refinement document content (Markdown)")
    last_updated: datetime = Field(..., description="Last update timestamp")
    word_count: int = Field(..., description="Word count")


class JiraStructureResponse(BaseModel):
    """JIRA structure response."""

    structure: Dict[str, Any] = Field(..., description="JIRA structure (JSON)")
    last_updated: datetime = Field(..., description="Last update timestamp")
    epic_count: int = Field(default=0, description="Number of epics")
    story_count: int = Field(default=0, description="Number of stories")


class EstimatesResponse(BaseModel):
    """Estimates response."""

    estimates: Dict[str, Any] = Field(..., description="Estimation data")
    total_story_points: int = Field(default=0, description="Total story points")
    total_hours: float = Field(default=0.0, description="Total estimated hours")
    last_updated: datetime = Field(..., description="Last update timestamp")


# Error Response Schema
class ErrorResponse(BaseModel):
    """Standard error response."""

    error: str = Field(..., description="Error type")
    message: str = Field(..., description="Error message")
    details: Optional[Dict[str, Any]] = Field(
        None, description="Additional error details"
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow, description="Error time"
    )


# Internal Models for Database
class SimpleSession(BaseModel):
    """Simplified session model for database storage."""

    id: str
    jira_key: str
    status: SessionStatus
    rag_store_ids: List[str]
    refinement_content: Optional[str] = None
    jira_structure: Optional[Dict[str, Any]] = None
    chat_history: List[ChatMessage] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    progress_message: Optional[str] = None
    error_message: Optional[str] = None

    class Config:
        """Pydantic config."""

        use_enum_values = True
        json_encoders = {datetime: lambda v: v.isoformat()}


# Utility functions
def create_session_id() -> str:
    """Create a new session ID."""
    return str(uuid.uuid4())


def create_message_id() -> str:
    """Create a new message ID."""
    return str(uuid.uuid4())


def create_chat_message(
    role: ChatRole, content: str, actions: Optional[List[str]] = None
) -> ChatMessage:
    """Create a new chat message."""
    return ChatMessage(
        id=create_message_id(),
        role=role,
        content=content,
        timestamp=datetime.utcnow(),
        actions=actions or [],
    )


# Project Management Schemas
class ProjectStoreType(str, Enum):
    """Types of stores available within a project."""

    GITHUB_REPOS = "github_repos"
    WEB_CONTENT = "web_content"
    API_DOCS = "api_docs"
    CODE_FILES = "code_files"
    DOCUMENTS = "documents"
    DEFAULT = "default"


class CreateProjectRequest(BaseModel):
    """Request to create a new project."""

    project_id: str = Field(..., description="Unique project identifier")
    name: str = Field(..., description="Human-readable project name")
    description: Optional[str] = Field(None, description="Project description")
    project_type: str = Field(default="feature_sizing", description="Type of project")
    created_by: Optional[str] = Field(None, description="User who created the project")


class ProjectResponse(BaseModel):
    """Response for project information."""

    project_id: str = Field(..., description="Project ID")
    name: str = Field(..., description="Project name")
    description: Optional[str] = Field(None, description="Project description")
    project_type: str = Field(..., description="Project type")
    created_by: Optional[str] = Field(None, description="Creator")
    auto_routing_enabled: bool = Field(..., description="Auto-routing enabled")
    is_active: bool = Field(..., description="Active status")
    created_at: str = Field(..., description="Creation timestamp")
    last_updated: Optional[str] = Field(None, description="Last update timestamp")

    # Store information
    stores: List[Dict[str, Any]] = Field(default=[], description="Project stores")
    total_documents: int = Field(default=0, description="Total documents in project")


class ProjectListResponse(BaseModel):
    """Response for listing projects."""

    projects: List[ProjectResponse] = Field(..., description="List of projects")
    total: int = Field(..., description="Total project count")


class ProjectIngestRequest(BaseModel):
    """Request to ingest documents into a project with auto-routing."""

    project_id: str = Field(..., description="Target project ID")
    documents: List[Dict[str, Any]] = Field(..., description="Documents to ingest")
    processing_type: LlamaIndexProcessingType = Field(
        ..., description="Processing type"
    )
    enable_progress_tracking: bool = Field(
        default=True, description="Enable progress tracking"
    )
    override_routing: Optional[Dict[str, str]] = Field(
        None, description="Override auto-routing: {document_url: store_type}"
    )


class DocumentResponse(BaseModel):
    """Response for document information."""

    document_id: str = Field(..., description="Document ID")
    name: str = Field(..., description="Document name")
    source_url: str = Field(..., description="Source URL")
    mime_type: str = Field(..., description="MIME type")
    source_type: Optional[str] = Field(
        None, description="Source type (github_repo, web_page, etc.)"
    )
    rag_store_name: Optional[str] = Field(None, description="RAG store name")
    rag_store_type: Optional[str] = Field(None, description="RAG store type")
    ingestion_date: str = Field(..., description="Ingestion timestamp")
    last_updated: Optional[str] = Field(None, description="Last update timestamp")
    chunk_count: int = Field(default=0, description="Number of chunks")
    ingestion_method: str = Field(default="manual", description="Ingestion method")
    document_metadata: Optional[Dict[str, Any]] = Field(
        None, description="Additional metadata"
    )
    is_active: bool = Field(default=True, description="Active status")


class ProjectDocumentsResponse(BaseModel):
    """Response for project documents."""

    project_id: str = Field(..., description="Project ID")
    documents: List[DocumentResponse] = Field(
        default=[], description="List of documents"
    )
    total: int = Field(default=0, description="Total number of documents")
