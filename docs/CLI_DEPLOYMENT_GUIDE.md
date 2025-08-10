# 🚀 CLI Deployment Guide for OpenShift

This guide helps you deploy and use the CLI agent on OpenShift without dealing with frontend issues.

## 📋 Prerequisites

1. **OpenShift cluster** with your application deployed
2. **Llama Stack server** running and accessible
3. **MCP Atlassian server** configured for JIRA access
4. **Database** (PostgreSQL/SQLite) set up with required tables

## 🔧 Environment Setup

### Required Environment Variables
```bash
# Core model configuration
export INFERENCE_MODEL="meta-llama/Llama-3.2-3B-Instruct"
export LLAMA_STACK_URL="http://llama-stack-service:11434"

# MCP JIRA integration
export MCP_ATLASSIAN_URL="ws://mcp-atlassian-service:3001/mcp"
export CONFIGURE_TOOLGROUPS="true"

# Database configuration
export DATABASE_URL="postgresql://user:pass@postgres-service:5432/rhoai_db"
# OR for SQLite
export SQLITE_DB_PATH="/app/data/rhoai_sessions.db"

# Optional: JIRA configuration
export JIRA_PROJECTS_FILTER="RHOAIENG,RHOAI"
```

### OpenShift ConfigMap Example
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: rhoai-cli-config
data:
  INFERENCE_MODEL: "meta-llama/Llama-3.2-3B-Instruct"
  LLAMA_STACK_URL: "http://llama-stack-service:11434"
  MCP_ATLASSIAN_URL: "ws://mcp-atlassian-service:3001/mcp"
  CONFIGURE_TOOLGROUPS: "true"
  JIRA_PROJECTS_FILTER: "RHOAIENG,RHOAI"
```

## 🚀 Deployment Options

### Option 1: Pod with CLI Access
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: rhoai-cli-pod
spec:
  containers:
  - name: cli
    image: your-registry/rhoai-feature-sizing:latest
    command: ["/bin/bash"]
    args: ["-c", "sleep infinity"]  # Keep pod running
    envFrom:
    - configMapRef:
        name: rhoai-cli-config
    - secretRef:
        name: rhoai-secrets
    volumeMounts:
    - name: data
      mountPath: /app/data
  volumes:
  - name: data
    persistentVolumeClaim:
      claimName: rhoai-data-pvc
```

### Option 2: Job for One-time Planning
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: plan-feature-job
spec:
  template:
    spec:
      containers:
      - name: planner
        image: your-registry/rhoai-feature-sizing:latest
        command: ["python", "cli_agent.py"]
        args: ["plan", "RHOAIENG-12345", "--output-dir", "/app/outputs"]
        envFrom:
        - configMapRef:
            name: rhoai-cli-config
        - secretRef:
            name: rhoai-secrets
        volumeMounts:
        - name: outputs
          mountPath: /app/outputs
      volumes:
      - name: outputs
        persistentVolumeClaim:
          claimName: rhoai-outputs-pvc
      restartPolicy: Never
```

## 🎯 Usage in OpenShift

### 1. Access CLI Pod
```bash
# Get into the CLI pod
oc exec -it rhoai-cli-pod -- bash

# Run planning
python cli_agent.py plan RHOAIENG-12345
```

### 2. Run as Job
```bash
# Create job for specific JIRA
oc create job plan-rhoaieng-12345 --from=cronjob/feature-planner \
  --dry-run=client -o yaml | \
  sed 's/JIRA_KEY/RHOAIENG-12345/' | \
  oc apply -f -

# Check job logs
oc logs job/plan-rhoaieng-12345
```

### 3. Interactive Session
```bash
# Start interactive session
oc exec -it rhoai-cli-pod -- python cli_agent.py chat RHOAIENG-12345

# Or with specific session
oc exec -it rhoai-cli-pod -- python cli_agent.py chat RHOAIENG-12345 --session-id existing-session-uuid
```

## 📊 Monitoring & Debugging

### Check Service Health
```bash
# Test basic functionality
oc exec -it rhoai-cli-pod -- python cli_agent.py list-stores

# Check environment
oc exec -it rhoai-cli-pod -- env | grep -E "(INFERENCE_MODEL|LLAMA_STACK|MCP)"
```

### View Logs
```bash
# CLI pod logs
oc logs rhoai-cli-pod

# Job logs
oc logs job/plan-feature-job

# Follow logs in real-time
oc logs -f rhoai-cli-pod
```

### Database Verification
```bash
# Check database connectivity (if using PostgreSQL)
oc exec -it rhoai-cli-pod -- python -c "
from src.rhoai_ai_feature_sizing.api.models import create_session_factory
try:
    session = create_session_factory()()
    print('✅ Database connection successful')
    session.close()
except Exception as e:
    print(f'❌ Database error: {e}')
"
```

## 🔧 Troubleshooting

### Common Issues

1. **"INFERENCE_MODEL not set"**
   ```bash
   oc set env pod/rhoai-cli-pod INFERENCE_MODEL=meta-llama/Llama-3.2-3B-Instruct
   ```

2. **"Failed to initialize services"**
   - Check Llama Stack server connectivity
   - Verify MCP Atlassian server is running
   - Ensure database is accessible

3. **"Import error"**
   - Verify the container image includes all dependencies
   - Check Python path configuration

4. **Agent timeout/no response**
   - Increase `--max-turns` parameter
   - Check Llama Stack server logs
   - Verify model is loaded and responding

### Debug Commands
```bash
# Test Llama Stack connectivity
oc exec -it rhoai-cli-pod -- curl -f http://llama-stack-service:11434/health

# Test MCP server
oc exec -it rhoai-cli-pod -- curl -f http://mcp-atlassian-service:3001/health

# Check database tables
oc exec -it rhoai-cli-pod -- python -c "
from src.rhoai_ai_feature_sizing.api.models import init_database
init_database()
print('Database initialized')
"
```

## 📁 File Outputs

### Persistent Storage
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: rhoai-outputs-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
```

### Accessing Output Files
```bash
# Save to persistent volume
oc exec -it rhoai-cli-pod -- python cli_agent.py plan RHOAIENG-12345 --output-dir /app/outputs

# Copy files from pod to local
oc cp rhoai-cli-pod:/app/outputs ./local-outputs

# List generated files
oc exec -it rhoai-cli-pod -- ls -la /app/outputs
```

## 🔄 Automation Examples

### CronJob for Regular Planning
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: weekly-feature-review
spec:
  schedule: "0 9 * * 1"  # Monday 9 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: reviewer
            image: your-registry/rhoai-feature-sizing:latest
            command: ["bash", "-c"]
            args:
            - |
              # Get recent JIRA issues and plan them
              python cli_agent.py plan RHOAIENG-12345 --output-dir /app/outputs
              python cli_agent.py plan RHOAIENG-12346 --output-dir /app/outputs
            envFrom:
            - configMapRef:
                name: rhoai-cli-config
          restartPolicy: OnFailure
```

### Webhook Integration
```bash
# Script to trigger planning from webhook
#!/bin/bash
JIRA_KEY=$1
oc create job plan-${JIRA_KEY,,} --from=cronjob/feature-planner \
  --dry-run=client -o yaml | \
  sed "s/JIRA_KEY/${JIRA_KEY}/" | \
  oc apply -f -
```

## 📈 Performance Tuning

### Resource Limits
```yaml
resources:
  requests:
    memory: "1Gi"
    cpu: "500m"
  limits:
    memory: "4Gi"
    cpu: "2000m"
```

### Optimization Tips
- Use `--no-validation` for faster execution
- Limit `--max-turns` for time-bounded execution
- Specify targeted `--rag-stores` for better performance
- Use persistent volumes for database and outputs

---

**Ready to deploy! 🚀**

For questions or issues, check the logs and use the troubleshooting section above.
