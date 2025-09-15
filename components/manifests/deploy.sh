#!/bin/bash

# OpenShift Deployment Script for vTeam Ambient Agentic Runner
# Usage: ./deploy.sh
# Or with environment variables: NAMESPACE=my-namespace ./deploy.sh
# Note: This script deploys pre-built images. Build and push images first.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="${NAMESPACE:-sallyom-vteam}"
DEFAULT_BACKEND_IMAGE="quay.io/sallyom/vteam:backend"
DEFAULT_FRONTEND_IMAGE="quay.io/sallyom/vteam:frontend"
DEFAULT_OPERATOR_IMAGE="quay.io/sallyom/vteam:operator"
DEFAULT_RUNNER_IMAGE="quay.io/sallyom/vteam:claude-runner"

echo -e "${BLUE}🚀 vTeam Ambient Agentic Runner - OpenShift Deployment${NC}"
echo -e "${BLUE}====================================================${NC}"
echo -e "Namespace: ${GREEN}${NAMESPACE}${NC}"
echo -e "Backend Image: ${GREEN}${DEFAULT_BACKEND_IMAGE}${NC}"
echo -e "Frontend Image: ${GREEN}${DEFAULT_FRONTEND_IMAGE}${NC}"
echo -e "Operator Image: ${GREEN}${DEFAULT_OPERATOR_IMAGE}${NC}"
echo -e "Runner Image: ${GREEN}${DEFAULT_RUNNER_IMAGE}${NC}"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "${YELLOW}🔍 Checking prerequisites...${NC}"
if ! command_exists oc; then
    echo -e "${RED}❌ OpenShift CLI (oc) not found. Please install it first.${NC}"
    exit 1
fi

if ! command_exists kustomize; then
    echo -e "${RED}❌ Kustomize not found. Please install it first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"
echo ""

# Check if logged in to OpenShift
echo -e "${YELLOW}🔐 Checking OpenShift authentication...${NC}"
if ! oc whoami >/dev/null 2>&1; then
    echo -e "${RED}❌ Not logged in to OpenShift. Please run 'oc login' first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Authenticated as: $(oc whoami)${NC}"
echo ""

# Check environment file
echo -e "${YELLOW}🔍 Checking environment configuration...${NC}"
ENV_FILE=".env"
if [[ ! -f "$ENV_FILE" ]]; then
    echo -e "${RED}❌ .env file not found${NC}"
    echo -e "${YELLOW}💡 Please create .env file from env.example:${NC}"
    echo "  cp env.example .env"
    echo "  # Edit .env and add your actual API key"
    exit 1
fi

# Source environment variables
source "$ENV_FILE"

if [[ -z "$ANTHROPIC_API_KEY" ]]; then
    echo -e "${RED}❌ ANTHROPIC_API_KEY not set in .env file${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Environment configuration loaded${NC}"
echo ""

# Deploy using kustomize
echo -e "${YELLOW}🚀 Deploying to OpenShift using Kustomize...${NC}"

# Set namespace if different from default
if [ "$NAMESPACE" != "sallyom-vteam" ]; then
    echo -e "${BLUE}📝 Setting custom namespace: ${NAMESPACE}${NC}"
    kustomize edit set namespace "$NAMESPACE"
fi

# Build and apply manifests
echo -e "${BLUE}📋 Building and applying manifests...${NC}"
kustomize build . | oc apply -f -

# Wait for namespace to be ready
echo -e "${YELLOW}⏳ Waiting for namespace to be ready...${NC}"
oc wait --for=condition=Active namespace/${NAMESPACE} --timeout=300s || {
    echo -e "${RED}❌ Namespace creation timed out. Checking status...${NC}"
    oc describe namespace ${NAMESPACE}
    exit 1
}

# Switch to the target namespace
echo -e "${BLUE}🔄 Switching to namespace ${NAMESPACE}...${NC}"
oc project ${NAMESPACE}

# Create API key secret (kustomize creates empty secret, we populate it)
echo -e "${BLUE}🔐 Creating API key secret...${NC}"
oc patch secret ambient-code-secrets -p "{\"stringData\":{\"anthropic-api-key\":\"$ANTHROPIC_API_KEY\"}}"

echo ""
echo -e "${GREEN}✅ Deployment completed!${NC}"
echo ""

# Wait for deployments to be ready
echo -e "${YELLOW}⏳ Waiting for deployments to be ready...${NC}"
oc rollout status deployment/backend-api --namespace=${NAMESPACE} --timeout=300s
oc rollout status deployment/agentic-operator --namespace=${NAMESPACE} --timeout=300s
oc rollout status deployment/frontend --namespace=${NAMESPACE} --timeout=300s

# Get service information
echo -e "${BLUE}🌐 Getting service information...${NC}"
echo ""
echo -e "${GREEN}🎉 Deployment successful!${NC}"
echo -e "${GREEN}========================${NC}"
echo -e "Namespace: ${BLUE}${NAMESPACE}${NC}"
echo ""

# Show pod status
echo -e "${BLUE}📊 Pod Status:${NC}"
oc get pods -n ${NAMESPACE}
echo ""

# Show services
echo -e "${BLUE}🔗 Services:${NC}"
oc get services -n ${NAMESPACE}
echo ""

echo -e "${YELLOW}📝 Next steps:${NC}"
echo -e "1. Access the frontend:"
echo -e "   ${BLUE}oc port-forward svc/frontend-service 3000:3000 -n ${NAMESPACE}${NC}"
echo -e "   Then open: http://localhost:3000"
echo -e "2. Monitor the deployment:"
echo -e "   ${BLUE}oc get pods -n ${NAMESPACE} -w${NC}"
echo -e "3. View logs:"
echo -e "   ${BLUE}oc logs -f deployment/backend-api -n ${NAMESPACE}${NC}"
echo -e "   ${BLUE}oc logs -f deployment/agentic-operator -n ${NAMESPACE}${NC}"
echo ""

# Restore kustomization if we modified it
if [ "$NAMESPACE" != "sallyom-vteam" ]; then
    echo -e "${BLUE}🔄 Restoring default namespace in kustomization...${NC}"
    kustomize edit set namespace sallyom-vteam
fi

echo -e "${GREEN}🎯 Ready to create agentic sessions!${NC}"