# vTeam Ambient Agentic Runner - OpenShift Deployment

This guide covers building all vTeam images and deploying the complete platform to OpenShift.

## 🏗️ Building Images

### Prerequisites
- **Podman** (or Docker) on Linux VM
- Access to **quay.io/sallyom** registry
- **Git** repository cloned

### Build All Images

From your Linux VM, build each component from its directory:

```bash
# Navigate to components directory
cd /path/to/vTeam/components

# Backend API (Go service)
cd backend
podman build -t quay.io/sallyom/vteam:backend .

# Frontend (NextJS)
cd ../frontend
podman build -t quay.io/sallyom/vteam:frontend .

# Operator (Kubernetes operator)
cd ../operator
podman build -t quay.io/sallyom/vteam:operator .

# Claude Runner (Python AI service)
cd ../runners/claude-code-runner
podman build -t quay.io/sallyom/vteam:claude-runner .
```

### Push Images to Registry

```bash
# Login to registry
podman login quay.io

# Push all images
podman push quay.io/sallyom/vteam:backend
podman push quay.io/sallyom/vteam:frontend
podman push quay.io/sallyom/vteam:operator
podman push quay.io/sallyom/vteam:claude-runner
```

## 🚀 OpenShift Deployment

### Prerequisites
- **OpenShift CLI (oc)** installed
- **Kustomize** installed
- Logged into OpenShift cluster: `oc login`
- **Anthropic API key**

### Deploy to OpenShift

```bash
# Navigate to manifests directory
cd /path/to/vTeam/components/manifests

# Create environment file
cp env.example .env
# Edit .env and add: ANTHROPIC_API_KEY=your-actual-key-here

# Deploy with defaults (sallyom-vteam namespace)
./deploy.sh

# OR deploy to custom namespace
NAMESPACE=my-namespace ./deploy.sh
```

### Alternative: Direct Kustomize Deployment

```bash
# Deploy with kustomize directly
kustomize build . | oc apply -f -

# Deploy to custom namespace
kustomize edit set namespace my-namespace
kustomize build . | oc apply -f -

# Change images if needed
kustomize edit set image quay.io/ambient_code/vteam_backend=quay.io/sallyom/vteam:backend
```

## 🏗️ Architecture Overview

The vTeam platform consists of 4 main components using **RWO (ReadWriteOnce) storage** for maximum compatibility:

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Frontend** | NextJS + Shadcn | Web UI for creating agentic sessions |
| **Backend API** | Go + Gin | REST API + File Storage (Single Writer) - RWO PVC |
| **Operator** | Go + Kubernetes | Watches CRs and creates Jobs |
| **Claude Runner** | Python + Claude Code + Playwright | Executes AI analysis, sends data via API |

## 🔄 Workflow

1. **User** creates agentic session via **Frontend**
2. **Frontend** calls **Backend API**
3. **Backend API** creates **AgenticSession Custom Resource**
4. **Operator** watches CR and creates **Job** with **Claude Runner** pod
5. **Claude Runner** executes AI analysis with browser tools
6. **Claude Runner** sends results to **Backend API** for file storage (single writer)
7. **Backend API** writes to RWO PVC and updates CR status
8. **Frontend** displays results to user

### 🗄️ Storage Architecture Benefits

- **RWO Compatibility**: Works with any Kubernetes storage class (no RWX requirement)
- **Single Writer**: Only backend writes to PVC, eliminates conflicts
- **API-Driven**: Claude runners send data via REST API, no direct file access
- **Portable**: Deploys on any cluster (OpenShift, EKS, GKE, kind, etc.)

## 📋 Post-Deployment

### Access the Application

```bash
# Port forward to access frontend
oc port-forward svc/frontend-service 3000:3000 -n sallyom-vteam

# Open browser to: http://localhost:3000
```

### Monitor Deployment

```bash
# Check pod status
oc get pods -n sallyom-vteam

# Watch logs
oc logs -f deployment/backend-api -n sallyom-vteam
oc logs -f deployment/agentic-operator -n sallyom-vteam

# Check agentic sessions (custom resources)
oc get agenticsessions -n sallyom-vteam
```

### Create Test Agentic Session

1. Navigate to `http://localhost:3000`
2. Click "New Agentic Session"
3. Fill out:
   - **Prompt**: "Analyze the pricing page and summarize the plans"
   - **Website URL**: "https://example.com/pricing"
   - **Model**: "Ambient AI v1"
4. Submit and monitor progress

## 🔧 Troubleshooting

### Image Pull Errors
```bash
# Verify images exist in registry
podman pull quay.io/sallyom/vteam:backend
podman pull quay.io/sallyom/vteam:frontend
podman pull quay.io/sallyom/vteam:operator
podman pull quay.io/sallyom/vteam:claude-runner
```

### Pod Failures
```bash
# Check pod events
oc describe pod <pod-name> -n sallyom-vteam

# Check resource limits
oc top pods -n sallyom-vteam

# Check logs
oc logs <pod-name> -n sallyom-vteam
```

### API Key Issues
```bash
# Verify secret exists
oc get secret ambient-code-secrets -n sallyom-vteam -o yaml

# Update API key
oc patch secret ambient-code-secrets -n sallyom-vteam -p '{"stringData":{"anthropic-api-key":"your-new-key"}}'
```

## 🧹 Cleanup

```bash
# Delete entire deployment
kustomize build . | oc delete -f -

# Or delete namespace (removes everything)
oc delete namespace sallyom-vteam
```

## 📂 File Structure

```
components/
├── backend/               # Go API service
│   └── Dockerfile
├── frontend/              # NextJS web interface
│   └── Dockerfile
├── operator/              # Kubernetes operator
│   └── Dockerfile
├── runners/
│   └── claude-code-runner/    # Python AI service
│       ├── Dockerfile
│       ├── main.py
│       └── README.md      # This file
└── manifests/             # OpenShift deployment
    ├── deploy.sh          # Deployment script
    ├── kustomization.yaml # Kustomize configuration
    ├── namespace.yaml     # Namespace definition
    ├── crd.yaml           # Custom Resource Definition
    ├── rbac.yaml          # Role-based access control
    ├── secrets.yaml       # Secret templates
    ├── backend-deployment.yaml
    ├── frontend-deployment.yaml
    └── operator-deployment.yaml
```

## 🎯 Next Steps

1. **Build all 4 images** in your Linux VM
2. **Push to quay.io registry**
3. **Deploy using ./deploy.sh**
4. **Access frontend** via port-forward
5. **Create test agentic session**
6. **Monitor execution** in OpenShift console

The platform is now ready for AI-powered website analysis and automation!