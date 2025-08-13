# API Reference

Comprehensive REST API documentation for the RHOAI AI Feature Sizing system. This API provides programmatic access to all system capabilities including session management, RAG operations, and real-time chat functionality.

## 🌐 Base Information

- **Base URL**: `http://localhost:8001` (development) or your deployed endpoint
- **API Version**: `2.0.0`
- **Content Type**: `application/json`
- **Interactive Documentation**: `{BASE_URL}/docs` (Swagger UI)
- **OpenAPI Specification**: `{BASE_URL}/openapi.json`

## 🔐 Authentication

Currently, the API does not require authentication. In production deployments, consider implementing:
- API key authentication
- OAuth 2.0 integration
- JWT tokens for session-based access

## 📋 Endpoints Overview

The API is organized into the following groups:

| Group | Base Path | Description |
|-------|-----------|-------------|
| **Health** | `/health` | System health and status |
| **Sessions** | `/sessions` | Feature planning session management |
| **Chat** | `/sessions/{id}/chat` | Interactive chat with AI agent |
| **Content** | `/sessions/{id}/...` | Access refinement docs and JIRA structures |
| **RAG Stores** | `/rag` | Retrieval-Augmented Generation management |
| **Utilities** | Various | Utility endpoints and system configuration |

## 🏥 Health Endpoints

### GET /health
Get system health status including service connectivity.

**Response**:
```json
{
  "status": "healthy|degraded",
  "services": {
    "unified_agent": "connected|error: message",
    "rag_service": "connected|error: message"
  }
}
```

### GET /healthz
Kubernetes-style health check (alias for `/health`).

## 👥 Session Management

### POST /sessions
Create a new feature planning session.

**Request Body**:
```json
{
  "jira_key": "RHOAIENG-12345",
  "rag_store_ids": ["rhoai_docs", "patternfly_docs"],
  "existing_refinement": "Optional existing content..."
}
```

**Response**:
```json
{
  "id": "session-uuid",
  "jira_key": "RHOAIENG-12345",
  "status": "pending|processing|ready|error",
  "rag_store_ids": ["rhoai_docs", "patternfly_docs"],
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z",
  "refinement_content": null,
  "jira_structure": null,
  "progress_message": "Processing feature with AI agent...",
  "error_message": null
}
```

### GET /sessions/{session_id}
Get detailed information about a specific session.

**Response**:
```json
{
  "id": "session-uuid",
  "jira_key": "RHOAIENG-12345",
  "status": "ready",
  "rag_store_ids": ["rhoai_docs"],
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:35:00Z",
  "refinement_content": "# Feature Refinement...",
  "jira_structure": {
    "epics": [...]
  },
  "progress_message": null,
  "error_message": null,
  "chat_history": [
    {
      "id": "msg-uuid",
      "role": "system",
      "content": "Starting feature processing...",
      "timestamp": "2024-01-15T10:30:05Z",
      "actions": []
    }
  ]
}
```

### GET /sessions/{session_id}/updates
Get real-time session updates (for polling-based UIs).

**Parameters**:
- `last_message_count` (query, optional): Number of messages previously received

**Response**:
```json
{
  "session": {
    "id": "session-uuid",
    "status": "processing",
    ...
  },
  "new_messages": [
    {
      "id": "msg-uuid",
      "role": "system",
      "content": "Generated refinement document",
      "timestamp": "2024-01-15T10:32:00Z"
    }
  ],
  "total_messages": 5,
  "has_updates": true
}
```

### DELETE /sessions/{session_id}
Delete a session and all associated data.

**Response**:
```json
{
  "message": "Session deleted successfully"
}
```

### GET /sessions
List all sessions with pagination.

**Parameters**:
- `page` (query, optional): Page number (default: 1)
- `page_size` (query, optional): Items per page (default: 20, max: 100)

**Response**:
```json
{
  "sessions": [
    {
      "id": "session-uuid",
      "jira_key": "RHOAIENG-12345",
      "status": "ready",
      ...
    }
  ],
  "total": 25,
  "page": 1,
  "page_size": 20
}
```

## 💬 Chat Interface

### POST /sessions/{session_id}/chat
Send a chat message to the AI agent and get a response.

**Request Body**:
```json
{
  "message": "Can you explain the implementation approach for this feature?"
}
```

**Response**:
```json
{
  "message_id": "user-msg-uuid",
  "agent_message_id": "agent-msg-uuid", 
  "agent_response": "The implementation approach involves...",
  "actions_taken": ["updated_refinement", "created_epic"],
  "updated_content": {
    "refinement": true,
    "jiras": false
  }
}
```

### GET /sessions/{session_id}/messages
Get chat history for a session.

**Parameters**:
- `limit` (query, optional): Maximum number of messages (default: 50)

**Response**:
```json
{
  "messages": [
    {
      "id": "msg-uuid",
      "role": "user|agent|system",
      "content": "Message content...",
      "timestamp": "2024-01-15T10:30:00Z",
      "actions": ["action1", "action2"]
    }
  ]
}
```

## 📄 Content Access

### GET /sessions/{session_id}/refinement
Get the refinement document for a session.

**Response**:
```json
{
  "content": "# Feature Refinement Document\n\n## Problem Statement...",
  "last_updated": "2024-01-15T10:35:00Z",
  "word_count": 1250
}
```

### GET /sessions/{session_id}/jiras
Get the JIRA structure (epics and stories) for a session.

**Response**:
```json
{
  "structure": {
    "epics": [
      {
        "title": "Enable Multi-tenancy in Model Registry",
        "component": "model-registry",
        "stories": [
          {
            "title": "Add tenant_id to models database schema",
            "description": "Update the database schema...",
            "acceptance_criteria": ["Schema updated", "Migration scripts created"],
            "story_points": 5,
            "estimated_hours": 20
          }
        ]
      }
    ]
  },
  "last_updated": "2024-01-15T10:35:00Z",
  "epic_count": 1,
  "story_count": 3
}
```

### GET /sessions/{session_id}/estimates
Get effort estimates for a session.

**Response**:
```json
{
  "estimates": {
    "total_story_points": 13,
    "total_hours": 52.0,
    "complexity_score": 0.7,
    "confidence_level": 0.8
  },
  "total_story_points": 13,
  "total_hours": 52.0,
  "last_updated": "2024-01-15T10:35:00Z"
}
```

## 🧠 RAG Store Management

### GET /rag/stores
List all available RAG stores.

**Response**:
```json
{
  "stores": [
    {
      "store_id": "rhoai_docs",
      "name": "RHOAI Documentation",
      "description": "Red Hat OpenShift AI documentation and guides",
      "document_count": 150,
      "created_at": "2024-01-10T09:00:00Z"
    }
  ],
  "total": 3
}
```

### POST /rag/stores
Create a new RAG store.

**Request Body**:
```json
{
  "store_id": "custom_docs",
  "name": "Custom Documentation",
  "description": "Company-specific documentation store"
}
```

**Response**:
```json
{
  "store_id": "custom_docs",
  "name": "Custom Documentation", 
  "message": "RAG store created successfully"
}
```

### POST /rag/ingest
Ingest documents into a RAG store using basic processing.

**Request Body**:
```json
{
  "store_id": "custom_docs",
  "documents": [
    {
      "name": "API Guide",
      "url": "https://example.com/docs/api.html",
      "mime_type": "text/html",
      "metadata": {
        "version": "1.0",
        "category": "api"
      }
    }
  ]
}
```

**Response**:
```json
{
  "store_id": "custom_docs",
  "documents_processed": 1,
  "chunks_created": 25,
  "message": "Documents ingested successfully"
}
```

### POST /rag/ingest/llamaindex
Ingest documents using advanced LlamaIndex processing.

**Request Body**: Same as `/rag/ingest`

**Response**:
```json
{
  "store_id": "custom_docs",
  "documents_processed": 1,
  "chunks_created": 25,
  "message": "Documents ingested successfully using LlamaIndex",
  "processing_method": "llamaindex"
}
```

**Supported Sources**:
- GitHub repositories: `https://github.com/owner/repo`
- Web pages: `https://example.com/page.html`
- Documentation sites with sitemaps
- PDF documents
- Markdown files

### POST /rag/query
Query RAG stores for relevant information.

**Request Body**:
```json
{
  "rag_store_ids": ["rhoai_docs", "patternfly_docs"],
  "query": "How to implement authentication in OpenShift AI?",
  "max_results": 5
}
```

**Response**:
```json
{
  "results": [
    {
      "content": "Authentication in OpenShift AI is implemented using...",
      "metadata": {
        "document_id": "doc-123",
        "score": 0.85,
        "source_url": "https://docs.redhat.com/auth.html"
      }
    }
  ],
  "total_found": 5,
  "stores_searched": ["rhoai_docs", "patternfly_docs"],
  "query_time_ms": 245
}
```

### DELETE /rag/stores/{store_id}
Delete a RAG store and all its documents.

**Response**:
```json
{
  "message": "RAG store deleted successfully"
}
```

## 🛠️ Utility Endpoints

### POST /rag/setup-predefined
Setup predefined RAG stores with default document sources.

**Response**:
```json
{
  "message": "Predefined RAG stores setup completed",
  "details": ["rhoai_docs", "github_repos"]
}
```

### GET /prompts
List available prompt templates.

**Response**:
```json
{
  "prompts": [
    "draft_jiras",
    "refine_feature", 
    "validate_jira_draft",
    "validate_refinement"
  ]
}
```

## 📊 Status Codes

| Code | Description |
|------|-------------|
| **200** | Success |
| **201** | Created |
| **400** | Bad Request - Invalid input |
| **404** | Not Found - Resource doesn't exist |
| **422** | Unprocessable Entity - Validation error |
| **500** | Internal Server Error |
| **503** | Service Unavailable - Dependencies not ready |

## 🚨 Error Response Format

All error responses follow this format:

```json
{
  "detail": "Error description",
  "error_code": "OPTIONAL_ERROR_CODE",
  "context": {
    "field": "additional context"
  }
}
```

**Common Error Scenarios**:

- **Session Not Found**: `404` when session ID doesn't exist
- **Invalid JIRA Key**: `422` when JIRA key format is invalid  
- **RAG Store Not Available**: `404` when specified RAG store doesn't exist
- **Service Unavailable**: `503` when Llama Stack or other services are down
- **Processing Error**: `500` when agent processing fails

## 🔄 Real-time Updates

The API supports polling-based real-time updates:

1. **Create Session**: `POST /sessions` returns session with `pending` status
2. **Poll for Updates**: `GET /sessions/{id}/updates?last_message_count=N`
3. **Check Status**: Monitor `status` field for completion (`ready` or `error`)
4. **Get Final Results**: Access refined content via content endpoints

**Recommended Polling**:
- **Active Sessions**: Every 2-3 seconds
- **Completed Sessions**: Stop polling
- **Error Sessions**: Stop polling, display error message

## 🏗️ Integration Examples

### JavaScript/TypeScript
```javascript
// Create session
const session = await fetch('/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jira_key: 'RHOAIENG-12345',
    rag_store_ids: ['rhoai_docs']
  })
}).then(r => r.json());

// Poll for updates
const pollUpdates = async (sessionId, lastCount = 0) => {
  const updates = await fetch(
    `/sessions/${sessionId}/updates?last_message_count=${lastCount}`
  ).then(r => r.json());
  
  if (updates.has_updates) {
    console.log('New messages:', updates.new_messages);
    return updates.total_messages;
  }
  return lastCount;
};
```

### Python
```python
import requests
import time

# Create session
response = requests.post('http://localhost:8001/sessions', json={
    'jira_key': 'RHOAIENG-12345',
    'rag_store_ids': ['rhoai_docs']
})
session = response.json()

# Poll until complete
while session['status'] in ['pending', 'processing']:
    time.sleep(3)
    response = requests.get(f"http://localhost:8001/sessions/{session['id']}")
    session = response.json()

print(f"Session complete: {session['status']}")
```

### curl Examples
```bash
# Create session
curl -X POST http://localhost:8001/sessions \
  -H "Content-Type: application/json" \
  -d '{"jira_key": "RHOAIENG-12345", "rag_store_ids": ["rhoai_docs"]}'

# Get session details  
curl http://localhost:8001/sessions/{session-id}

# Query RAG stores
curl -X POST http://localhost:8001/rag/query \
  -H "Content-Type: application/json" \
  -d '{"rag_store_ids": ["rhoai_docs"], "query": "authentication", "max_results": 3}'
```

## 🎯 Best Practices

1. **Error Handling**: Always check status codes and handle errors gracefully
2. **Polling Strategy**: Use exponential backoff for failed requests
3. **Resource Cleanup**: Delete sessions when no longer needed
4. **RAG Store Management**: Create focused stores for better retrieval accuracy
5. **Query Optimization**: Use specific queries for better RAG results
6. **Session Monitoring**: Monitor session status and handle error states
7. **Rate Limiting**: Implement client-side rate limiting for polling

## 🔗 Related Documentation

- [CLI Guide](CLI_GUIDE.md) - Command-line interface documentation
- [Architecture](ARCHITECTURE.md) - System architecture and design patterns
- [Deployment](DEPLOYMENT.md) - Production deployment guidelines
- [Getting Started](GETTING_STARTED.md) - Setup and configuration guide

---

**Need more help?** Check the interactive API documentation at `{BASE_URL}/docs` for live examples and testing capabilities.