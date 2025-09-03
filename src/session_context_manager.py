"""
Session Context Manager - Makes uploaded documents available to current chat session
"""

from typing import Dict, List, Any, Optional
from pathlib import Path
import json
from llama_index.core import VectorStoreIndex
from llama_index.core.storage.storage_context import StorageContext


class SessionContextManager:
    """Manages document context for chat sessions"""

    def __init__(self):
        self.session_contexts: Dict[str, Dict] = {}
        self.context_dir = Path("output/session-contexts")
        self.context_dir.mkdir(parents=True, exist_ok=True)

    async def add_documents_to_session(
        self, session_id: str, documents: List, kb_name: str
    ):
        """Add uploaded documents to session context"""

        # Create or load session context
        if session_id not in self.session_contexts:
            self.session_contexts[session_id] = {
                "knowledge_bases": [],
                "document_summaries": [],
                "last_updated": None,
            }

        # Add knowledge base reference
        self.session_contexts[session_id]["knowledge_bases"].append(kb_name)

        # Create document summaries for quick context injection
        summaries = []
        for doc in documents:
            summary = {
                "source": doc.metadata.get("source_file", "unknown"),
                "preview": doc.text[:500] + "..." if len(doc.text) > 500 else doc.text,
                "metadata": doc.metadata,
            }
            summaries.append(summary)

        self.session_contexts[session_id]["document_summaries"].extend(summaries)

        # Persist session context
        await self._save_session_context(session_id)

        return len(summaries)

    async def get_session_context(self, session_id: str) -> Dict[str, Any]:
        """Get all context for a session"""
        if session_id not in self.session_contexts:
            await self._load_session_context(session_id)

        return self.session_contexts.get(session_id, {})

    async def query_session_documents(
        self, session_id: str, query: str, top_k: int = 3
    ) -> List[str]:
        """Query uploaded documents for relevant context"""
        context = await self.get_session_context(session_id)

        if not context.get("knowledge_bases"):
            return []

        results = []
        for kb_name in context["knowledge_bases"]:
            kb_path = Path(f"output/python-rag/{kb_name}")
            if kb_path.exists():
                # Load index and query
                index = VectorStoreIndex.from_storage(
                    StorageContext.from_defaults(persist_dir=str(kb_path))
                )
                retriever = index.as_retriever(similarity_top_k=top_k)
                nodes = retriever.retrieve(query)

                for node in nodes:
                    results.append(node.text)

        return results[:top_k]  # Limit total results

    async def get_context_summary(self, session_id: str) -> str:
        """Get a summary of uploaded documents for this session"""
        context = await self.get_session_context(session_id)

        if not context.get("document_summaries"):
            return "No documents uploaded in this session."

        summary = f"📚 Session has {len(context['document_summaries'])} uploaded documents:\n\n"

        for i, doc_summary in enumerate(context["document_summaries"][:5], 1):
            summary += f"{i}. **{doc_summary['source']}**\n"
            summary += f"   Preview: {doc_summary['preview']}\n\n"

        if len(context["document_summaries"]) > 5:
            summary += (
                f"... and {len(context['document_summaries']) - 5} more documents.\n"
            )

        return summary

    async def _save_session_context(self, session_id: str):
        """Save session context to disk"""
        context_file = self.context_dir / f"{session_id}.json"
        with open(context_file, "w") as f:
            json.dump(self.session_contexts[session_id], f, indent=2)

    async def _load_session_context(self, session_id: str):
        """Load session context from disk"""
        context_file = self.context_dir / f"{session_id}.json"
        if context_file.exists():
            with open(context_file, "r") as f:
                self.session_contexts[session_id] = json.load(f)


# Global instance
session_manager = SessionContextManager()
