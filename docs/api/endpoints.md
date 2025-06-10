# API Endpoints

This document describes the REST API endpoints available in the RHOAI AI Feature Sizing system. The API is built on top of [Llama Stack](https://llama-stack.readthedocs.io/en/latest/) and provides both direct and wrapped endpoints for feature estimation.

## 🌐 Base URL

**Development**: `http://localhost:8321`  
**Production**: `https://your-domain.com/api`

## 🔐 Authentication

See [Authentication Documentation](./authentication.md) for details on API authentication methods.

## 📋 API Endpoints

### Feature Management

#### `POST /api/features/refine`

Refine a raw feature description into a detailed specification.

**Request Body:**
```json
{
  "description": "Add user authentication to the mobile app",
  "context": {
    "project_type": "mobile_app",
    "technology_stack": ["React Native", "Node.js"],
    "team_size": 5
  },
  "options": {
    "detail_level": "high",
    "include_acceptance_criteria": true,
    "include_technical_requirements": true
  }
}
```

**Response:**
```json
{
  "id": "feat_123456",
  "status": "success",
  "original_description": "Add user authentication to the mobile app",
  "refined_feature": {
    "title": "Mobile App User Authentication System",
    "description": "Implement comprehensive user authentication system for mobile application with OAuth2 integration, session management, and security features.",
    "acceptance_criteria": [
      "Users can register with email and password",
      "Users can log in with Google OAuth2",
      "Users can log in with Facebook OAuth2",
      "Session tokens expire after 30 days of inactivity",
      "Failed login attempts are rate-limited",
      "Password reset functionality via email"
    ],
    "technical_requirements": [
      "OAuth2 client configuration for Google and Facebook",
      "JWT token generation and validation",
      "Secure password hashing with bcrypt",
      "Session storage and management",
      "Rate limiting middleware",
      "Email service integration for password reset"
    ],
    "dependencies": [
      "User management database schema",
      "Email service provider setup",
      "OAuth provider app registration"
    ],
    "estimated_complexity": "medium-high"
  },
  "processing_time": 3.2,
  "model_used": "llama3.2:3b"
}
```

**Status Codes:**
- `200 OK`: Feature successfully refined
- `400 Bad Request`: Invalid input data
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Processing error

---

#### `POST /api/features/estimate`

Estimate the development effort for a feature.

**Request Body:**
```json
{
  "feature": {
    "title": "Mobile App User Authentication System",
    "description": "Implement comprehensive user authentication...",
    "acceptance_criteria": [...],
    "technical_requirements": [...]
  },
  "estimation_context": {
    "team_velocity": 25,
    "team_experience": "intermediate",
    "project_deadline": "2024-06-01",
    "complexity_factors": ["security", "integration", "mobile"]
  },
  "options": {
    "estimation_method": "story_points",
    "confidence_level": "medium",
    "include_risk_analysis": true
  }
}
```

**Response:**
```json
{
  "id": "est_789012",
  "status": "success",
  "estimation": {
    "story_points": 8,
    "confidence": 82,
    "estimated_hours": {
      "min": 28,
      "max": 40,
      "expected": 32
    },
    "complexity_breakdown": {
      "technical": "medium",
      "business": "low",
      "integration": "high"
    },
    "risk_factors": [
      {
        "factor": "OAuth provider API changes",
        "impact": "medium",
        "probability": "low",
        "mitigation": "Use well-established OAuth libraries"
      },
      {
        "factor": "Mobile platform differences",
        "impact": "high",
        "probability": "medium",
        "mitigation": "Comprehensive cross-platform testing"
      }
    ],
    "recommendations": [
      "Start with Google OAuth2 implementation as it's most stable",
      "Plan for extensive security testing",
      "Consider implementing progressive rollout"
    ]
  },
  "processing_time": 2.8,
  "model_used": "llama3.2:3b"
}
```

---

#### `POST /api/features/complete-workflow`

Run the complete feature sizing workflow from description to JIRA ticket.

**Request Body:**
```json
{
  "description": "Add user authentication to the mobile app",
  "context": {
    "project_type": "mobile_app",
    "technology_stack": ["React Native", "Node.js"],
    "team_size": 5
  },
  "jira_config": {
    "project_key": "PROJ",
    "issue_type": "Story",
    "assignee": "john.doe@example.com",
    "components": ["Mobile", "Authentication"]
  },
  "options": {
    "create_jira_ticket": true,
    "send_notifications": false
  }
}
```

**Response:**
```json
{
  "id": "workflow_345678",
  "status": "success",
  "refined_feature": { /* Feature refinement results */ },
  "estimation": { /* Estimation results */ },
  "jira_ticket": {
    "id": "PROJ-1234",
    "key": "PROJ-1234",
    "url": "https://your-domain.atlassian.net/browse/PROJ-1234",
    "status": "created"
  },
  "processing_time": 8.5
}
```

---

### Batch Operations

#### `POST /api/features/batch-estimate`

Process multiple features in a single request.

**Request Body:**
```json
{
  "features": [
    {
      "id": "feat_1",
      "description": "Add user authentication"
    },
    {
      "id": "feat_2", 
      "description": "Implement payment gateway"
    },
    {
      "id": "feat_3",
      "description": "Create admin dashboard"
    }
  ],
  "context": {
    "project_type": "web_app",
    "team_velocity": 30
  },
  "options": {
    "parallel_processing": true,
    "include_summaries": true
  }
}
```

**Response:**
```json
{
  "id": "batch_901234",
  "status": "success",
  "results": [
    {
      "feature_id": "feat_1",
      "status": "success",
      "refined_feature": { /* ... */ },
      "estimation": { /* ... */ }
    },
    {
      "feature_id": "feat_2",
      "status": "success", 
      "refined_feature": { /* ... */ },
      "estimation": { /* ... */ }
    },
    {
      "feature_id": "feat_3",
      "status": "failed",
      "error": "Feature description too vague for estimation"
    }
  ],
  "summary": {
    "total_features": 3,
    "successful": 2,
    "failed": 1,
    "total_story_points": 15,
    "average_confidence": 78,
    "total_estimated_hours": {
      "min": 50,
      "max": 85,
      "expected": 65
    }
  },
  "processing_time": 12.3
}
```

---

### JIRA Integration

#### `POST /api/jira/create-ticket`

Create a JIRA ticket from feature estimation results.

**Request Body:**
```json
{
  "feature_estimation": {
    "refined_feature": { /* Feature data */ },
    "estimation": { /* Estimation data */ }
  },
  "jira_config": {
    "project_key": "PROJ",
    "issue_type": "Story",
    "priority": "Medium",
    "assignee": "john.doe@example.com",
    "components": ["Backend", "API"],
    "labels": ["ai-estimated", "sprint-planning"],
    "custom_fields": {
      "story_points": 8,
      "confidence_level": 82
    }
  },
  "template_options": {
    "include_acceptance_criteria": true,
    "include_technical_requirements": true,
    "include_risk_factors": true,
    "format": "detailed"
  }
}
```

**Response:**
```json
{
  "status": "success",
  "jira_ticket": {
    "id": "10123",
    "key": "PROJ-1234",
    "url": "https://your-domain.atlassian.net/browse/PROJ-1234",
    "fields": {
      "summary": "Mobile App User Authentication System",
      "description": "# Feature Description\n\nImplement comprehensive user authentication...",
      "story_points": 8,
      "assignee": {
        "name": "john.doe@example.com",
        "displayName": "John Doe"
      },
      "status": "To Do",
      "created": "2024-01-15T10:30:00.000Z"
    }
  },
  "template_used": "feature_story_template",
  "processing_time": 1.2
}
```

---

### System Management

#### `GET /api/health`

Check system health and status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "services": {
    "llama_stack": {
      "status": "running",
      "url": "http://localhost:8321",
      "model": "llama3.2:3b",
      "response_time": 150
    },
    "jira": {
      "status": "connected",
      "base_url": "https://your-domain.atlassian.net",
      "response_time": 200
    },
    "database": {
      "status": "connected",
      "response_time": 5
    }
  },
  "performance": {
    "avg_response_time": 2.3,
    "requests_per_minute": 45,
    "active_sessions": 3
  }
}
```

---

#### `GET /api/models`

List available AI models and their capabilities.

**Response:**
```json
{
  "models": [
    {
      "id": "llama3.2:3b",
      "name": "Llama 3.2 3B",
      "type": "llm",
      "status": "available",
      "capabilities": ["text_generation", "reasoning"],
      "performance": {
        "speed": "fast",
        "quality": "good",
        "memory_usage": "low"
      },
      "recommended_for": ["development", "quick_estimates"]
    },
    {
      "id": "llama3.1:8b",
      "name": "Llama 3.1 8B", 
      "type": "llm",
      "status": "available",
      "capabilities": ["text_generation", "reasoning", "analysis"],
      "performance": {
        "speed": "medium",
        "quality": "high",
        "memory_usage": "medium"
      },
      "recommended_for": ["production", "detailed_analysis"]
    }
  ],
  "current_model": "llama3.2:3b",
  "embedding_models": [
    {
      "id": "sentence-transformers/all-MiniLM-L6-v2",
      "name": "All MiniLM L6 v2",
      "dimensions": 384,
      "status": "available"
    }
  ]
}
```

---

### Configuration

#### `GET /api/config`

Get current system configuration.

**Response:**
```json
{
  "estimation": {
    "default_confidence_threshold": 80,
    "max_story_points": 13,
    "complexity_factors": ["technical", "business", "integration"],
    "estimation_methods": ["story_points", "hours", "t_shirt_sizes"]
  },
  "jira": {
    "base_url": "https://your-domain.atlassian.net",
    "default_project": "PROJ",
    "default_issue_type": "Story",
    "custom_fields": {
      "story_points": "customfield_10106",
      "confidence_level": "customfield_10107"
    }
  },
  "llama_stack": {
    "base_url": "http://localhost:8321",
    "default_model": "llama3.2:3b",
    "timeout": 30,
    "max_retries": 3
  },
  "rate_limits": {
    "requests_per_minute": 60,
    "batch_size_limit": 10,
    "concurrent_requests": 5
  }
}
```

---

#### `PUT /api/config`

Update system configuration.

**Request Body:**
```json
{
  "estimation": {
    "default_confidence_threshold": 85,
    "max_story_points": 21
  },
  "jira": {
    "default_project": "NEWPROJ"
  }
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Configuration updated successfully",
  "updated_fields": ["estimation.default_confidence_threshold", "estimation.max_story_points", "jira.default_project"],
  "restart_required": false
}
```

---

## 🔄 Async Operations

For long-running operations, the API supports asynchronous processing:

#### `POST /api/features/estimate-async`

Start an asynchronous estimation job.

**Response:**
```json
{
  "job_id": "job_567890",
  "status": "started",
  "estimated_completion": "2024-01-15T10:35:00.000Z",
  "status_url": "/api/jobs/job_567890"
}
```

#### `GET /api/jobs/{job_id}`

Check the status of an asynchronous job.

**Response:**
```json
{
  "job_id": "job_567890",
  "status": "completed",
  "progress": 100,
  "started_at": "2024-01-15T10:30:00.000Z",
  "completed_at": "2024-01-15T10:34:30.000Z",
  "result": { /* Estimation results */ }
}
```

## 📊 Error Handling

### Error Response Format

```json
{
  "error": {
    "code": "INVALID_FEATURE_DESCRIPTION",
    "message": "Feature description is too vague for accurate estimation",
    "details": {
      "field": "description",
      "minimum_length": 20,
      "provided_length": 8
    },
    "suggestions": [
      "Provide more specific technical details",
      "Include acceptance criteria", 
      "Specify integration requirements"
    ]
  },
  "request_id": "req_123456",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Common Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `INVALID_INPUT` | Request validation failed | 400 |
| `FEATURE_TOO_VAGUE` | Feature description insufficient | 400 |
| `MODEL_UNAVAILABLE` | AI model not accessible | 503 |
| `RATE_LIMIT_EXCEEDED` | Too many requests | 429 |
| `JIRA_CONNECTION_FAILED` | JIRA integration error | 502 |
| `ESTIMATION_TIMEOUT` | Processing took too long | 504 |
| `AUTHENTICATION_REQUIRED` | Missing or invalid auth | 401 |
| `INSUFFICIENT_PERMISSIONS` | Access denied | 403 |

## 📚 SDK Examples

### Python SDK

```python
from rhoai_feature_sizing import FeatureSizingClient

# Initialize client
client = FeatureSizingClient(
    base_url="http://localhost:8321",
    api_key="your-api-key"
)

# Refine a feature
refined = client.refine_feature(
    "Add user authentication to mobile app",
    context={"project_type": "mobile_app"}
)

# Get estimation
estimate = client.estimate_feature(refined.feature)

# Create JIRA ticket
ticket = client.create_jira_ticket(
    refined.feature,
    estimate,
    project_key="PROJ"
)
```

### JavaScript/Node.js SDK

```javascript
const { FeatureSizingClient } = require('@rhoai/feature-sizing');

const client = new FeatureSizingClient({
  baseUrl: 'http://localhost:8321',
  apiKey: 'your-api-key'
});

// Complete workflow
const result = await client.completeWorkflow({
  description: 'Add user authentication to mobile app',
  context: { projectType: 'mobile_app' },
  jiraConfig: { projectKey: 'PROJ' }
});

console.log('JIRA ticket created:', result.jiraTicket.url);
```

---

## 🔗 Related Documentation

- [Authentication Guide](./authentication.md) - API authentication methods
- [Getting Started](../user-guide/getting-started.md) - Basic usage examples
- [Llama Stack API Reference](https://llama-stack.readthedocs.io/en/latest/references/api_reference.html) - Underlying API documentation

*For more examples and advanced usage patterns, see our [GitHub repository examples](https://github.com/your-repo/examples).*