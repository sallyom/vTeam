#!/usr/bin/env python3
"""Run the RHOAI AI Feature Sizing API server."""
import logging
import os
import sys


def setup_logging():
    """Setup logging configuration."""
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()

    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        format="%(asctime)s - %(name)s - %(levelname)s - %(funcName)s:%(lineno)d - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Set specific logger levels
    logging.getLogger("uvicorn").setLevel(logging.INFO)
    logging.getLogger("sqlalchemy").setLevel(logging.WARNING)


def main():
    """Run the API server."""
    setup_logging()

    # Get configuration from environment
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))
    workers = int(os.getenv("WORKERS", 1))
    reload = os.getenv("RELOAD", "false").lower() == "true"

    logging.info(f"Starting RHOAI AI Feature Sizing API on {host}:{port}")
    logging.info(f"Workers: {workers}, Reload: {reload}")

    try:
        import uvicorn

        uvicorn.run(
            "rhoai_ai_feature_sizing.api.main:app",
            host=host,
            port=port,
            workers=workers if not reload else 1,
            reload=reload,
            log_level=os.getenv("LOG_LEVEL", "info").lower(),
        )
    except ImportError:
        logging.error("uvicorn not installed. Install with: pip install uvicorn")
        sys.exit(1)
    except Exception as e:
        logging.error(f"Failed to start server: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
