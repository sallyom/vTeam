"""Service layer for processing sessions and managing stages."""

import json
import logging
import time
import uuid
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
from contextlib import contextmanager
import tempfile
import os
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy.orm import Session as DBSession

from .models import (
    Session,
    Message,
    Output,
    MCPUsage,
    SessionStatus,
    Stage,
    MessageRole,
    MessageStatus,
    create_session_factory,
)
from .schemas import (
    StageProgressUpdate,
    SessionResponse,
    MessageResponse,
    OutputResponse,
    MCPUsageResponse,
)
from ..stages.refine_feature import generate_refinement_with_agent
from ..stages.draft_jiras import draft_jiras_from_file


class SessionLogHandler(logging.Handler):
    """Custom logging handler to capture log messages for sessions."""

    def __init__(self, session_id: uuid.UUID, stage: Stage, service: "SessionService"):
        super().__init__()
        self.session_id = session_id
        self.stage = stage
        self.service = service

    def emit(self, record):
        """Emit a log record as a session message."""
        try:
            message = self.format(record)
            # Skip debug messages and internal logging
            if record.levelno >= logging.INFO and not record.name.startswith("uvicorn"):
                self.service.add_message(
                    self.session_id, MessageRole.SYSTEM, message, self.stage
                )
        except Exception:
            # Don't let logging errors crash the application
            pass


class SessionService:
    """Service for managing processing sessions."""

    def __init__(self):
        self.session_factory = create_session_factory()
        self.logger = logging.getLogger("SessionService")
        # Thread pool for running blocking I/O operations
        self.executor = ThreadPoolExecutor(max_workers=4)
        # WebSocket manager for real-time updates
        self.ws_manager = None

    def set_websocket_manager(self, ws_manager):
        """Set the WebSocket manager for real-time updates."""
        self.ws_manager = ws_manager

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

    def create_session(self, jira_key: str, soft_mode: bool = False) -> uuid.UUID:
        """Create a new processing session."""
        session_id = uuid.uuid4()

        with self.get_db_session() as db_session:
            session = Session(
                id=session_id,
                jira_key=jira_key,
                soft_mode=soft_mode,
                status=SessionStatus.PENDING,
                started_at=datetime.now(),
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
            db_session.add(session)

        self.logger.info(f"Created session {session_id} for JIRA key {jira_key}")
        return session_id

    def get_session(self, session_id: uuid.UUID) -> Optional[SessionResponse]:
        """Get a session by ID."""
        with self.get_db_session() as db_session:
            session = db_session.query(Session).filter(Session.id == session_id).first()
            return SessionResponse.model_validate(session) if session else None

    def get_sessions(
        self, page: int = 1, page_size: int = 20
    ) -> tuple[List[SessionResponse], int]:
        """Get paginated list of sessions."""
        with self.get_db_session() as db_session:
            query = db_session.query(Session).order_by(Session.created_at.desc())

            # Get total count
            total = query.count()

            # Apply pagination
            sessions = query.offset((page - 1) * page_size).limit(page_size).all()

            # Convert to Pydantic models while still in database session
            session_responses = [SessionResponse.model_validate(s) for s in sessions]

            return session_responses, total

    def update_session_status(
        self,
        session_id: uuid.UUID,
        status: SessionStatus,
        stage: Optional[Stage] = None,
        error_message: Optional[str] = None,
    ):
        """Update session status and current stage."""
        with self.get_db_session() as db_session:
            session = db_session.query(Session).filter(Session.id == session_id).first()
            if session:
                session.status = status
                if stage is not None:
                    session.current_stage = stage
                if error_message is not None:
                    session.error_message = error_message
                if status == SessionStatus.COMPLETED:
                    session.completed_at = datetime.now()
                session.updated_at = datetime.now()

    def add_message(
        self,
        session_id: uuid.UUID,
        role: MessageRole,
        content: str,
        stage: Optional[Stage] = None,
        status: MessageStatus = MessageStatus.SUCCESS,
    ) -> uuid.UUID:
        """Add a message to the session."""
        message_data = None
        message_id = uuid.uuid4()

        with self.get_db_session() as db_session:
            message = Message(
                id=message_id,
                session_id=session_id,
                role=role,
                content=content,
                stage=stage,
                status=status,
                timestamp=datetime.now(),
            )
            db_session.add(message)

            # Prepare WebSocket message data while message is still attached to session
            if self.ws_manager:
                message_data = {
                    "type": "message",
                    "data": {
                        "id": str(message.id),
                        "session_id": str(session_id),
                        "role": role.value,
                        "content": content,
                        "stage": stage.value if stage else None,
                        "status": status.value,
                        "timestamp": message.timestamp.isoformat(),
                    },
                }

        self.logger.info(
            f"Added {role} message to session {session_id}: {content[:100]}... (status: {status})"
        )

        # Emit message via WebSocket if available
        if message_data:
            try:
                # Schedule WebSocket send (non-blocking)
                asyncio.create_task(
                    self.ws_manager.send_message(session_id, message_data)
                )
            except Exception as e:
                self.logger.debug(f"Failed to send WebSocket message: {e}")
                # Don't let WebSocket errors crash the application
                pass

        return message_id

    def update_message_status(
        self,
        message_id: uuid.UUID,
        status: MessageStatus,
        content: Optional[str] = None,
    ):
        """Update the status of a message and optionally its content."""
        message_data = None
        message_session_id = None

        with self.get_db_session() as db_session:
            message = db_session.query(Message).filter(Message.id == message_id).first()
            if message:
                message.status = status
                if content is not None:
                    message.content = content
                message.timestamp = (
                    datetime.now()
                )  # Update timestamp for real-time updates

                # Extract session_id while we're still in the database session context
                message_session_id = message.session_id

                # Prepare WebSocket message data
                if self.ws_manager:
                    message_data = {
                        "type": "message",
                        "data": {
                            "id": str(message.id),
                            "session_id": str(message.session_id),
                            "role": message.role.value,
                            "content": message.content,
                            "stage": message.stage.value if message.stage else None,
                            "status": status.value,
                            "timestamp": message.timestamp.isoformat(),
                        },
                    }

        # Emit updated message via WebSocket if available
        if message_data and message_session_id:
            try:
                # Schedule WebSocket send (non-blocking)
                asyncio.create_task(
                    self.ws_manager.send_message(message_session_id, message_data)
                )
            except Exception as e:
                self.logger.debug(f"Failed to send WebSocket message: {e}")
                # Don't let WebSocket errors crash the application
                pass

    def get_session_messages(
        self,
        session_id: uuid.UUID,
        limit: Optional[int] = None,
        stage: Optional[Stage] = None,
    ) -> List[MessageResponse]:
        """Get messages for a session."""
        with self.get_db_session() as db_session:
            query = db_session.query(Message).filter(Message.session_id == session_id)

            if stage:
                query = query.filter(Message.stage == stage)

            query = query.order_by(Message.timestamp.desc())

            if limit:
                query = query.limit(limit)

            messages = query.all()
            return [MessageResponse.model_validate(m) for m in messages]

    def add_output(
        self, session_id: uuid.UUID, stage: Stage, filename: str, content: str
    ):
        """Add an output file to the session."""
        with self.get_db_session() as db_session:
            output = Output(
                id=uuid.uuid4(),
                session_id=session_id,
                stage=stage,
                filename=filename,
                content=content,
                created_at=datetime.now(),
            )
            db_session.add(output)

        self.logger.info(
            f"Added output {filename} to session {session_id} for stage {stage}"
        )

    def get_session_outputs(
        self, session_id: uuid.UUID, stage: Optional[Stage] = None
    ) -> List[OutputResponse]:
        """Get outputs for a session."""
        with self.get_db_session() as db_session:
            query = db_session.query(Output).filter(Output.session_id == session_id)

            if stage:
                query = query.filter(Output.stage == stage)

            outputs = query.order_by(Output.created_at.desc()).all()
            return [OutputResponse.model_validate(o) for o in outputs]

    def get_session_mcp_usage(self, session_id: uuid.UUID) -> List[MCPUsageResponse]:
        """Get MCP usage for a session."""
        with self.get_db_session() as db_session:
            mcp_usages = (
                db_session.query(MCPUsage)
                .filter(MCPUsage.session_id == session_id)
                .order_by(MCPUsage.timestamp.desc())
                .all()
            )
            return [MCPUsageResponse.from_model(u) for u in mcp_usages]

    def add_mcp_usage(
        self,
        session_id: uuid.UUID,
        stage: Stage,
        tool_name: str,
        input_data: Optional[Dict[str, Any]] = None,
        output_data: Optional[Dict[str, Any]] = None,
        duration_ms: Optional[int] = None,
        success: bool = True,
        error_message: Optional[str] = None,
    ):
        """Add MCP usage tracking entry."""
        import json

        mcp_usage_id = None
        mcp_usage_timestamp = None

        with self.get_db_session() as db_session:
            mcp_usage = MCPUsage(
                id=uuid.uuid4(),
                session_id=session_id,
                stage=stage,
                tool_name=tool_name,
                request_data=json.dumps(input_data) if input_data else None,
                response_data=json.dumps(output_data) if output_data else None,
                timestamp=datetime.now(),
                duration_ms=duration_ms,
                success=success,
                error_message=error_message,
            )
            db_session.add(mcp_usage)

            # Extract values while we're still in the database session context
            mcp_usage_id = mcp_usage.id
            mcp_usage_timestamp = mcp_usage.timestamp

        self.logger.info(
            f"Added MCP usage for tool {tool_name} in session {session_id} (stage: {stage})"
        )

        # Emit MCP usage via WebSocket if available
        if self.ws_manager and mcp_usage_id and mcp_usage_timestamp:
            mcp_data = {
                "type": "mcp_usage",
                "data": {
                    "id": str(mcp_usage_id),
                    "session_id": str(session_id),
                    "stage": stage.value,
                    "tool_name": tool_name,
                    "input_data": input_data,
                    "output_data": output_data,
                    "timestamp": mcp_usage_timestamp.isoformat(),
                    "success": success,
                },
            }
            try:
                # Schedule WebSocket send (non-blocking)
                asyncio.create_task(self.ws_manager.send_message(session_id, mcp_data))
            except Exception as e:
                self.logger.debug(f"Failed to send WebSocket MCP message: {e}")
                # Don't let WebSocket errors crash the application
                pass

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
                        f"Processing failed: {str(e)}",
                        status=MessageStatus.ERROR,
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

        # Add loading message
        loading_message_id = self.add_message(
            session_id,
            MessageRole.AGENT,
            f"🔍 Starting feature refinement for {jira_key}...",
            Stage.REFINE,
            MessageStatus.LOADING,
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
            # Generate refinement using thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            refinement_content = await loop.run_in_executor(
                self.executor,
                generate_refinement_with_agent,
                jira_key,
                template,
                session_id,
            )

            # Save output
            filename = f"refined_{jira_key}.md"
            self.add_output(session_id, Stage.REFINE, filename, refinement_content)

            duration = time.time() - start_time
            # Update loading message to success
            self.update_message_status(
                loading_message_id,
                MessageStatus.SUCCESS,
                f"✅ Feature refinement completed in {duration:.2f}s. Generated {len(refinement_content)} characters.",
            )

        except Exception as e:
            # Update loading message to error
            self.update_message_status(
                loading_message_id,
                MessageStatus.ERROR,
                f"❌ Feature refinement failed: {str(e)}",
            )
            raise  # Re-raise to maintain existing error handling

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
        # Add loading message
        loading_message_id = self.add_message(
            session_id,
            MessageRole.AGENT,
            f"🎫 Starting Jira ticket drafting ({mode_text})...",
            Stage.JIRAS,
            MessageStatus.LOADING,
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
            # Generate jiras using thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            jira_content = await loop.run_in_executor(
                self.executor, draft_jiras_from_file, temp_file, soft_mode
            )

            # Save output
            filename = f"jiras_{refined_output.filename.replace('refined_', '')}"
            self.add_output(session_id, Stage.JIRAS, filename, jira_content)

            duration = time.time() - start_time
            # Update loading message to success
            self.update_message_status(
                loading_message_id,
                MessageStatus.SUCCESS,
                f"✅ Jira ticket drafting completed in {duration:.2f}s ({mode_text}). Generated {len(jira_content)} characters.",
            )

        except Exception as e:
            # Update loading message to error
            self.update_message_status(
                loading_message_id,
                MessageStatus.ERROR,
                f"❌ Jira ticket drafting failed: {str(e)}",
            )
            raise  # Re-raise to maintain existing error handling

        finally:
            logger.removeHandler(handler)

    async def _process_estimate_stage(self, session_id: uuid.UUID, temp_path: Path):
        """Process the estimate stage (placeholder)."""
        self.logger.info(f"Starting estimate stage for session {session_id}")
        self.update_session_status(session_id, SessionStatus.RUNNING, Stage.ESTIMATE)

        self.add_message(
            session_id,
            MessageRole.AGENT,
            "📊 Estimation stage is not yet implemented. Completing session...",
            Stage.ESTIMATE,
        )

    def delete_session(self, session_id: uuid.UUID) -> bool:
        """Delete a session and all related data.

        Args:
            session_id: The UUID of the session to delete

        Returns:
            bool: True if session was deleted, False if not found
        """
        try:
            with self.get_db_session() as db_session:
                # Get the session
                session = (
                    db_session.query(Session).filter(Session.id == session_id).first()
                )

                if not session:
                    return False

                # Delete the session (cascade will handle related data)
                db_session.delete(session)
                db_session.commit()

                self.logger.info(f"Successfully deleted session {session_id}")
                return True

        except Exception as e:
            self.logger.error(f"Error deleting session {session_id}: {e}")
            raise
