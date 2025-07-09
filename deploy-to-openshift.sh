#!/bin/bash

# Deploy LLAMA Stack to OpenShift with External API Provider
# Usage: ./deploy-to-openshift.sh

set -e

NAMESPACE="llama-stack"

echo "🚀 Deploying LLAMA Stack to OpenShift..."

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
oc create namespace $NAMESPACE --dry-run=client -o yaml | oc apply -f -

echo "🔧 Configuring API provider..."

echo ""
echo "📡 API Configuration:"
prompt_input "Enter your API base URL (e.g., https://api.openai.com/v1, https://mistral-small-24b-w8a8-maas-apicast-production.apps.prod.rhoai.rh-aiservices-bu.com:443)" API_BASE_URL
prompt_input "Enter your API key (leave empty if not required)" API_KEY
prompt_input "Enter the model name for LLAMA Stack (e.g., gpt-4o-mini, mistral-small)" MODEL_NAME
prompt_input "Enter the actual model ID used by the API (often same as above, or 'auto')" MODEL_ID

echo ""
echo "📋 Jira Configuration:"
prompt_input "Enter your Jira URL (e.g., https://your-company.atlassian.net)" JIRA_URL
prompt_input "Enter your Jira API Token" JIRA_API_TOKEN true
prompt_input "Enter your Jira Username" JIRA_USERNAME

# Create secrets with base64 encoded values
echo "🔐 Creating secrets..."
cat <<EOF | oc apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: llama-stack-secrets
  namespace: $NAMESPACE
type: Opaque
data:
  CUSTOM_API_BASE_URL: $(encode_base64 "$API_BASE_URL")
  CUSTOM_MODEL_NAME: $(encode_base64 "$MODEL_NAME")
  CUSTOM_MODEL_ID: $(encode_base64 "$MODEL_ID")
EOF

# Only add API key if provided
if [ -n "$API_KEY" ]; then
    echo "🔑 Adding API key..."
    oc patch secret llama-stack-secrets -n $NAMESPACE --patch="$(cat <<EOF
data:
  CUSTOM_API_KEY: $(encode_base64 "$API_KEY")
EOF
    )"
fi

# Create Jira secrets
cat <<EOF | oc apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: jira-secrets
  namespace: $NAMESPACE
type: Opaque
data:
  JIRA_URL: $(encode_base64 "$JIRA_URL")
  JIRA_API_TOKEN: $(encode_base64 "$JIRA_API_TOKEN")
  JIRA_USERNAME: $(encode_base64 "$JIRA_USERNAME")
EOF

# Deploy configuration
echo "🚀 Deploying LLAMA Stack..."
oc apply -f openshift-deployment.yaml

echo "⏳ Waiting for deployments to be ready..."

# Wait for LLAMA Stack deployment
oc rollout status deployment/llama-stack -n $NAMESPACE --timeout=300s

# Wait for Jira MCP deployment
oc rollout status deployment/jira-mcp -n $NAMESPACE --timeout=300s

echo "🎉 Deployment completed successfully!"

# Get route information
echo "📍 Access information:"
ROUTE_URL=$(oc get route llama-stack-route -n $NAMESPACE -o jsonpath='{.spec.host}' 2>/dev/null || echo "Route not available")

if [ "$ROUTE_URL" != "Route not available" ]; then
    echo "🌐 LLAMA Stack URL: http://$ROUTE_URL"
    echo "🔧 Update your .env file with:"
    echo "LLAMA_STACK_URL=http://$ROUTE_URL"
    echo "MCP_ATLASSIAN_URL=http://jira-mcp-service.$NAMESPACE.svc.cluster.local:9000/sse"
    echo ""
    echo "📝 Your API configuration:"
    echo "  • API URL: $API_BASE_URL"
    echo "  • Model: $MODEL_NAME"
    echo "  • Has API Key: $([ -n "$API_KEY" ] && echo "Yes" || echo "No")"
else
    echo "⚠️  Route not created. Access via port-forward:"
    echo "oc port-forward svc/llama-stack-service 8321:8321 -n $NAMESPACE"
fi

echo ""
echo "🧪 Test your deployment:"
echo "curl http://$ROUTE_URL/v1/health"
echo ""
echo "📚 Next steps:"
echo "1. Update your application's LLAMA_STACK_URL environment variable"
echo "2. Test the API endpoints"
echo "3. Run your existing CLI commands against the new endpoint"
echo ""
echo "🎯 Example API configurations that work with this setup:"
echo "  • OpenAI: https://api.openai.com/v1 + gpt-4o-mini"
echo "  • Mistral: https://mistral-small-24b-w8a8-maas-apicast-production.apps.prod.rhoai.rh-aiservices-bu.com:443 + mistral-small"
echo "  • Azure OpenAI: https://your-resource.openai.azure.com/ + your-deployment-name"
echo "  • Any other OpenAI-compatible API" 