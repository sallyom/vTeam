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

        # Store progress callback for detailed reporting
        self._current_progress_callback = progress_callback

        for i, source in enumerate(sources):
            try:
                if progress_callback:
                    source_type = self._detect_source_type(source.url)
                    source_icon = (
                        "📁"
                        if source_type == "github_repository"
                        else "📄" if source_type == "github_file" else "🌐"
                    )
                    progress_callback(
                        progress=i / total_sources,
                        step=f"{source_icon} Loading {source_type} from {source.url[:50]}...",
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

                # Report progress after processing this source with detailed info
                if progress_callback:
                    source_name = Path(source.url).name if source.url else "unknown"
                    progress_callback(
                        progress=(i + 0.9)
                        / total_sources,  # 90% of this source is done
                        step=f"✅ Completed {source_name}: {len(converted_docs)} chunks created ({len(docs)} files processed)",
                        processed=i + 1,
                        total=total_sources,
                    )

                self.logger.info(
                    f"Loaded {len(converted_docs)} chunks from {source.url}"
                )

            except Exception as e:
                self.logger.error(
                    f"Failed to load source {source.url}: {e}", exc_info=True
                )
                # Report the error through progress callback with more detail
                if progress_callback:
                    progress_callback(
                        progress=i / total_sources,
                        step=f"❌ Error loading {source.url}: {str(e)}",
                        processed=i,
                        total=total_sources,
                    )
                # Still continue to next source, but track the error
                continue

        if progress_callback:
            total_chunks = sum(
                len(doc.get("metadata", {}).get("chunks", []))
                for doc in all_documents
                if isinstance(doc, dict)
            )
            if total_chunks == 0:
                total_chunks = len(all_documents)  # Fallback to document count

            progress_callback(
                progress=1.0,
                step=f"🎉 Document loading completed: {len(all_documents)} chunks from {total_sources} sources",
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

        # List of common branch names to try if main fails
        branch_alternatives = ["main", "master", "develop", "dev"]
        if branch not in branch_alternatives:
            branch_alternatives.insert(0, branch)  # Try the specified branch first

        self.logger.info(
            f"Parsing GitHub URL: owner={owner}, repo={repo}, branch={branch}, subdirectory={subdirectory}"
        )

        # Report detailed progress step
        if (
            hasattr(self, "_current_progress_callback")
            and self._current_progress_callback
        ):
            self._current_progress_callback(
                progress=0.1,
                step=f"Connecting to GitHub: {owner}/{repo} (branch: {branch})",
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

                # Initialize file tracking for progress reporting
                processed_files = 0
                total_files_estimate = 0  # We'll update this as we discover files
                last_progress_percentage = 0

                # Create process_file_callback for granular progress tracking
                def process_file_callback(
                    file_path: str, file_size: int
                ) -> tuple[bool, str]:
                    nonlocal processed_files, total_files_estimate, last_progress_percentage

                    processed_files += 1

                    # Estimate total files if we haven't done so yet (rough heuristic)
                    if total_files_estimate == 0:
                        # Initial estimate - we'll adjust as we go
                        total_files_estimate = max(
                            100, processed_files * 20
                        )  # Start with conservative estimate
                    elif processed_files > total_files_estimate * 0.8:
                        # If we're approaching our estimate, increase it
                        total_files_estimate = int(processed_files * 1.3)

                    # Calculate progress between 30% (start of file processing) and 85% (end)
                    # Reserve 15% for post-processing
                    base_progress = 0.3
                    processing_range = 0.55  # From 30% to 85%

                    if total_files_estimate > 0:
                        file_progress = min(processed_files / total_files_estimate, 1.0)
                        current_progress = base_progress + (
                            file_progress * processing_range
                        )
                    else:
                        current_progress = (
                            base_progress + 0.1
                        )  # Small increment if no estimate

                    # Report progress every 5% or every 10 files
                    current_percentage = int(current_progress * 100)
                    should_report = (
                        current_percentage >= last_progress_percentage + 5
                        or processed_files % 10 == 0
                        or processed_files <= 5  # Always report first few files
                    )

                    if (
                        should_report
                        and hasattr(self, "_current_progress_callback")
                        and self._current_progress_callback
                    ):
                        last_progress_percentage = current_percentage
                        file_name = Path(file_path).name
                        size_kb = file_size / 1024 if file_size > 0 else 0

                        self._current_progress_callback(
                            progress=current_progress,
                            step=f"📝 Processing file {processed_files}/{total_files_estimate if total_files_estimate > 0 else '?'}: {file_name} ({size_kb:.1f}KB)",
                            processed=processed_files,
                            total=(
                                total_files_estimate
                                if total_files_estimate > 0
                                else None
                            ),
                        )

                        self.logger.info(
                            f"Processing file {processed_files}: {file_path} ({size_kb:.1f}KB)"
                        )

                    # Always process the file (return True) with a reason
                    return True, f"Processing {Path(file_path).name}"

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
                        process_file_callback=process_file_callback,  # Add file-level progress tracking
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
                        process_file_callback=process_file_callback,  # Add file-level progress tracking
                    )

                # Try to load documents, with fallback to other common branch names
                documents = None
                last_error = None
                successful_branch = None

                for attempt_branch in branch_alternatives:
                    try:
                        # Report progress before each branch attempt
                        if (
                            hasattr(self, "_current_progress_callback")
                            and self._current_progress_callback
                        ):
                            self._current_progress_callback(
                                progress=0.3,
                                step=f"Trying branch '{attempt_branch}' on {owner}/{repo}...",
                                total=0,  # We'll update this as we discover files
                            )

                        self.logger.info(
                            f"Trying to load from {owner}/{repo} on branch '{attempt_branch}'..."
                        )
                        documents = reader.load_data(branch=attempt_branch)

                        if documents:
                            self.logger.info(
                                f"Successfully loaded {len(documents)} documents from {owner}/{repo} on branch '{attempt_branch}'"
                            )
                            successful_branch = (
                                attempt_branch  # Track the successful branch
                            )
                            break
                        else:
                            self.logger.warning(
                                f"No documents found on branch '{attempt_branch}' for {owner}/{repo}"
                            )

                    except Exception as branch_error:
                        last_error = branch_error
                        self.logger.warning(
                            f"Failed to load from branch '{attempt_branch}' for {owner}/{repo}: {branch_error}"
                        )
                        continue

                # If no branch worked, raise the last error
                if not documents:
                    error_msg = f"Could not load any documents from {owner}/{repo}. Tried branches: {branch_alternatives}"
                    if last_error:
                        error_msg += f". Last error: {last_error}"
                    raise Exception(error_msg)

                # Final progress update with actual file count
                if (
                    hasattr(self, "_current_progress_callback")
                    and self._current_progress_callback
                ):
                    self._current_progress_callback(
                        progress=0.85,
                        step=f"Loaded {len(documents)} files from {owner}/{repo}, converting to chunks...",
                        processed=processed_files,
                        total=processed_files,  # Now we know the actual total
                    )

                self.logger.info(
                    f"Loaded {len(documents)} documents from {owner}/{repo} (branch: {successful_branch or 'unknown'}, subdirectory: {subdirectory or 'entire repo'})"
                )
                return documents
            except Exception as repo_error:
                # Make sure thread-level errors are also exposed
                self.logger.error(
                    f"GitHub repository loading failed for {owner}/{repo}: {repo_error}",
                    exc_info=True,
                )
                if (
                    hasattr(self, "_current_progress_callback")
                    and self._current_progress_callback
                ):
                    self._current_progress_callback(
                        progress=0.0,
                        step=f"❌ GitHub repository access failed for {owner}/{repo}: {str(repo_error)}",
                    )
                raise repo_error
            finally:
                loop.close()

        # Run in thread pool to avoid event loop conflict
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_load_repo)
            try:
                documents = future.result(timeout=300)  # 5 minute timeout
            except Exception as thread_error:
                # Expose thread execution errors
                if (
                    hasattr(self, "_current_progress_callback")
                    and self._current_progress_callback
                ):
                    self._current_progress_callback(
                        progress=0.0,
                        step=f"Repository loading failed: {str(thread_error)}",
                    )
                raise thread_error

        return documents

    def _load_github_file(self, source: DocumentSource) -> List[LlamaDocument]:
        """Load single GitHub file using web reader."""
        try:
            # Convert GitHub blob URL to raw URL
            raw_url = source.url.replace("github.com", "raw.githubusercontent.com")
            raw_url = raw_url.replace("/blob/", "/")

            # Report progress for file loading
            if (
                hasattr(self, "_current_progress_callback")
                and self._current_progress_callback
            ):
                self._current_progress_callback(
                    progress=0.3,
                    step=f"Fetching GitHub file: {raw_url}",
                )

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
        except Exception as e:
            # Expose GitHub file loading errors
            if (
                hasattr(self, "_current_progress_callback")
                and self._current_progress_callback
            ):
                self._current_progress_callback(
                    progress=0.0,
                    step=f"Failed to load GitHub file {source.url}: {str(e)}",
                )
            raise

    def _load_web_page(self, source: DocumentSource) -> List[LlamaDocument]:
        """Load web page using LlamaIndex web reader."""
        try:
            # Report progress for web page loading
            if (
                hasattr(self, "_current_progress_callback")
                and self._current_progress_callback
            ):
                self._current_progress_callback(
                    progress=0.3,
                    step=f"Fetching web page: {source.url}",
                )

            reader = SimpleWebPageReader(html_to_text=True)
            documents = reader.load_data([source.url])

            # Add web-specific metadata
            for doc in documents:
                doc.metadata.update(
                    {"source_type": "web_page", "source_url": source.url}
                )

            return documents
        except Exception as e:
            # Expose web page loading errors
            if (
                hasattr(self, "_current_progress_callback")
                and self._current_progress_callback
            ):
                self._current_progress_callback(
                    progress=0.0,
                    step=f"Failed to load web page {source.url}: {str(e)}",
                )
            raise

    def _convert_documents(
        self, llamaindex_docs: List[LlamaDocument], source: DocumentSource
    ) -> List[Dict[str, Any]]:
        """Convert LlamaIndex Documents to our internal format."""
        converted_docs = []

        try:
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
        except Exception as e:
            # Expose document conversion errors
            if (
                hasattr(self, "_current_progress_callback")
                and self._current_progress_callback
            ):
                self._current_progress_callback(
                    progress=0.0,
                    step=f"Failed to convert documents from {source.url}: {str(e)}",
                )
            raise

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
