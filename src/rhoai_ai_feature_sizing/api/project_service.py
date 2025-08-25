"""
Project management service for organizing RAG stores and documents.
"""

import logging
import re
from datetime import datetime
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from .models import Project, ProjectStore, Document, VectorDatabase, SessionLocal
from .schemas import VectorDBConfig
from .simple_schemas import (
    ProjectStoreType,
    CreateProjectRequest,
    ProjectResponse,
    DocumentResponse,
    ProjectDocumentsResponse,
)


class ProjectService:
    """Service for managing projects and automatic document routing."""

    def __init__(self):
        self.logger = logging.getLogger(__name__)

    def get_db_session(self):
        """Get database session."""
        return SessionLocal()

    def create_project(self, request: CreateProjectRequest) -> ProjectResponse:
        """Create a new project with associated stores."""
        with self.get_db_session() as db:
            # Check if project already exists
            existing = (
                db.query(Project).filter_by(project_id=request.project_id).first()
            )
            if existing:
                raise ValueError(f"Project {request.project_id} already exists")

            # Create project
            project = Project(
                project_id=request.project_id,
                name=request.name,
                description=request.description,
                project_type=request.project_type,
                created_by=request.created_by,
                auto_routing_enabled=False,  # No routing needed with single store
            )
            db.add(project)
            db.flush()  # Get the project ID

            # Create single RAG store for the project
            store = self._create_project_store(
                db, project.id, ProjectStoreType.DEFAULT, request.project_id
            )
            stores = [store]

            db.commit()

            self.logger.info(
                f"Created project {request.project_id} with single RAG store"
            )

            return self._project_to_response(project, stores)

    def get_project(self, project_id: str) -> Optional[ProjectResponse]:
        """Get project by ID."""
        with self.get_db_session() as db:
            project = (
                db.query(Project)
                .filter_by(project_id=project_id, is_active=True)
                .first()
            )

            if not project:
                return None

            stores = (
                db.query(ProjectStore)
                .filter_by(project_id=project.id, is_active=True)
                .all()
            )

            return self._project_to_response(project, stores)

    def list_projects(self, limit: int = 50) -> List[ProjectResponse]:
        """List all active projects."""
        with self.get_db_session() as db:
            projects = (
                db.query(Project)
                .filter_by(is_active=True)
                .order_by(Project.created_at.desc())
                .limit(limit)
                .all()
            )

            project_responses = []
            for project in projects:
                stores = (
                    db.query(ProjectStore)
                    .filter_by(project_id=project.id, is_active=True)
                    .all()
                )
                project_responses.append(self._project_to_response(project, stores))

            return project_responses

    def delete_project(self, project_id: str) -> bool:
        """Soft delete a project and its stores."""
        with self.get_db_session() as db:
            project = (
                db.query(Project)
                .filter_by(project_id=project_id, is_active=True)
                .first()
            )

            if not project:
                return False

            # Soft delete project and its stores
            project.is_active = False
            project.last_updated = datetime.utcnow()

            # Deactivate all stores in the project
            stores = db.query(ProjectStore).filter_by(project_id=project.id).all()
            for store in stores:
                store.is_active = False
                store.last_updated = datetime.utcnow()

            # Deactivate all documents in the project
            documents = db.query(Document).filter_by(project_id=project.id).all()
            for doc in documents:
                doc.is_active = False
                doc.last_updated = datetime.utcnow()

            db.commit()

            self.logger.info(f"Deleted project {project_id}")
            return True

    def route_document_to_store(
        self,
        project_id: str,
        document_url: str,
        document_metadata: Dict[str, Any],
        override_store_type: Optional[str] = None,
    ) -> Optional[str]:
        """Automatically route a document to the appropriate store within a project."""

        # Use override if provided
        if override_store_type:
            return self._get_store_vector_db_id(project_id, override_store_type)

        # Auto-detect store type based on URL and metadata
        store_type = self._detect_store_type(document_url, document_metadata)
        return self._get_store_vector_db_id(project_id, store_type)

    def _detect_store_type(self, url: str, metadata: Dict[str, Any]) -> str:
        """Detect the appropriate store type for a document."""
        url_lower = url.lower()

        # GitHub content
        if "github.com" in url_lower:
            if "/blob/" in url_lower or metadata.get("source_type") == "github_file":
                return ProjectStoreType.CODE_FILES
            else:
                return ProjectStoreType.GITHUB_REPOS

        # API documentation
        if any(
            term in url_lower
            for term in ["api.", "swagger", "openapi", "rest", "graphql"]
        ):
            return ProjectStoreType.API_DOCS

        # Code files (by extension)
        if any(
            url_lower.endswith(ext)
            for ext in [".py", ".js", ".ts", ".tsx", ".jsx", ".go", ".java", ".cpp"]
        ):
            return ProjectStoreType.CODE_FILES

        # Documents
        if any(
            url_lower.endswith(ext)
            for ext in [".pdf", ".doc", ".docx", ".ppt", ".pptx"]
        ):
            return ProjectStoreType.DOCUMENTS

        # Web content (default for http/https)
        if url_lower.startswith(("http://", "https://")):
            return ProjectStoreType.WEB_CONTENT

        # Default fallback
        return ProjectStoreType.DEFAULT

    def _get_store_vector_db_id(
        self, project_id: str, store_type: str
    ) -> Optional[str]:
        """Get the vector_db_id for a specific store type within a project."""
        with self.get_db_session() as db:
            project = (
                db.query(Project)
                .filter_by(project_id=project_id, is_active=True)
                .first()
            )

            if not project:
                return None

            store = (
                db.query(ProjectStore)
                .filter_by(project_id=project.id, store_type=store_type, is_active=True)
                .first()
            )

            return store.vector_db_id if store else None

    def _create_project_store(
        self,
        db: Session,
        project_id: str,
        store_type: ProjectStoreType,
        project_slug: str,
    ) -> ProjectStore:
        """Create a store within a project."""

        # Generate unique vector_db_id for Llama Stack
        vector_db_id = f"{project_slug}_{store_type.value}"

        # Store metadata based on type
        store_configs = {
            ProjectStoreType.GITHUB_REPOS: {
                "name": "GitHub Repositories",
                "description": "GitHub repositories and their contents",
            },
            ProjectStoreType.WEB_CONTENT: {
                "name": "Web Content",
                "description": "Web pages and documentation sites",
            },
            ProjectStoreType.API_DOCS: {
                "name": "API Documentation",
                "description": "API references and technical documentation",
            },
            ProjectStoreType.CODE_FILES: {
                "name": "Code Files",
                "description": "Individual code files and snippets",
            },
            ProjectStoreType.DOCUMENTS: {
                "name": "Documents",
                "description": "PDFs, presentations, and other documents",
            },
            ProjectStoreType.DEFAULT: {
                "name": "Default",
                "description": "Miscellaneous content",
            },
        }

        config = store_configs.get(store_type, store_configs[ProjectStoreType.DEFAULT])

        store = ProjectStore(
            project_id=project_id,
            store_type=store_type.value,
            vector_db_id=vector_db_id,
            name=config["name"],
            description=config["description"],
        )

        db.add(store)
        return store

    def _project_to_response(
        self, project: Project, stores: List[ProjectStore]
    ) -> ProjectResponse:
        """Convert project model to response schema."""

        # Get document count
        with self.get_db_session() as db:
            total_docs = (
                db.query(Document)
                .filter_by(project_id=project.id, is_active=True)
                .count()
            )

            store_info = []
            for store in stores:
                doc_count = (
                    db.query(Document)
                    .filter_by(project_store_id=store.id, is_active=True)
                    .count()
                )

                store_info.append(
                    {
                        "store_id": store.id,
                        "store_type": store.store_type,
                        "vector_db_id": store.vector_db_id,
                        "name": store.name,
                        "description": store.description,
                        "document_count": doc_count,
                    }
                )

        return ProjectResponse(
            project_id=project.project_id,
            name=project.name,
            description=project.description,
            project_type=project.project_type,
            created_by=project.created_by,
            auto_routing_enabled=project.auto_routing_enabled,
            is_active=project.is_active,
            created_at=project.created_at.isoformat(),
            last_updated=(
                project.last_updated.isoformat() if project.last_updated else None
            ),
            stores=store_info,
            total_documents=total_docs,
        )

    def get_project_documents(
        self, project_id: str
    ) -> Optional[ProjectDocumentsResponse]:
        """Get all documents for a project."""
        with self.get_db_session() as db:
            # Verify project exists
            project = db.query(Project).filter_by(project_id=project_id).first()
            if not project:
                return None

            # Get all documents for the project with project store info
            documents = (
                db.query(Document)
                .filter_by(project_id=project.id, is_active=True)
                .order_by(Document.ingestion_date.desc())
                .all()
            )

            # Convert to response schema
            document_responses = []
            for doc in documents:
                # Get RAG store info if available
                rag_store_name = None
                rag_store_type = None
                if doc.project_store:
                    rag_store_name = doc.project_store.name
                    rag_store_type = doc.project_store.store_type

                document_responses.append(
                    DocumentResponse(
                        document_id=doc.document_id,
                        name=doc.name,
                        source_url=doc.source_url,
                        mime_type=doc.mime_type,
                        source_type=doc.source_type,
                        rag_store_name=rag_store_name,
                        rag_store_type=rag_store_type,
                        ingestion_date=doc.ingestion_date.isoformat(),
                        last_updated=(
                            doc.last_updated.isoformat() if doc.last_updated else None
                        ),
                        chunk_count=doc.chunk_count,
                        ingestion_method=doc.ingestion_method,
                        document_metadata=doc.document_metadata,
                        is_active=doc.is_active,
                    )
                )

            return ProjectDocumentsResponse(
                project_id=project_id,
                documents=document_responses,
                total=len(document_responses),
            )


# Global project service instance
project_service = ProjectService()
