#!/bin/bash

# Deploy LLAMA Stack to Kubernetes/OpenShift with External API Provider
# Works with both kubectl and oc
# Usage: ./deploy-to-openshift.sh

set -e

NAMESPACE="llama-stack"

# Detect available CLI tool
if command -v oc >/dev/null 2>&1; then
    KUBE_CLI="oc"
    echo "🔧 Using OpenShift CLI (oc)"
elif command -v kubectl >/dev/null 2>&1; then
    KUBE_CLI="kubectl"
    echo "🔧 Using Kubernetes CLI (kubectl)"
else
    echo "❌ Error: Neither 'oc' nor 'kubectl' found. Please install one of them."
    exit 1
fi

echo "🚀 Deploying LLAMA Stack with Frontend and Backend to Kubernetes..."

# Function to encode base64
encode_base64() {
    echo -n "$1" | base64 -w 0
}

# Function to prompt for input
prompt_input() {
    local prompt="$1"
    local var_name="$2"
    local secret=${3:-false}
    
    echo -n "$prompt: "
    if [ "$secret" = true ]; then
        read -s value
        echo
    else
        read value
    fi
    
    if [ -z "$value" ]; then
        echo "❌ Error: $var_name cannot be empty"
        exit 1
    fi
    
    eval "$var_name='$value'"
}

# Create namespace
echo "📋 Creating namespace '$NAMESPACE'..."
$KUBE_CLI create namespace $NAMESPACE --dry-run=client -o yaml | $KUBE_CLI apply -f -

echo "🔧 Configuring API provider..."

echo ""
echo "📡 API Configuration:"
prompt_input "Enter your API base URL (e.g., https://api.openai.com/v1, https://mistral-small-24b-w8a8-maas-apicast-production.apps.prod.rhoai.rh-aiservices-bu.com:443)" API_BASE_URL
prompt_input "Enter your API key (leave empty if not required)" API_KEY
prompt_input "Enter the model name for LLAMA Stack (e.g., gpt-4o-mini, mistral-small)" MODEL_NAME

echo ""
echo "📋 Jira Configuration:"
prompt_input "Enter your Jira URL (e.g., https://your-company.atlassian.net)" JIRA_URL
prompt_input "Enter your Jira API Token" JIRA_PERSONAL_TOKEN true

# Create secrets with base64 encoded values
echo "🔐 Creating secrets..."
cat <<EOF | $KUBE_CLI apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: llama-stack-secrets
  namespace: $NAMESPACE
type: Opaque
data:
  VLLM_URL: $(encode_base64 "$API_BASE_URL")
  VLLM_INFERENCE_MODEL: $(encode_base64 "$MODEL_NAME")
EOF

# Only add API key if provided
if [ -n "$API_KEY" ]; then
    echo "🔑 Adding API key..."
    $KUBE_CLI patch secret llama-stack-secrets -n $NAMESPACE --patch="$(cat <<EOF
data:
  VLLM_API_TOKEN: $(encode_base64 "$API_KEY")
EOF
    )"
fi

# Create Jira secrets
cat <<EOF | $KUBE_CLI apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: jira-secrets
  namespace: $NAMESPACE
type: Opaque
data:
  JIRA_URL: $(encode_base64 "$JIRA_URL")
  JIRA_PERSONAL_TOKEN: $(encode_base64 "$JIRA_PERSONAL_TOKEN")
EOF

# Create database secrets
echo "🗄️ Creating database secrets..."
DB_PASSWORD="rhoai_password_$(date +%s)"
cat <<EOF | $KUBE_CLI apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: database-secrets
  namespace: $NAMESPACE
type: Opaque
data:
  POSTGRES_DB: $(encode_base64 "rhoai_sessions")
  POSTGRES_USER: $(encode_base64 "rhoai_user")
  POSTGRES_PASSWORD: $(encode_base64 "$DB_PASSWORD")
  DATABASE_URL: $(encode_base64 "postgresql://rhoai_user:$DB_PASSWORD@postgresql-service.llama-stack.svc.cluster.local:5432/rhoai_sessions")
EOF

# Deploy configuration
echo "🚀 Deploying LLAMA Stack with Frontend and Backend..."
$KUBE_CLI apply -f k8s-deployment.yaml

echo "⏳ Waiting for deployments to be ready..."

# Wait for PostgreSQL deployment
$KUBE_CLI rollout status deployment/postgresql -n $NAMESPACE --timeout=300s

# Wait for LLAMA Stack deployment
$KUBE_CLI rollout status deployment/llama-stack -n $NAMESPACE --timeout=300s

# Wait for Jira MCP deployment
$KUBE_CLI rollout status deployment/jira-mcp -n $NAMESPACE --timeout=300s

# Wait for RHOAI Frontend+API deployment
$KUBE_CLI rollout status deployment/rhoai-ai-feature-sizing -n $NAMESPACE --timeout=300s

echo "🎉 Deployment completed successfully!"

# No routes created - access via port forwarding
echo "📍 Access via port forwarding:"
echo ""
echo "🌐 Main Application (Frontend + API):"
echo "  $KUBE_CLI port-forward svc/rhoai-ai-feature-sizing-service 8080:80 -n $NAMESPACE"
echo "  Then access: http://localhost:8080"
echo ""
echo "🔧 LLAMA Stack API (Direct Access):"
echo "  $KUBE_CLI port-forward svc/llama-stack-service 8321:8321 -n $NAMESPACE"
echo "  Then access: http://localhost:8321"
echo ""
echo "🗄️ PostgreSQL Database (For DB Tools):"
echo "  $KUBE_CLI port-forward svc/postgresql-service 5432:5432 -n $NAMESPACE"
echo "  Then connect: postgresql://rhoai_user:$DB_PASSWORD@localhost:5432/rhoai_sessions"
echo ""
echo "🎯 Frontend Features:"
echo "  • React-based web interface for managing JIRA RFE sessions"
echo "  • Interactive chat panel for real-time session monitoring"
echo "  • Session management with create, view, and delete functionality"
echo "  • Custom prompt configuration support"
echo ""
echo "📝 Your API configuration:"
echo "  • API URL: $API_BASE_URL"
echo "  • Model: $MODEL_NAME"
echo "  • Has API Key: $([ -n "$API_KEY" ] && echo "Yes" || echo "No")"
echo ""
echo "🎯 Jira MCP configuration:"
echo "  • Jira URL: $JIRA_URL"
echo "  • MCP Service: jira-mcp-service.$NAMESPACE.svc.cluster.local:9000"
echo "  • Available Jira tools: search, get_issue, create_issue, update_issue, transitions, etc."
echo ""
echo "🗄️ Database configuration:"
echo "  • PostgreSQL 15 with persistent storage (5GB)"
echo "  • Database: rhoai_sessions"
echo "  • Internal URL: postgresql-service.$NAMESPACE.svc.cluster.local:5432"
echo "  • Multi-pod scalable (replaces SQLite)"

echo ""
echo "🧪 Test your deployment (after port forwarding):"
echo "# Frontend (web interface) - after port forwarding to 8080:"
echo "curl http://localhost:8080"
echo "# API health check:"
echo "curl http://localhost:8080/health"
echo "# LLAMA Stack health - after port forwarding to 8321:"
echo "curl http://localhost:8321/v1/health"
echo ""
echo "🔍 Test Jira MCP service (from within cluster):"
echo "$KUBE_CLI exec -n $NAMESPACE deployment/llama-stack -- curl http://jira-mcp-service:9000/health"
echo ""
echo "🗄️ Test PostgreSQL database:"
echo "$KUBE_CLI exec -n $NAMESPACE deployment/postgresql -- psql -U rhoai_user -d rhoai_sessions -c 'SELECT version();'"
echo ""
echo "📚 Next steps:"
echo "1. 🔌 Set up port forwarding: $KUBE_CLI port-forward svc/rhoai-ai-feature-sizing-service 8080:80 -n $NAMESPACE"
echo "2. 🌐 Open the web interface: http://localhost:8080"
echo "3. 🔧 Create a new JIRA session through the UI"
echo "4. 💬 Monitor session progress in real-time via the chat panel"
echo "5. 🛠️ Configure custom prompts via the UI settings (if needed)"
echo "6. 📊 Use the existing CLI commands against the port-forwarded endpoint"
echo ""
echo "🎯 Example API configurations that work with this setup:"
echo "  • OpenAI: https://api.openai.com/v1 + gpt-4o-mini"
echo "  • Mistral: https://mistral-small-24b-w8a8-maas-apicast-production.apps.prod.rhoai.rh-aiservices-bu.com:443 + mistral-small"
echo "  • Azure OpenAI: https://your-resource.openai.azure.com/ + your-deployment-name"
echo "  • Any other OpenAI-compatible API"
echo ""
echo "🎨 Architecture Overview:"
echo "  📱 Frontend (React/PatternFly) → nginx proxy → 🐍 Python API → 🦙 LLAMA Stack → 🤖 External LLM"
echo "                                        ↓"
echo "                                 🗄️ PostgreSQL Database" 