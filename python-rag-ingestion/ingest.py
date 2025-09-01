#!/usr/bin/env python3
"""
RAG Data Ingestion Pipeline using Python LlamaIndex
Ingests data from GitHub repos and outputs to shared vector store
"""

import os
import json
import yaml
from pathlib import Path
from typing import List, Dict, Any
from dotenv import load_dotenv
from llama_index.core import VectorStoreIndex, Settings, Document
from llama_index.core.storage.storage_context import StorageContext
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.llms.openai import OpenAI

# Load environment variables from .env file
load_dotenv()

# Only install if GitHub reader is available
try:
    from llama_index.readers.github import GithubRepositoryReader, GithubClient

    GITHUB_AVAILABLE = True
except ImportError:
    print(
        "GitHub reader not available. Install: pip install llama-index-readers-github"
    )
    GITHUB_AVAILABLE = False

try:
    from llama_index.readers.web import SimpleWebPageReader

    WEB_AVAILABLE = True
except ImportError:
    WEB_AVAILABLE = False


def load_agent_configs(agents_dir: Path) -> Dict[str, Dict]:
    """Load all agent YAML configurations"""
    agents = {}

    for yaml_file in agents_dir.glob("*.yaml"):
        if yaml_file.name.startswith("agent-schema"):
            continue

        with open(yaml_file, "r") as f:
            try:
                config = yaml.safe_load(f)
                agents[config["persona"]] = config
                print(f"✅ Loaded agent: {config['persona']} ({config['name']})")
            except Exception as e:
                print(f"❌ Error loading {yaml_file}: {e}")

    return agents


def ingest_github_source(source_config: Dict, github_token: str) -> List[Document]:
    """Ingest documents from GitHub repository"""
    if not GITHUB_AVAILABLE:
        print("⚠️ GitHub reader not available, skipping...")
        return []

    try:
        github_client = GithubClient(github_token=github_token, verbose=True)

        # Parse repository (support "owner/repo" format)
        if "/" in source_config["source"]:
            owner, repo = source_config["source"].split("/", 1)
        else:
            raise ValueError(f"Invalid GitHub source format: {source_config['source']}")

        options = source_config.get("options", {})
        branch = options.get("branch", "main")

        # Set up filters
        filter_dirs = None
        filter_files = None

        if "path" in options:
            filter_dirs = ([options["path"]], GithubRepositoryReader.FilterType.INCLUDE)

        if "fileTypes" in options:
            # Convert to exclude common non-text files
            exclude_files = [
                ".png",
                ".jpg",
                ".jpeg",
                ".gif",
                ".svg",
                ".ico",
                ".json",
                ".ipynb",
            ]
            include_files = options["fileTypes"]
            # Use include filter for specified file types
            filter_files = (include_files, GithubRepositoryReader.FilterType.INCLUDE)

        reader = GithubRepositoryReader(
            github_client=github_client,
            owner=owner,
            repo=repo,
            use_parser=False,
            verbose=True,
            filter_directories=filter_dirs,
            filter_file_extensions=filter_files,
        )

        documents = reader.load_data(branch=branch)
        print(f"📚 Loaded {len(documents)} documents from {owner}/{repo}")

        # Add metadata
        for doc in documents:
            doc.metadata.update(
                {
                    "source_type": "github",
                    "repository": f"{owner}/{repo}",
                    "branch": branch,
                    "agent_source": source_config["name"],
                }
            )

        return documents

    except Exception as e:
        print(f"❌ Error ingesting GitHub source {source_config['name']}: {e}")
        return []


def ingest_web_source(source_config: Dict) -> List[Document]:
    """Ingest documents from web URL"""
    if not WEB_AVAILABLE:
        print("⚠️ Web reader not available, skipping...")
        return []

    try:
        reader = SimpleWebPageReader(html_to_text=True)
        documents = reader.load_data([source_config["source"]])

        for doc in documents:
            doc.metadata.update(
                {
                    "source_type": "web",
                    "url": source_config["source"],
                    "agent_source": source_config["name"],
                }
            )

        print(f"🌐 Loaded {len(documents)} documents from {source_config['source']}")
        return documents

    except Exception as e:
        print(f"❌ Error ingesting web source {source_config['name']}: {e}")
        return []


def ingest_agent_data(
    agent_persona: str, agent_config: Dict, github_token: str
) -> List[Document]:
    """Ingest all data sources for a specific agent"""
    print(f"\n🔄 Ingesting data for {agent_persona} ({agent_config['name']})...")

    all_documents = []
    data_sources = agent_config.get("dataSources", [])

    for source in data_sources:
        # Handle simple string sources (local directories)
        if isinstance(source, str):
            print(f"📁 Skipping local directory: {source} (handled by TypeScript)")
            continue

        # Handle advanced source configurations
        if isinstance(source, dict):
            source_type = source.get("type", "directory")

            if source_type == "github":
                docs = ingest_github_source(source, github_token)
                all_documents.extend(docs)
            elif source_type == "web":
                docs = ingest_web_source(source)
                all_documents.extend(docs)
            else:
                print(f"⚠️ Unsupported source type: {source_type}")

    print(f"✅ Total documents for {agent_persona}: {len(all_documents)}")
    return all_documents


def create_vector_index(
    documents: List[Document], output_dir: Path, agent_persona: str
):
    """Create and persist vector index"""
    if not documents:
        print(f"⚠️ No documents to index for {agent_persona}")
        return

    # Create agent-specific output directory
    agent_output_dir = output_dir / agent_persona.lower()
    agent_output_dir.mkdir(parents=True, exist_ok=True)

    # Create storage context
    storage_context = StorageContext.from_defaults(persist_dir=str(agent_output_dir))

    # Create index
    print(f"🔮 Creating vector index for {agent_persona}...")
    index = VectorStoreIndex.from_documents(
        documents, storage_context=storage_context, show_progress=True
    )

    # Persist index
    index.storage_context.persist(persist_dir=str(agent_output_dir))

    # Save metadata
    metadata = {
        "agent_persona": agent_persona,
        "document_count": len(documents),
        "sources": list(
            set([doc.metadata.get("agent_source", "unknown") for doc in documents])
        ),
        "last_updated": str(Path().absolute()),
        "index_type": "VectorStoreIndex",
    }

    with open(agent_output_dir / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"💾 Saved index for {agent_persona} to {agent_output_dir}")


def main():
    """Main ingestion pipeline"""
    print("🚀 Starting RAG Data Ingestion Pipeline\n")

    # Configuration
    agents_dir = Path("../src/agents")
    output_dir = Path("../output/python-rag")
    github_token = os.getenv("GITHUB_TOKEN")

    if not github_token:
        print("⚠️ Warning: GITHUB_TOKEN not set. GitHub sources will be skipped.")

    # Set up LlamaIndex
    Settings.embed_model = OpenAIEmbedding()
    Settings.llm = OpenAI()

    # Load agent configurations
    print("📋 Loading agent configurations...")
    agents = load_agent_configs(agents_dir)

    if not agents:
        print("❌ No agent configurations found!")
        return

    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)

    # Process each agent
    for persona, config in agents.items():
        try:
            # Ingest documents
            documents = ingest_agent_data(persona, config, github_token)

            # Create vector index
            create_vector_index(documents, output_dir, persona)

        except Exception as e:
            print(f"❌ Error processing {persona}: {e}")
            continue

    print(f"\n🎉 RAG ingestion complete! Check {output_dir} for results.")


if __name__ == "__main__":
    main()
