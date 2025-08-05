"""Database models for the API."""

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
    JSON,
    Float,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.types import TypeDecorator, CHAR
import os

Base = declarative_base()


class GUID(TypeDecorator):
    """Platform-independent GUID type.
    Uses PostgreSQL's UUID type, otherwise uses CHAR(32), storing as stringified hex values.
    """

    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(UUID())
        else:
            return dialect.type_descriptor(CHAR(32))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        elif dialect.name == "postgresql":
            return str(value)
        else:
            if not isinstance(value, uuid.UUID):
                return "%.32x" % uuid.UUID(value).int
            else:
                return "%.32x" % value.int

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        else:
            if not isinstance(value, uuid.UUID):
                return uuid.UUID(value)
            else:
                return value


class SessionStatus(str, Enum):
    """Status of a processing session."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Stage(str, Enum):
    """Processing stages."""

    REFINE = "refine"
    EPICS = "epics"
    JIRAS = "jiras"
    ESTIMATE = "estimate"


class MessageRole(str, Enum):
    """Message roles in chat history."""

    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    AGENT = "agent"


class MessageStatus(str, Enum):
    """Status of a message."""

    LOADING = "loading"
    SUCCESS = "success"
    ERROR = "error"


class EpicStatus(str, Enum):
    """Status of an epic."""

    TODO = "todo"
    IN_PROGRESS = "in-progress"
    DONE = "done"
    CANCELLED = "cancelled"


class StoryStatus(str, Enum):
    """Status of a story."""

    TODO = "todo"
    IN_PROGRESS = "in-progress"
    DONE = "done"
    CANCELLED = "cancelled"


class Priority(str, Enum):
    """Priority levels for epics and stories."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Session(Base):
    """Main session tracking table."""

    __tablename__ = "sessions"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    jira_key = Column(String(50), nullable=False, index=True)
    status = Column(
        SQLEnum(SessionStatus), default=SessionStatus.PENDING, nullable=False
    )
    current_stage = Column(SQLEnum(Stage), nullable=True)
    soft_mode = Column(Boolean, default=True, nullable=False)
    custom_prompts = Column(Text, nullable=True)  # JSON string for custom prompts
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)

    # Relationships
    messages = relationship(
        "Message", back_populates="session", cascade="all, delete-orphan"
    )
    outputs = relationship(
        "Output", back_populates="session", cascade="all, delete-orphan"
    )
    mcp_usages = relationship(
        "MCPUsage", back_populates="session", cascade="all, delete-orphan"
    )
    rag_queries = relationship(
        "RAGQuery", back_populates="session", cascade="all, delete-orphan"
    )
    epics = relationship("Epic", back_populates="session", cascade="all, delete-orphan")

    def __repr__(self):
        return (
            f"<Session(id={self.id}, jira_key={self.jira_key}, status={self.status})>"
        )


class Message(Base):
    """Chat messages and agent communications."""

    __tablename__ = "messages"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    session_id = Column(GUID(), ForeignKey("sessions.id"), nullable=False, index=True)
    role = Column(SQLEnum(MessageRole), nullable=False)
    content = Column(Text, nullable=False)
    stage = Column(SQLEnum(Stage), nullable=True)
    status = Column(
        SQLEnum(MessageStatus), default=MessageStatus.SUCCESS, nullable=False
    )
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    message_metadata = Column(Text, nullable=True)  # JSON string for additional data

    # Relationships
    session = relationship("Session", back_populates="messages")

    def __repr__(self):
        return f"<Message(id={self.id}, role={self.role}, stage={self.stage}, status={self.status})>"


class Output(Base):
    """Generated markdown outputs from each stage."""

    __tablename__ = "outputs"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    session_id = Column(GUID(), ForeignKey("sessions.id"), nullable=False, index=True)
    stage = Column(SQLEnum(Stage), nullable=False)
    filename = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    session = relationship("Session", back_populates="outputs")

    def __repr__(self):
        return f"<Output(id={self.id}, stage={self.stage}, filename={self.filename})>"


class MCPUsage(Base):
    """Track MCP tool usage for analytics."""

    __tablename__ = "mcp_usages"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    session_id = Column(GUID(), ForeignKey("sessions.id"), nullable=False, index=True)
    stage = Column(SQLEnum(Stage, name="stage"), nullable=False)
    tool_name = Column(String(100), nullable=False)
    request_data = Column(Text, nullable=True)  # JSON string
    response_data = Column(Text, nullable=True)  # JSON string
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    duration_ms = Column(Integer, nullable=True)
    success = Column(Boolean, default=True, nullable=False)
    error_message = Column(Text, nullable=True)

    # Relationships
    session = relationship("Session", back_populates="mcp_usages")

    def __repr__(self):
        return f"<MCPUsage(id={self.id}, tool_name={self.tool_name}, success={self.success})>"


# RAG-related models
class VectorDatabase(Base):
    """Vector database configuration and metadata."""

    __tablename__ = "vector_databases"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    vector_db_id = Column(
        String(255), unique=True, nullable=False, index=True
    )  # Used by Llama Stack
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    embedding_model = Column(String(255), nullable=False, default="all-MiniLM-L6-v2")
    embedding_dimension = Column(Integer, nullable=False, default=384)
    use_case = Column(
        String(100), nullable=False
    )  # 'patternfly', 'github_repos', 'documentation', etc.
    created_at = Column(DateTime, default=datetime.utcnow)
    last_updated = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)

    # Relationships
    documents = relationship(
        "Document", back_populates="vector_db", cascade="all, delete-orphan"
    )


class Document(Base):
    """Document metadata and ingestion tracking."""

    __tablename__ = "documents"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    document_id = Column(String(255), nullable=False, index=True)  # Used by Llama Stack
    vector_db_id = Column(GUID(), ForeignKey("vector_databases.id"), nullable=False)
    name = Column(String(255), nullable=False)
    source_url = Column(Text, nullable=False)
    mime_type = Column(String(100), nullable=False, default="text/plain")
    ingestion_date = Column(DateTime, default=datetime.utcnow)
    last_updated = Column(DateTime, nullable=True)
    chunk_count = Column(Integer, default=0)
    document_metadata = Column(JSON, nullable=True)  # Store additional metadata as JSON
    is_active = Column(Boolean, default=True)

    # Relationships
    vector_db = relationship("VectorDatabase", back_populates="documents")


class RAGQuery(Base):
    """RAG query history and analytics."""

    __tablename__ = "rag_queries"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    session_id = Column(
        GUID(), ForeignKey("sessions.id"), nullable=True
    )  # Optional link to session
    query_text = Column(Text, nullable=False)
    vector_db_ids = Column(JSON, nullable=False)  # List of vector DB IDs searched
    chunks_retrieved = Column(Integer, default=0)
    query_time_ms = Column(Float, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

    # Relationships
    session = relationship("Session", back_populates="rag_queries")


# Database setup
def get_database_url():
    """Get database URL from environment variables."""
    # For OpenShift/production, use PostgreSQL
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        return db_url

    # For development, use SQLite
    db_path = os.getenv("SQLITE_DB_PATH", "/tmp/rhoai_sessions.db")
    return f"sqlite:///{db_path}"


def create_engine_instance():
    """Create SQLAlchemy engine instance."""
    database_url = get_database_url()

    if database_url.startswith("sqlite"):
        engine = create_engine(
            database_url,
            connect_args={"check_same_thread": False},
            echo=os.getenv("DEBUG", "").lower() == "true",
        )
    else:
        engine = create_engine(
            database_url, echo=os.getenv("DEBUG", "").lower() == "true"
        )

    return engine


def create_session_factory():
    """Create SQLAlchemy session factory."""
    engine = create_engine_instance()
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


# Create a global session factory for use throughout the application
SessionLocal = create_session_factory()


# Task Management Models
class TaskStatus(Enum):
    """Status of a background task."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class BackgroundTask(Base):
    """Persistent storage for background tasks."""

    __tablename__ = "background_tasks"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(36), unique=True, index=True, nullable=False)
    status = Column(SQLEnum(TaskStatus), nullable=False, default=TaskStatus.PENDING)
    task_type = Column(String(50), nullable=False)  # e.g., "ingestion", "processing"

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    progress = Column(Float, default=0.0, nullable=False)  # 0.0 to 1.0
    current_step = Column(String(255), nullable=True)
    total_items = Column(Integer, nullable=True)
    processed_items = Column(Integer, default=0, nullable=False)

    error_message = Column(Text, nullable=True)
    result = Column(JSON, nullable=True)
    task_metadata = Column(JSON, nullable=True)  # Task-specific metadata


class IngestionRequest(Base):
    """Persistent storage for document ingestion requests."""

    __tablename__ = "ingestion_requests"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(String(36), unique=True, index=True, nullable=False)
    task_id = Column(String(36), ForeignKey("background_tasks.task_id"), nullable=False)

    vector_db_id = Column(String(100), nullable=False)
    source_count = Column(Integer, nullable=False)  # Number of sources to process
    use_llamaindex = Column(Boolean, default=True, nullable=False)

    chunk_size_in_tokens = Column(Integer, default=512, nullable=False)
    chunk_overlap_in_tokens = Column(Integer, default=0, nullable=False)

    # Progress tracking
    sources_processed = Column(Integer, default=0, nullable=False)
    total_chunks_created = Column(Integer, default=0, nullable=False)
    documents_created = Column(Integer, default=0, nullable=False)

    # Timing
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    processing_time_ms = Column(Float, nullable=True)

    # Results and errors
    success_count = Column(Integer, default=0, nullable=False)
    error_count = Column(Integer, default=0, nullable=False)
    errors = Column(JSON, nullable=True)  # List of error messages

    # Source data
    source_urls = Column(JSON, nullable=False)  # List of source URLs
    source_metadata = Column(JSON, nullable=True)  # Additional source metadata

    # Relationships
    task = relationship("BackgroundTask", backref="ingestion_requests")


class Epic(Base):
    """Epic generated from JIRA analysis."""

    __tablename__ = "epics"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    session_id = Column(
        GUID(),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    component_team = Column(String(255), nullable=True)  # Team responsible for the epic
    status = Column(SQLEnum(EpicStatus), default=EpicStatus.TODO, nullable=False)
    priority = Column(SQLEnum(Priority), default=Priority.MEDIUM, nullable=False)

    # Effort tracking
    estimated_hours = Column(Float, nullable=True)
    actual_hours = Column(Float, default=0.0, nullable=False)
    completion_percentage = Column(Float, default=0.0, nullable=False)

    # Dates
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    due_date = Column(DateTime, nullable=True)

    # Additional metadata
    epic_metadata = Column(JSON, nullable=True)  # Additional metadata

    # Relationships
    session = relationship("Session", back_populates="epics")
    stories = relationship("Story", back_populates="epic", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Epic(id={self.id}, title={self.title}, status={self.status})>"


class Story(Base):
    """Story/ticket under an epic."""

    __tablename__ = "stories"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    epic_id = Column(
        GUID(), ForeignKey("epics.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(SQLEnum(StoryStatus), default=StoryStatus.TODO, nullable=False)

    # Story points and effort
    story_points = Column(Integer, nullable=True)  # Fibonacci: 1, 2, 3, 5, 8, 13, 21
    estimated_hours = Column(Float, nullable=True)
    actual_hours = Column(Float, default=0.0, nullable=False)

    # Assignment and tracking
    assignee = Column(String(255), nullable=True)  # Username or email

    # Dates
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    due_date = Column(DateTime, nullable=True)

    # Additional metadata
    story_metadata = Column(JSON, nullable=True)  # Additional metadata

    # Relationships
    epic = relationship("Epic", back_populates="stories")

    def __repr__(self):
        return f"<Story(id={self.id}, title={self.title}, status={self.status}, points={self.story_points})>"


def init_database():
    """Initialize database tables."""
    engine = create_engine_instance()
    Base.metadata.create_all(bind=engine)
    return engine
