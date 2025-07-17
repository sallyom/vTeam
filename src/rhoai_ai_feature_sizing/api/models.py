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


def init_database():
    """Initialize database tables."""
    engine = create_engine_instance()
    Base.metadata.create_all(bind=engine)
    return engine
