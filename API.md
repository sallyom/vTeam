# RHOAI AI Feature Sizing API

This FastAPI-based service provides a web API for the RHOAI AI Feature Sizing tool, allowing you to process Jira issues through multiple AI-powered stages with session management and progress tracking.

## Features

- **Session Management**: Create and track long-running processing sessions
- **Progress Tracking**: Real-time progress updates via polling endpoints
- **Chat History**: All agent communications are stored as messages
- **Output Storage**: Generated markdown files are stored in the database
- **MCP Usage Tracking**: Monitor MCP tool usage for analytics
- **Health Checks**: Monitor service and dependency status

## Quick Start

### Local Development

1. **Install dependencies**:
   ```bash
   # Using uv (recommended)
   uv pip install -e .
   
   # Or sync from lock file
   uv sync
   ```

2. **Set environment variables**:
   
   **Option A: Use your deployed cluster (recommended)**
   ```bash
   # Get your cluster's Llama Stack URL
   CLUSTER_LLAMA_STACK=$(oc get route llama-stack-route -n llama-stack -o jsonpath='{.spec.host}')
   
   # Create simple .env file
   cat > .env << EOF
   LLAMA_STACK_URL=https://$CLUSTER_LLAMA_STACK
   PORT=8000
   LOG_LEVEL=INFO
   SQLITE_DB_PATH=./data/rhoai_sessions.db
   EOF
   ```
   
   **Option B: Full local setup**
   ```bash
   # RHOAI AI Feature Sizing API - Environment Configuration
   
   # Llama Stack service URL (where your Llama Stack is running)
   LLAMA_STACK_URL=http://localhost:8321
   
   # VLLM inference service URL (your actual LLM endpoint)
   VLLM_URL=https://your-vllm-endpoint.example.com/v1
   
   # VLLM API token (if required by your endpoint)
   VLLM_API_TOKEN=your-api-token-here
   
   # Model name for inference (e.g., "llama-3.1-70b-instruct", "mistral-7b")
   VLLM_INFERENCE_MODEL=llama-3.1-70b-instruct
   INFERENCE_MODEL=llama-3.1-70b-instruct
   
   # API server configuration
   HOST=0.0.0.0
   PORT=8000
   LOG_LEVEL=INFO
   
   # Database (SQLite for development)
   SQLITE_DB_PATH=./data/rhoai_sessions.db
   
   # Optional - Jira/MCP Configuration (for hard mode)
   # JIRA_URL=https://your-company.atlassian.net
   # JIRA_USERNAME=your-email@company.com
   # JIRA_API_TOKEN=your-jira-api-token
   # MCP_ATLASSIAN_URL=http://localhost:9000/sse
   ```
   
   **Simple setup using your deployed cluster:**
   ```bash
   # Just point to your OpenShift Llama Stack - that's it!
   
   # Get your cluster's Llama Stack URL
   LLAMA_STACK_URL=https://$(oc get route llama-stack-route -n llama-stack -o jsonpath='{.spec.host}')
   
   # API config
   PORT=8000
   LOG_LEVEL=INFO
   
   # Database (local SQLite for development)
   SQLITE_DB_PATH=./data/rhoai_sessions.db
   ```
   
   **Alternative endpoint examples (if not using cluster):**
   ```bash
   # Local Ollama
   LLAMA_STACK_URL=http://localhost:8321
   VLLM_URL=http://localhost:11434/v1
   VLLM_INFERENCE_MODEL=llama3.1:8b
   
   # OpenAI
   LLAMA_STACK_URL=http://localhost:8321  
   VLLM_URL=https://api.openai.com/v1
   VLLM_API_TOKEN=sk-your-openai-api-key
   VLLM_INFERENCE_MODEL=gpt-4o-mini
   ```

3. **Run the API server**:
   ```bash
   # Method 1: Using uv with .env file (recommended)
   uv run --env-file .env python -m rhoai_ai_feature_sizing.run_api
   
   # Method 2: Using uv with auto-reload for development
   uv run --env-file .env uvicorn rhoai_ai_feature_sizing.api.main:app --reload --host 0.0.0.0 --port 8000
   
   # Method 3: Export variables and run
   export $(cat .env | xargs) && python -m rhoai_ai_feature_sizing.run_api
   
   # Method 4: Direct uvicorn
   uv run uvicorn rhoai_ai_feature_sizing.api.main:app --host 0.0.0.0 --port 8000
   ```

4. **Access the API**:
   - API: http://localhost:8000
   - Interactive docs: http://localhost:8000/docs
   - OpenAPI spec: http://localhost:8000/openapi.json

### OpenShift Deployment

The API is included in the OpenShift deployment. After deploying:

```bash
# Deploy all services
./deploy-to-openshift.sh

# Get the API route URL
oc get route rhoai-ai-feature-sizing-api-route -n llama-stack -o jsonpath='{.spec.host}'
```

## 🔧 Development Tips

### **Quick Development Workflow (using your cluster)**

```bash
# 1. Install dependencies with uv
uv pip install -e .

# 2. Get your cluster's Llama Stack URL
CLUSTER_LLAMA_STACK=$(oc get route llama-stack-route -n llama-stack -o jsonpath='{.spec.host}')
echo "Llama Stack URL: https://$CLUSTER_LLAMA_STACK"

# 3. Create simple .env file
cat > .env << EOF
LLAMA_STACK_URL=https://$CLUSTER_LLAMA_STACK
PORT=8000
LOG_LEVEL=INFO
SQLITE_DB_PATH=./data/rhoai_sessions.db
EOF

# 4. Run with auto-reload for development
uv run --env-file .env uvicorn rhoai_ai_feature_sizing.api.main:app --reload --host 0.0.0.0 --port 8000

# 5. Test the API
python test_api.py --url http://localhost:8000 --jira-key YOUR-JIRA-KEY --wait
```

### **Alternative Run Methods**

```bash
# Production-like (no auto-reload)
uv run --env-file .env python -m rhoai_ai_feature_sizing.run_api

# Without .env file (export manually)
export LLAMA_STACK_URL=http://localhost:8321
export VLLM_URL=your-endpoint
export VLLM_INFERENCE_MODEL=your-model
uv run python -m rhoai_ai_feature_sizing.run_api

# Debug mode with verbose logging
LOG_LEVEL=DEBUG uv run --env-file .env python -m rhoai_ai_feature_sizing.run_api
```

### **Testing Commands**

```bash
# Quick health check
curl http://localhost:8000/healthz

# Full API test with real Jira issue
python test_api.py --url http://localhost:8000 --jira-key RHOAI-1234 --wait

# Just test basic endpoints (no processing)
python test_api.py --url http://localhost:8000 --jira-key TEST-123
```

### **Database Management**

```bash
# SQLite database location (default)
ls -la /tmp/rhoai_sessions.db

# Or custom location from .env
ls -la ./data/rhoai_sessions.db

# View database schema (if you have sqlite3 installed)
sqlite3 /tmp/rhoai_sessions.db ".schema"
```

## API Endpoints

### Health Check

```http
GET /healthz
```

Returns the health status of the API, database, and Llama Stack connections.

### Session Management

#### Create Session

```http
POST /sessions
Content-Type: application/json

{
  "jira_key": "PROJ-123",
  "soft_mode": true
}
```

Creates a new processing session and starts background processing.

#### List Sessions

```http
GET /sessions?page=1&page_size=20
```

Get paginated list of all sessions.

#### Get Session Details

```http
GET /sessions/{session_id}
```

Get complete session information including messages, outputs, and MCP usage.

#### Get Session Progress

```http
GET /sessions/{session_id}/progress
```

Get current progress status for polling. Returns:
- Current status (pending, running, completed, failed)
- Current stage (refine, epics, jiras, estimate)
- Progress percentage (0-100)
- Latest message
- Error information (if failed)

### Messages (Chat History)

```http
GET /sessions/{session_id}/messages?limit=50&stage=refine
```

Get chat messages for a session, optionally filtered by stage.

### Outputs (Generated Files)

```http
GET /sessions/{session_id}/outputs
GET /sessions/{session_id}/outputs/{stage}
```

Get generated markdown outputs, either all outputs or for a specific stage.

### MCP Usage Analytics

```http
GET /sessions/{session_id}/mcp-usage
```

Get MCP tool usage statistics for analytics.

### JIRA Metrics

```http
POST /jira/metrics
Content-Type: application/json

{
  "jira_key": "PROJ-123"
}
```

Get comprehensive metrics for a JIRA issue and all its children recursively. This endpoint:

- Recursively fetches the specified JIRA issue and all its children (subtasks, child issues, etc.)
- Only processes issues with resolution status "Done"
- Calculates story points and completion time metrics per component
- Returns aggregated totals across all components

**Response Example:**
```json
{
  "components": {
    "some-component": {
      "total_story_points": 45,
      "total_days_to_done": 120.5
    },
    "another-component": {
      "total_story_points": 23,
      "total_days_to_done": 85.2
    }
  },
  "total_story_points": 68,
  "total_days_to_done": 120.5,
  "processed_issues": 15,
  "done_issues": 12
}
```

**Key Metrics:**
- `total_story_points`: Sum of story points for all "Done" issues
- `total_days_to_done`: Days from earliest creation date to latest resolution date (only for "Done" issues)
- `processed_issues`: Total number of issues found recursively
- `done_issues`: Number of issues with "Done" resolution

## Processing Stages

The API processes Jira issues through four stages:

1. **Refine** (25% progress): Generate detailed feature specification
2. **Epics** (50% progress): Create epic breakdown (placeholder)
3. **Jiras** (75% progress): Draft Jira ticket structure
4. **Estimate** (90% progress): Generate estimates (placeholder)

## Soft Mode vs Hard Mode

- **Soft Mode** (default): Generate ticket structure without creating actual Jira tickets
- **Hard Mode**: Create actual Jira tickets using MCP tools

## Usage Examples

### JavaScript/TypeScript

```javascript
// Create a session
const response = await fetch('/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jira_key: 'PROJ-123',
    soft_mode: true
  })
});
const session = await response.json();

// Poll for progress
const pollProgress = async (sessionId) => {
  const response = await fetch(`/sessions/${sessionId}/progress`);
  const progress = await response.json();
  console.log(`Progress: ${progress.progress_percentage}%`);
  
  if (progress.status === 'running') {
    setTimeout(() => pollProgress(sessionId), 2000);
  }
};

pollProgress(session.id);

// Get messages for chat display
const messagesResponse = await fetch(`/sessions/${session.id}/messages`);
const messages = await messagesResponse.json();

// Get outputs for markdown display
const outputsResponse = await fetch(`/sessions/${session.id}/outputs`);
const outputs = await outputsResponse.json();
```

### Python

```python
import requests
import time

# Create session
response = requests.post('/sessions', json={
    'jira_key': 'PROJ-123',
    'soft_mode': True
})
session = response.json()

# Poll for completion
while True:
    progress = requests.get(f'/sessions/{session["id"]}/progress').json()
    print(f"Progress: {progress['progress_percentage']}%")
    
    if progress['status'] in ['completed', 'failed']:
        break
    
    time.sleep(2)

# Get results
outputs = requests.get(f'/sessions/{session["id"]}/outputs').json()
for output in outputs:
    print(f"Stage {output['stage']}: {output['filename']}")
    print(output['content'][:200] + "...")
```

### cURL

```bash
# Create session
curl -X POST http://localhost:8000/sessions \
  -H "Content-Type: application/json" \
  -d '{"jira_key": "PROJ-123", "soft_mode": true}'

# Check progress
curl http://localhost:8000/sessions/{session_id}/progress

# Get messages
curl http://localhost:8000/sessions/{session_id}/messages

# Get outputs
curl http://localhost:8000/sessions/{session_id}/outputs
```

## Database

The API uses SQLAlchemy with support for:
- **Development**: SQLite (default)
- **Production**: PostgreSQL (via DATABASE_URL environment variable)

### Environment Variables

- `DATABASE_URL`: PostgreSQL connection string (optional, defaults to SQLite)
- `SQLITE_DB_PATH`: SQLite database file path (default: `/tmp/rhoai_sessions.db`)
- `LLAMA_STACK_URL`: Llama Stack service URL
- `VLLM_URL`: VLLM inference service URL
- `VLLM_INFERENCE_MODEL`: Model name for inference
- `INFERENCE_MODEL`: Alias for VLLM_INFERENCE_MODEL
- `PORT`: API server port (default: 8000)
- `HOST`: API server host (default: 0.0.0.0)
- `LOG_LEVEL`: Logging level (default: INFO)

## Error Handling

The API provides comprehensive error handling:
- 404: Session not found
- 500: Internal server errors with detailed messages
- 503: Service not initialized

All errors include descriptive messages to help with debugging.

## Future Enhancements

- WebSocket support for real-time updates
- Session resumption and stage selection
- Advanced filtering and search
- Metrics and monitoring endpoints
- Authentication and authorization
- File upload/download endpoints 