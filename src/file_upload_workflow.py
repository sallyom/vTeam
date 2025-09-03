"""
File Upload Workflow for LlamaDeploy
Handles file uploads and integrates with LlamaIndex RAG pipeline
"""

import base64
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional
from datetime import datetime

from llama_index.core.workflow import (
    Context,
    Event,
    StartEvent,
    StopEvent,
    Workflow,
    step,
)
from pydantic import BaseModel, Field

from src.settings import init_settings
from src.file_upload_handler import FileUploadHandler
from src.session_context_manager import session_manager


# Events
class FileUploadEvent(Event):
    """Event for file upload requests"""

    files: List[Dict[str, Any]] = Field(
        description="List of files with filename and base64 content"
    )
    user_id: Optional[str] = Field(default=None, description="User identifier")
    context_description: Optional[str] = Field(
        default=None, description="Context for the uploaded files"
    )


class FileProcessingProgressEvent(Event):
    """Event for file processing progress"""

    stage: str = Field(description="Current processing stage")
    progress: int = Field(description="Progress percentage")
    message: str = Field(description="Progress message")
    file_count: int = Field(default=0, description="Number of files being processed")


# Response Models
class FileUploadResponse(BaseModel):
    """Response model for file upload results"""

    success: bool = Field(description="Whether upload was successful")
    message: str = Field(description="Success or error message")
    files_processed: int = Field(default=0, description="Number of files processed")
    documents_created: int = Field(default=0, description="Number of documents created")
    knowledge_base_name: Optional[str] = Field(
        default=None, description="Created knowledge base name"
    )
    errors: List[str] = Field(
        default_factory=list, description="Any errors encountered"
    )


class FileUploadWorkflow(Workflow):
    """
    Workflow for handling file uploads via LlamaDeploy

    This workflow:
    1. Receives file upload requests with base64-encoded files
    2. Processes files using the FileUploadHandler
    3. Creates knowledge bases for RAG integration
    4. Returns results and progress updates
    """

    def __init__(self, **kwargs: Any):
        super().__init__(**kwargs)
        init_settings()
        self.upload_handler = FileUploadHandler(
            upload_dir=Path("uploads/workflow_temp")
        )

    @step
    async def handle_upload_request(
        self, ctx: Context, ev: StartEvent
    ) -> FileUploadEvent:
        """Handle initial file upload request"""

        # Extract files from the start event
        files = ev.get("files", [])
        user_id = ev.get("user_id")
        context_description = ev.get("context_description", "Workflow uploaded files")

        if not files:
            # Return error if no files provided
            return StopEvent(
                result=FileUploadResponse(
                    success=False,
                    message="No files provided for upload",
                    errors=["No files in upload request"],
                ).dict()
            )

        return FileUploadEvent(
            files=files, user_id=user_id, context_description=context_description
        )

    @step
    async def process_files(self, ctx: Context, ev: FileUploadEvent) -> StopEvent:
        """Process uploaded files and create knowledge base"""

        try:
            # Emit progress event - starting
            ctx.write_event_to_stream(
                FileProcessingProgressEvent(
                    stage="validation",
                    progress=10,
                    message="Validating uploaded files...",
                    file_count=len(ev.files),
                )
            )

            # Convert base64 files to file contents
            file_contents = []
            validation_errors = []

            for file_data in ev.files:
                try:
                    filename = file_data.get("filename", "unknown")
                    content_b64 = file_data.get("content", "")

                    if not content_b64:
                        validation_errors.append(f"No content for file: {filename}")
                        continue

                    # Decode base64 content
                    content = base64.b64decode(content_b64)
                    file_contents.append((filename, content))

                except Exception as e:
                    validation_errors.append(f"Error processing {filename}: {str(e)}")

            if not file_contents:
                return StopEvent(
                    result=FileUploadResponse(
                        success=False,
                        message="No valid files to process",
                        errors=validation_errors,
                    ).dict()
                )

            # Emit progress event - processing
            ctx.write_event_to_stream(
                FileProcessingProgressEvent(
                    stage="processing",
                    progress=30,
                    message="Processing files with LlamaIndex...",
                    file_count=len(file_contents),
                )
            )

            # Process files using the upload handler
            result = await self.upload_handler.process_upload_workflow(
                file_contents=file_contents,
                user_id=ev.user_id,
                context_description=ev.context_description,
                create_kb=True,
            )

            # Emit progress event - completing
            ctx.write_event_to_stream(
                FileProcessingProgressEvent(
                    stage="completing",
                    progress=90,
                    message="Finalizing knowledge base creation...",
                    file_count=len(file_contents),
                )
            )

            if not result["success"]:
                return StopEvent(
                    result=FileUploadResponse(
                        success=False,
                        message=result.get("error", "File processing failed"),
                        errors=result.get("save_errors", [])
                        + result.get("processing_errors", []),
                    ).dict()
                )

            # Emit final progress event
            ctx.write_event_to_stream(
                FileProcessingProgressEvent(
                    stage="completed",
                    progress=100,
                    message=result["message"],
                    file_count=len(file_contents),
                )
            )

            # Return successful response
            kb_name = None
            if result.get("knowledge_base") and result["knowledge_base"].get("success"):
                kb_name = result["knowledge_base"]["knowledge_base_name"]

                # Add documents to session context for immediate availability
                session_id = ev.user_id or "default_session"
                try:
                    docs_added = await session_manager.add_documents_to_session(
                        session_id=session_id,
                        documents=processing_result["documents"],
                        kb_name=kb_name,
                    )

                    # Update message to include session info
                    session_message = f"{result['message']} Documents are now available in your current session."

                except Exception as e:
                    print(f"Warning: Could not add to session context: {e}")
                    session_message = result["message"]
            else:
                session_message = result["message"]

            return StopEvent(
                result=FileUploadResponse(
                    success=True,
                    message=session_message,
                    files_processed=result["saved_files"],
                    documents_created=result["processed_documents"],
                    knowledge_base_name=kb_name,
                    errors=result.get("save_errors", [])
                    + result.get("processing_errors", []),
                ).dict()
            )

        except Exception as e:
            # Emit error progress event
            ctx.write_event_to_stream(
                FileProcessingProgressEvent(
                    stage="error",
                    progress=0,
                    message=f"Upload workflow failed: {str(e)}",
                    file_count=len(ev.files),
                )
            )

            return StopEvent(
                result=FileUploadResponse(
                    success=False,
                    message=f"Upload workflow failed: {str(e)}",
                    errors=[str(e)],
                ).dict()
            )


# Create workflow instance for deployment
def create_file_upload_workflow() -> Workflow:
    """Factory function for creating file upload workflow"""
    return FileUploadWorkflow(timeout=300.0)


# Export for LlamaDeploy
file_upload_workflow = create_file_upload_workflow()
