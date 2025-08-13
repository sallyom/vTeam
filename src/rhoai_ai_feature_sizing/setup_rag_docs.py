#!/usr/bin/env python3
"""
Setup script for initializing RAG system with predefined document sources.

This script creates vector databases and ingests initial documents for:
- PatternFly design system documentation
- RHOAI documentation
- Kubernetes documentation
- Common GitHub repositories

Usage:
    python -m rhoai_ai_feature_sizing.setup_rag_docs
"""

import asyncio
import logging
from typing import List, Dict, Any

from .api.rag_service import RAGService
from .api.schemas import VectorDBConfig, DocumentSource, DocumentIngestionRequest


# Predefined document sources for different use cases
DOCUMENT_SOURCES = {
    "default": [
        {
            "name": "PatternFly Components Overview",
            "url": "https://raw.githubusercontent.com/patternfly/patternfly-react/main/packages/react-core/README.md",
            "mime_type": "text/markdown",
            "metadata": {"category": "components", "source": "patternfly-react"},
        },
        {
            "name": "PatternFly Design Guidelines",
            "url": "https://raw.githubusercontent.com/patternfly/patternfly-design/main/README.md",
            "mime_type": "text/markdown",
            "metadata": {"category": "design", "source": "patternfly-design"},
        },
        {
            "name": "PatternFly Card Component",
            "url": "https://raw.githubusercontent.com/patternfly/patternfly-react/main/packages/react-core/src/components/Card/Card.tsx",
            "mime_type": "text/plain",
            "metadata": {"category": "component", "component": "Card"},
        },
        {
            "name": "PatternFly Form Components",
            "url": "https://raw.githubusercontent.com/patternfly/patternfly-react/main/packages/react-core/src/components/Form/Form.tsx",
            "mime_type": "text/plain",
            "metadata": {"category": "component", "component": "Form"},
        },
        {
            "name": "PatternFly Navigation",
            "url": "https://raw.githubusercontent.com/patternfly/patternfly-react/main/packages/react-core/src/components/Nav/Nav.tsx",
            "mime_type": "text/plain",
            "metadata": {"category": "component", "component": "Nav"},
        },
    ],
}


class RAGSetupManager:
    """Manager for setting up RAG system with predefined documents."""

    def __init__(self):
        self.rag_service = RAGService()
        self.logger = logging.getLogger("RAGSetupManager")

    async def setup_all_vector_databases(self) -> Dict[str, Any]:
        """
        Setup all predefined vector databases with their documents.

        Returns:
            Dictionary with setup results
        """
        results = {"created_databases": [], "ingested_documents": {}, "errors": []}

        # First, ensure predefined vector databases exist
        try:
            created_dbs = await self.rag_service.setup_predefined_vector_dbs()
            results["created_databases"] = created_dbs
            self.logger.info(f"Created {len(created_dbs)} new vector databases")
        except Exception as e:
            error_msg = f"Failed to setup predefined databases: {e}"
            results["errors"].append(error_msg)
            self.logger.error(error_msg)

        # Get list of available vector databases
        try:
            db_list = await self.rag_service.list_vector_databases()
            available_dbs = {vdb.vector_db_id: vdb for vdb in db_list.vector_dbs}
        except Exception as e:
            error_msg = f"Failed to list vector databases: {e}"
            results["errors"].append(error_msg)
            self.logger.error(error_msg)
            return results

        # Ingest documents for each vector database
        for vector_db_id, documents in DOCUMENT_SOURCES.items():
            if vector_db_id not in available_dbs:
                error_msg = f"Vector database {vector_db_id} not found"
                results["errors"].append(error_msg)
                self.logger.warning(error_msg)
                continue

            try:
                # Check if database already has documents
                existing_docs = await self.rag_service.list_documents(vector_db_id)
                if existing_docs.total_count > 0:
                    self.logger.info(
                        f"Vector database {vector_db_id} already has {existing_docs.total_count} documents, skipping"
                    )
                    continue

                # Convert to DocumentSource objects
                document_sources = [
                    DocumentSource(
                        name=doc["name"],
                        url=doc["url"],
                        mime_type=doc["mime_type"],
                        metadata=doc["metadata"],
                    )
                    for doc in documents
                ]

                # Ingest documents
                ingestion_request = DocumentIngestionRequest(
                    vector_db_id=vector_db_id,
                    documents=document_sources,
                    chunk_size_in_tokens=512,
                    chunk_overlap_in_tokens=0,
                )

                self.logger.info(
                    f"Ingesting {len(document_sources)} documents into {vector_db_id}..."
                )
                response = await self.rag_service.ingest_documents(ingestion_request)

                results["ingested_documents"][vector_db_id] = {
                    "document_count": len(response.ingested_documents),
                    "total_chunks": response.total_chunks_created,
                    "ingestion_time_ms": response.ingestion_time_ms,
                    "errors": response.errors,
                }

                if response.errors:
                    self.logger.warning(
                        f"Ingestion for {vector_db_id} completed with errors: {response.errors}"
                    )
                else:
                    self.logger.info(
                        f"Successfully ingested {len(response.ingested_documents)} documents into {vector_db_id}"
                    )

            except Exception as e:
                error_msg = f"Failed to ingest documents for {vector_db_id}: {e}"
                results["errors"].append(error_msg)
                self.logger.error(error_msg)

        return results

    async def setup_specific_database(
        self, vector_db_id: str, force_reingest: bool = False
    ) -> Dict[str, Any]:
        """
        Setup a specific vector database with its documents.

        Args:
            vector_db_id: ID of the vector database to setup
            force_reingest: Whether to force re-ingestion of documents

        Returns:
            Dictionary with setup results
        """
        if vector_db_id not in DOCUMENT_SOURCES:
            raise ValueError(f"Unknown vector database ID: {vector_db_id}")

        result = {
            "vector_db_id": vector_db_id,
            "ingested_documents": 0,
            "total_chunks": 0,
            "errors": [],
        }

        try:
            # Check if database exists, create if not
            try:
                await self.rag_service.get_vector_database(vector_db_id)
            except:
                # Database doesn't exist, it should be created by setup_predefined_vector_dbs
                created_dbs = await self.rag_service.setup_predefined_vector_dbs()
                if vector_db_id not in created_dbs:
                    raise ValueError(f"Could not create vector database {vector_db_id}")

            # Check existing documents
            if not force_reingest:
                existing_docs = await self.rag_service.list_documents(vector_db_id)
                if existing_docs.total_count > 0:
                    self.logger.info(
                        f"Vector database {vector_db_id} already has documents. Use force_reingest=True to override."
                    )
                    result["message"] = "Database already has documents"
                    return result

            # Prepare documents for ingestion
            documents = DOCUMENT_SOURCES[vector_db_id]
            document_sources = [
                DocumentSource(
                    name=doc["name"],
                    url=doc["url"],
                    mime_type=doc["mime_type"],
                    metadata=doc["metadata"],
                )
                for doc in documents
            ]

            # Ingest documents
            ingestion_request = DocumentIngestionRequest(
                vector_db_id=vector_db_id,
                documents=document_sources,
                chunk_size_in_tokens=512,
                chunk_overlap_in_tokens=0,
            )

            response = await self.rag_service.ingest_documents(ingestion_request)

            result.update(
                {
                    "ingested_documents": len(response.ingested_documents),
                    "total_chunks": response.total_chunks_created,
                    "ingestion_time_ms": response.ingestion_time_ms,
                    "errors": response.errors,
                }
            )

            self.logger.info(
                f"Successfully setup {vector_db_id} with {len(response.ingested_documents)} documents"
            )

        except Exception as e:
            error_msg = f"Failed to setup {vector_db_id}: {e}"
            result["errors"].append(error_msg)
            self.logger.error(error_msg)

        return result

    async def add_custom_documents(
        self, vector_db_id: str, documents: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Add custom documents to a vector database.

        Args:
            vector_db_id: ID of the target vector database
            documents: List of document dictionaries with name, url, mime_type, metadata

        Returns:
            Ingestion results
        """
        try:
            # Validate vector database exists
            vdb_info = await self.rag_service.get_vector_database(vector_db_id)
            if not vdb_info:
                raise ValueError(f"Vector database {vector_db_id} not found")

            # Convert to DocumentSource objects
            document_sources = [
                DocumentSource(
                    name=doc["name"],
                    url=doc["url"],
                    mime_type=doc.get("mime_type", "text/plain"),
                    metadata=doc.get("metadata", {}),
                )
                for doc in documents
            ]

            # Ingest documents
            ingestion_request = DocumentIngestionRequest(
                vector_db_id=vector_db_id,
                documents=document_sources,
                chunk_size_in_tokens=512,
                chunk_overlap_in_tokens=0,
            )

            response = await self.rag_service.ingest_documents(ingestion_request)

            return {
                "vector_db_id": vector_db_id,
                "ingested_documents": len(response.ingested_documents),
                "total_chunks": response.total_chunks_created,
                "ingestion_time_ms": response.ingestion_time_ms,
                "errors": response.errors,
            }

        except Exception as e:
            self.logger.error(f"Failed to add custom documents to {vector_db_id}: {e}")
            return {
                "vector_db_id": vector_db_id,
                "ingested_documents": 0,
                "total_chunks": 0,
                "errors": [str(e)],
            }


async def main():
    """Main setup function."""
    logging.basicConfig(level=logging.INFO)

    setup_manager = RAGSetupManager()

    print("🚀 Setting up RAG system with predefined document sources...")
    print("This may take a few minutes depending on network speed and document sizes.")

    results = await setup_manager.setup_all_vector_databases()

    print(f"\n✅ Setup completed!")
    print(f"📊 Created {len(results['created_databases'])} new vector databases")
    print(f"📚 Ingested documents into {len(results['ingested_documents'])} databases")

    for db_id, info in results["ingested_documents"].items():
        print(
            f"  - {db_id}: {info['document_count']} documents, {info['total_chunks']} chunks"
        )
        if info["errors"]:
            print(f"    ⚠️  Errors: {info['errors']}")

    if results["errors"]:
        print(f"\n⚠️  {len(results['errors'])} errors occurred:")
        for error in results["errors"]:
            print(f"  - {error}")

    print(
        f"\n🎉 RAG system is ready! You can now use the knowledge bases in your agents."
    )


if __name__ == "__main__":
    asyncio.run(main())
