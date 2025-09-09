#!/usr/bin/env python3
"""
Simple deployment script for RHOAI AI Feature Sizing
"""

import asyncio
from pathlib import Path
import yaml

from llama_deploy.apiserver import serve


async def main():
    """Deploy the services using llama-deploy"""

    # Load the deployment configuration
    config_path = Path("deployment.yml")
    if not config_path.exists():
        print("❌ deployment.yml not found!")
        return

    with open(config_path) as f:
        config = yaml.safe_load(f)

    print("🚀 Starting LlamaDeploy services...")
    print(f"📋 Deployment: {config['name']}")
    print(f"🎯 Services: {', '.join(config['services'].keys())}")

    # Start the API server
    try:
        await serve(config_path, host="0.0.0.0", port=8000, reload=False)
    except KeyboardInterrupt:
        print("\n⏹️  Deployment stopped by user")
    except Exception as e:
        print(f"❌ Deployment failed: {e}")


if __name__ == "__main__":
    print("🚀 RHOAI AI Feature Sizing - LlamaDeploy")
    print("=" * 50)
    asyncio.run(main())
