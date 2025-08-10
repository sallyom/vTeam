# Deployment Guide

This comprehensive deployment guide covers all deployment scenarios for the RHOAI AI Feature Sizing system, from local development to production-scale OpenShift deployments.

## 🎯 Deployment Overview

This deployment provides a **scalable, production-ready** setup with:

### **Complete Web Application**
- **React Frontend** with PatternFly UI components for JIRA session management
- **Interactive Chat Panel** for real-time session monitoring
- **Session Management** with create, view, delete functionality  
- **Custom Prompt Configuration** via web interface
- **nginx Proxy** serving frontend and routing API requests

### **External Model Providers**
Instead of using Ollama locally, connects to external providers like:
- **OpenAI** (GPT-4o, GPT-4o-mini)
- **Azure OpenAI** (Your deployed models)
- **External vLLM services** (Hosted elsewhere)
- **HuggingFace TGI endpoints** (Hosted services)
- **Custom APIs** (Mistral, Gemini, Claude, RHOAI models, etc.)

### **Production Database**
- **PostgreSQL 15** with persistent storage for scalability
- **Multi-pod capable** (no SQLite limitations)
- **Automatic database initialization** and schema management
- **Secure credential management** via Kubernetes secrets

## 🏗️ Architecture Overview

The deployment creates a complete web application with the following architecture:

```
📱 User Browser → 🌐 OpenShift Route → nginx (Port 80) → {
                                                          📄 Static Files (React App)
                                                          🔀 /api/* → Python API (Port 8000)
                                                        }
                                                                    ↓
                                        🐍 Python API → 🦙 LLAMA Stack → 🤖 External LLM
                                             ↓                ↓
                                        🗄️ PostgreSQL ← 📋 Jira MCP
```

**Components:**
- **nginx**: Serves React frontend and proxies API requests
- **React Frontend**: PatternFly-based UI for session management  
- **Python API**: FastAPI backend for session processing
- **LLAMA Stack**: AI orchestration layer
- **PostgreSQL**: Persistent session storage
- **Jira MCP**: Jira integration service

## 🚀 Quick Start

### Prerequisites

1. **OpenShift cluster access** with `oc` CLI configured
2. **Docker** and access to a **container registry** (e.g., Quay.io, Docker Hub, OpenShift internal registry)
3. **Appropriate permissions** to create namespaces, deployments, secrets, and routes
4. **API credentials** for your chosen provider:
   - **OpenAI**: API key from https://platform.openai.com/api-keys
   - **Azure OpenAI**: API key, endpoint, and deployment names
   - **vLLM**: URL of your hosted vLLM service

### 1. Clone and Prepare

```bash
git clone <your-repo>
cd rhoai-ai-feature-sizing

# Make deployment script executable
chmod +x deploy-to-openshift.sh
```

### 2. Build and Push Custom Docker Image

The RHOAI AI Feature Sizing application requires a custom Docker image that includes both the React frontend and Python backend:

```bash
# Build and push to your container registry (replace with your registry URL)
docker build -t quay.io/yourusername/rhoai-ai-feature-sizing:latest .
docker push quay.io/yourusername/rhoai-ai-feature-sizing:latest
```

**The Dockerfile creates a multi-stage build that:**
- **Stage 1**: Builds the React frontend using Node.js and webpack
- **Stage 2**: Sets up Python backend, nginx, and combines everything

**Important**: Update `openshift-deployment.yaml` with your actual image URL:
```yaml
# Replace this line in the rhoai-ai-feature-sizing deployment:
image: quay.io/yourusername/rhoai-ai-feature-sizing:latest
```

### 3. Deploy to OpenShift

Run the deployment script:

```bash
./deploy-to-openshift.sh
```

The script will prompt you for:
- **API URL** (e.g., OpenAI, Mistral, Gemini, Azure OpenAI, etc.)
- **API Key** (if required)
- **Model Name** (for LLAMA Stack)
- **Model ID** (actual model used by the API)
- **Jira credentials**

The script will:
- Create the `llama-stack` namespace
- Prompt you for API details and credentials
- Deploy LLAMA Stack configured for your API
- Deploy the Jira MCP service
- **Deploy PostgreSQL database** for scalable data storage
- Create routes for external access

### 3. Update Your Environment

After deployment, update your local `.env` file:

```bash
cp env.openshift.example .env
# Edit .env with the URL provided by the deployment script
```

### 4. Test Your Deployment

```bash
# Open the web interface in your browser
open http://your-app-route-url

# Test the API health endpoint
curl http://your-app-route-url/health

# Test the LLAMA Stack endpoint  
curl http://your-llama-stack-route-url/v1/health

# Test with your existing CLI (update API URL in .env)
uv run python -m rhoai_ai_feature_sizing.main stage refine PROJ-123
```

## 🛠️ Manual Deployment

If you prefer manual deployment or need to customize the configuration:

### 1. Build and Push Custom Image

First, build and push the custom Docker image that includes both frontend and backend:

```bash
# Build the multi-stage image (frontend + backend)
docker build -t quay.io/yourusername/rhoai-ai-feature-sizing:latest .

# Push to registry
docker push quay.io/yourusername/rhoai-ai-feature-sizing:latest

# Update openshift-deployment.yaml with your image URL
sed -i 's|quay.io/yourusername/rhoai-ai-feature-sizing:latest|your-registry/your-image:tag|g' openshift-deployment.yaml
```

### 2. Create Namespace
```bash
oc create namespace llama-stack
```

### 3. Create Secrets

```bash
# Create API secrets
oc create secret generic llama-stack-secrets \
  --from-literal=CUSTOM_API_BASE_URL="https://your-api.com/v1" \
  --from-literal=CUSTOM_API_KEY="your-api-key" \
  --from-literal=CUSTOM_MODEL_NAME="your-model" \
  --from-literal=CUSTOM_MODEL_ID="actual-model-id" \
  -n llama-stack

# Create Jira secrets
oc create secret generic jira-secrets \
  --from-literal=JIRA_URL="https://your-company.atlassian.net" \
  --from-literal=JIRA_API_TOKEN="your-token" \
  --from-literal=JIRA_USERNAME="your-username" \
  -n llama-stack
```

### 4. Deploy Configuration

```bash
oc apply -f openshift-deployment.yaml
```

## 🗄️ Database Architecture

The deployment includes a **PostgreSQL database** for scalability and production readiness:

- **PostgreSQL 15** container with persistent storage (5GB)
- **Dedicated secrets** for database credentials
- **Health checks** with readiness and liveness probes
- **Resource limits** for stable operation
- **Cluster-internal service** for secure database access

### Database Connection
- **Internal URL**: `postgresql-service.llama-stack.svc.cluster.local:5432`
- **Database**: `rhoai_sessions`
- **Credentials**: Stored in `database-secrets` secret
- **Persistence**: 5GB PersistentVolumeClaim

This replaces SQLite for multi-pod scalability and data persistence.

## 📊 Supported APIs

LLAMA Stack works with **any OpenAI-compatible API endpoint**. Examples include:

### Popular API Providers
- **OpenAI**: `https://api.openai.com/v1` (GPT-4o, GPT-4o-mini)
- **Azure OpenAI**: `https://your-resource.openai.azure.com/` (Your deployed models)
- **Mistral**: `https://mistral-small-24b-w8a8-maas-apicast-production.apps.prod.rhoai.rh-aiservices-bu.com:443`
- **Anthropic Claude**: Via compatible proxy/gateway
- **Google Gemini**: Via compatible proxy/gateway
- **RHOAI Models**: Red Hat AI Services hosted models
- **Self-hosted vLLM/TGI**: Your own inference servers
- **HuggingFace Endpoints**: Hosted inference endpoints

### Requirements
- **OpenAI-compatible API** with `/v1/chat/completions` endpoint
- **Optional authentication** (API key or no auth)
- **Model availability** via `/v1/models` endpoint (recommended)

See [Custom API Examples](CUSTOM-API-EXAMPLES.md) for specific configuration examples.

## 🔧 Configuration Details

### LLAMA Stack Configuration

The configuration is defined in `run.yaml` within the ConfigMap. Key sections:

- **Providers**: Defines which inference provider to use
- **Models**: Maps model IDs to provider-specific model names
- **APIs**: Enabled APIs (agents, inference, safety, telemetry)

### Environment Variables

The deployment uses these environment variables for any API:

**API Configuration:**
- `CUSTOM_API_BASE_URL`: Base URL of your API endpoint
- `CUSTOM_API_KEY`: API key (if required)
- `CUSTOM_MODEL_NAME`: Model name for LLAMA Stack
- `CUSTOM_MODEL_ID`: Actual model ID used by the API

**Examples:**
- **OpenAI**: `https://api.openai.com/v1`, `your-api-key`, `gpt-4o-mini`, `gpt-4o-mini`
- **Mistral**: `https://mistral-small-24b-w8a8-maas-apicast-production.apps.prod.rhoai.rh-aiservices-bu.com:443`, `[none]`, `mistral-small`, `mistral-small`
- **Azure OpenAI**: `https://your-resource.openai.azure.com/`, `your-api-key`, `gpt-4o-mini`, `your-deployment-name`

## 🚦 Monitoring and Troubleshooting

### Check Deployment Status

```bash
# Check pod status
oc get pods -n llama-stack

# Check logs
oc logs deployment/llama-stack -n llama-stack
oc logs deployment/jira-mcp -n llama-stack

# Check routes
oc get routes -n llama-stack
```

### Common Issues

1. **Pods not starting**: Check logs for credential or configuration issues
2. **Route not accessible**: Verify route creation and DNS resolution
3. **Model not found**: Verify model names match your provider's available models
4. **API errors**: Check API keys and network connectivity

### Port Forward for Local Testing

If routes aren't working, use port-forward:

```bash
# LLAMA Stack
oc port-forward svc/llama-stack-service 8321:8321 -n llama-stack

# Jira MCP
oc port-forward svc/jira-mcp-service 9000:9000 -n llama-stack
```

## 🔄 Switching Providers

To switch to a different provider:

1. Delete the current deployment:
   ```bash
   oc delete all -l app=llama-stack -n llama-stack
   oc delete secrets llama-stack-secrets* -n llama-stack
   ```

2. Deploy with new provider:
   ```bash
   ./deploy-to-openshift.sh <new-provider>
   ```

## 📈 Scaling and Performance

### Resource Requests and Limits

The deployments include resource specifications:
- **LLAMA Stack**: 512Mi-1Gi memory, 250m-500m CPU
- **Jira MCP**: 256Mi-512Mi memory, 100m-200m CPU

Adjust these based on your usage patterns and cluster resources.

### High Availability

For production deployments:

1. Increase replica count:
   ```yaml
   spec:
     replicas: 3  # Instead of 1
   ```

2. Add pod disruption budgets
3. Configure anti-affinity rules
4. Use persistent volumes for SQLite stores

## 🔐 Security Considerations

1. **Secrets Management**: All credentials are stored in OpenShift secrets
2. **Network Policies**: Consider implementing network policies to restrict traffic
3. **RBAC**: Use appropriate service accounts and RBAC rules
4. **TLS**: Enable TLS for routes in production
5. **Image Security**: Use trusted image registries and scan for vulnerabilities

## 🎛️ Advanced Configuration

### Custom Models

To add custom models, edit the ConfigMap:

```yaml
models:
  - metadata: {}
    model_id: custom-model
    provider_id: your-provider
    provider_model_id: provider-specific-name
    model_type: llm
```

### Authentication

To enable authentication on LLAMA Stack, add to the server configuration:

```yaml
server:
  port: 8321
  auth:
    provider_config:
      type: "oauth2_token"
      jwks:
        uri: "https://your-auth-provider/jwks"
```

### Persistent Storage

For production, use persistent volumes:

```yaml
volumeMounts:
- name: storage
  mountPath: /data
volumes:
- name: storage
  persistentVolumeClaim:
    claimName: llama-stack-pvc
```

## 📚 Next Steps

1. **Test your deployment** with the existing CLI commands
2. **Monitor performance** and adjust resources as needed
3. **Set up monitoring** with Prometheus/Grafana if available
4. **Configure backups** for any persistent data
5. **Review security** settings for your environment

## 🤝 External Provider Setup Guides

### Setting up OpenAI
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Note the key for use in deployment

### Setting up Azure OpenAI
1. Create an Azure OpenAI resource
2. Deploy models (GPT-4o, GPT-4o-mini)
3. Get the endpoint URL and API key
4. Note the deployment names

### Setting up External vLLM
Refer to external guides like:
- [OpenShift AI vLLM examples](https://github.com/rh-aiservices-bu/llm-on-openshift)
- [Community vLLM deployments](https://github.com/rcarrat-AI/hftgi-llms)

## 🔍 Troubleshooting

### Database Issues
```bash
# Check PostgreSQL pod status
oc get pods -n llama-stack -l app=postgresql

# View PostgreSQL logs
oc logs -n llama-stack deployment/postgresql

# Test database connectivity from API pod
oc exec -n llama-stack deployment/rhoai-ai-feature-sizing-api -- python -c "
import os
from sqlalchemy import create_engine
url = os.getenv('DATABASE_URL')
engine = create_engine(url)
with engine.connect() as conn:
    result = conn.execute('SELECT version()')
    print('Database connected:', result.fetchone()[0])
"
```

### API Health Check
```bash
# Check API health (includes database status)
ROUTE_URL=$(oc get route rhoai-ai-feature-sizing-api-route -n llama-stack -o jsonpath='{.spec.host}')
curl http://$ROUTE_URL/health
```

### Scaling Issues
```bash
# Scale API pods (PostgreSQL supports multiple connections)
oc scale deployment/rhoai-ai-feature-sizing-api --replicas=3 -n llama-stack

# Check all pods are ready
oc get pods -n llama-stack -l app=rhoai-ai-feature-sizing-api
```

## 🐛 Getting Help

- Check the [LLAMA Stack documentation](https://llama-stack.readthedocs.io/)
- Review OpenShift logs and events
- Open issues in the project repository
- Consult OpenShift documentation for cluster-specific issues 