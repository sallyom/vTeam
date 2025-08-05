"""RAG (Retrieval Augmented Generation) service for managing vector databases and documents."""

import os
import time
import logging
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from contextlib import contextmanager

from sqlalchemy.orm import Session as DBSession
from llama_stack_client import LlamaStackClient, RAGDocument

from .models import VectorDatabase, Document, RAGQuery, create_session_factory
from .schemas import (
    VectorDBConfig,
    DocumentSource,
    DocumentIngestionRequest,
    RAGQueryRequest,
    VectorDBUpdateRequest,
    DocumentInfo,
    VectorDBInfo,
    RAGQueryResponse,
    DocumentIngestionResponse,
    VectorDBListResponse,
    DocumentListResponse,
    ChunkBrowseRequest,
    ChunkBrowseResponse,
)
from ..llama_stack_setup import get_llama_stack_client

# Make LlamaIndex import optional for testing
try:
    from .llamaindex_loaders import LlamaIndexLoaderService

    LLAMAINDEX_AVAILABLE = True
except ImportError as e:
    print(f"LlamaIndex not available: {e}")
    LlamaIndexLoaderService = None
    LLAMAINDEX_AVAILABLE = False


class RAGService:
    """Service for managing RAG vector databases and documents."""

    def __init__(self):
        self.session_factory = create_session_factory()
        self.logger = logging.getLogger("RAGService")
        self.client: Optional[LlamaStackClient] = None

    def _get_client(self) -> LlamaStackClient:
        """Get or create Llama Stack client."""
        if self.client is None:
            self.client = get_llama_stack_client()
        return self.client

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

    # Vector Database Management

    async def create_vector_database(self, config: VectorDBConfig) -> VectorDBInfo:
        """Create a new vector database."""
        client = self._get_client()

        try:
            # Register vector database with Llama Stack
            response = client.vector_dbs.register(
                vector_db_id=config.vector_db_id,
                embedding_model=config.embedding_model,
                embedding_dimension=config.embedding_dimension,
                provider_id="faiss",  # Using faiss as configured in run.yaml
            )

            # Store metadata in our database (reactivate if exists)
            with self.get_db_session() as db:
                # Check if database already exists (inactive)
                existing_vdb = (
                    db.query(VectorDatabase)
                    .filter_by(vector_db_id=config.vector_db_id)
                    .first()
                )

                if existing_vdb:
                    # Reactivate existing database
                    existing_vdb.is_active = True
                    existing_vdb.name = config.name
                    existing_vdb.description = config.description
                    existing_vdb.embedding_model = config.embedding_model
                    existing_vdb.embedding_dimension = config.embedding_dimension
                    existing_vdb.use_case = config.use_case
                    existing_vdb.last_updated = datetime.utcnow()
                    vector_db = existing_vdb
                    self.logger.info(
                        f"Reactivated existing vector database: {config.vector_db_id}"
                    )
                else:
                    # Create new database
                    vector_db = VectorDatabase(
                        vector_db_id=config.vector_db_id,
                        name=config.name,
                        description=config.description,
                        embedding_model=config.embedding_model,
                        embedding_dimension=config.embedding_dimension,
                        use_case=config.use_case,
                        created_at=datetime.utcnow(),
                    )
                    db.add(vector_db)
                    self.logger.info(
                        f"Created new vector database: {config.vector_db_id}"
                    )

                db.flush()  # Get the ID

                return VectorDBInfo(
                    vector_db_id=vector_db.vector_db_id,
                    name=vector_db.name,
                    description=vector_db.description,
                    embedding_model=vector_db.embedding_model,
                    embedding_dimension=vector_db.embedding_dimension,
                    use_case=vector_db.use_case,
                    document_count=0,
                    total_chunks=0,
                    created_at=vector_db.created_at,
                    last_updated=None,
                )

        except Exception as e:
            self.logger.error(
                f"Failed to create vector database {config.vector_db_id}: {e}"
            )
            raise

    async def list_vector_databases(self) -> VectorDBListResponse:
        """List all vector databases."""
        with self.get_db_session() as db:
            vector_dbs = db.query(VectorDatabase).filter_by(is_active=True).all()

            vector_db_infos = []
            for vdb in vector_dbs:
                # Access relationships while still in session context
                doc_count = len([d for d in vdb.documents if d.is_active])
                total_chunks = sum(d.chunk_count for d in vdb.documents if d.is_active)

                vector_db_infos.append(
                    VectorDBInfo(
                        vector_db_id=vdb.vector_db_id,
                        name=vdb.name,
                        description=vdb.description,
                        embedding_model=vdb.embedding_model,
                        embedding_dimension=vdb.embedding_dimension,
                        use_case=vdb.use_case,
                        document_count=doc_count,
                        total_chunks=total_chunks,
                        created_at=vdb.created_at,
                        last_updated=vdb.last_updated,
                    )
                )

            return VectorDBListResponse(
                vector_dbs=vector_db_infos, total_count=len(vector_db_infos)
            )

    async def get_vector_database(self, vector_db_id: str) -> Optional[VectorDBInfo]:
        """Get information about a specific vector database."""
        with self.get_db_session() as db:
            vdb = (
                db.query(VectorDatabase)
                .filter_by(vector_db_id=vector_db_id, is_active=True)
                .first()
            )

            if not vdb:
                return None

            # Access relationships while still in session context
            doc_count = len([d for d in vdb.documents if d.is_active])
            total_chunks = sum(d.chunk_count for d in vdb.documents if d.is_active)

            return VectorDBInfo(
                vector_db_id=vdb.vector_db_id,
                name=vdb.name,
                description=vdb.description,
                embedding_model=vdb.embedding_model,
                embedding_dimension=vdb.embedding_dimension,
                use_case=vdb.use_case,
                document_count=doc_count,
                total_chunks=total_chunks,
                created_at=vdb.created_at,
                last_updated=vdb.last_updated,
            )

    async def delete_vector_database(self, vector_db_id: str) -> bool:
        """Delete/deactivate a vector database."""
        client = self._get_client()

        try:
            # Unregister from Llama Stack
            client.vector_dbs.unregister(vector_db_id=vector_db_id)

            # Mark as inactive in our database
            with self.get_db_session() as db:
                vdb = (
                    db.query(VectorDatabase)
                    .filter_by(vector_db_id=vector_db_id)
                    .first()
                )
                if vdb:
                    vdb.is_active = False
                    # Also mark all documents as inactive
                    for doc in vdb.documents:
                        doc.is_active = False
                    return True
                return False

        except Exception as e:
            self.logger.error(f"Failed to delete vector database {vector_db_id}: {e}")
            return False

    # Document Management

    async def ingest_documents(
        self, request: DocumentIngestionRequest
    ) -> DocumentIngestionResponse:
        """Ingest documents into a vector database."""
        client = self._get_client()
        start_time = time.time()
        errors = []
        ingested_docs = []
        total_chunks = 0

        try:
            # Convert DocumentSource to RAGDocument format
            rag_documents = []
            document_ids = []  # Store document IDs to reuse in database
            timestamp = int(
                time.time()
            )  # Use same timestamp for all documents in this batch

            for i, doc_source in enumerate(request.documents):
                doc_id = f"{request.vector_db_id}-{i}-{timestamp}"
                document_ids.append(doc_id)

                rag_doc = RAGDocument(
                    document_id=doc_id,
                    content=doc_source.url,
                    mime_type=doc_source.mime_type,
                    metadata=doc_source.metadata or {},
                )
                rag_documents.append(rag_doc)

            # Ingest using Llama Stack RAG tool
            try:
                client.tool_runtime.rag_tool.insert(
                    documents=rag_documents,
                    vector_db_id=request.vector_db_id,
                    chunk_size_in_tokens=request.chunk_size_in_tokens,
                )
            except Exception as e:
                self.logger.error(f"Llama Stack ingestion failed: {e}")

                # Try auto-recovery - re-register databases and retry once
                if "not served by provider" in str(e) or "not found" in str(e).lower():
                    self.logger.info(
                        "Attempting auto-recovery by re-registering vector databases"
                    )
                    try:
                        await self.ensure_vector_dbs_registered()
                        # Retry ingestion once after re-registration
                        client.tool_runtime.rag_tool.insert(
                            documents=rag_documents,
                            vector_db_id=request.vector_db_id,
                            chunk_size_in_tokens=request.chunk_size_in_tokens,
                        )
                        self.logger.info(
                            "Auto-recovery successful - ingestion completed after re-registration"
                        )
                    except Exception as retry_e:
                        self.logger.error(f"Auto-recovery failed: {retry_e}")
                        errors.append(
                            f"Llama Stack ingestion failed even after auto-recovery: {str(retry_e)}"
                        )
                else:
                    errors.append(f"Llama Stack ingestion failed: {str(e)}")
                # Continue to update our metadata even if ingestion failed partially

            # Update our database with document metadata
            with self.get_db_session() as db:
                vdb = (
                    db.query(VectorDatabase)
                    .filter_by(vector_db_id=request.vector_db_id)
                    .first()
                )

                if not vdb:
                    raise ValueError(
                        f"Vector database {request.vector_db_id} not found"
                    )

                for i, doc_source in enumerate(request.documents):
                    doc_id = document_ids[i]  # Use the same ID as in RAG documents

                    # Initially set chunk count to 0, will update after ingestion
                    document = Document(
                        document_id=doc_id,
                        vector_db_id=vdb.id,
                        name=doc_source.name,
                        source_url=doc_source.url,
                        mime_type=doc_source.mime_type,
                        chunk_count=0,  # Will be updated after getting real count
                        document_metadata=doc_source.metadata,
                        ingestion_date=datetime.utcnow(),
                    )
                    db.add(document)
                    db.flush()  # Ensure document is saved

                    ingested_docs.append(
                        DocumentInfo(
                            document_id=doc_id,
                            source_url=doc_source.url,
                            mime_type=doc_source.mime_type,
                            ingestion_date=document.ingestion_date,
                            chunk_count=0,  # Will be updated below
                            metadata=doc_source.metadata or {},
                        )
                    )

                # Update vector database last_updated timestamp
                vdb.last_updated = datetime.utcnow()

            # Update chunk counts with actual counts from Llama Stack
            try:
                actual_counts = await self._get_actual_chunk_counts(
                    request.vector_db_id, [doc.document_id for doc in ingested_docs]
                )
                total_chunks = 0

                with self.get_db_session() as db:
                    for doc_info in ingested_docs:
                        actual_count = actual_counts.get(doc_info.document_id, 0)
                        doc_info.chunk_count = actual_count
                        total_chunks += actual_count

                        # Update database record
                        db_doc = (
                            db.query(Document)
                            .filter_by(document_id=doc_info.document_id)
                            .first()
                        )
                        if db_doc:
                            db_doc.chunk_count = actual_count

                self.logger.info(f"Updated chunk counts: {actual_counts}")

            except Exception as e:
                self.logger.warning(f"Failed to update chunk counts: {e}")
                # Keep the estimated counts as fallback

            end_time = time.time()
            ingestion_time_ms = (end_time - start_time) * 1000

            return DocumentIngestionResponse(
                vector_db_id=request.vector_db_id,
                ingested_documents=ingested_docs,
                total_chunks_created=total_chunks,
                ingestion_time_ms=ingestion_time_ms,
                errors=errors,
            )

        except Exception as e:
            self.logger.error(f"Document ingestion failed: {e}")
            end_time = time.time()
            ingestion_time_ms = (end_time - start_time) * 1000

            return DocumentIngestionResponse(
                vector_db_id=request.vector_db_id,
                ingested_documents=ingested_docs,
                total_chunks_created=total_chunks,
                ingestion_time_ms=ingestion_time_ms,
                errors=[str(e)],
            )

    async def list_documents(self, vector_db_id: str) -> DocumentListResponse:
        """List documents in a vector database."""
        with self.get_db_session() as db:
            vdb = (
                db.query(VectorDatabase)
                .filter_by(vector_db_id=vector_db_id, is_active=True)
                .first()
            )

            if not vdb:
                return DocumentListResponse(
                    vector_db_id=vector_db_id, documents=[], total_count=0
                )

            documents = []
            for doc in vdb.documents:
                if doc.is_active:
                    documents.append(
                        DocumentInfo(
                            document_id=doc.document_id,
                            source_url=doc.source_url,
                            mime_type=doc.mime_type,
                            ingestion_date=doc.ingestion_date,
                            chunk_count=doc.chunk_count,
                            metadata=doc.document_metadata or {},
                        )
                    )

            return DocumentListResponse(
                vector_db_id=vector_db_id,
                documents=documents,
                total_count=len(documents),
            )

    async def update_documents(self, request: VectorDBUpdateRequest) -> bool:
        """Update documents in a vector database."""
        try:
            # Re-ingest the documents (this is a simple approach)
            # In a more sophisticated system, you might want to:
            # 1. Check if documents have changed
            # 2. Only update changed documents
            # 3. Handle incremental updates

            with self.get_db_session() as db:
                vdb = (
                    db.query(VectorDatabase)
                    .filter_by(vector_db_id=request.vector_db_id)
                    .first()
                )

                if not vdb:
                    return False

                # Get documents to update
                if request.document_ids:
                    docs_to_update = [
                        doc
                        for doc in vdb.documents
                        if doc.document_id in request.document_ids and doc.is_active
                    ]
                else:
                    docs_to_update = [doc for doc in vdb.documents if doc.is_active]

                # Convert to DocumentSource format for re-ingestion
                document_sources = []
                for doc in docs_to_update:
                    document_sources.append(
                        DocumentSource(
                            name=doc.name,
                            url=doc.source_url,
                            mime_type=doc.mime_type,
                            metadata=doc.document_metadata or {},
                        )
                    )

                # Create ingestion request
                ingestion_request = DocumentIngestionRequest(
                    vector_db_id=request.vector_db_id,
                    documents=document_sources,
                )

                # Mark old documents as inactive
                for doc in docs_to_update:
                    doc.is_active = False

                # Re-ingest
                await self.ingest_documents(ingestion_request)

                return True

        except Exception as e:
            self.logger.error(f"Document update failed: {e}")
            return False

    async def ingest_documents_with_llamaindex(
        self, request: DocumentIngestionRequest
    ) -> DocumentIngestionResponse:
        """Ingest documents using LlamaIndex data loaders for smarter processing."""
        start_time = time.time()

        # Check if LlamaIndex is available
        if not LLAMAINDEX_AVAILABLE:
            self.logger.warning(
                "LlamaIndex not available, falling back to basic ingestion"
            )
            return await self.ingest_documents(request)

        # Verify vector database exists
        with self.get_db_session() as db:
            vdb = (
                db.query(VectorDatabase)
                .filter_by(vector_db_id=request.vector_db_id)
                .first()
            )

            if not vdb:
                raise ValueError(f"Vector database {request.vector_db_id} not found")

        # Check for GitHub token if needed
        github_token = os.getenv("GITHUB_ACCESS_TOKEN")
        github_urls = [doc.url for doc in request.documents if "github.com" in doc.url]
        if github_urls and not github_token:
            raise ValueError(
                f"GitHub access token required for repository ingestion. "
                f"Please set GITHUB_ACCESS_TOKEN environment variable. "
                f"GitHub URLs found: {github_urls}"
            )

        # Initialize LlamaIndex loader service
        llamaindex_service = LlamaIndexLoaderService(github_token=github_token)

        try:
            self.logger.info(
                f"Starting LlamaIndex bulk ingestion for {len(request.documents)} sources"
            )

            # Load documents using LlamaIndex loaders
            processed_docs = await llamaindex_service.load_documents(request.documents)

            if not processed_docs:
                ingestion_time_ms = (time.time() - start_time) * 1000
                return DocumentIngestionResponse(
                    vector_db_id=request.vector_db_id,
                    ingested_documents=[],
                    total_chunks_created=0,
                    ingestion_time_ms=ingestion_time_ms,
                    errors=["No documents were successfully processed"],
                )

            # Convert to RAG documents for Llama Stack
            client = self._get_client()
            timestamp = int(time.time())

            rag_documents = []
            document_info_map = {}  # Track document info for database storage

            for i, doc_data in enumerate(processed_docs):
                doc_id = f"{request.vector_db_id}-{i}-{timestamp}"

                # Create RAG document for Llama Stack
                rag_doc = RAGDocument(
                    document_id=doc_id,
                    content=doc_data["content"],
                    metadata=doc_data["metadata"],
                )
                rag_documents.append(rag_doc)

                # Group by source file for database records
                file_key = doc_data["metadata"].get("file_path") or doc_data[
                    "metadata"
                ].get("source_url", f"doc_{i}")
                if file_key not in document_info_map:
                    document_info_map[file_key] = {
                        "name": doc_data["metadata"].get("file_name")
                        or doc_data["metadata"].get("source_name", f"Document {i}"),
                        "source_url": doc_data["metadata"].get("source_url", ""),
                        "mime_type": doc_data["metadata"].get(
                            "source_mime_type", "text/plain"
                        ),
                        "chunks": [],
                        "metadata": {
                            k: v
                            for k, v in doc_data["metadata"].items()
                            if k
                            not in [
                                "chunk_index",
                                "total_chunks_in_document",
                                "content",
                            ]
                        },
                    }

                document_info_map[file_key]["chunks"].append(doc_id)

            # Ingest into Llama Stack
            self.logger.info(f"Ingesting {len(rag_documents)} chunks into Llama Stack")

            try:
                client.tool_runtime.rag_tool.insert(
                    documents=rag_documents,
                    vector_db_id=request.vector_db_id,
                    chunk_size_in_tokens=request.chunk_size_in_tokens,
                )
            except Exception as e:
                self.logger.error(f"Llama Stack ingestion failed: {e}")
                raise

            # Store document records in database
            ingested_docs = []
            with self.get_db_session() as db:
                vdb = (
                    db.query(VectorDatabase)
                    .filter_by(vector_db_id=request.vector_db_id)
                    .first()
                )

                for file_key, file_info in document_info_map.items():
                    doc_id = f"{request.vector_db_id}-{file_key.replace('/', '_')}-{timestamp}"

                    document = Document(
                        document_id=doc_id,
                        vector_db_id=vdb.id,
                        name=file_info["name"],
                        source_url=file_info["source_url"],
                        mime_type=file_info["mime_type"],
                        chunk_count=len(file_info["chunks"]),
                        document_metadata=file_info["metadata"],
                        ingestion_date=datetime.utcnow(),
                    )
                    db.add(document)

                    # Create DocumentInfo for response
                    doc_info = DocumentInfo(
                        document_id=doc_id,
                        name=file_info["name"],
                        source_url=file_info["source_url"],
                        mime_type=file_info["mime_type"],
                        chunk_count=len(file_info["chunks"]),
                        metadata=file_info["metadata"],
                        ingestion_date=document.ingestion_date,
                    )
                    ingested_docs.append(doc_info)

                # Update vector database timestamp
                vdb.last_updated = datetime.utcnow()

            total_chunks = len(processed_docs)
            ingestion_time_ms = (time.time() - start_time) * 1000

            self.logger.info(
                f"Successfully ingested {len(ingested_docs)} documents "
                f"({total_chunks} chunks) using LlamaIndex loaders in {ingestion_time_ms:.2f}ms"
            )

            return DocumentIngestionResponse(
                vector_db_id=request.vector_db_id,
                ingested_documents=ingested_docs,
                total_chunks_created=total_chunks,
                ingestion_time_ms=ingestion_time_ms,
                errors=[],
            )

        except Exception as e:
            self.logger.error(f"LlamaIndex bulk ingestion failed: {e}")
            raise

    def ingest_documents_with_llamaindex_sync(
        self, request, progress_callback=None
    ) -> Dict[str, Any]:
        """Synchronous version of LlamaIndex ingestion for background tasks."""
        start_time = time.time()

        # Check if LlamaIndex is available
        if not LLAMAINDEX_AVAILABLE:
            self.logger.warning(
                "LlamaIndex not available, falling back to basic ingestion"
            )
            return self.ingest_documents_sync(request, progress_callback)

        # Verify vector database exists
        with self.get_db_session() as db:
            vdb = (
                db.query(VectorDatabase)
                .filter_by(vector_db_id=request.vector_db_id)
                .first()
            )

            if not vdb:
                raise ValueError(f"Vector database {request.vector_db_id} not found")

        # Check for GitHub token if needed
        github_token = os.getenv("GITHUB_ACCESS_TOKEN")
        github_urls = [doc.url for doc in request.documents if "github.com" in doc.url]
        if github_urls and not github_token:
            raise ValueError(
                f"GitHub access token required for repository ingestion. "
                f"Please set GITHUB_ACCESS_TOKEN environment variable. "
                f"GitHub URLs found: {github_urls}"
            )

        # Initialize LlamaIndex loader service
        from .llamaindex_loaders import LlamaIndexLoaderService

        llamaindex_service = LlamaIndexLoaderService(github_token=github_token)

        try:
            self.logger.info(
                f"Starting LlamaIndex bulk ingestion for {len(request.documents)} sources"
            )

            # Load documents using LlamaIndex loaders
            processed_docs = llamaindex_service.load_documents(
                request.documents, progress_callback
            )

            if not processed_docs:
                ingestion_time_ms = (time.time() - start_time) * 1000
                return {
                    "vector_db_id": request.vector_db_id,
                    "ingested_documents": [],
                    "total_chunks_created": 0,
                    "ingestion_time_ms": ingestion_time_ms,
                    "errors": ["No documents were successfully processed"],
                }

            # Convert to RAG documents for Llama Stack
            client = self._get_client()
            timestamp = int(time.time())

            rag_documents = []
            document_info_map = {}  # Track document info for database storage

            for i, doc_data in enumerate(processed_docs):
                doc_id = f"{request.vector_db_id}-{i}-{timestamp}"

                # Create RAG document for Llama Stack with enhanced metadata
                from llama_stack_client.types import Document as RAGDocument

                # Add ingestion tracking metadata
                enhanced_metadata = {
                    **doc_data["metadata"],
                    "ingestion_timestamp": timestamp,
                    "ingestion_method": "llamaindex",
                    "chunk_index": i,
                    "vector_db_id": request.vector_db_id,
                    "source_url": doc_data["metadata"].get("source_url", ""),
                    "document_name": doc_data["metadata"].get(
                        "file_name", f"Document {i+1}"
                    ),
                }

                rag_doc = RAGDocument(
                    document_id=doc_id,
                    content=doc_data["content"],
                    metadata=enhanced_metadata,
                )
                rag_documents.append(rag_doc)

                # Group by source file for database records
                file_key = doc_data["metadata"].get("file_path") or doc_data[
                    "metadata"
                ].get("source_url", f"doc_{i}")

                if file_key not in document_info_map:
                    document_info_map[file_key] = {
                        "name": doc_data["metadata"].get(
                            "file_name", f"Document {i+1}"
                        ),
                        "source_url": doc_data["metadata"].get("source_url", ""),
                        "mime_type": doc_data["metadata"].get(
                            "mime_type", "text/plain"
                        ),
                        "chunks": [],
                        "metadata": doc_data["metadata"],
                    }

                document_info_map[file_key]["chunks"].append(doc_id)

            # Ingest into Llama Stack
            self.logger.info(f"Ingesting {len(rag_documents)} chunks into Llama Stack")

            try:
                client.tool_runtime.rag_tool.insert(
                    documents=rag_documents,
                    vector_db_id=request.vector_db_id,
                    chunk_size_in_tokens=request.chunk_size_in_tokens,
                )
            except Exception as e:
                self.logger.error(f"Llama Stack ingestion failed: {e}")
                raise

            # Store document records in database
            ingested_docs = []
            with self.get_db_session() as db:
                vdb = (
                    db.query(VectorDatabase)
                    .filter_by(vector_db_id=request.vector_db_id)
                    .first()
                )

                for file_key, file_info in document_info_map.items():
                    doc_id = f"{request.vector_db_id}-{file_key.replace('/', '_')}-{timestamp}"

                    document = Document(
                        document_id=doc_id,
                        vector_db_id=vdb.id,
                        name=file_info["name"],
                        source_url=file_info["source_url"],
                        mime_type=file_info["mime_type"],
                        chunk_count=len(file_info["chunks"]),
                        document_metadata=file_info["metadata"],
                        ingestion_date=datetime.utcnow(),
                    )
                    db.add(document)

                    ingested_docs.append(
                        {
                            "document_id": doc_id,
                            "name": file_info["name"],
                            "source_url": file_info["source_url"],
                            "mime_type": file_info["mime_type"],
                            "chunk_count": len(file_info["chunks"]),
                            "metadata": file_info["metadata"],
                            "ingestion_date": document.ingestion_date,
                        }
                    )

                # Update vector database timestamp
                vdb.last_updated = datetime.utcnow()

            total_chunks = len(processed_docs)
            ingestion_time_ms = (time.time() - start_time) * 1000

            self.logger.info(
                f"Successfully ingested {len(ingested_docs)} documents "
                f"({total_chunks} chunks) using LlamaIndex loaders in {ingestion_time_ms:.2f}ms"
            )

            return {
                "vector_db_id": request.vector_db_id,
                "ingested_documents": ingested_docs,
                "total_chunks_created": total_chunks,
                "ingestion_time_ms": ingestion_time_ms,
                "errors": [],
            }

        except Exception as e:
            self.logger.error(f"LlamaIndex bulk ingestion failed: {e}")
            raise

    def ingest_documents_sync(self, request, progress_callback=None) -> Dict[str, Any]:
        """Synchronous version of basic document ingestion for background tasks."""
        # Convert to basic DocumentIngestionRequest if needed
        from .schemas import DocumentIngestionRequest

        if not isinstance(request, DocumentIngestionRequest):
            basic_request = DocumentIngestionRequest(
                vector_db_id=request.vector_db_id,
                documents=request.documents,
                chunk_size_in_tokens=request.chunk_size_in_tokens,
                chunk_overlap_in_tokens=request.chunk_overlap_in_tokens,
            )
        else:
            basic_request = request

        # Run the async method in a synchronous context
        import asyncio

        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        result = loop.run_until_complete(self.ingest_documents(basic_request))

        # Convert to dict format for consistency
        return {
            "vector_db_id": result.vector_db_id,
            "ingested_documents": [doc.dict() for doc in result.ingested_documents],
            "total_chunks_created": result.total_chunks_created,
            "ingestion_time_ms": result.ingestion_time_ms,
            "errors": result.errors,
        }

    async def reset_vector_database(self, vector_db_id: str) -> bool:
        """Reset a vector database by deleting and recreating it."""
        client = self._get_client()

        try:
            # Get the current database info first
            with self.get_db_session() as db:
                vdb = (
                    db.query(VectorDatabase)
                    .filter_by(vector_db_id=vector_db_id)
                    .first()
                )

                if not vdb:
                    raise ValueError(f"Vector database {vector_db_id} not found")

                # Store the config for recreation
                config = VectorDBConfig(
                    vector_db_id=vdb.vector_db_id,
                    name=vdb.name,
                    description=vdb.description,
                    embedding_model=vdb.embedding_model,
                    embedding_dimension=vdb.embedding_dimension,
                    use_case=vdb.use_case,
                )

            # Delete the vector database (this removes from Llama Stack and marks as inactive)
            await self.delete_vector_database(vector_db_id)

            # Clean up ingestion request records for this vector database
            # This ensures the Sources tab shows empty after reset
            with self.get_db_session() as db:
                from .models import IngestionRequest, BackgroundTask

                # Get all ingestion requests for this vector database
                ingestion_requests = (
                    db.query(IngestionRequest)
                    .filter_by(vector_db_id=vector_db_id)
                    .all()
                )

                # Delete related background tasks and ingestion requests
                for req in ingestion_requests:
                    # Delete the background task
                    background_task = (
                        db.query(BackgroundTask).filter_by(task_id=req.task_id).first()
                    )
                    if background_task:
                        db.delete(background_task)

                    # Delete the ingestion request
                    db.delete(req)

                db.commit()

                if ingestion_requests:
                    self.logger.info(
                        f"Cleaned up {len(ingestion_requests)} ingestion requests "
                        f"and their background tasks for vector database: {vector_db_id}"
                    )

            # Recreate the vector database fresh
            new_vdb_info = await self.create_vector_database(config)

            self.logger.info(f"Successfully reset vector database: {vector_db_id}")
            return True

        except Exception as e:
            self.logger.error(f"Failed to reset vector database {vector_db_id}: {e}")
            return False

    async def _get_actual_chunk_counts(
        self, vector_db_id: str, document_ids: List[str]
    ) -> Dict[str, int]:
        """Get actual chunk counts for documents from Llama Stack."""
        client = self._get_client()
        counts = {}

        try:
            # Use browse_chunks to get all chunks and count by document_id
            response = client.tool_runtime.rag_tool.query(
                vector_db_ids=[vector_db_id],
                content="document text content information data",  # Broad query to get all chunks
                query_config={
                    "max_chunks": 1000,  # Get all chunks
                    "chunk_template": "Result {index}\nContent: {chunk.content}\nMetadata: {metadata}\n",
                },
            )

            # Initialize counts for all requested document IDs
            for doc_id in document_ids:
                counts[doc_id] = 0

            # Extract chunks and count by document_id
            if (
                hasattr(response, "metadata")
                and response.metadata
                and "chunks" in response.metadata
                and "document_ids" in response.metadata
            ):
                doc_ids_from_chunks = response.metadata.get("document_ids", [])

                # Count chunks for each document
                for chunk_doc_id in doc_ids_from_chunks:
                    if chunk_doc_id in counts:
                        counts[chunk_doc_id] += 1

                self.logger.info(f"Actual chunk counts for {vector_db_id}: {counts}")
            else:
                self.logger.warning(
                    f"Could not extract chunk metadata for {vector_db_id}"
                )

        except Exception as e:
            self.logger.error(f"Failed to get actual chunk counts: {e}")

        return counts

    async def cleanup_orphaned_chunks(self, vector_db_id: str) -> Dict[str, int]:
        """Clean up chunks that belong to deleted/inactive documents."""
        client = self._get_client()

        try:
            # Get all active document IDs from our database
            active_doc_ids = set()
            with self.get_db_session() as db:
                vdb = (
                    db.query(VectorDatabase)
                    .filter_by(vector_db_id=vector_db_id)
                    .first()
                )

                if not vdb:
                    raise ValueError(f"Vector database {vector_db_id} not found")

                active_docs = (
                    db.query(Document)
                    .filter_by(vector_db_id=vdb.id, is_active=True)
                    .all()
                )

                active_doc_ids = {doc.document_id for doc in active_docs}

            # Get all chunks from Llama Stack
            response = client.tool_runtime.rag_tool.query(
                vector_db_ids=[vector_db_id],
                content="document text content information data",
                query_config={
                    "max_chunks": 1000,
                    "chunk_template": "Result {index}\nContent: {chunk.content}\nMetadata: {metadata}\n",
                },
            )

            orphaned_chunks = 0
            total_chunks = 0
            orphaned_doc_ids = set()

            if (
                hasattr(response, "metadata")
                and response.metadata
                and "document_ids" in response.metadata
            ):
                doc_ids_from_chunks = response.metadata.get("document_ids", [])
                total_chunks = len(doc_ids_from_chunks)

                for chunk_doc_id in doc_ids_from_chunks:
                    if chunk_doc_id not in active_doc_ids:
                        orphaned_chunks += 1
                        orphaned_doc_ids.add(chunk_doc_id)

            self.logger.info(
                f"Found {orphaned_chunks} orphaned chunks out of {total_chunks} total chunks in {vector_db_id}"
            )

            if orphaned_doc_ids:
                self.logger.info(f"Orphaned document IDs: {orphaned_doc_ids}")

            # TODO: Implement actual chunk removal when Llama Stack supports it
            # Currently, Llama Stack doesn't provide a way to remove individual chunks
            # This method serves as detection and reporting for now

            return {
                "total_chunks": total_chunks,
                "orphaned_chunks": orphaned_chunks,
                "active_documents": len(active_doc_ids),
                "orphaned_document_ids": len(orphaned_doc_ids),
            }

        except Exception as e:
            self.logger.error(f"Failed to cleanup orphaned chunks: {e}")
            raise

    # RAG Querying

    async def query_rag(
        self, request: RAGQueryRequest, session_id: Optional[uuid.UUID] = None
    ) -> RAGQueryResponse:
        """Query the RAG system."""
        client = self._get_client()
        start_time = time.time()

        # Log RAG query details
        self.logger.info("=== RAG QUERY START ===")
        self.logger.info(f"Query: '{request.query}'")
        self.logger.info(f"Vector DBs to search: {request.vector_db_ids}")
        self.logger.info(f"Max chunks requested: {request.max_chunks}")

        # Try to get human-readable vector DB names and document counts
        try:
            with self.get_db_session() as db:
                db_info = []
                total_docs = 0
                for db_id in request.vector_db_ids:
                    vector_db = (
                        db.query(VectorDatabase)
                        .filter(VectorDatabase.id == db_id)
                        .first()
                    )
                    if vector_db:
                        doc_count = (
                            db.query(Document)
                            .filter(Document.vector_db_id == db_id)
                            .count()
                        )
                        db_info.append(f"{vector_db.name} ({doc_count} docs)")
                        total_docs += doc_count

                        # Log a few sample document names from this vector DB
                        sample_docs = (
                            db.query(Document)
                            .filter(Document.vector_db_id == db_id)
                            .limit(3)
                            .all()
                        )
                        if sample_docs:
                            doc_names = [
                                doc.filename or f"doc_{doc.id[:8]}"
                                for doc in sample_docs
                            ]
                            self.logger.info(
                                f"  Sample documents in {vector_db.name}: {doc_names}"
                            )
                    else:
                        db_info.append(f"Unknown ({db_id})")

                self.logger.info(f"Vector databases: {db_info}")
                self.logger.info(f"Total documents available: {total_docs}")
        except Exception as e:
            self.logger.debug(f"Could not resolve vector DB info: {e}")

        try:
            # Query using Llama Stack RAG tool
            results = client.tool_runtime.rag_tool.query(
                vector_db_ids=request.vector_db_ids,
                content=request.query,
                query_config={
                    "max_chunks": request.max_chunks,
                    "chunk_template": request.chunk_template
                    or "Result {index}\nContent: {chunk.content}\nMetadata: {metadata}\n",
                },
            )

            end_time = time.time()
            query_time_ms = (end_time - start_time) * 1000

            # Extract chunks from results
            chunks = []
            document_ids = []
            scores = []

            if (
                hasattr(results, "metadata")
                and results.metadata
                and "chunks" in results.metadata
            ):
                # RAG tool returns chunks in metadata.chunks
                raw_chunks = results.metadata["chunks"]
                document_ids = results.metadata.get("document_ids", [])
                scores = results.metadata.get("scores", [])

                chunks = [
                    {
                        "content": chunk,
                        "metadata": {
                            "document_id": (
                                document_ids[i] if i < len(document_ids) else None
                            ),
                            "score": (scores[i] if i < len(scores) else None),
                        },
                    }
                    for i, chunk in enumerate(raw_chunks[: request.max_chunks])
                ]
            elif hasattr(results, "chunks") and results.chunks:
                chunks = results.chunks[: request.max_chunks]
            elif isinstance(results, list):
                chunks = results[: request.max_chunks]

            # Log detailed retrieval results
            self.logger.info("=== RAG RETRIEVAL RESULTS ===")
            self.logger.info(f"Total chunks found: {len(chunks)}")
            self.logger.info(f"Query time: {query_time_ms:.2f}ms")

            if chunks:
                self.logger.info("Retrieved chunks:")
                for i, chunk in enumerate(chunks):
                    chunk_metadata = (
                        chunk.get("metadata", {}) if isinstance(chunk, dict) else {}
                    )
                    doc_id = chunk_metadata.get("document_id", "Unknown")
                    score = chunk_metadata.get("score", "N/A")
                    content_preview = (
                        chunk.get("content", str(chunk))[:100] + "..."
                        if len(str(chunk.get("content", chunk))) > 100
                        else str(chunk.get("content", chunk))
                    )

                    self.logger.info(f"  Chunk {i+1}:")
                    self.logger.info(f"    Document ID: {doc_id}")
                    self.logger.info(f"    Relevance Score: {score}")
                    self.logger.info(f"    Content Preview: {content_preview}")

                # Log unique documents retrieved
                unique_docs = set()
                for chunk in chunks:
                    if isinstance(chunk, dict) and "metadata" in chunk:
                        doc_id = chunk["metadata"].get("document_id")
                        if doc_id:
                            unique_docs.add(doc_id)

                if unique_docs:
                    self.logger.info(
                        f"Unique documents retrieved: {sorted(list(unique_docs))}"
                    )
            else:
                self.logger.info("No relevant chunks found for this query")

            self.logger.info("=== RAG QUERY END ===")

            # Store query in database for analytics
            with self.get_db_session() as db:
                rag_query = RAGQuery(
                    session_id=session_id,
                    query_text=request.query,
                    vector_db_ids=request.vector_db_ids,
                    chunks_retrieved=len(chunks),
                    query_time_ms=query_time_ms,
                    timestamp=datetime.utcnow(),
                )
                db.add(rag_query)

            return RAGQueryResponse(
                chunks=chunks,
                total_chunks_found=len(chunks),
                vector_dbs_searched=request.vector_db_ids,
                query_time_ms=query_time_ms,
            )

        except Exception as e:
            self.logger.error(f"RAG query failed: {e}")
            end_time = time.time()
            query_time_ms = (end_time - start_time) * 1000

            return RAGQueryResponse(
                chunks=[],
                total_chunks_found=0,
                vector_dbs_searched=request.vector_db_ids,
                query_time_ms=query_time_ms,
            )

    async def browse_chunks(self, request: ChunkBrowseRequest) -> ChunkBrowseResponse:
        """Browse chunks in a vector database for debugging and visualization."""
        client = self._get_client()

        try:
            if request.search_query:
                # User provided a search query - do semantic similarity search with limited results
                # Only return the most relevant chunks (not everything)
                response = client.tool_runtime.rag_tool.query(
                    vector_db_ids=[request.vector_db_id],
                    content=request.search_query,
                    query_config={
                        "max_chunks": min(
                            20, request.limit + request.offset + 10
                        ),  # Much lower limit for search
                        "chunk_template": "Result {index}\nContent: {chunk.content}\nMetadata: {metadata}\n",
                    },
                )
            else:
                # No search query - browse all chunks (use a very broad query to get everything)
                # This is essentially a "list all chunks" operation for debugging/browsing
                response = client.tool_runtime.rag_tool.query(
                    vector_db_ids=[request.vector_db_id],
                    content="document text content information data",  # Very broad terms to match everything
                    query_config={
                        "max_chunks": min(
                            100, request.limit + request.offset + 20
                        ),  # Higher limit for browsing
                        "chunk_template": "Result {index}\nContent: {chunk.content}\nMetadata: {metadata}\n",
                    },
                )

            # Extract chunks from RAG tool response (same logic as query_rag)
            raw_chunks = []
            scores = []

            if (
                hasattr(response, "metadata")
                and response.metadata
                and "chunks" in response.metadata
            ):
                # RAG tool returns chunks in metadata.chunks
                raw_chunks = response.metadata["chunks"]
                scores = response.metadata.get("scores", [])
            elif hasattr(response, "chunks") and response.chunks:
                raw_chunks = response.chunks
            elif isinstance(response, list):
                raw_chunks = response

            # Filter chunks by relevance if we have a search query and scores
            if request.search_query and scores:
                # Filter out chunks with low similarity scores (< 0.7)
                # Based on testing: relevant chunks score 0.8+, irrelevant chunks score ~0.55
                original_count = len(raw_chunks)
                filtered_chunks_with_scores = [
                    (chunk, score)
                    for chunk, score in zip(raw_chunks, scores)
                    if score >= 0.7  # Threshold chosen based on score analysis
                ]

                # Always apply filtering - even if it results in 0 chunks
                raw_chunks = [chunk for chunk, _ in filtered_chunks_with_scores]
                scores = [score for _, score in filtered_chunks_with_scores]

                self.logger.info(
                    f"Filtered {len(raw_chunks)} relevant chunks out of {original_count} "
                    f"for query: '{request.search_query}' (threshold: 0.7)"
                )

            # Apply offset and limit to filtered chunks
            start_idx = request.offset
            end_idx = start_idx + request.limit
            selected_chunks = raw_chunks[start_idx:end_idx]
            selected_scores = scores[start_idx:end_idx] if scores else []

            chunks = []
            for i, chunk_content in enumerate(selected_chunks):
                chunk_info = {
                    "chunk_id": f"chunk_{start_idx + i}",
                    "content": (
                        chunk_content
                        if isinstance(chunk_content, str)
                        else str(chunk_content)
                    ),
                    "metadata": {
                        "similarity_score": (
                            selected_scores[i] if i < len(selected_scores) else None
                        )
                    },
                    "document_id": (
                        response.metadata.get("document_ids", [])[start_idx + i]
                        if hasattr(response, "metadata")
                        and response.metadata
                        and "document_ids" in response.metadata
                        and start_idx + i < len(response.metadata["document_ids"])
                        else None
                    ),
                }
                chunks.append(chunk_info)

            # Get total count
            total_chunks = len(raw_chunks)

            return ChunkBrowseResponse(
                chunks=chunks,
                total_chunks=total_chunks,
                vector_db_id=request.vector_db_id,
            )

        except Exception as e:
            self.logger.error(f"Failed to browse chunks: {e}")
            return ChunkBrowseResponse(
                chunks=[],
                total_chunks=0,
                vector_db_id=request.vector_db_id,
            )

    # Utility Methods

    async def get_predefined_vector_dbs(self) -> List[VectorDBConfig]:
        """Get predefined vector database configurations for common use cases."""
        return [
            VectorDBConfig(
                vector_db_id="patternfly_docs",
                name="PatternFly Documentation",
                description="PatternFly design system documentation and components",
                use_case="patternfly",
            ),
            VectorDBConfig(
                vector_db_id="github_repos",
                name="GitHub Repositories",
                description="Documentation from various GitHub repositories",
                use_case="github_repos",
            ),
            VectorDBConfig(
                vector_db_id="rhoai_docs",
                name="RHOAI Documentation",
                description="Red Hat OpenShift AI documentation",
                use_case="documentation",
            ),
            VectorDBConfig(
                vector_db_id="kubernetes_docs",
                name="Kubernetes Documentation",
                description="Kubernetes and OpenShift documentation",
                use_case="documentation",
            ),
        ]

    async def setup_predefined_vector_dbs(self) -> List[str]:
        """Setup predefined vector databases if they don't exist."""
        created_dbs = []
        predefined_configs = await self.get_predefined_vector_dbs()

        with self.get_db_session() as db:
            existing_db_ids = {
                vdb.vector_db_id
                for vdb in db.query(VectorDatabase).filter_by(is_active=True).all()
            }

        for config in predefined_configs:
            if config.vector_db_id not in existing_db_ids:
                try:
                    await self.create_vector_database(config)
                    created_dbs.append(config.vector_db_id)
                    self.logger.info(
                        f"Created predefined vector database: {config.vector_db_id}"
                    )
                except Exception as e:
                    self.logger.error(
                        f"Failed to create predefined vector database {config.vector_db_id}: {e}"
                    )

        return created_dbs

    async def ensure_vector_dbs_registered(self) -> List[str]:
        """Ensure all local vector databases are registered with Llama Stack."""
        client = self._get_client()
        re_registered = []

        try:
            # Get all registered DBs from Llama Stack
            llama_stack_dbs = client.vector_dbs.list()
            registered_ids = {db.identifier for db in llama_stack_dbs}

            # Get all local DBs and extract needed data while in session
            local_db_data = []
            with self.get_db_session() as db:
                local_dbs = db.query(VectorDatabase).filter_by(is_active=True).all()
                # Extract the data we need while objects are still bound to session
                for local_db in local_dbs:
                    local_db_data.append(
                        {
                            "vector_db_id": local_db.vector_db_id,
                            "embedding_model": local_db.embedding_model,
                            "embedding_dimension": local_db.embedding_dimension,
                        }
                    )

            # Re-register missing databases using extracted data
            for db_data in local_db_data:
                if db_data["vector_db_id"] not in registered_ids:
                    try:
                        client.vector_dbs.register(
                            vector_db_id=db_data["vector_db_id"],
                            embedding_model=db_data["embedding_model"],
                            embedding_dimension=db_data["embedding_dimension"],
                            provider_id="faiss",
                        )
                        re_registered.append(db_data["vector_db_id"])
                        self.logger.info(
                            f"Re-registered vector database: {db_data['vector_db_id']}"
                        )
                    except Exception as e:
                        self.logger.error(
                            f"Failed to re-register {db_data['vector_db_id']}: {e}"
                        )

        except Exception as e:
            self.logger.error(f"Failed to check vector database registrations: {e}")

        return re_registered

    async def sync_vector_databases(self) -> Dict[str, List[str]]:
        """
        Synchronize vector databases between Application Database and Llama Stack.

        This ensures perfect consistency by:
        1. Removing orphaned Llama Stack registrations (exist in LL but not in app DB)
        2. Re-registering missing Llama Stack registrations (exist in app DB but not in LL)

        Returns:
            Dictionary with 'cleaned_orphans' and 're_registered' lists
        """
        client = self._get_client()
        results = {"cleaned_orphans": [], "re_registered": []}

        try:
            # Get all registered DBs from Llama Stack
            llama_stack_dbs = client.vector_dbs.list()
            llama_stack_ids = {db.identifier for db in llama_stack_dbs}

            # Get all local DBs and extract needed data while in session
            local_db_data = {}
            with self.get_db_session() as db:
                local_dbs = db.query(VectorDatabase).filter_by(is_active=True).all()
                # Extract the data we need while objects are still bound to session
                for local_db in local_dbs:
                    local_db_data[local_db.vector_db_id] = {
                        "vector_db_id": local_db.vector_db_id,
                        "embedding_model": local_db.embedding_model,
                        "embedding_dimension": local_db.embedding_dimension,
                    }

            local_db_ids = set(local_db_data.keys())

            # 1. Clean up orphaned Llama Stack registrations
            orphaned_ids = llama_stack_ids - local_db_ids
            for orphaned_id in orphaned_ids:
                try:
                    client.vector_dbs.unregister(vector_db_id=orphaned_id)
                    results["cleaned_orphans"].append(orphaned_id)
                    self.logger.info(
                        f"Cleaned up orphaned vector database: {orphaned_id}"
                    )
                except Exception as e:
                    self.logger.error(
                        f"Failed to clean up orphaned database {orphaned_id}: {e}"
                    )

            # 2. Re-register missing Llama Stack registrations
            missing_ids = local_db_ids - llama_stack_ids
            for missing_id in missing_ids:
                db_data = local_db_data[missing_id]
                try:
                    client.vector_dbs.register(
                        vector_db_id=db_data["vector_db_id"],
                        embedding_model=db_data["embedding_model"],
                        embedding_dimension=db_data["embedding_dimension"],
                        provider_id="faiss",
                    )
                    results["re_registered"].append(missing_id)
                    self.logger.info(
                        f"Re-registered missing vector database: {missing_id}"
                    )
                except Exception as e:
                    self.logger.error(
                        f"Failed to re-register missing database {missing_id}: {e}"
                    )

            # Log summary
            if results["cleaned_orphans"] or results["re_registered"]:
                self.logger.info(
                    f"Vector database sync completed: "
                    f"cleaned {len(results['cleaned_orphans'])} orphans, "
                    f"re-registered {len(results['re_registered'])} missing"
                )
            else:
                self.logger.info("Vector databases already in sync")

        except Exception as e:
            self.logger.error(f"Failed to sync vector databases: {e}")

        return results
