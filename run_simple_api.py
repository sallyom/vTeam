#!/usr/bin/env python3
"""Launch script for the simplified RHOAI Feature Sizing API."""

import os
import sys
import uvicorn
from pathlib import Path

# Add the src directory to Python path
src_path = Path(__file__).parent / "src"
sys.path.insert(0, str(src_path))


def main():
    """Run the simplified API server."""
    # Set default environment variables if not set
    if not os.getenv("INFERENCE_MODEL"):
        print("⚠️  INFERENCE_MODEL not set. Please set it to your preferred model.")
        print("   Example: export INFERENCE_MODEL='meta-llama/Llama-3.2-3B-Instruct'")
        return

    # Default configuration
    port = int(os.getenv("PORT", 8001))
    host = os.getenv("HOST", "0.0.0.0")

    print("🚀 Starting Simplified RHOAI Feature Sizing API")
    print(f"   Model: {os.getenv('INFERENCE_MODEL')}")
    print(f"   Server: http://{host}:{port}")
    print(f"   Docs: http://{host}:{port}/docs")
    print()

    # Run the server
    uvicorn.run(
        "rhoai_ai_feature_sizing.api.simple_api:app",
        host=host,
        port=port,
        reload=True,
        log_level="info",
    )


if __name__ == "__main__":
    main()
