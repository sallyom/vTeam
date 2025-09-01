#!/usr/bin/env python3
"""
Enhanced RAG Data Ingestion Pipeline with LlamaIndex Components
Shows how all the pieces fit together
"""

import os
import json
import yaml
from pathlib import Path
from typing import List, Dict, Any
from dotenv import load_dotenv
from llama_index.core import VectorStoreIndex, Settings, Document
from llama_index.core.storage.storage_context import StorageContext
from llama_index.core.ingestion import IngestionPipeline
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.extractors import TitleExtractor
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.llms.openai import OpenAI

# Load environment variables from .env file
load_dotenv()

# Readers
try:
    from llama_index.readers.github import GithubRepositoryReader, GithubClient

    GITHUB_AVAILABLE = True
except ImportError:
    print(
        "GitHub reader not available. Install: pip install llama-index-readers-github"
    )
    GITHUB_AVAILABLE = False


def create_ingestion_pipeline(chunking_strategy: str = "sentence") -> IngestionPipeline:
    """
    Create an ingestion pipeline with transformations
    This is where the magic happens - documents become searchable
    """
    transformations = []

    # 1. Text Splitting (Chunking)
    if chunking_strategy == "sentence":
        transformations.append(
            SentenceSplitter(
                chunk_size=512,
                chunk_overlap=50,
                separator=" ",
            )
        )
    elif chunking_strategy == "semantic":
        # Could add semantic splitter here
        transformations.append(
            SentenceSplitter(
                chunk_size=1024,
                chunk_overlap=100,
            )
        )

    # 2. Metadata Extraction
    transformations.append(TitleExtractor())

    # 3. Embeddings (converts text to vectors)
    transformations.append(OpenAIEmbedding())

    return IngestionPipeline(transformations=transformations)


def enhanced_ingest_github_source(
    source_config: Dict, github_token: str, pipeline: IngestionPipeline
) -> List[Document]:
    """Enhanced GitHub ingestion with pipeline processing"""
    if not GITHUB_AVAILABLE:
        print("⚠️ GitHub reader not available, skipping...")
        return []

    try:
        # 1. LOAD DATA (Reader)
        github_client = GithubClient(github_token=github_token, verbose=True)

        if "/" in source_config["source"]:
            owner, repo = source_config["source"].split("/", 1)
        else:
            raise ValueError(f"Invalid GitHub source format: {source_config['source']}")

        options = source_config.get("options", {})
        branch = options.get("branch", "main")

        reader = GithubRepositoryReader(
            github_client=github_client,
            owner=owner,
            repo=repo,
            use_parser=False,
            verbose=True,
        )

        # Load raw documents
        raw_documents = reader.load_data(branch=branch)
        print(f"📚 Loaded {len(raw_documents)} raw documents from {owner}/{repo}")

        # 2. PROCESS THROUGH PIPELINE (Transformations)
        print(f"🔄 Processing through ingestion pipeline...")
        processed_nodes = pipeline.run(documents=raw_documents)

        # Convert nodes back to documents for consistency
        processed_docs = []
        for node in processed_nodes:
            doc = Document(
                text=node.get_content(),
                metadata={
                    **node.metadata,
                    "source_type": "github",
                    "repository": f"{owner}/{repo}",
                    "branch": branch,
                    "agent_source": source_config["name"],
                    "processed": True,
                },
            )
            processed_docs.append(doc)

        print(f"✅ Pipeline produced {len(processed_docs)} processed chunks")
        return processed_docs

    except Exception as e:
        print(f"❌ Error in enhanced GitHub ingestion: {e}")
        return []


def create_storage_context(output_dir: Path, agent_persona: str) -> StorageContext:
    """
    Create storage context - this manages all the different stores

    Storage Types in LlamaIndex:
    - Document Store: Stores original documents
    - Vector Store: Stores embeddings for similarity search
    - Index Store: Stores index metadata
    - Graph Store: For knowledge graphs (not used here)
    """
    agent_output_dir = output_dir / agent_persona.lower()
    agent_output_dir.mkdir(parents=True, exist_ok=True)

    # This creates local file-based stores by default
    # Could be configured for cloud vector databases
    return StorageContext.from_defaults(persist_dir=str(agent_output_dir))


def main():
    """Main pipeline showing how all components work together"""
    print("🚀 Enhanced RAG Ingestion Pipeline\n")

    # Configuration
    agents_dir = Path("../src/agents")
    output_dir = Path("../output/python-rag")
    github_token = os.getenv("GITHUB_TOKEN")

    # Set up LlamaIndex Settings (global configuration)
    Settings.embed_model = OpenAIEmbedding()
    Settings.llm = OpenAI()

    # Load agent configurations
    print("📋 Loading agent configurations...")
    with open(agents_dir / "frontend_eng.yaml", "r") as f:
        config = yaml.safe_load(f)

    # Create ingestion pipeline
    chunking_strategy = "sentence"  # Could be configured per agent
    pipeline = create_ingestion_pipeline(chunking_strategy)
    print(f"🔧 Created ingestion pipeline with {chunking_strategy} chunking")

    # Process data sources
    all_documents = []
    for source in config.get("dataSources", []):
        if isinstance(source, dict) and source.get("type") == "github":
            docs = enhanced_ingest_github_source(source, github_token, pipeline)
            all_documents.extend(docs)

    if not all_documents:
        print("⚠️ No documents processed")
        return

    # Create storage context (manages all stores)
    storage_context = create_storage_context(output_dir, config["persona"])

    # Create index (this uses the storage context)
    print(f"🔮 Creating vector index with {len(all_documents)} processed documents...")
    index = VectorStoreIndex.from_documents(
        all_documents, storage_context=storage_context, show_progress=True
    )

    # Persist everything (documents, vectors, metadata)
    index.storage_context.persist()

    print(f"💾 Saved complete RAG system to {output_dir}")
    print("Components saved:")
    print("  📄 Document Store: Original processed documents")
    print("  🔢 Vector Store: Embeddings for similarity search")
    print("  📊 Index Store: Index metadata and configuration")


if __name__ == "__main__":
    main()
