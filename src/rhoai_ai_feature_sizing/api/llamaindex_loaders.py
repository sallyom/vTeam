"""
LlamaIndex data loaders integration for the RAG system.
Simple service that uses LlamaIndex loaders and converts to Llama Stack format.
"""

import asyncio
import logging
import os
from typing import List, Dict, Any, Optional
from pathlib import Path
from urllib.parse import urlparse

from llama_index.core import Document as LlamaDocument
from llama_index.core.node_parser import SentenceSplitter
from llama_index.readers.github import GithubRepositoryReader, GithubClient
from llama_index.readers.web import SimpleWebPageReader

from .schemas import DocumentSource


class LlamaIndexLoaderService:
    """Service for loading documents using LlamaIndex data loaders."""

    def __init__(self, github_token: Optional[str] = None):
        self.logger = logging.getLogger(__name__)
        self.github_token = github_token or os.getenv("GITHUB_ACCESS_TOKEN")

        # Initialize text splitter for consistent chunking
        self.text_splitter = SentenceSplitter(
            chunk_size=1000, chunk_overlap=200, separator=" "
        )

    def load_documents(
        self, sources: List[DocumentSource], progress_callback=None
    ) -> List[Dict[str, Any]]:
        """Load documents from various sources using LlamaIndex loaders."""
        all_documents = []
        total_sources = len(sources)

        for i, source in enumerate(sources):
            try:
                if progress_callback:
                    progress_callback(
                        progress=i / total_sources,
                        step=f"Loading {self._detect_source_type(source.url)} from {source.url[:50]}...",
                        processed=i,
                        total=total_sources,
                    )

                source_type = self._detect_source_type(source.url)
                self.logger.info(f"Loading {source_type} from {source.url}")

                if source_type == "github_repository":
                    docs = self._load_github_repository(source)
                elif source_type == "github_file":
                    docs = self._load_github_file(source)
                elif source_type == "web_page":
                    docs = self._load_web_page(source)
                else:
                    self.logger.warning(f"Unsupported source type for {source.url}")
                    continue

                # Convert LlamaIndex Documents to our format
                converted_docs = self._convert_documents(docs, source)
                all_documents.extend(converted_docs)

                self.logger.info(
                    f"Loaded {len(converted_docs)} chunks from {source.url}"
                )

            except Exception as e:
                self.logger.error(f"Failed to load source {source.url}: {e}")
                continue

        if progress_callback:
            progress_callback(
                progress=1.0,
                step="Document loading completed",
                processed=total_sources,
                total=total_sources,
            )

        return all_documents

    def _load_github_repository(self, source: DocumentSource) -> List[LlamaDocument]:
        """Load entire GitHub repository using LlamaIndex GitHub reader."""
        if not self.github_token:
            raise ValueError("GitHub token required for repository access")

        # Parse GitHub URL to extract owner, repo, and optional subdirectory
        repo_url = source.url
        if repo_url.endswith("/"):
            repo_url = repo_url[:-1]

        # Extract owner/repo and subdirectory from URL
        # URL formats:
        # https://github.com/owner/repo -> load entire repo
        # https://github.com/owner/repo/tree/branch/path -> load specific path
        url_path = repo_url.replace("https://github.com/", "")
        parts = url_path.split("/")

        if len(parts) < 2:
            raise ValueError(f"Invalid GitHub repository URL: {source.url}")

        owner, repo = parts[0], parts[1]

        # Check if this is a subdirectory URL (contains /tree/branch/path)
        subdirectory = None
        branch = "main"  # default branch

        if len(parts) >= 4 and parts[2] == "tree":
            branch = parts[3]
            if len(parts) > 4:
                # Everything after /tree/branch/ is the subdirectory path
                subdirectory = "/".join(parts[4:])

        self.logger.info(
            f"Parsing GitHub URL: owner={owner}, repo={repo}, branch={branch}, subdirectory={subdirectory}"
        )

        # Run in a separate thread to avoid event loop conflicts
        import concurrent.futures

        def _load_repo():
            # Create a new event loop for this thread
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

            try:
                # Configure GitHub client and reader (using current 0.8.0 API)
                github_client = GithubClient(
                    github_token=self.github_token, verbose=False
                )

                # Configure directory filters based on subdirectory
                if subdirectory:
                    # If subdirectory is specified, only include that directory
                    self.logger.info(
                        f"Configuring reader to only load from subdirectory: {subdirectory}"
                    )
                    reader = GithubRepositoryReader(
                        github_client=github_client,
                        owner=owner,
                        repo=repo,
                        use_parser=True,  # Use built-in parsing for different file types
                        verbose=False,
                        # Using current FilterType enum for better error handling
                        filter_file_extensions=(
                            [
                                ".py",
                                ".js",
                                ".ts",
                                ".tsx",
                                ".jsx",
                                ".md",
                                ".txt",
                                ".rst",
                                ".json",
                                ".yaml",
                                ".yml",
                            ],
                            GithubRepositoryReader.FilterType.INCLUDE,  # Include only these file types
                        ),
                        filter_directories=(
                            [subdirectory],  # Only include the specific subdirectory
                            GithubRepositoryReader.FilterType.INCLUDE,  # Include ONLY this directory
                        ),
                    )
                else:
                    # Load entire repo but exclude common non-useful directories
                    exclude_dirs = [
                        "node_modules",
                        "__pycache__",
                        ".git",
                        "dist",
                        "build",
                        ".venv",
                        "venv",
                    ]

                    reader = GithubRepositoryReader(
                        github_client=github_client,
                        owner=owner,
                        repo=repo,
                        use_parser=True,  # Use built-in parsing for different file types
                        verbose=False,
                        filter_directories=(
                            exclude_dirs,
                            GithubRepositoryReader.FilterType.EXCLUDE,  # Exclude these directories
                        ),
                    )

                # Load documents from the specified branch
                documents = reader.load_data(branch=branch)

                self.logger.info(
                    f"Loaded {len(documents)} documents from {owner}/{repo} (branch: {branch}, subdirectory: {subdirectory or 'entire repo'})"
                )
                return documents
            finally:
                loop.close()

        # Run in thread pool to avoid event loop conflict
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_load_repo)
            documents = future.result(timeout=300)  # 5 minute timeout

        return documents

    def _load_github_file(self, source: DocumentSource) -> List[LlamaDocument]:
        """Load single GitHub file using web reader."""
        # Convert GitHub blob URL to raw URL
        raw_url = source.url.replace("github.com", "raw.githubusercontent.com")
        raw_url = raw_url.replace("/blob/", "/")

        reader = SimpleWebPageReader(html_to_text=True)
        documents = reader.load_data([raw_url])

        # Add GitHub-specific metadata
        for doc in documents:
            doc.metadata.update(
                {
                    "source_type": "github_file",
                    "original_url": source.url,
                    "raw_url": raw_url,
                }
            )

        return documents

    def _load_web_page(self, source: DocumentSource) -> List[LlamaDocument]:
        """Load web page using LlamaIndex web reader."""
        reader = SimpleWebPageReader(html_to_text=True)
        documents = reader.load_data([source.url])

        # Add web-specific metadata
        for doc in documents:
            doc.metadata.update({"source_type": "web_page", "source_url": source.url})

        return documents

    def _convert_documents(
        self, llamaindex_docs: List[LlamaDocument], source: DocumentSource
    ) -> List[Dict[str, Any]]:
        """Convert LlamaIndex Documents to our internal format."""
        converted_docs = []

        for doc_idx, doc in enumerate(llamaindex_docs):
            # Split document into chunks
            nodes = self.text_splitter.get_nodes_from_documents([doc])

            for chunk_idx, node in enumerate(nodes):
                # Extract file information
                file_path = node.metadata.get("file_path", f"document_{doc_idx}")
                file_name = (
                    node.metadata.get("file_name")
                    or Path(file_path).name
                    or f"document_{doc_idx}"
                )

                converted_doc = {
                    "content": node.text,
                    "metadata": {
                        **node.metadata,
                        "source_name": source.name,
                        "source_url": source.url,
                        "source_mime_type": source.mime_type,
                        "chunk_index": chunk_idx,
                        "total_chunks_in_document": len(nodes),
                        "document_index": doc_idx,
                        "file_name": file_name,
                        "file_path": file_path,
                        "llamaindex_processed": True,
                    },
                }

                converted_docs.append(converted_doc)

        return converted_docs

    def _detect_source_type(self, url: str) -> str:
        """Detect the type of source from URL."""
        url_lower = url.lower()

        if "github.com" in url_lower:
            if "/blob/" in url_lower:
                return "github_file"
            else:
                return "github_repository"
        elif url_lower.startswith(("http://", "https://")):
            return "web_page"
        else:
            return "file_path"

    def _detect_mime_type(self, file_path: str) -> str:
        """Detect MIME type from file extension."""
        ext = Path(file_path).suffix.lower()
        mime_types = {
            ".py": "text/x-python",
            ".js": "application/javascript",
            ".ts": "application/typescript",
            ".tsx": "application/typescript",
            ".jsx": "application/javascript",
            ".md": "text/markdown",
            ".txt": "text/plain",
            ".json": "application/json",
            ".yaml": "application/x-yaml",
            ".yml": "application/x-yaml",
            ".rst": "text/x-rst",
        }
        return mime_types.get(ext, "text/plain")
