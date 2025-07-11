"""Service layer for processing sessions and managing stages."""

import json
import logging
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
from contextlib import contextmanager
import tempfile
import os

from sqlalchemy.orm import Session as DBSession

from .models import (
    Session,
    Message,
    Output,
    MCPUsage,
    SessionStatus,
    Stage,
    MessageRole,
    create_session_factory,
)
from .schemas import StageProgressUpdate
from ..stages.refine_feature import generate_refinement_with_agent
from ..stages.draft_jiras import draft_jiras_from_file


class SessionService:
    """Service for managing processing sessions."""

    def __init__(self):
        self.session_factory = create_session_factory()
        self.logger = logging.getLogger("SessionService")

    @contextmanager
    def get_db_session(self):
        """Context manager for database sessions."""
        db_session = self.session_factory()
        try:
            yield db_session
            db_session.commit()
        except Exception:
            db_session.rollback()
            raise
        finally:
            db_session.close()

    def create_session(self, jira_key: str, soft_mode: bool = True) -> uuid.UUID:
        """Create a new processing session."""
        with self.get_db_session() as db_session:
            session = Session(
                jira_key=jira_key, soft_mode=soft_mode, status=SessionStatus.PENDING
            )
            db_session.add(session)
            db_session.flush()

            # Add initial message
            initial_message = Message(
                session_id=session.id,
                role=MessageRole.SYSTEM,
                content=f"Session created for Jira issue {jira_key} ({'soft mode' if soft_mode else 'hard mode'})",
                stage=None,
            )
            db_session.add(initial_message)

            self.logger.info(f"Created session {session.id} for {jira_key}")
            return session.id

    def get_session(self, session_id: uuid.UUID) -> Optional[Session]:
        """Get session by ID."""
        with self.get_db_session() as db_session:
            session = db_session.query(Session).filter(Session.id == session_id).first()
            if session:
                # Load all attributes while session is active to avoid DetachedInstanceError
                _ = (
                    session.id,
                    session.jira_key,
                    session.status,
                    session.current_stage,
                    session.soft_mode,
                    session.created_at,
                    session.updated_at,
                    session.started_at,
                    session.completed_at,
                    session.error_message,
                )
                db_session.expunge(session)
            return session

    def get_sessions(
        self, page: int = 1, page_size: int = 20
    ) -> tuple[List[Session], int]:
        """Get paginated list of sessions."""
        with self.get_db_session() as db_session:
            offset = (page - 1) * page_size
            sessions = (
                db_session.query(Session)
                .order_by(Session.created_at.desc())
                .offset(offset)
                .limit(page_size)
                .all()
            )
            total = db_session.query(Session).count()

            # Load all attributes for each session to avoid DetachedInstanceError
            for session in sessions:
                _ = (
                    session.id,
                    session.jira_key,
                    session.status,
                    session.current_stage,
                    session.soft_mode,
                    session.created_at,
                    session.updated_at,
                    session.started_at,
                    session.completed_at,
                    session.error_message,
                )
                db_session.expunge(session)

            return sessions, total

    def get_session_messages(
        self, session_id: uuid.UUID, limit: int = 50
    ) -> List[Message]:
        """Get messages for a session."""
        with self.get_db_session() as db_session:
            messages = (
                db_session.query(Message)
                .filter(Message.session_id == session_id)
                .order_by(Message.timestamp.asc())
                .limit(limit)
                .all()
            )

            # Load all attributes for each message to avoid DetachedInstanceError
            for message in messages:
                _ = (
                    message.id,
                    message.session_id,
                    message.role,
                    message.content,
                    message.stage,
                    message.timestamp,
                    message.message_metadata,
                )
                db_session.expunge(message)

            return messages

    def get_session_outputs(self, session_id: uuid.UUID) -> List[Output]:
        """Get outputs for a session."""
        with self.get_db_session() as db_session:
            outputs = (
                db_session.query(Output)
                .filter(Output.session_id == session_id)
                .order_by(Output.created_at.asc())
                .all()
            )

            # Load all attributes for each output to avoid DetachedInstanceError
            for output in outputs:
                _ = (
                    output.id,
                    output.session_id,
                    output.stage,
                    output.filename,
                    output.content,
                    output.created_at,
                )
                db_session.expunge(output)

            return outputs

    def get_session_mcp_usage(self, session_id: uuid.UUID) -> List[MCPUsage]:
        """Get MCP usage for a session."""
        with self.get_db_session() as db_session:
            usages = (
                db_session.query(MCPUsage)
                .filter(MCPUsage.session_id == session_id)
                .order_by(MCPUsage.timestamp.asc())
                .all()
            )

            # Load all attributes for each usage to avoid DetachedInstanceError
            for usage in usages:
                _ = (
                    usage.id,
                    usage.session_id,
                    usage.tool_name,
                    usage.request_data,
                    usage.response_data,
                    usage.timestamp,
                    usage.duration_ms,
                    usage.success,
                    usage.error_message,
                )
                db_session.expunge(usage)

            return usages

    def add_message(
        self,
        session_id: uuid.UUID,
        role: MessageRole,
        content: str,
        stage: Optional[Stage] = None,
        message_metadata: Optional[Dict[str, Any]] = None,
    ):
        """Add a message to the session."""
        with self.get_db_session() as db_session:
            message = Message(
                session_id=session_id,
                role=role,
                content=content,
                stage=stage,
                message_metadata=(
                    json.dumps(message_metadata) if message_metadata else None
                ),
            )
            db_session.add(message)

    def add_output(
        self, session_id: uuid.UUID, stage: Stage, filename: str, content: str
    ):
        """Add an output file to the session."""
        with self.get_db_session() as db_session:
            output = Output(
                session_id=session_id, stage=stage, filename=filename, content=content
            )
            db_session.add(output)

    def add_mcp_usage(
        self,
        session_id: uuid.UUID,
        tool_name: str,
        request_data: Optional[Dict] = None,
        response_data: Optional[Dict] = None,
        duration_ms: Optional[int] = None,
        success: bool = True,
        error_message: Optional[str] = None,
    ):
        """Add MCP usage tracking."""
        with self.get_db_session() as db_session:
            usage = MCPUsage(
                session_id=session_id,
                tool_name=tool_name,
                request_data=json.dumps(request_data) if request_data else None,
                response_data=json.dumps(response_data) if response_data else None,
                duration_ms=duration_ms,
                success=success,
                error_message=error_message,
            )
            db_session.add(usage)

    def update_session_status(
        self,
        session_id: uuid.UUID,
        status: SessionStatus,
        current_stage: Optional[Stage] = None,
        error_message: Optional[str] = None,
    ):
        """Update session status and stage."""
        with self.get_db_session() as db_session:
            session = db_session.query(Session).filter(Session.id == session_id).first()
            if session:
                session.status = status
                if current_stage is not None:
                    session.current_stage = current_stage
                if error_message is not None:
                    session.error_message = error_message
                if status == SessionStatus.RUNNING and not session.started_at:
                    session.started_at = datetime.utcnow()
                elif status in [SessionStatus.COMPLETED, SessionStatus.FAILED]:
                    session.completed_at = datetime.utcnow()

    async def process_session(self, session_id: uuid.UUID):
        """Process a complete session through all stages."""
        try:
            session = self.get_session(session_id)
            if not session:
                self.logger.error(f"Session {session_id} not found")
                return

            self.logger.info(f"Starting processing for session {session_id}")
            self.update_session_status(session_id, SessionStatus.RUNNING)

            # Create a temporary directory for processing
            with tempfile.TemporaryDirectory() as temp_dir:
                temp_path = Path(temp_dir)

                try:
                    # Stage 1: Refine
                    await self._process_refine_stage(
                        session_id, session.jira_key, temp_path
                    )

                    # Stage 2: Epics (placeholder - not implemented yet)
                    await self._process_epics_stage(session_id, temp_path)

                    # Stage 3: Jiras
                    await self._process_jiras_stage(
                        session_id, temp_path, session.soft_mode
                    )

                    # Stage 4: Estimate (placeholder - not implemented yet)
                    await self._process_estimate_stage(session_id, temp_path)

                    self.update_session_status(session_id, SessionStatus.COMPLETED)
                    self.add_message(
                        session_id,
                        MessageRole.SYSTEM,
                        "✅ All stages completed successfully!",
                    )

                except Exception as e:
                    self.logger.error(
                        f"Error processing session {session_id}: {e}", exc_info=True
                    )
                    self.update_session_status(
                        session_id, SessionStatus.FAILED, error_message=str(e)
                    )
                    self.add_message(
                        session_id,
                        MessageRole.SYSTEM,
                        f"❌ Processing failed: {str(e)}",
                    )

        except Exception as e:
            self.logger.error(
                f"Unexpected error in process_session: {e}", exc_info=True
            )
            self.update_session_status(
                session_id,
                SessionStatus.FAILED,
                error_message=f"Unexpected error: {str(e)}",
            )

    async def _process_refine_stage(
        self, session_id: uuid.UUID, jira_key: str, temp_path: Path
    ):
        """Process the refine stage."""
        self.logger.info(f"Starting refine stage for session {session_id}")
        self.update_session_status(session_id, SessionStatus.RUNNING, Stage.REFINE)

        self.add_message(
            session_id,
            MessageRole.AGENT,
            f"🔍 Starting feature refinement for {jira_key}...",
            Stage.REFINE,
        )

        # Load template
        template_path = Path(__file__).parent.parent / "prompts" / "refine_feature.md"
        with open(template_path, "r", encoding="utf-8") as f:
            template = f.read()

        start_time = time.time()

        # Set up custom logging handler to capture messages
        handler = SessionLogHandler(session_id, Stage.REFINE, self)
        logger = logging.getLogger("refine_feature")
        logger.addHandler(handler)

        try:
            # Generate refinement
            refinement_content = generate_refinement_with_agent(jira_key, template)

            # Save output
            filename = f"refined_{jira_key}.md"
            self.add_output(session_id, Stage.REFINE, filename, refinement_content)

            duration = time.time() - start_time
            self.add_message(
                session_id,
                MessageRole.AGENT,
                f"✅ Feature refinement completed in {duration:.2f}s. Generated {len(refinement_content)} characters.",
                Stage.REFINE,
            )

        finally:
            logger.removeHandler(handler)

    async def _process_epics_stage(self, session_id: uuid.UUID, temp_path: Path):
        """Process the epics stage (placeholder)."""
        self.logger.info(f"Starting epics stage for session {session_id}")
        self.update_session_status(session_id, SessionStatus.RUNNING, Stage.EPICS)

        self.add_message(
            session_id,
            MessageRole.AGENT,
            "📋 Epic creation stage is not yet implemented. Skipping to Jira drafting...",
            Stage.EPICS,
        )

    async def _process_jiras_stage(
        self, session_id: uuid.UUID, temp_path: Path, soft_mode: bool
    ):
        """Process the jiras stage."""
        self.logger.info(f"Starting jiras stage for session {session_id}")
        self.update_session_status(session_id, SessionStatus.RUNNING, Stage.JIRAS)

        mode_text = "soft mode" if soft_mode else "hard mode"
        self.add_message(
            session_id,
            MessageRole.AGENT,
            f"🎫 Starting Jira ticket drafting ({mode_text})...",
            Stage.JIRAS,
        )

        # Get the refined content from database
        outputs = self.get_session_outputs(session_id)
        refined_output = next((o for o in outputs if o.stage == Stage.REFINE), None)

        if not refined_output:
            raise RuntimeError("No refined output found for Jira stage")

        # Write refined content to temp file
        temp_file = temp_path / f"refined_{uuid.uuid4().hex[:8]}.md"
        with open(temp_file, "w", encoding="utf-8") as f:
            f.write(refined_output.content)

        start_time = time.time()

        # Set up custom logging handler
        handler = SessionLogHandler(session_id, Stage.JIRAS, self)
        logger = logging.getLogger("draft_jiras")
        logger.addHandler(handler)

        try:
            # Generate jiras
            jira_content = draft_jiras_from_file(temp_file, soft_mode=soft_mode)

            # Save output
            filename = f"jiras_{refined_output.filename.replace('refined_', '')}"
            self.add_output(session_id, Stage.JIRAS, filename, jira_content)

            duration = time.time() - start_time
            self.add_message(
                session_id,
                MessageRole.AGENT,
                f"✅ Jira ticket drafting completed in {duration:.2f}s ({mode_text}). Generated {len(jira_content)} characters.",
                Stage.JIRAS,
            )

        finally:
            logger.removeHandler(handler)

    async def _process_estimate_stage(self, session_id: uuid.UUID, temp_path: Path):
        """Process the estimate stage (placeholder)."""
        self.logger.info(f"Starting estimate stage for session {session_id}")
        self.update_session_status(session_id, SessionStatus.RUNNING, Stage.ESTIMATE)

        self.add_message(
            session_id,
            MessageRole.AGENT,
            "📊 Estimation stage is not yet implemented. Processing complete!",
            Stage.ESTIMATE,
        )


class SessionLogHandler(logging.Handler):
    """Custom logging handler that captures log messages as session messages."""

    def __init__(self, session_id: uuid.UUID, stage: Stage, service: SessionService):
        super().__init__()
        self.session_id = session_id
        self.stage = stage
        self.service = service

    def emit(self, record: logging.LogRecord):
        """Emit a log record as a session message."""
        try:
            message = self.format(record)

            # Filter out some noisy logs
            if any(skip in message.lower() for skip in ["debug", "httpx", "urllib3"]):
                return

            # Map log levels to message roles
            if record.levelno >= logging.ERROR:
                role = MessageRole.SYSTEM
                message = f"❌ ERROR: {message}"
            elif record.levelno >= logging.WARNING:
                role = MessageRole.SYSTEM
                message = f"⚠️ WARNING: {message}"
            elif record.levelno >= logging.INFO:
                role = MessageRole.AGENT
                if "✅" not in message and "📋" not in message and "🔍" not in message:
                    message = f"ℹ️ {message}"
            else:
                return  # Skip debug messages

            self.service.add_message(self.session_id, role, message, self.stage)
        except Exception:
            # Don't let logging errors break the main process
            pass
