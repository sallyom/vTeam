# Kubernetes/OpenShift Deployment Guide

This guide shows you how to deploy the complete RHOAI AI Feature Sizing application to **any Kubernetes cluster** (including OpenShift), with both the React frontend and Python backend with external model providers.

> **✨ Works on both Kubernetes and OpenShift!** The deployment automatically detects and uses either `kubectl` or `oc` CLI.

## 🎯 Overview

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

1. **Kubernetes or OpenShift cluster access** with `kubectl` or `oc` CLI configured
2. **Docker** and access to a **container registry** (e.g., Quay.io, Docker Hub, OpenShift internal registry)
3. **Appropriate permissions** to create namespaces, deployments, secrets, and services
4. **API credentials** for your chosen provider:
   - **OpenAI**: API key from https://platform.openai.com/api-keys
   - **Azure OpenAI**: API key, endpoint, and deployment names
   - **vLLM**: URL of your hosted vLLM service

### 1. Clone and Prepare

```bash
git clone <your-repo>
cd rhoai-ai-feature-sizing

# Make deployment script executable
chmod +x deploy-to-k8s.sh
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

**Important**: Update `k8s-deployment.yaml` with your actual image URL:
```yaml
# Replace this line in the rhoai-ai-feature-sizing deployment:
image: quay.io/yourusername/rhoai-ai-feature-sizing:latest
```

### 3. Deploy to Kubernetes/OpenShift

Run the deployment script (works with both `kubectl` and `oc`):

```bash
./deploy-to-k8s.sh
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
- **No external routes** - access via port forwarding for development

### 3. Update Your Environment

After deployment, update your local `.env` file:

```bash
cp env.openshift.example .env
# Edit .env with the URL provided by the deployment script
```

### 4. Access Your Deployment

**Port forward the services** (recommended for development):

```bash
# Main application (React frontend + Python API)
kubectl port-forward svc/rhoai-ai-feature-sizing-service 8080:80 -n llama-stack
# Or use 'oc' if on OpenShift

# Then open in browser:
open http://localhost:8080
```

**Test the deployment:**

```bash
# Test the API health endpoint
curl http://localhost:8080/health

# Port forward LLAMA Stack directly (optional)
kubectl port-forward svc/llama-stack-service 8321:8321 -n llama-stack
curl http://localhost:8321/v1/health

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

# Update k8s-deployment.yaml with your image URL
sed -i 's|quay.io/yourusername/rhoai-ai-feature-sizing:latest|your-registry/your-image:tag|g' k8s-deployment.yaml
```

### 2. Create Namespace
```bash
# Use kubectl or oc depending on your cluster
kubectl create namespace llama-stack
# OR: oc create namespace llama-stack
```

### 3. Create Secrets

```bash
# Create API secrets (use kubectl or oc)
kubectl create secret generic llama-stack-secrets \
  --from-literal=VLLM_URL="https://your-api.com/v1" \
  --from-literal=VLLM_API_TOKEN="your-api-key" \
  --from-literal=VLLM_INFERENCE_MODEL="your-model" \
  -n llama-stack

# Create Jira secrets
kubectl create secret generic jira-secrets \
  --from-literal=JIRA_URL="https://your-company.atlassian.net" \
  --from-literal=JIRA_PERSONAL_TOKEN="your-token" \
  -n llama-stack

# Create database secrets
kubectl create secret generic database-secrets \
  --from-literal=POSTGRES_DB="rhoai_sessions" \
  --from-literal=POSTGRES_USER="rhoai_user" \
  --from-literal=POSTGRES_PASSWORD="your-secure-password" \
  --from-literal=DATABASE_URL="postgresql://rhoai_user:your-secure-password@postgresql-service.llama-stack.svc.cluster.local:5432/rhoai_sessions" \
  -n llama-stack
```

### 4. Deploy Configuration

```bash
kubectl apply -f k8s-deployment.yaml
# OR: oc apply -f k8s-deployment.yaml
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
# Check pod status (use kubectl or oc)
kubectl get pods -n llama-stack

# Check logs
kubectl logs deployment/llama-stack -n llama-stack
kubectl logs deployment/jira-mcp -n llama-stack
kubectl logs deployment/rhoai-ai-feature-sizing -n llama-stack

# Check services
kubectl get services -n llama-stack
```

### Common Issues

1. **Pods not starting**: Check logs for credential or configuration issues
2. **Port forwarding fails**: Verify services are running and accessible
3. **Model not found**: Verify model names match your provider's available models
4. **API errors**: Check API keys and network connectivity
5. **Database connection issues**: Check PostgreSQL pod status and credentials

### Port Forward for Development

Access all services via port forwarding (no external routes needed):

```bash
# Main Application (Frontend + API)
kubectl port-forward svc/rhoai-ai-feature-sizing-service 8080:80 -n llama-stack

# LLAMA Stack (Direct Access)
kubectl port-forward svc/llama-stack-service 8321:8321 -n llama-stack

# PostgreSQL Database (For DB Tools)
kubectl port-forward svc/postgresql-service 5432:5432 -n llama-stack

# Jira MCP (Debugging only - normally accessed internally)
kubectl port-forward svc/jira-mcp-service 9000:9000 -n llama-stack
```

## 🔄 Switching Providers

To switch to a different provider:

1. Delete the current deployment:
   ```bash
   kubectl delete all -l app=llama-stack -n llama-stack
   kubectl delete secrets llama-stack-secrets* -n llama-stack
   ```

2. Deploy with new provider:
   ```bash
   ./deploy-to-k8s.sh
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
kubectl get pods -n llama-stack -l app=postgresql

# View PostgreSQL logs
kubectl logs -n llama-stack deployment/postgresql

# Test database connectivity from API pod
kubectl exec -n llama-stack deployment/rhoai-ai-feature-sizing -- python -c "
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
# Check API health via port forwarding
kubectl port-forward svc/rhoai-ai-feature-sizing-service 8080:80 -n llama-stack &
sleep 2
curl http://localhost:8080/health
kill %1  # Stop port forwarding
```

### Scaling Issues
```bash
# Scale API pods (PostgreSQL supports multiple connections)
kubectl scale deployment/rhoai-ai-feature-sizing --replicas=3 -n llama-stack

# Check all pods are ready
kubectl get pods -n llama-stack -l app=rhoai-ai-feature-sizing
```

## 🐛 Getting Help

- Check the [LLAMA Stack documentation](https://llama-stack.readthedocs.io/)
- Review Kubernetes/OpenShift logs and events
- Open issues in the project repository
- Consult Kubernetes or OpenShift documentation for cluster-specific issues

## 🎯 Port Forwarding Development Workflow

**This deployment is optimized for development access via port forwarding:**

1. **Deploy once**: `./deploy-to-k8s.sh` 
2. **Port forward main app**: `kubectl port-forward svc/rhoai-ai-feature-sizing-service 8080:80 -n llama-stack`
3. **Access locally**: `http://localhost:8080`
4. **No external routes needed** - perfect for development and testing!

**Benefits:**
- ✅ Works on any Kubernetes cluster (no Ingress Controller required)
- ✅ No DNS or TLS certificate setup needed
- ✅ Easy to switch between environments
- ✅ Secure (no external exposure by default) 