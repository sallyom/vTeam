#!/bin/bash
set -e

echo "Starting LlamaDeploy API server in background..."
uv run -m llama_deploy.apiserver &

echo "Waiting for API server to be ready..."
sleep 10

echo "Deploying workflows..."
uv run llamactl deploy deployment.yml

wait
