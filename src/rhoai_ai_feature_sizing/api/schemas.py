"""Schema definitions for the API - minimal set for compatibility."""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class VectorDBConfig(BaseModel):
    """Configuration for creating a vector database."""

    vector_db_id: str = Field(
        ..., description="Unique identifier for the vector database"
    )
    name: str = Field(..., description="Human-readable name")
    description: str = Field(
        default="", description="Description of the vector database"
    )
    embedding_model: str = Field(
        default="all-MiniLM-L6-v2", description="Embedding model to use"
    )
    embedding_dimension: int = Field(
        default=384, description="Dimension of the embedding vectors"
    )
    use_case: str = Field(default="general", description="Use case category")


class DocumentSource(BaseModel):
    """Source document for ingestion."""

    name: str = Field(..., description="Document name")
    url: str = Field(..., description="Document URL or path")
    mime_type: str = Field(default="text/plain", description="MIME type")
    content: Optional[str] = Field(None, description="Document content")
    metadata: Dict[str, Any] = Field(
        default_factory=dict, description="Additional metadata"
    )


class DocumentIngestionRequest(BaseModel):
    """Request to ingest documents into a vector database."""

    vector_db_id: str = Field(..., description="Target vector database ID")
    documents: List[DocumentSource] = Field(..., description="Documents to ingest")
    chunk_size: int = Field(default=512, description="Chunk size for splitting")
    chunk_overlap: int = Field(default=50, description="Overlap between chunks")


class RAGQueryRequest(BaseModel):
    """Request to query vector databases."""

    vector_db_ids: List[str] = Field(..., description="Vector database IDs to search")
    query: str = Field(..., description="Search query")
    max_chunks: int = Field(default=5, description="Maximum chunks to return")
    similarity_threshold: float = Field(default=0.7, description="Similarity threshold")


class VectorDBUpdateRequest(BaseModel):
    """Request to update vector database configuration."""

    name: Optional[str] = Field(None, description="New name")
    description: Optional[str] = Field(None, description="New description")
    is_active: Optional[bool] = Field(None, description="Active status")


class DocumentInfo(BaseModel):
    """Document information."""

    document_id: str = Field(..., description="Document ID")
    name: str = Field(..., description="Document name")
    url: str = Field(..., description="Document URL")
    mime_type: str = Field(..., description="MIME type")
    size: int = Field(..., description="Document size in bytes")
    chunk_count: int = Field(..., description="Number of chunks")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class VectorDBInfo(BaseModel):
    """Vector database information."""

    vector_db_id: str = Field(..., description="Vector database ID")
    name: str = Field(..., description="Name")
    description: str = Field(..., description="Description")
    embedding_model: str = Field(..., description="Embedding model")
    document_count: int = Field(default=0, description="Number of documents")
    chunk_count: int = Field(default=0, description="Number of chunks")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: Optional[datetime] = Field(None, description="Last update timestamp")


class RAGQueryResponse(BaseModel):
    """Response from RAG query."""

    chunks: List[Dict[str, Any]] = Field(..., description="Retrieved chunks")
    total_found: int = Field(..., description="Total chunks found")
    query_time_ms: float = Field(
        ..., description="Query execution time in milliseconds"
    )


class DocumentIngestionResponse(BaseModel):
    """Response from document ingestion."""

    vector_db_id: str = Field(..., description="Vector database ID")
    ingested_documents: List[DocumentInfo] = Field(
        ..., description="Successfully ingested documents"
    )
    failed_documents: List[Dict[str, str]] = Field(
        default_factory=list, description="Failed documents with errors"
    )
    total_chunks_created: int = Field(..., description="Total chunks created")
    errors: List[str] = Field(default_factory=list, description="General errors")


class VectorDBListResponse(BaseModel):
    """Response from listing vector databases."""

    vector_dbs: List[VectorDBInfo] = Field(..., description="Vector databases")
    total_count: int = Field(..., description="Total count")


class DocumentListResponse(BaseModel):
    """Response from listing documents."""

    vector_db_id: str = Field(..., description="Vector database ID")
    documents: List[DocumentInfo] = Field(..., description="Documents")
    total_count: int = Field(..., description="Total count")


class ChunkBrowseRequest(BaseModel):
    """Request to browse chunks."""

    vector_db_id: str = Field(..., description="Vector database ID")
    document_id: Optional[str] = Field(None, description="Filter by document ID")
    page: int = Field(default=1, description="Page number")
    page_size: int = Field(default=20, description="Page size")


class ChunkBrowseResponse(BaseModel):
    """Response from browsing chunks."""

    chunks: List[Dict[str, Any]] = Field(..., description="Chunks")
    total_count: int = Field(..., description="Total count")
    page: int = Field(..., description="Current page")
    page_size: int = Field(..., description="Page size")


# Task management schemas
class BackgroundTaskInfo(BaseModel):
    """Background task information."""

    task_id: str = Field(..., description="Task ID")
    task_type: str = Field(..., description="Task type")
    status: str = Field(..., description="Task status")
    progress: float = Field(default=0.0, description="Progress percentage")
    current_step: Optional[str] = Field(None, description="Current processing step")
    processed_items: Optional[int] = Field(None, description="Items processed so far")
    total_items: Optional[int] = Field(None, description="Total items to process")
    result: Optional[Dict[str, Any]] = Field(None, description="Task result")
    error: Optional[str] = Field(None, description="Error message")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class TaskStatus(str, Enum):
    """Task status enumeration."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
