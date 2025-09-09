#!/bin/bash

# OpenShift Deployment Script for RHOAI AI Feature Sizing Platform
# Usage: ./deploy.sh [REGISTRY_URL] [IMAGE_TAG]
# Note: This script deploys a pre-built image. Use build.sh first to build and push the image.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="rhoai-ai-feature-sizing"
APP_NAME="rhoai-ai-feature-sizing"
DEFAULT_REGISTRY="quay.io/gkrumbach07/llama-index-demo"
DEFAULT_TAG="latest"

# Parse arguments
REGISTRY_URL=${1:-$DEFAULT_REGISTRY}
IMAGE_TAG=${2:-$DEFAULT_TAG}
IMAGE_FULL_NAME="${REGISTRY_URL}/${APP_NAME}:${IMAGE_TAG}"

echo -e "${BLUE}🚀 RHOAI AI Feature Sizing - OpenShift Deployment${NC}"
echo -e "${BLUE}=================================================${NC}"
echo -e "Registry: ${GREEN}${REGISTRY_URL}${NC}"
echo -e "Image: ${GREEN}${IMAGE_FULL_NAME}${NC}"
echo -e "Namespace: ${GREEN}${NAMESPACE}${NC}"
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

# Verify image exists in registry (optional check)
echo -e "${YELLOW}🔍 Using pre-built image...${NC}"
echo -e "Image: ${BLUE}${IMAGE_FULL_NAME}${NC}"
echo -e "${YELLOW}💡 If image doesn't exist, run: ${BLUE}./openshift/build.sh${NC}"
echo ""

# Update deployment with new image
echo -e "${YELLOW}🔧 Updating deployment manifest...${NC}"
sed -i.bak "s|image:.*|image: ${IMAGE_FULL_NAME}|g" openshift/deployment.yaml
echo -e "${GREEN}✅ Deployment manifest updated${NC}"
echo ""

# Deploy to OpenShift
echo -e "${YELLOW}🚀 Deploying to OpenShift...${NC}"

# Create namespace
echo -e "${BLUE}📁 Creating namespace...${NC}"
oc apply -f openshift/namespace.yaml

# Check if namespace already exists and is active
if oc get namespace ${NAMESPACE} >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Namespace already exists${NC}"
else
    echo -e "${YELLOW}⏳ Waiting for namespace to be ready...${NC}"
    # Wait for namespace to be ready with increased timeout
    oc wait --for=condition=Active namespace/${NAMESPACE} --timeout=300s || {
        echo -e "${RED}❌ Namespace creation timed out. Checking status...${NC}"
        oc describe namespace ${NAMESPACE}
        echo -e "${YELLOW}💡 Try running: oc delete namespace ${NAMESPACE} && sleep 10${NC}"
        exit 1
    }
fi

# Create persistent volume claims
echo -e "${BLUE}💾 Creating persistent volumes...${NC}"
oc apply -f openshift/pvc.yaml

# Create config map and secrets
echo -e "${BLUE}⚙️ Creating configuration...${NC}"
oc apply -f openshift/configmap.yaml

# Check if secrets file exists and has content
if [ -s openshift/secret.yaml ] && grep -q "OPENAI_API_KEY:" openshift/secret.yaml; then
    oc apply -f openshift/secret.yaml
else
    echo -e "${YELLOW}⚠️  Secret file is empty or missing API keys. Creating empty secret...${NC}"
    echo -e "${YELLOW}   Please update the secret with your API keys:${NC}"
    echo -e "${YELLOW}   oc patch secret rhoai-secrets -n ${NAMESPACE} -p '{\"stringData\":{\"OPENAI_API_KEY\":\"your-key-here\"}}'${NC}"
    oc create secret generic rhoai-secrets --namespace=${NAMESPACE} --from-literal=OPENAI_API_KEY="" || true
fi

# Deploy application
echo -e "${BLUE}🚢 Deploying application...${NC}"
oc apply -f openshift/deployment.yaml

# Create services
echo -e "${BLUE}🔗 Creating services...${NC}"
oc apply -f openshift/service.yaml

# Create routes
echo -e "${BLUE}🌐 Creating routes...${NC}"
oc apply -f openshift/route.yaml

echo ""
echo -e "${GREEN}✅ Deployment completed!${NC}"
echo ""

# Wait for deployment to be ready
echo -e "${YELLOW}⏳ Waiting for deployment to be ready...${NC}"
oc rollout status deployment/${APP_NAME} --namespace=${NAMESPACE} --timeout=300s

# Get route URLs
echo -e "${BLUE}🌐 Getting route URLs...${NC}"
API_ROUTE=$(oc get route rhoai-api -n ${NAMESPACE} -o jsonpath='{.spec.host}')
UI_ROUTE=$(oc get route rhoai-ui -n ${NAMESPACE} -o jsonpath='{.spec.host}')

echo ""
echo -e "${GREEN}🎉 Deployment successful!${NC}"
echo -e "${GREEN}========================${NC}"
echo -e "API URL: ${BLUE}https://${API_ROUTE}${NC}"
echo -e "UI URL:  ${BLUE}https://${UI_ROUTE}${NC}"
echo -e "Docs:    ${BLUE}https://${API_ROUTE}/docs${NC}"
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo -e "1. Update API keys in the secret if not done already:"
echo -e "   ${BLUE}oc patch secret rhoai-secrets -n ${NAMESPACE} -p '{\"stringData\":{\"OPENAI_API_KEY\":\"your-actual-key\"}}'${NC}"
echo -e "2. Monitor the deployment:"
echo -e "   ${BLUE}oc get pods -n ${NAMESPACE}${NC}"
echo -e "3. View logs:"
echo -e "   ${BLUE}oc logs -f deployment/${APP_NAME} -n ${NAMESPACE}${NC}"
echo ""

# Restore original deployment file
mv openshift/deployment.yaml.bak openshift/deployment.yaml 2>/dev/null || true
