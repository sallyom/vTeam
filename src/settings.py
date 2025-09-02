import os
from dotenv import load_dotenv
from llama_index.core.settings import Settings
from llama_index.llms.openai import OpenAI
from llama_index.embeddings.openai import OpenAIEmbedding


def init_settings():
    """Initialize LlamaIndex settings"""
    load_dotenv()

    # Set up OpenAI
    Settings.llm = OpenAI(
        model="gpt-4", temperature=0.1, api_key=os.getenv("OPENAI_API_KEY")
    )

    Settings.embed_model = OpenAIEmbedding(
        model="text-embedding-3-small", api_key=os.getenv("OPENAI_API_KEY")
    )

    # Set global chunk size for retrieval
    Settings.chunk_size = 512
    Settings.chunk_overlap = 50
