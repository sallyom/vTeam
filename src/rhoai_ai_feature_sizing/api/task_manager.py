"""
Background task management for long-running operations.
"""

import asyncio
import logging
import uuid
from datetime import datetime
from typing import Dict, Optional, Callable, Any, List
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy.orm import sessionmaker

from .schemas import BackgroundTaskInfo, TaskStatus as SchemaTaskStatus
from .models import (
    BackgroundTask,
    IngestionRequest,
    TaskStatus as ModelTaskStatus,
    SessionLocal,
)


class TaskManager:
    """Manages background tasks for long-running operations with database persistence."""

    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=4)
        self.logger = logging.getLogger(__name__)

    def _get_db_session(self):
        """Get database session."""
        return SessionLocal()

    def _convert_to_schema(self, db_task: BackgroundTask) -> BackgroundTaskInfo:
        """Convert database model to schema."""
        return BackgroundTaskInfo(
            task_id=db_task.task_id,
            status=db_task.status.value,
            created_at=db_task.created_at.isoformat(),
            started_at=db_task.started_at.isoformat() if db_task.started_at else None,
            completed_at=(
                db_task.completed_at.isoformat() if db_task.completed_at else None
            ),
            progress=db_task.progress,
            current_step=db_task.current_step,
            total_items=db_task.total_items,
            processed_items=db_task.processed_items,
            error_message=db_task.error_message,
            result=db_task.result,
        )

    def _serialize_result_for_json(self, result: Any) -> Any:
        """Convert datetime objects to strings for JSON serialization."""
        if isinstance(result, dict):
            return {k: self._serialize_result_for_json(v) for k, v in result.items()}
        elif isinstance(result, list):
            return [self._serialize_result_for_json(item) for item in result]
        elif isinstance(result, datetime):
            return result.isoformat()
        else:
            return result

    def create_task(
        self,
        task_func: Callable,
        *args,
        task_type: str = "generic",
        estimated_duration_minutes: Optional[int] = None,
        **kwargs,
    ) -> str:
        """Create a new background task with database persistence."""
        task_id = str(uuid.uuid4())

        # Create task in database
        with self._get_db_session() as db:
            db_task = BackgroundTask(
                task_id=task_id,
                status=ModelTaskStatus.PENDING,
                task_type=task_type,
                progress=0.0,
                total_items=kwargs.get("total_items"),
                task_metadata=kwargs.get("task_metadata", {}),
            )
            db.add(db_task)
            db.commit()

        # Start the task
        asyncio.create_task(self._run_task(task_id, task_func, *args, **kwargs))

        self.logger.info(f"Created background task {task_id} of type {task_type}")
        return task_id

    async def _run_task(self, task_id: str, task_func: Callable, *args, **kwargs):
        """Run a task in the background with database persistence."""
        try:
            # Update status to running
            with self._get_db_session() as db:
                db_task = db.query(BackgroundTask).filter_by(task_id=task_id).first()
                if db_task:
                    db_task.status = ModelTaskStatus.RUNNING
                    db_task.started_at = datetime.utcnow()
                    db_task.current_step = "Starting task..."
                    db.commit()

            self.logger.info(f"Starting background task {task_id}")

            # Create progress callback that updates database
            def progress_callback(
                progress: float,
                step: str = None,
                processed: int = None,
                total: int = None,
            ):
                try:
                    with self._get_db_session() as db:
                        db_task = (
                            db.query(BackgroundTask).filter_by(task_id=task_id).first()
                        )
                        if db_task:
                            db_task.progress = max(0.0, min(1.0, progress))
                            if step:
                                db_task.current_step = step
                            if processed is not None:
                                db_task.processed_items = processed
                            if total is not None:
                                db_task.total_items = total
                            db.commit()
                    self.logger.debug(
                        f"Task {task_id} progress: {progress:.1%} - {step}"
                    )
                except Exception as e:
                    self.logger.error(f"Failed to update task progress: {e}")

            # Create a wrapper function that includes progress callback
            # Filter out metadata kwargs that aren't for the task function
            task_kwargs = {
                k: v
                for k, v in kwargs.items()
                if k not in ["total_items", "task_metadata"]
            }

            def task_wrapper():
                # Add task_id to kwargs for linking
                return task_func(
                    *args,
                    progress_callback=progress_callback,
                    task_id=task_id,
                    **task_kwargs,
                )

            # Run the task in executor to avoid blocking
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(self.executor, task_wrapper)

            # Task completed successfully
            with self._get_db_session() as db:
                db_task = db.query(BackgroundTask).filter_by(task_id=task_id).first()
                if db_task:
                    db_task.status = ModelTaskStatus.COMPLETED
                    db_task.completed_at = datetime.utcnow()
                    db_task.progress = 1.0
                    db_task.current_step = "Completed"
                    # Convert datetime objects to strings for JSON serialization
                    db_task.result = self._serialize_result_for_json(result)
                    db.commit()

            self.logger.info(f"Background task {task_id} completed successfully")

        except Exception as e:
            # Task failed
            with self._get_db_session() as db:
                db_task = db.query(BackgroundTask).filter_by(task_id=task_id).first()
                if db_task:
                    db_task.status = ModelTaskStatus.FAILED
                    db_task.completed_at = datetime.utcnow()
                    db_task.error_message = str(e)
                    db_task.current_step = f"Failed: {str(e)}"
                    db.commit()

            self.logger.error(f"Background task {task_id} failed: {e}", exc_info=True)

    def get_task(self, task_id: str) -> Optional[BackgroundTaskInfo]:
        """Get task information by ID from database."""
        with self._get_db_session() as db:
            db_task = db.query(BackgroundTask).filter_by(task_id=task_id).first()
            if db_task:
                return self._convert_to_schema(db_task)
        return None

    def list_tasks(
        self, limit: int = 50, task_type: Optional[str] = None
    ) -> List[BackgroundTaskInfo]:
        """List tasks from database with optional filtering."""
        with self._get_db_session() as db:
            query = db.query(BackgroundTask).order_by(BackgroundTask.created_at.desc())

            if task_type:
                query = query.filter_by(task_type=task_type)

            db_tasks = query.limit(limit).all()
            return [self._convert_to_schema(task) for task in db_tasks]

    def search_tasks(
        self,
        status: Optional[str] = None,
        task_type: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[BackgroundTaskInfo]:
        """Search tasks with filtering options."""
        with self._get_db_session() as db:
            query = db.query(BackgroundTask).order_by(BackgroundTask.created_at.desc())

            if status:
                try:
                    status_enum = ModelTaskStatus(status)
                    query = query.filter_by(status=status_enum)
                except ValueError:
                    pass  # Invalid status, ignore filter

            if task_type:
                query = query.filter_by(task_type=task_type)

            db_tasks = query.offset(offset).limit(limit).all()
            return [self._convert_to_schema(task) for task in db_tasks]

    def cleanup_completed_tasks(self, max_age_hours: int = 24):
        """Clean up old completed tasks from database."""
        from datetime import timedelta

        cutoff_time = datetime.utcnow() - timedelta(hours=max_age_hours)

        with self._get_db_session() as db:
            deleted_count = (
                db.query(BackgroundTask)
                .filter(
                    BackgroundTask.status.in_(
                        [ModelTaskStatus.COMPLETED, ModelTaskStatus.FAILED]
                    ),
                    BackgroundTask.completed_at < cutoff_time,
                )
                .delete()
            )

            db.commit()

        if deleted_count > 0:
            self.logger.info(f"Cleaned up {deleted_count} old completed tasks")


# Global task manager instance
task_manager = TaskManager()
