"""
File Upload Handler for RHOAI AI Feature Sizing
Integrates uploaded files with the existing LlamaIndex RAG pipeline
"""

import os
import tempfile
import shutil
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
import asyncio

from llama_index.core import Document, SimpleDirectoryReader
from llama_index.readers.file import PDFReader, DocxReader
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.extractors import TitleExtractor

from src.settings import init_settings
from src.ingestion import RAGIngestor


class FileUploadHandler:
    """Handle file uploads and integrate with LlamaIndex RAG pipeline"""

    def __init__(
        self,
        upload_dir: Path = None,
        max_file_size_mb: int = 10,
        allowed_extensions: List[str] = None,
    ):

        # Initialize settings
        init_settings()

        # Setup directories
        self.upload_dir = upload_dir or Path("uploads/temp")
        self.upload_dir.mkdir(parents=True, exist_ok=True)

        # Configuration
        self.max_file_size_mb = max_file_size_mb
        self.allowed_extensions = allowed_extensions or [
            ".pdf",
            ".docx",
            ".doc",
            ".txt",
            ".md",
            ".rtf",
        ]

        # File readers for different formats
        self.file_readers = {
            ".pdf": PDFReader(),
            ".docx": DocxReader(),
            ".doc": DocxReader(),
        }

        # Initialize ingestion pipeline
        self.ingestor = RAGIngestor(chunking_strategy="sentence", verbose=True)

    def validate_file(self, filename: str, file_size: int) -> Dict[str, Any]:
        """Validate uploaded file"""

        # Check file extension
        file_ext = Path(filename).suffix.lower()
        if file_ext not in self.allowed_extensions:
            return {
                "valid": False,
                "error": f"File type {file_ext} not supported. Allowed: {', '.join(self.allowed_extensions)}",
            }

        # Check file size
        max_size_bytes = self.max_file_size_mb * 1024 * 1024
        if file_size > max_size_bytes:
            return {
                "valid": False,
                "error": f"File size {file_size / 1024 / 1024:.1f}MB exceeds maximum {self.max_file_size_mb}MB",
            }

        return {"valid": True}

    async def save_uploaded_file(
        self, file_content: bytes, filename: str, user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Save uploaded file to temporary directory"""

        # Validate file
        validation = self.validate_file(filename, len(file_content))
        if not validation["valid"]:
            return validation

        try:
            # Create user-specific directory
            user_dir = self.upload_dir / (user_id or "anonymous")
            user_dir.mkdir(parents=True, exist_ok=True)

            # Generate unique filename with timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            safe_filename = f"{timestamp}_{filename}"
            file_path = user_dir / safe_filename

            # Save file
            with open(file_path, "wb") as f:
                f.write(file_content)

            return {
                "valid": True,
                "file_path": str(file_path),
                "filename": safe_filename,
                "original_filename": filename,
                "size_bytes": len(file_content),
                "upload_time": datetime.now().isoformat(),
            }

        except Exception as e:
            return {"valid": False, "error": f"Failed to save file: {str(e)}"}

    async def process_uploaded_files(
        self, file_paths: List[str], context_description: Optional[str] = None
    ) -> Dict[str, Any]:
        """Process uploaded files and create documents for RAG"""

        try:
            documents = []
            processed_files = []
            errors = []

            for file_path in file_paths:
                try:
                    file_path_obj = Path(file_path)

                    if not file_path_obj.exists():
                        errors.append(f"File not found: {file_path}")
                        continue

                    # Load document based on file type
                    file_ext = file_path_obj.suffix.lower()

                    if file_ext in self.file_readers:
                        # Use specialized reader
                        reader = self.file_readers[file_ext]
                        file_docs = reader.load_data(file=file_path_obj)
                    else:
                        # Use SimpleDirectoryReader for text files
                        reader = SimpleDirectoryReader(
                            input_files=[str(file_path_obj)],
                            file_extractor=self.file_readers,
                        )
                        file_docs = reader.load_data()

                    # Add metadata to documents
                    for doc in file_docs:
                        doc.metadata.update(
                            {
                                "source_file": file_path_obj.name,
                                "file_path": str(file_path_obj),
                                "file_type": file_ext,
                                "upload_time": datetime.now().isoformat(),
                                "context_description": context_description
                                or "User uploaded document",
                                "source_type": "user_upload",
                            }
                        )

                    documents.extend(file_docs)
                    processed_files.append(
                        {
                            "file_path": str(file_path_obj),
                            "filename": file_path_obj.name,
                            "document_count": len(file_docs),
                        }
                    )

                except Exception as e:
                    errors.append(f"Error processing {file_path}: {str(e)}")

            return {
                "success": True,
                "documents": documents,
                "processed_files": processed_files,
                "total_documents": len(documents),
                "errors": errors,
            }

        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to process uploaded files: {str(e)}",
                "documents": [],
                "processed_files": [],
                "total_documents": 0,
                "errors": [str(e)],
            }

    async def create_knowledge_base(
        self, documents: List[Document], knowledge_base_name: str = "uploaded_docs"
    ) -> Dict[str, Any]:
        """Create a knowledge base from uploaded documents"""

        try:
            if not documents:
                return {
                    "success": False,
                    "error": "No documents provided for knowledge base creation",
                }

            # Create vector index using the existing ingestion pipeline
            index = self.ingestor.create_vector_index(
                documents=documents, agent_persona=knowledge_base_name
            )

            if index is None:
                return {"success": False, "error": "Failed to create vector index"}

            return {
                "success": True,
                "knowledge_base_name": knowledge_base_name,
                "document_count": len(documents),
                "index_created": True,
                "message": f"Knowledge base '{knowledge_base_name}' created successfully with {len(documents)} documents",
            }

        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to create knowledge base: {str(e)}",
            }

    async def process_upload_workflow(
        self,
        file_contents: List[tuple],  # [(filename, content), ...]
        user_id: Optional[str] = None,
        context_description: Optional[str] = None,
        create_kb: bool = True,
    ) -> Dict[str, Any]:
        """Complete workflow: save files, process documents, create knowledge base"""

        try:
            # Step 1: Save uploaded files
            saved_files = []
            save_errors = []

            for filename, content in file_contents:
                result = await self.save_uploaded_file(content, filename, user_id)
                if result["valid"]:
                    saved_files.append(result["file_path"])
                else:
                    save_errors.append(f"{filename}: {result['error']}")

            if not saved_files:
                return {
                    "success": False,
                    "error": "No files could be saved",
                    "save_errors": save_errors,
                }

            # Step 2: Process documents
            processing_result = await self.process_uploaded_files(
                saved_files, context_description
            )

            if not processing_result["success"]:
                return processing_result

            # Step 3: Create knowledge base (optional)
            kb_result = None
            if create_kb and processing_result["documents"]:
                kb_name = f"uploads_{user_id or 'anonymous'}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                kb_result = await self.create_knowledge_base(
                    processing_result["documents"], kb_name
                )

            return {
                "success": True,
                "saved_files": len(saved_files),
                "processed_documents": processing_result["total_documents"],
                "processed_files": processing_result["processed_files"],
                "knowledge_base": kb_result,
                "save_errors": save_errors,
                "processing_errors": processing_result["errors"],
                "message": f"Successfully processed {len(saved_files)} files into {processing_result['total_documents']} documents",
            }

        except Exception as e:
            return {"success": False, "error": f"Upload workflow failed: {str(e)}"}

    def cleanup_temp_files(self, file_paths: List[str]) -> None:
        """Clean up temporary uploaded files"""
        for file_path in file_paths:
            try:
                Path(file_path).unlink(missing_ok=True)
            except Exception as e:
                print(f"Warning: Could not delete temp file {file_path}: {e}")


# FastAPI integration example
async def handle_file_upload_endpoint(files, user_id: str = None, context: str = None):
    """
    Example FastAPI endpoint handler
    Usage:

    @app.post("/api/upload")
    async def upload_files(files: List[UploadFile] = File(...),
                          user_id: str = None,
                          context: str = None):
        return await handle_file_upload_endpoint(files, user_id, context)
    """

    handler = FileUploadHandler()

    # Convert uploaded files to format expected by handler
    file_contents = []
    for file in files:
        content = await file.read()
        file_contents.append((file.filename, content))

    # Process the upload workflow
    result = await handler.process_upload_workflow(
        file_contents=file_contents,
        user_id=user_id,
        context_description=context,
        create_kb=True,
    )

    return result


# Export the main handler class
__all__ = ["FileUploadHandler", "handle_file_upload_endpoint"]
