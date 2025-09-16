#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Ambient Code Research Runner Deployment Script${NC}"
echo "=========================================="

# Function to check if kubectl is available
check_kubectl() {
    if ! command -v kubectl &> /dev/null; then
        echo -e "${RED}Error: kubectl is not installed or not in PATH${NC}"
        exit 1
    fi
}

# Function to check if we can connect to k8s cluster
check_cluster() {
    if ! kubectl cluster-info &> /dev/null; then
        echo -e "${RED}Error: Cannot connect to Kubernetes cluster${NC}"
        echo "Please ensure your kubeconfig is properly configured."
        exit 1
    fi
}

# Function to build docker images (placeholder)
build_images() {
    echo -e "${YELLOW}Building Docker images...${NC}"
    
    # Load environment variables to get registry info
    load_env_vars
    
    echo "Note: You need to build and push the following images:"
    echo "- $CONTAINER_REGISTRY/vteam_backend:$IMAGE_TAG"
    echo "- $CONTAINER_REGISTRY/vteam_frontend:$IMAGE_TAG"
    echo "- $CONTAINER_REGISTRY/vteam_operator:$IMAGE_TAG"
    echo "- $CONTAINER_REGISTRY/vteam_claude_runner:$IMAGE_TAG"
    echo ""
    echo "Example build and push commands:"
    echo "  docker build -t $CONTAINER_REGISTRY/vteam_backend:$IMAGE_TAG ../backend/"
    echo "  docker push $CONTAINER_REGISTRY/vteam_backend:$IMAGE_TAG"
    echo "  docker build -t $CONTAINER_REGISTRY/vteam_frontend:$IMAGE_TAG ../frontend/"
    echo "  docker push $CONTAINER_REGISTRY/vteam_frontend:$IMAGE_TAG"
    echo "  docker build -t $CONTAINER_REGISTRY/vteam_operator:$IMAGE_TAG ../operator/"
    echo "  docker push $CONTAINER_REGISTRY/vteam_operator:$IMAGE_TAG"
    echo "  docker build -t $CONTAINER_REGISTRY/vteam_claude_runner:$IMAGE_TAG ../runners/claude-code-runner/"
    echo "  docker push $CONTAINER_REGISTRY/vteam_claude_runner:$IMAGE_TAG"
    echo ""
    read -p "Have you built and pushed all required images? (y/N): " confirm
    if [[ $confirm != [yY] && $confirm != [yY][eE][sS] ]]; then
        echo -e "${RED}Please build and push the required images first.${NC}"
        exit 1
    fi
}

# Function to create namespace
create_namespace() {
    echo -e "${YELLOW}Creating namespace...${NC}"
    kubectl apply -f namespace.yaml
    echo -e "${GREEN}✓ Namespace created${NC}"
}

# Function to deploy CRD
deploy_crd() {
    echo -e "${YELLOW}Deploying Custom Resource Definition...${NC}"
    kubectl apply -f crd.yaml
    echo -e "${GREEN}✓ CRD deployed${NC}"
}

# Function to deploy RBAC
deploy_rbac() {
    echo -e "${YELLOW}Deploying RBAC configuration...${NC}"
    kubectl apply -f rbac.yaml
    echo -e "${GREEN}✓ RBAC deployed${NC}"
}

# Function to load environment variables from .env file
load_env_vars() {
    local env_file=".env"
    if [[ ! -f "$env_file" ]]; then
        echo -e "${RED}Error: .env file not found at $env_file${NC}"
        echo -e "${YELLOW}Please create .env file from env.example:${NC}"
        echo "  cp manifests/env.example ../.env"
        echo "  # Edit ../.env and add your actual API key"
        exit 1
    fi
    
    # Source the .env file
    set -a  # automatically export all variables
    source "$env_file"
    set +a
    
    # Validate required variables
    if [[ -z "$ANTHROPIC_API_KEY" ]]; then
        echo -e "${RED}Error: ANTHROPIC_API_KEY not set in .env file${NC}"
        exit 1
    fi
    
    if [[ -z "$CONTAINER_REGISTRY" ]]; then
        echo -e "${RED}Error: CONTAINER_REGISTRY not set in .env file${NC}"
        exit 1
    fi
    
    if [[ -z "$IMAGE_TAG" ]]; then
        echo -e "${RED}Error: IMAGE_TAG not set in .env file${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Environment variables loaded from .env${NC}"
}

# Function to update deployment manifests with custom registry if different from default
update_deployment_images() {
    local default_registry="quay.io/ambient_code"
    
    # Only update if using a different registry than default
    if [[ "$CONTAINER_REGISTRY" != "$default_registry" || "$IMAGE_TAG" != "latest" ]]; then
        echo -e "${YELLOW}Updating deployment manifests with custom registry...${NC}"
        
        # Create backup of original files
        cp backend-deployment.yaml backend-deployment.yaml.bak
        cp frontend-deployment.yaml frontend-deployment.yaml.bak
        cp operator-deployment.yaml operator-deployment.yaml.bak
        
        # Update image references in deployment files (using underscore format)
        sed -i.tmp "s|${default_registry}/vteam_backend:latest|${CONTAINER_REGISTRY}/vteam_backend:${IMAGE_TAG}|g" backend-deployment.yaml
        sed -i.tmp "s|${default_registry}/vteam_frontend:latest|${CONTAINER_REGISTRY}/vteam_frontend:${IMAGE_TAG}|g" frontend-deployment.yaml
        sed -i.tmp "s|${default_registry}/vteam_operator:latest|${CONTAINER_REGISTRY}/vteam_operator:${IMAGE_TAG}|g" operator-deployment.yaml
        sed -i.tmp "s|${default_registry}/vteam_claude_runner:latest|${CONTAINER_REGISTRY}/vteam_claude_runner:${IMAGE_TAG}|g" operator-deployment.yaml
        
        # Clean up temporary files
        rm -f *.tmp
        
        echo -e "${GREEN}✓ Deployment manifests updated for registry: $CONTAINER_REGISTRY${NC}"
    fi
}

# Function to restore original deployment manifests
restore_deployment_manifests() {
    if [[ -f "backend-deployment.yaml.bak" ]]; then
        echo -e "${YELLOW}Restoring original deployment manifests...${NC}"
        mv backend-deployment.yaml.bak backend-deployment.yaml
        mv frontend-deployment.yaml.bak frontend-deployment.yaml
        mv operator-deployment.yaml.bak operator-deployment.yaml
        echo -e "${GREEN}✓ Original manifests restored${NC}"
    fi
}

# Function to deploy secrets
deploy_secrets() {
    echo -e "${YELLOW}Deploying secrets and config...${NC}"
    
    # Load environment variables
    load_env_vars
    
    # Delete existing secret if it exists (ignore errors)
    kubectl delete secret ambient-code-secrets -n ambient-code --ignore-not-found=true
    
    # Create secret from environment variable
    kubectl create secret generic ambient-code-secrets -n ambient-code \
        --from-literal=anthropic-api-key="$ANTHROPIC_API_KEY"
    
    # Apply the ConfigMap
    kubectl apply -f secrets.yaml
    
    echo -e "${GREEN}✓ Secrets and config deployed${NC}"
}

# Function to deploy backend
deploy_backend() {
    echo -e "${YELLOW}Deploying backend API service...${NC}"
    kubectl apply -f backend-deployment.yaml
    echo -e "${GREEN}✓ Backend deployed${NC}"
}

# Function to deploy operator
deploy_operator() {
    echo -e "${YELLOW}Deploying research operator...${NC}"
    kubectl apply -f operator-deployment.yaml
    echo -e "${GREEN}✓ Operator deployed${NC}"
}

# Function to deploy frontend
deploy_frontend() {
    echo -e "${YELLOW}Deploying frontend application...${NC}"
    kubectl apply -f frontend-deployment.yaml
    echo -e "${GREEN}✓ Frontend deployed${NC}"
}

# Function to wait for deployments
wait_for_deployments() {
    echo -e "${YELLOW}Waiting for deployments to be ready...${NC}"
    kubectl wait --for=condition=available --timeout=300s deployment/backend-api -n ambient-code
    kubectl wait --for=condition=available --timeout=300s deployment/research-operator -n ambient-code
    kubectl wait --for=condition=available --timeout=300s deployment/frontend -n ambient-code
    echo -e "${GREEN}✓ All deployments are ready${NC}"
}

# Function to display status
show_status() {
    echo -e "${BLUE}Deployment Status:${NC}"
    echo "=================="
    kubectl get pods -l 'app in (backend-api,research-operator,frontend)' -n ambient-code
    echo ""
    kubectl get services -l 'app in (backend-api,frontend)' -n ambient-code
    echo ""
    echo -e "${GREEN}Frontend URL: http://ambient-code.local (add to /etc/hosts)${NC}"
    echo -e "${GREEN}Or use: kubectl port-forward svc/frontend-service 3000:3000 -n ambient-code${NC}"
}

# Main deployment process
main() {
    echo -e "${BLUE}Starting deployment process...${NC}"
    
    check_kubectl
    check_cluster
    
    # Set up cleanup trap
    trap 'restore_deployment_manifests' EXIT
    
    create_namespace
    deploy_crd
    deploy_rbac
    deploy_secrets
    update_deployment_images
    deploy_backend
    deploy_operator
    deploy_frontend
    
    wait_for_deployments
    show_status
    
    echo -e "${GREEN}Deployment completed successfully!${NC}"
}

# Handle command line arguments
case "${1:-}" in
    "crd")
        check_kubectl && check_cluster && deploy_crd
        ;;
    "rbac")
        check_kubectl && check_cluster && deploy_rbac
        ;;
    "secrets")
        check_kubectl && check_cluster && deploy_secrets
        ;;
    "backend")
        check_kubectl && check_cluster && deploy_backend
        ;;
    "operator")
        check_kubectl && check_cluster && deploy_operator
        ;;
    "frontend")
        check_kubectl && check_cluster && deploy_frontend
        ;;
    "status")
        check_kubectl && check_cluster && show_status
        ;;
    "build")
        build_images
        ;;
    "clean")
        echo -e "${YELLOW}Cleaning up resources...${NC}"
        kubectl delete -f frontend-deployment.yaml --ignore-not-found
        kubectl delete -f operator-deployment.yaml --ignore-not-found
        kubectl delete -f backend-deployment.yaml --ignore-not-found
        kubectl delete -f secrets.yaml --ignore-not-found
        kubectl delete -f rbac.yaml --ignore-not-found
        kubectl delete -f crd.yaml --ignore-not-found
        kubectl delete -f namespace.yaml --ignore-not-found
        restore_deployment_manifests
        echo -e "${GREEN}✓ Resources cleaned up${NC}"
        ;;
    *)
        main
        ;;
esac
