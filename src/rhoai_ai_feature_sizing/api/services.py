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
    Epic,
    Story,
    SessionStatus,
    Stage,
    MessageRole,
    MessageStatus,
    EpicStatus,
    StoryStatus,
    Priority,
    create_session_factory,
)
from .schemas import (
    StageProgressUpdate,
    SessionResponse,
    MessageResponse,
    OutputResponse,
    MCPUsageResponse,
    EpicCreate,
    EpicUpdate,
    EpicResponse,
    StoryCreate,
    StoryUpdate,
    StoryResponse,
)
from ..stages.refine_feature import generate_refinement_with_agent_sync
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

    def create_session(
        self,
        jira_key: str,
        soft_mode: bool = False,
        custom_prompts: Optional[Dict[str, str]] = None,
    ) -> uuid.UUID:
        """Create a new processing session."""
        session_id = uuid.uuid4()

        with self.get_db_session() as db_session:
            session = Session(
                id=session_id,
                jira_key=jira_key,
                soft_mode=soft_mode,
                custom_prompts=json.dumps(custom_prompts) if custom_prompts else None,
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
            return SessionResponse.from_model(session) if session else None

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
            session_responses = [SessionResponse.from_model(s) for s in sessions]

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

        # Get session to check for custom prompts
        session = self.get_session(session_id)
        custom_prompts = None
        if session and session.custom_prompts:
            try:
                # Handle both string (JSON) and dict cases
                if isinstance(session.custom_prompts, str):
                    custom_prompts = json.loads(session.custom_prompts)
                elif isinstance(session.custom_prompts, dict):
                    custom_prompts = session.custom_prompts
                else:
                    self.logger.warning(
                        f"Unexpected custom_prompts type for session {session_id}: {type(session.custom_prompts)}"
                    )
            except json.JSONDecodeError:
                self.logger.warning(
                    f"Failed to parse custom prompts for session {session_id}"
                )

        # Load template - use custom prompt if available
        if custom_prompts and "refine_feature" in custom_prompts:
            template = custom_prompts["refine_feature"]
            self.logger.info(
                f"Using custom refine_feature prompt for session {session_id}"
            )
        else:
            template_path = (
                Path(__file__).parent.parent / "prompts" / "refine_feature.md"
            )
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
                generate_refinement_with_agent_sync,
                jira_key,
                template,
                session_id,
                custom_prompts,
                True,  # use_rag
                None,  # vector_db_ids (use default)
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

        # Get session to check for custom prompts
        session = self.get_session(session_id)
        custom_prompts = None
        if session and session.custom_prompts:
            try:
                # Handle both string (JSON) and dict cases
                if isinstance(session.custom_prompts, str):
                    custom_prompts = json.loads(session.custom_prompts)
                elif isinstance(session.custom_prompts, dict):
                    custom_prompts = session.custom_prompts
                else:
                    self.logger.warning(
                        f"Unexpected custom_prompts type for session {session_id}: {type(session.custom_prompts)}"
                    )
            except json.JSONDecodeError:
                self.logger.warning(
                    f"Failed to parse custom prompts for session {session_id}"
                )

        start_time = time.time()

        # Set up custom logging handler
        handler = SessionLogHandler(session_id, Stage.JIRAS, self)
        logger = logging.getLogger("draft_jiras")
        logger.addHandler(handler)

        try:
            # Generate jiras using thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            jira_content = await loop.run_in_executor(
                self.executor,
                draft_jiras_from_file,
                temp_file,
                soft_mode,
                custom_prompts,
                True,  # use_rag
                None,  # vector_db_ids (use default)
            )

            # Save output
            filename = f"jiras_{refined_output.filename.replace('refined_', '')}"
            self.add_output(session_id, Stage.JIRAS, filename, jira_content)

            # Extract structured epic/story data and create in database
            try:
                from ..stages.draft_jiras import (
                    extract_epic_story_data,
                    create_epics_and_stories_from_extracted_data,
                )

                self.logger.info(
                    f"Extracting structured data from JIRA markdown for session {session_id}"
                )
                extracted_data = extract_epic_story_data(jira_content)

                # Create epics and stories in database
                creation_result = create_epics_and_stories_from_extracted_data(
                    str(session_id), extracted_data, self
                )

                self.logger.info(
                    f"Created {creation_result['total_epics']} epics and {creation_result['total_stories']} stories for session {session_id}"
                )

            except Exception as e:
                self.logger.error(
                    f"Failed to extract/create structured data for session {session_id}: {e}"
                )
                # Don't fail the whole stage if extraction fails, just log the error
                pass

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

    def get_jira_metrics(self, jira_key: str) -> Dict:
        """
        Recursively fetch JIRA issue and all children, calculate metrics for Done issues.

        Args:
            jira_key: The root JIRA issue key

        Returns:
            Dict containing component metrics and totals
        """
        from ..llama_stack_setup import get_llama_stack_client
        from datetime import datetime
        import json
        import re

        logger = self.logger
        logger.info(f"Starting JIRA metrics calculation for {jira_key}")

        try:
            client = get_llama_stack_client()

            # Data structures to store results
            all_issues = {}  # key -> issue_data
            components = (
                {}
            )  # component_name -> {issues: [], total_story_points: 0, dates: []}

            def fetch_issue_recursive(issue_key: str, visited: set = None):
                """Recursively fetch issue and all its children."""
                if visited is None:
                    visited = set()

                if issue_key in visited:
                    logger.warning(
                        f"Circular reference detected for {issue_key}, skipping"
                    )
                    return

                visited.add(issue_key)
                logger.info(f"Fetching issue: {issue_key}")

                try:
                    # Fetch issue data using MCP tool, requesting specific fields for efficiency
                    response = client.tool_runtime.invoke_tool(
                        tool_name="jira_get_issue",
                        kwargs={
                            "issue_key": issue_key,
                            "fields": "summary,status,resolution,components,customfield_12310243,created,resolutiondate",
                        },
                    )

                    if response.error_message:
                        logger.error(
                            f"Failed to fetch {issue_key}: {response.error_message}"
                        )
                        return

                    # Extract issue data
                    content = response.content
                    if isinstance(content, list):
                        if not content:
                            logger.warning(f"Empty response for {issue_key}")
                            return
                        content = content[0]

                    issue_text = getattr(content, "text", None)
                    if not issue_text:
                        logger.warning(f"No text content for {issue_key}")
                        return

                    # Parse the issue data - MCP tool returns structured text
                    try:
                        issue_data = json.loads(issue_text)
                    except Exception as e:
                        logger.error(
                            f"Failed to parse issue_text as JSON for {issue_key}: {e}"
                        )
                        return

                    # Normalize the issue data format
                    normalized_issue = self._normalize_jira_issue(issue_data, issue_key)
                    all_issues[issue_key] = normalized_issue

                    logger.info(
                        f"Parsed {issue_key}: resolution={normalized_issue.get('resolution', 'N/A')}, "
                        f"component={normalized_issue.get('component', 'N/A')}, "
                        f"story_points={normalized_issue.get('story_points', 0)}"
                    )

                    # Search for child issues using JQL parent relationship
                    search_response = client.tool_runtime.invoke_tool(
                        tool_name="jira_search",
                        kwargs={
                            "jql": f'"Parent Link" = {issue_key}',
                            "fields": "summary,status,resolution,components,customfield_12310243,created,resolutiondate,issuetype",
                            "limit": 50,
                            "start_at": 0,
                            "projects_filter": "",
                            "expand": "",
                        },
                    )

                    if not search_response.error_message:
                        # Process search results
                        search_content = search_response.content
                        if isinstance(search_content, list) and search_content:
                            search_content = search_content[0]

                        search_text = getattr(search_content, "text", None)
                        if search_text:
                            try:
                                search_data = json.loads(search_text)
                                child_issues = search_data.get("issues", [])

                                logger.info(
                                    f"Found {len(child_issues)} child issues for {issue_key}"
                                )

                                # Recursively process each child issue only if it is a Epic or Feature
                                for child_issue in child_issues:
                                    child_key = child_issue.get("key")

                                    issue_type_obj = child_issue.get("issue_type")
                                    issue_type = (
                                        issue_type_obj.get("name")
                                        if isinstance(issue_type_obj, dict)
                                        and issue_type_obj
                                        else issue_type_obj
                                    )

                                    if child_key and child_key not in visited:
                                        # Normalize and add child issue to our collection
                                        normalized_child = self._normalize_jira_issue(
                                            child_issue, child_key
                                        )
                                        all_issues[child_key] = normalized_child

                                        # Recursively fetch grandchildren
                                        if issue_type in [
                                            "Epic",
                                            "Feature",
                                            "Feature Request",
                                        ]:
                                            fetch_issue_recursive(
                                                child_key, visited.copy()
                                            )

                            except Exception as e:
                                logger.error(
                                    f"Failed to parse search results for {issue_key}: {e}"
                                )
                    else:
                        logger.warning(
                            f"Failed to search for children of {issue_key}: {search_response.error_message}"
                        )

                except Exception as e:
                    logger.error(f"Error fetching {issue_key}: {e}")

            # Start recursive fetch from root issue
            fetch_issue_recursive(jira_key)

            # Process all fetched issues
            earliest_start = None
            latest_resolution = None
            total_story_points = 0
            processed_count = 0
            done_count = 0

            for key, issue_data in all_issues.items():
                processed_count += 1

                # Only process Done issues
                resolution = issue_data.get("resolution")
                if resolution != "Done":
                    print(issue_data.get("story_points"))
                    continue

                done_count += 1
                component = issue_data.get("component", "Unknown")
                story_points = issue_data.get("story_points", 0)
                created_date = issue_data.get("created")
                resolved_date = issue_data.get("resolved")

                # Initialize component if not exists
                if component not in components:
                    components[component] = {
                        "total_story_points": 0,
                        "total_days_to_done": 0.0,
                        "created_dates": [],
                        "resolved_dates": [],
                    }

                # Add story points
                components[component]["total_story_points"] += story_points
                total_story_points += story_points

                # Track dates for duration calculation
                if created_date:
                    components[component]["created_dates"].append(created_date)
                    if earliest_start is None or created_date < earliest_start:
                        earliest_start = created_date

                if resolved_date:
                    components[component]["resolved_dates"].append(resolved_date)
                    if latest_resolution is None or resolved_date > latest_resolution:
                        latest_resolution = resolved_date

            # Calculate total days to done
            total_days_to_done = 0.0
            if earliest_start and latest_resolution:
                total_days_to_done = (
                    latest_resolution - earliest_start
                ).total_seconds() / (24 * 3600)

            # Calculate component-level days to done
            for component, data in components.items():
                comp_earliest = (
                    min(data["created_dates"]) if data["created_dates"] else None
                )
                comp_latest = (
                    max(data["resolved_dates"]) if data["resolved_dates"] else None
                )

                if comp_earliest and comp_latest:
                    data["total_days_to_done"] = (
                        comp_latest - comp_earliest
                    ).total_seconds() / (24 * 3600)
                else:
                    data["total_days_to_done"] = 0.0

            # Format response
            response_components = {}
            for comp_name, comp_data in components.items():
                response_components[comp_name] = {
                    "total_story_points": comp_data["total_story_points"],
                    "total_days_to_done": round(comp_data["total_days_to_done"], 2),
                }

            result = {
                "components": response_components,
                "total_story_points": total_story_points,
                "total_days_to_done": round(total_days_to_done, 2),
                "processed_issues": processed_count,
                "done_issues": done_count,
            }

            logger.info(
                f"JIRA metrics calculation completed for {jira_key}: "
                f"{done_count}/{processed_count} Done issues, "
                f"{total_story_points} total story points, "
                f"{result['total_days_to_done']} days total"
            )

            return result

        except Exception as e:
            print(e)
            logger.error(
                f"Error calculating JIRA metrics for {jira_key}: {e}", exc_info=True
            )
            raise

    def _normalize_jira_issue(self, issue_data: dict, issue_key: str) -> dict:
        """
        Normalize JIRA issue data from different sources (get_issue vs search) into consistent format.

        Args:
            issue_data: Raw JIRA issue data from API
            issue_key: The JIRA issue key

        Returns:
            Dict with normalized issue data
        """
        from datetime import datetime

        normalized = {
            "key": issue_key,
            "resolution": None,
            "component": "Unknown",
            "story_points": 0,
            "created": None,
            "resolved": None,
        }

        # Handle fields that might be in different structures
        fields = issue_data.get("fields", issue_data)

        # Extract resolution from status or resolution field
        if "resolution" in fields and fields["resolution"]:
            if isinstance(fields["resolution"], dict):
                normalized["resolution"] = fields["resolution"].get("name")
            else:
                normalized["resolution"] = str(fields["resolution"])
        elif "status" in fields and fields["status"]:
            if isinstance(fields["status"], dict):
                normalized["resolution"] = fields["status"].get("name")
            else:
                normalized["resolution"] = str(fields["status"])

        # Extract component
        if "components" in fields and fields["components"]:
            if isinstance(fields["components"], list) and fields["components"]:
                component = fields["components"][0]
                if isinstance(component, dict):
                    normalized["component"] = component.get("name", "Unknown")
                else:
                    normalized["component"] = str(component)
        elif "component" in fields and fields["component"]:
            if isinstance(fields["component"], dict):
                normalized["component"] = fields["component"].get("name", "Unknown")
            else:
                normalized["component"] = str(fields["component"])

        # Extract story points from custom field
        story_points_field = fields.get("customfield_12310243")
        points = story_points_field.get("value") if story_points_field else None
        if points is not None:
            try:
                normalized["story_points"] = int(float(points))
            except (ValueError, TypeError):
                normalized["story_points"] = 0

        # Also try other common story point field names

        # Extract dates
        if "created" in fields and fields["created"]:
            try:
                # Handle different date formats
                date_str = str(fields["created"])
                # Remove timezone info and parse
                clean_date = date_str.replace("Z", "").split("+")[0].split(".")[0]
                for fmt in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"]:
                    try:
                        normalized["created"] = datetime.strptime(clean_date, fmt)
                        break
                    except ValueError:
                        continue
            except Exception:
                pass

        if "resolutiondate" in fields and fields["resolutiondate"]:
            try:
                # Handle different date formats
                date_str = str(fields["resolutiondate"])
                # Remove timezone info and parse
                clean_date = date_str.replace("Z", "").split("+")[0].split(".")[0]
                for fmt in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"]:
                    try:
                        normalized["resolved"] = datetime.strptime(clean_date, fmt)
                        break
                    except ValueError:
                        continue
            except Exception:
                pass

        return normalized

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

    # Epic management methods
    def get_session_epics(self, session_id: uuid.UUID) -> List[EpicResponse]:
        """Get all epics for a session."""
        with self.get_db_session() as db_session:
            epics = db_session.query(Epic).filter(Epic.session_id == session_id).all()
            return [EpicResponse.model_validate(epic) for epic in epics]

    def create_epic(self, session_id: uuid.UUID, epic_data: EpicCreate) -> EpicResponse:
        """Create a new epic for a session."""
        with self.get_db_session() as db_session:
            # Verify session exists
            session = db_session.query(Session).filter(Session.id == session_id).first()
            if not session:
                raise ValueError(f"Session {session_id} not found")

            # Create epic
            epic = Epic(
                id=uuid.uuid4(),
                session_id=session_id,
                title=epic_data.title,
                description=epic_data.description,
                component_team=epic_data.component_team,
                priority=epic_data.priority,
                estimated_hours=epic_data.estimated_hours,
                due_date=epic_data.due_date,
            )
            db_session.add(epic)
            db_session.flush()  # Flush to get the epic ID

            # Create associated stories if provided
            for story_data in epic_data.stories or []:
                story = Story(
                    id=uuid.uuid4(),
                    epic_id=epic.id,
                    title=story_data.title,
                    description=story_data.description,
                    story_points=story_data.story_points,
                    estimated_hours=story_data.estimated_hours,
                    assignee=story_data.assignee,
                    due_date=story_data.due_date,
                )
                db_session.add(story)

            db_session.commit()

            # Refresh to get all relationships
            db_session.refresh(epic)
            return EpicResponse.model_validate(epic)

    def get_epic(self, epic_id: uuid.UUID) -> Optional[EpicResponse]:
        """Get an epic by ID."""
        with self.get_db_session() as db_session:
            epic = db_session.query(Epic).filter(Epic.id == epic_id).first()
            if epic:
                return EpicResponse.model_validate(epic)
            return None

    def update_epic(
        self, epic_id: uuid.UUID, epic_data: EpicUpdate
    ) -> Optional[EpicResponse]:
        """Update an epic."""
        with self.get_db_session() as db_session:
            epic = db_session.query(Epic).filter(Epic.id == epic_id).first()
            if not epic:
                return None

            # Update fields
            if epic_data.title is not None:
                epic.title = epic_data.title
            if epic_data.description is not None:
                epic.description = epic_data.description
            if epic_data.status is not None:
                epic.status = epic_data.status
            if epic_data.priority is not None:
                epic.priority = epic_data.priority
            if epic_data.estimated_hours is not None:
                epic.estimated_hours = epic_data.estimated_hours
            if epic_data.actual_hours is not None:
                epic.actual_hours = epic_data.actual_hours
            if epic_data.completion_percentage is not None:
                epic.completion_percentage = epic_data.completion_percentage
            if epic_data.component_team is not None:
                epic.component_team = epic_data.component_team
            if epic_data.due_date is not None:
                epic.due_date = epic_data.due_date

            epic.updated_at = datetime.utcnow()
            db_session.commit()
            db_session.refresh(epic)
            return EpicResponse.model_validate(epic)

    def delete_epic(self, epic_id: uuid.UUID) -> bool:
        """Delete an epic and all its stories."""
        with self.get_db_session() as db_session:
            epic = db_session.query(Epic).filter(Epic.id == epic_id).first()
            if not epic:
                return False

            db_session.delete(epic)
            db_session.commit()
            return True

    # Story management methods
    def get_epic_stories(self, epic_id: uuid.UUID) -> List[StoryResponse]:
        """Get all stories for an epic."""
        with self.get_db_session() as db_session:
            stories = db_session.query(Story).filter(Story.epic_id == epic_id).all()
            return [StoryResponse.model_validate(story) for story in stories]

    def create_story(
        self, epic_id: uuid.UUID, story_data: StoryCreate
    ) -> StoryResponse:
        """Create a new story for an epic."""
        with self.get_db_session() as db_session:
            # Verify epic exists
            epic = db_session.query(Epic).filter(Epic.id == epic_id).first()
            if not epic:
                raise ValueError(f"Epic {epic_id} not found")

            # Create story
            story = Story(
                id=uuid.uuid4(),
                epic_id=epic_id,
                title=story_data.title,
                description=story_data.description,
                story_points=story_data.story_points,
                estimated_hours=story_data.estimated_hours,
                assignee=story_data.assignee,
                due_date=story_data.due_date,
            )
            db_session.add(story)
            db_session.commit()
            db_session.refresh(story)
            return StoryResponse.model_validate(story)

    def get_story(self, story_id: uuid.UUID) -> Optional[StoryResponse]:
        """Get a story by ID."""
        with self.get_db_session() as db_session:
            story = db_session.query(Story).filter(Story.id == story_id).first()
            if story:
                return StoryResponse.model_validate(story)
            return None

    def update_story(
        self, story_id: uuid.UUID, story_data: StoryUpdate
    ) -> Optional[StoryResponse]:
        """Update a story."""
        with self.get_db_session() as db_session:
            story = db_session.query(Story).filter(Story.id == story_id).first()
            if not story:
                return None

            # Update fields
            if story_data.title is not None:
                story.title = story_data.title
            if story_data.description is not None:
                story.description = story_data.description
            if story_data.status is not None:
                story.status = story_data.status
            if story_data.story_points is not None:
                story.story_points = story_data.story_points
            if story_data.estimated_hours is not None:
                story.estimated_hours = story_data.estimated_hours
            if story_data.actual_hours is not None:
                story.actual_hours = story_data.actual_hours
            if story_data.assignee is not None:
                story.assignee = story_data.assignee
            if story_data.due_date is not None:
                story.due_date = story_data.due_date

            story.updated_at = datetime.utcnow()
            db_session.commit()
            db_session.refresh(story)
            return StoryResponse.model_validate(story)

    def delete_story(self, story_id: uuid.UUID) -> bool:
        """Delete a story."""
        with self.get_db_session() as db_session:
            story = db_session.query(Story).filter(Story.id == story_id).first()
            if not story:
                return False

            db_session.delete(story)
            db_session.commit()
            return True
