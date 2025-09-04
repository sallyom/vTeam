#!/bin/bash

# Build Script for RHOAI AI Feature Sizing Platform
# Usage: ./build.sh [REGISTRY_URL] [IMAGE_TAG]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="rhoai-ai-feature-sizing"
DEFAULT_REGISTRY="quay.io/gkrumbach07/llama-index-demo"
DEFAULT_TAG="latest"

# Parse arguments
REGISTRY_URL=${1:-$DEFAULT_REGISTRY}
IMAGE_TAG=${2:-$DEFAULT_TAG}
IMAGE_FULL_NAME="${REGISTRY_URL}/${APP_NAME}:${IMAGE_TAG}"

echo -e "${BLUE}🔨 RHOAI AI Feature Sizing - Docker Build${NC}"
echo -e "${BLUE}=========================================${NC}"
echo -e "Registry: ${GREEN}${REGISTRY_URL}${NC}"
echo -e "Image: ${GREEN}${IMAGE_FULL_NAME}${NC}"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "${YELLOW}🔍 Checking prerequisites...${NC}"
if ! command_exists docker; then
    echo -e "${RED}❌ Docker not found. Please install it first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"
echo ""

# Build Docker image
echo -e "${YELLOW}🔨 Building Docker image...${NC}"
docker build -t "${IMAGE_FULL_NAME}" .

echo -e "${YELLOW}📤 Pushing Docker image to registry...${NC}"
docker push "${IMAGE_FULL_NAME}"
echo -e "${GREEN}✅ Image pushed successfully${NC}"
echo ""

echo -e "${GREEN}🎉 Build completed successfully!${NC}"
echo -e "${GREEN}==============================${NC}"
echo -e "Image: ${BLUE}${IMAGE_FULL_NAME}${NC}"
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo -e "1. Deploy the image:"
echo -e "   ${BLUE}./openshift/deploy.sh ${REGISTRY_URL} ${IMAGE_TAG}${NC}"
echo -e "2. Or deploy with defaults:"
echo -e "   ${BLUE}./openshift/deploy.sh${NC}"
echo ""
