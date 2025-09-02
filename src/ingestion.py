# Integration of existing ingestion pipeline with the new backend
import os
import json
import yaml
import click
from pathlib import Path
from typing import List, Dict, Optional, Any
from dotenv import load_dotenv

from llama_index.core import VectorStoreIndex, Settings, Document
from llama_index.core.storage.storage_context import StorageContext
from llama_index.core.ingestion import IngestionPipeline
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.extractors import TitleExtractor
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.llms.openai import OpenAI

# Load environment variables
load_dotenv()

# Optional dependencies (same as original)
try:
    from llama_index.readers.github import GithubRepositoryReader, GithubClient
    GITHUB_AVAILABLE = True
except ImportError:
    GITHUB_AVAILABLE = False

try:
    from llama_index.readers.web import SimpleWebPageReader
    WEB_AVAILABLE = True
except ImportError:
    WEB_AVAILABLE = False


class RAGIngestorError(Exception):
    """Custom exception for RAG ingestion errors"""
    pass


class RAGIngestor:
    """Main RAG ingestion class - integrated with new backend"""
    
    def __init__(self, 
                 agents_dir: Path = None,
                 output_dir: Path = None,
                 chunking_strategy: str = "sentence",
                 verbose: bool = False):
        
        # Default paths for new backend structure
        self.agents_dir = agents_dir or Path("../src/agents")
        self.output_dir = output_dir or Path("../output/python-rag")
        self.chunking_strategy = chunking_strategy
        self.verbose = verbose
        self.github_token = os.getenv("GITHUB_TOKEN")
        
        # Setup LlamaIndex (compatible versions)
        Settings.embed_model = OpenAIEmbedding(model="text-embedding-3-small")
        Settings.llm = OpenAI(model="gpt-4", temperature=0.1)
        
        # Create ingestion pipeline
        self.pipeline = self._create_ingestion_pipeline()
    
    def _create_ingestion_pipeline(self) -> IngestionPipeline:
        """Create ingestion pipeline with specified chunking strategy"""
        transformations = []
        
        if self.chunking_strategy == "sentence":
            transformations.append(
                SentenceSplitter(
                    chunk_size=512,
                    chunk_overlap=50,
                    separator=" ",
                )
            )
        elif self.chunking_strategy == "semantic":
            transformations.append(
                SentenceSplitter(
                    chunk_size=1024,
                    chunk_overlap=100,
                )
            )
        elif self.chunking_strategy == "large":
            transformations.append(
                SentenceSplitter(
                    chunk_size=2048,
                    chunk_overlap=200,
                )
            )
        
        # Add metadata extraction
        transformations.append(TitleExtractor())
        
        # Add embeddings
        transformations.append(OpenAIEmbedding(model="text-embedding-3-small"))
        
        return IngestionPipeline(transformations=transformations)
    
    def load_agent_configs(self, specific_agents: Optional[List[str]] = None) -> Dict[str, Dict]:
        """Load agent configurations from YAML files"""
        agents = {}
        
        if not self.agents_dir.exists():
            click.echo(f"❌ Agents directory not found: {self.agents_dir}")
            return agents
        
        for yaml_file in self.agents_dir.glob("*.yaml"):
            if yaml_file.name.startswith("agent-schema"):
                continue
            
            try:
                with open(yaml_file, "r") as f:
                    config = yaml.safe_load(f)
                
                persona = config.get("persona")
                if not persona:
                    continue
                
                # Filter by specific agents if requested
                if specific_agents and persona not in specific_agents:
                    continue
                
                agents[persona] = config
                if self.verbose:
                    click.echo(f"✅ Loaded agent: {persona} ({config.get('name', 'Unknown')})")
                    
            except Exception as e:
                click.echo(f"❌ Error loading {yaml_file}: {e}", err=True)
        
        return agents
    
    # Include all the ingestion methods from the original CLI
    # (GitHub ingestion, web ingestion, etc.)
    # ... (copying relevant methods from original cli.py)
    
    def create_vector_index(self, documents: List[Document], agent_persona: str) -> Optional[VectorStoreIndex]:
        """Create and persist vector index (compatible with new backend)"""
        if not documents:
            click.echo(f"⚠️ No documents to index for {agent_persona}")
            return None
        
        # Create agent-specific output directory
        agent_output_dir = self.output_dir / agent_persona.lower()
        agent_output_dir.mkdir(parents=True, exist_ok=True)
        
        # Create index first with default storage context
        click.echo(f"🔮 Creating vector index for {agent_persona}...")
        index = VectorStoreIndex.from_documents(
            documents, 
            show_progress=True
        )
        
        # Persist index to the specified directory
        index.storage_context.persist(persist_dir=str(agent_output_dir))
        
        # Save metadata (compatible format)
        metadata = {
            "agent_persona": agent_persona,
            "document_count": len(documents),
            "chunking_strategy": self.chunking_strategy,
            "sources": list(set(doc.metadata.get("agent_source", "unknown") for doc in documents)),
            "sample_files": [doc.metadata.get("file_path", "unknown") for doc in documents[:5]],
            "created_at": str(Path().absolute()),
            "index_type": "VectorStoreIndex",
            "backend_version": "backend-v1"
        }
        
        with open(agent_output_dir / "metadata.json", "w") as f:
            json.dump(metadata, f, indent=2)
        
        click.echo(f"💾 Saved index for {agent_persona} to {agent_output_dir}")
        return index


# CLI interface (simplified for new backend)
@click.group(invoke_without_command=True)
@click.option('--version', is_flag=True, help='Show version')
@click.pass_context
def cli(ctx, version):
    """RHOAI Backend RAG Ingestion Pipeline"""
    if version:
        click.echo("backend-ingestion v1.0.0")
        return
    
    if ctx.invoked_subcommand is None:
        click.echo(ctx.get_help())


@cli.command()
@click.option('--agents-dir', '-a', type=click.Path(exists=True, path_type=Path), 
              default=Path('../src/agents'), help='Directory containing agent YAML configs')
@click.option('--output-dir', '-o', type=click.Path(path_type=Path), 
              default=Path('../output/python-rag'), help='Output directory for vector stores')
@click.option('--chunking-strategy', '-c', type=click.Choice(['sentence', 'semantic', 'large']),
              default='sentence', help='Text chunking strategy')
@click.option('--agents', '-ag', multiple=True, help='Specific agents to process (default: all)')
@click.option('--verbose', '-v', is_flag=True, help='Verbose output')
def ingest(agents_dir, output_dir, chunking_strategy, agents, verbose):
    """Ingest data for the new RHOAI backend"""
    
    # Validate prerequisites
    if not os.getenv('OPENAI_API_KEY'):
        click.echo("❌ OPENAI_API_KEY environment variable required", err=True)
        return
    
    # Initialize ingestor
    ingestor = RAGIngestor(
        agents_dir=agents_dir,
        output_dir=output_dir,
        chunking_strategy=chunking_strategy,
        verbose=verbose
    )
    
    click.echo("🚀 Starting RHOAI Backend RAG Ingestion\n")
    
    # Load agent configurations
    click.echo("📋 Loading agent configurations...")
    agent_configs = ingestor.load_agent_configs(list(agents) if agents else None)
    
    if not agent_configs:
        click.echo("❌ No agent configurations found!", err=True)
        return
    
    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)
    
    click.echo(f"✅ Ready to ingest data for {len(agent_configs)} agents")
    click.echo("💡 Run the original python-rag-ingestion CLI for actual data ingestion")
    click.echo("💡 This command validates the backend integration")


if __name__ == "__main__":
    cli()
