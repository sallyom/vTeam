#!/usr/bin/env python3
"""
Simplified RAG Ingestion Pipeline - Only the Essentials
Tests with ODH Dashboard docs
"""

import os
import json
import yaml
from pathlib import Path
from typing import List, Dict
from dotenv import load_dotenv
from llama_index.core import VectorStoreIndex, Settings, Document
from llama_index.core.storage.storage_context import StorageContext
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.llms.openai import OpenAI

# Load environment variables from .env file
load_dotenv()

# Only import what we need
try:
    from llama_index.readers.github import GithubRepositoryReader, GithubClient

    GITHUB_AVAILABLE = True
except ImportError:
    print(
        "❌ GitHub reader not available. Install: pip install llama-index-readers-github"
    )
    GITHUB_AVAILABLE = False


def load_github_documents(source_config: Dict, github_token: str) -> List[Document]:
    """Load documents from GitHub - simple and direct"""
    if not GITHUB_AVAILABLE or not github_token:
        print("⚠️ GitHub reader or token not available")
        return []

    try:
        # Parse repository
        if "/" in source_config["source"]:
            owner, repo = source_config["source"].split("/", 1)
        else:
            raise ValueError(f"Invalid GitHub format: {source_config['source']}")

        options = source_config.get("options", {})
        branch = options.get("branch", "main")

        print(f"📥 Loading from {owner}/{repo} (branch: {branch})")

        # Set up GitHub reader with filters
        github_client = GithubClient(github_token=github_token, verbose=True)

        filter_dirs = None
        filter_files = None

        # Only include specified path
        if "path" in options:
            filter_dirs = ([options["path"]], GithubRepositoryReader.FilterType.INCLUDE)
            print(f"🗂️  Filtering to path: {options['path']}")

        # Only include specified file types
        if "fileTypes" in options:
            filter_files = (
                options["fileTypes"],
                GithubRepositoryReader.FilterType.INCLUDE,
            )
            print(f"📄 Filtering to file types: {options['fileTypes']}")

        reader = GithubRepositoryReader(
            github_client=github_client,
            owner=owner,
            repo=repo,
            use_parser=False,  # Keep it simple
            verbose=True,
            filter_directories=filter_dirs,
            filter_file_extensions=filter_files,
        )

        # Load documents
        documents = reader.load_data(branch=branch)
        print(f"📚 Loaded {len(documents)} documents")

        # Add minimal but useful metadata
        for doc in documents:
            doc.metadata.update(
                {
                    "source": f"{owner}/{repo}",
                    "branch": branch,
                    "agent_source": source_config["name"],
                    "file_path": doc.metadata.get("file_path", "unknown"),
                }
            )

        return documents

    except Exception as e:
        print(f"❌ Error loading from GitHub: {e}")
        return []


def create_simple_index(
    documents: List[Document], output_dir: Path, agent_persona: str
):
    """Create vector index - minimal but complete"""
    if not documents:
        print(f"⚠️ No documents for {agent_persona}")
        return

    # Create output directory
    agent_output_dir = output_dir / agent_persona.lower()
    agent_output_dir.mkdir(parents=True, exist_ok=True)

    print(f"🔮 Creating index for {agent_persona}...")

    # Simple storage context (handles document, vector, and index stores automatically)
    storage_context = StorageContext.from_defaults(persist_dir=str(agent_output_dir))

    # Create index with progress bar
    index = VectorStoreIndex.from_documents(
        documents, storage_context=storage_context, show_progress=True
    )

    # Persist everything
    index.storage_context.persist()

    # Save metadata for debugging
    metadata = {
        "agent_persona": agent_persona,
        "document_count": len(documents),
        "sources": list(
            set(doc.metadata.get("agent_source", "unknown") for doc in documents)
        ),
        "sample_files": [
            doc.metadata.get("file_path", "unknown") for doc in documents[:5]
        ],
        "created_at": str(Path().absolute()),
    }

    with open(agent_output_dir / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"✅ Saved index to {agent_output_dir}")
    return index


def test_index(index: VectorStoreIndex, test_query: str = "How to deploy"):
    """Quick test of the created index"""
    if not index:
        return

    print(f"\n🧪 Testing index with query: '{test_query}'")

    try:
        retriever = index.as_retriever(similarity_top_k=3)
        nodes = retriever.retrieve(test_query)

        print(f"📖 Retrieved {len(nodes)} relevant documents:")
        for i, node in enumerate(nodes[:2], 1):
            content_preview = (
                node.get_content()[:150] + "..."
                if len(node.get_content()) > 150
                else node.get_content()
            )
            file_path = node.metadata.get("file_path", "unknown")
            print(f"  {i}. {file_path}: {content_preview}")

    except Exception as e:
        print(f"❌ Test failed: {e}")


def main():
    """Main ingestion - keep it simple"""
    print("🚀 Simple RAG Ingestion Test\n")

    # Configuration
    agents_dir = Path("../src/agents")
    output_dir = Path("../output/python-rag")
    github_token = os.getenv("GITHUB_TOKEN")

    if not github_token:
        print("❌ GITHUB_TOKEN environment variable required")
        print("   Export it like: export GITHUB_TOKEN=github_pat_...")
        return

    # Set up LlamaIndex
    Settings.embed_model = OpenAIEmbedding()
    Settings.llm = OpenAI()

    # Load frontend engineer config (the one we modified)
    config_file = agents_dir / "frontend_eng.yaml"
    if not config_file.exists():
        print(f"❌ Config file not found: {config_file}")
        return

    with open(config_file, "r") as f:
        config = yaml.safe_load(f)

    print(f"📋 Processing agent: {config['persona']} ({config['name']})")

    # Process data sources
    all_documents = []
    for source in config.get("dataSources", []):
        if isinstance(source, dict) and source.get("type") == "github":
            print(f"\n🔄 Processing GitHub source: {source['name']}")
            docs = load_github_documents(source, github_token)
            all_documents.extend(docs)
        else:
            print(f"⏭️  Skipping non-GitHub source: {source}")

    if not all_documents:
        print("❌ No documents loaded!")
        return

    # Create index
    index = create_simple_index(all_documents, output_dir, config["persona"])

    # Test the index
    test_index(index, "dashboard deployment guide")

    print(f"\n🎉 Complete! Index ready for TypeScript app.")
    print(f"   Location: {output_dir / config['persona'].lower()}")


if __name__ == "__main__":
    main()
