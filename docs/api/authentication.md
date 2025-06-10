# API Authentication

This document describes the authentication methods available for the RHOAI AI Feature Sizing API, built on [Llama Stack](https://llama-stack.readthedocs.io/en/latest/).

## 🔐 Authentication Overview

The RHOAI AI Feature Sizing API supports multiple authentication methods to secure access to AI-powered feature estimation capabilities. Authentication is required for all API endpoints except health checks and public documentation.

## 🛡️ Authentication Methods

### 1. API Key Authentication (Recommended)

API Key authentication is the simplest and most commonly used method for programmatic access.

#### Setup

1. **Generate an API Key**:
   ```bash
   # Using the CLI
   python -m rhoai_feature_sizing generate-api-key --user "john.doe@example.com"
   
   # Or via API (requires admin access)
   curl -X POST http://localhost:8321/api/auth/keys \
     -H "Authorization: Bearer admin-token" \
     -H "Content-Type: application/json" \
     -d '{"name": "Development Key", "permissions": ["read", "write"]}'
   ```

2. **API Key Response**:
   ```json
   {
     "api_key": "rfs_key_1234567890abcdef",
     "name": "Development Key",
     "permissions": ["read", "write"],
     "created_at": "2024-01-15T10:30:00.000Z",
     "expires_at": "2025-01-15T10:30:00.000Z"
   }
   ```

#### Usage

Include the API key in the `Authorization` header:

```bash
curl -X POST http://localhost:8321/api/features/refine \
  -H "Authorization: Bearer rfs_key_1234567890abcdef" \
  -H "Content-Type: application/json" \
  -d '{"description": "Add user authentication"}'
```

**Python SDK:**
```python
from rhoai_feature_sizing import FeatureSizingClient

client = FeatureSizingClient(
    base_url="http://localhost:8321",
    api_key="rfs_key_1234567890abcdef"
)
```

**JavaScript SDK:**
```javascript
const client = new FeatureSizingClient({
  baseUrl: 'http://localhost:8321',
  apiKey: 'rfs_key_1234567890abcdef'
});
```

---

### 2. JWT Token Authentication

JWT tokens provide more sophisticated authentication with user context and expiration.

#### Setup

1. **Obtain JWT Token**:
   ```bash
   curl -X POST http://localhost:8321/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "username": "john.doe@example.com",
       "password": "your-password"
     }'
   ```

2. **JWT Response**:
   ```json
   {
     "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     "token_type": "Bearer",
     "expires_in": 3600,
     "user": {
       "id": "user_123",
       "email": "john.doe@example.com",
       "permissions": ["read", "write", "admin"]
     }
   }
   ```

#### Usage

Include the JWT token in the `Authorization` header:

```bash
curl -X POST http://localhost:8321/api/features/refine \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"description": "Add user authentication"}'
```

#### Token Refresh

```bash
curl -X POST http://localhost:8321/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}'
```

---

### 3. OAuth 2.0 Integration

For enterprise integrations, OAuth 2.0 provides secure, delegated access.

#### Supported Providers

- **Google Workspace**
- **Microsoft Azure AD**
- **GitHub Enterprise**
- **Custom OIDC providers**

#### OAuth Flow

1. **Authorization Request**:
   ```bash
   https://auth.your-domain.com/oauth/authorize?
     client_id=your-client-id&
     redirect_uri=https://your-app.com/callback&
     response_type=code&
     scope=feature-sizing.read feature-sizing.write&
     state=random-state-string
   ```

2. **Token Exchange**:
   ```bash
   curl -X POST https://auth.your-domain.com/oauth/token \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "client_id=your-client-id" \
     -d "client_secret=your-client-secret" \
     -d "code=authorization-code" \
     -d "grant_type=authorization_code"
   ```

3. **Using OAuth Token**:
   ```bash
   curl -X POST http://localhost:8321/api/features/refine \
     -H "Authorization: Bearer oauth-access-token" \
     -H "Content-Type: application/json" \
     -d '{"description": "Add user authentication"}'
   ```

---

### 4. Development Mode (Local Only)

For local development, you can disable authentication:

```bash
# Set environment variable
export RHOAI_AUTH_DISABLED=true

# Or in config.json
{
  "auth": {
    "enabled": false,
    "require_api_key": false
  }
}
```

**⚠️ Warning**: Never disable authentication in production environments.

---

## 🔑 API Key Management

### Creating API Keys

```bash
# Create a read-only key
python -m rhoai_feature_sizing create-api-key \
  --name "Analytics Dashboard" \
  --permissions read \
  --expires-in 90d

# Create a full-access key
python -m rhoai_feature_sizing create-api-key \
  --name "CI/CD Pipeline" \
  --permissions read,write \
  --expires-in 1y
```

### Listing API Keys

```bash
# List all keys for current user
curl -X GET http://localhost:8321/api/auth/keys \
  -H "Authorization: Bearer your-admin-token"
```

**Response:**
```json
{
  "api_keys": [
    {
      "id": "key_123",
      "name": "Development Key",
      "permissions": ["read", "write"],
      "created_at": "2024-01-15T10:30:00.000Z",
      "last_used": "2024-01-16T09:15:00.000Z",
      "expires_at": "2025-01-15T10:30:00.000Z",
      "status": "active"
    },
    {
      "id": "key_456",
      "name": "Analytics Dashboard",
      "permissions": ["read"],
      "created_at": "2024-01-10T14:20:00.000Z",
      "last_used": "2024-01-16T08:30:00.000Z",
      "expires_at": "2024-04-10T14:20:00.000Z",
      "status": "active"
    }
  ]
}
```

### Revoking API Keys

```bash
# Revoke a specific key
curl -X DELETE http://localhost:8321/api/auth/keys/key_123 \
  -H "Authorization: Bearer your-admin-token"

# Revoke all keys for a user
curl -X DELETE http://localhost:8321/api/auth/keys \
  -H "Authorization: Bearer your-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "user_123"}'
```

---

## 🔒 Permissions and Scopes

### Permission Levels

| Permission | Description | Allowed Operations |
|-----------|-------------|-------------------|
| `read` | Read-only access | Get configurations, health checks, model info |
| `write` | Read and write access | All read operations + feature estimation, refinement |
| `admin` | Full administrative access | All operations + user management, configuration |
| `jira` | JIRA integration access | Create and update JIRA tickets |
| `batch` | Batch processing access | Submit batch estimation jobs |

### Scope Examples

```json
{
  "scopes": [
    "features:read",
    "features:write", 
    "features:estimate",
    "jira:create",
    "jira:read",
    "models:read",
    "config:read"
  ]
}
```

### Permission Checking

API endpoints automatically check permissions:

```bash
# This will fail with 403 if user lacks 'write' permission
curl -X POST http://localhost:8321/api/features/refine \
  -H "Authorization: Bearer read-only-key" \
  -H "Content-Type: application/json" \
  -d '{"description": "Add user authentication"}'
```

**Error Response:**
```json
{
  "error": {
    "code": "INSUFFICIENT_PERMISSIONS",
    "message": "API key lacks required 'write' permission",
    "required_permissions": ["write"],
    "current_permissions": ["read"]
  }
}
```

---

## 🌐 Environment Configuration

### Development Environment

```bash
# .env file
RHOAI_AUTH_ENABLED=true
RHOAI_AUTH_METHOD=api_key
RHOAI_JWT_SECRET=dev-secret-key
RHOAI_API_KEY_EXPIRY=30d
RHOAI_REQUIRE_HTTPS=false
```

### Production Environment

```bash
# .env file
RHOAI_AUTH_ENABLED=true
RHOAI_AUTH_METHOD=jwt
RHOAI_JWT_SECRET=your-secure-secret-key
RHOAI_JWT_EXPIRY=1h
RHOAI_REFRESH_TOKEN_EXPIRY=7d
RHOAI_REQUIRE_HTTPS=true
RHOAI_CORS_ORIGINS=https://your-frontend.com
```

### OAuth Configuration

```bash
# OAuth environment variables
OAUTH_GOOGLE_CLIENT_ID=your-google-client-id
OAUTH_GOOGLE_CLIENT_SECRET=your-google-client-secret
OAUTH_AZURE_CLIENT_ID=your-azure-client-id
OAUTH_AZURE_CLIENT_SECRET=your-azure-client-secret
OAUTH_AZURE_TENANT_ID=your-azure-tenant-id
```

---

## 🛡️ Security Best Practices

### API Key Security

1. **Store Keys Securely**:
   ```bash
   # Use environment variables
   export RHOAI_API_KEY="rfs_key_1234567890abcdef"
   
   # Or secure key management systems
   aws secretsmanager get-secret-value --secret-id rhoai-api-key
   ```

2. **Rotate Keys Regularly**:
   ```bash
   # Create new key before old one expires
   python -m rhoai_feature_sizing create-api-key --name "Rotated Key"
   
   # Update applications with new key
   # Revoke old key after verification
   python -m rhoai_feature_sizing revoke-api-key --key-id "old-key-id"
   ```

3. **Use Principle of Least Privilege**:
   ```bash
   # Create read-only keys for monitoring
   python -m rhoai_feature_sizing create-api-key \
     --name "Monitoring" \
     --permissions read
   
   # Create write keys only when needed
   python -m rhoai_feature_sizing create-api-key \
     --name "Feature Pipeline" \
     --permissions read,write,jira
   ```

### Network Security

1. **Use HTTPS in Production**:
   ```bash
   # Enforce HTTPS
   export RHOAI_REQUIRE_HTTPS=true
   ```

2. **Configure CORS Properly**:
   ```bash
   # Restrict origins
   export RHOAI_CORS_ORIGINS="https://app.yourcompany.com,https://admin.yourcompany.com"
   ```

3. **Rate Limiting**:
   ```json
   {
     "rate_limits": {
       "requests_per_minute": 60,
       "burst_limit": 10,
       "by_api_key": true
     }
   }
   ```

### JWT Security

1. **Strong Secrets**:
   ```bash
   # Generate secure secret
   python -c "import secrets; print(secrets.token_urlsafe(64))"
   ```

2. **Short Expiry Times**:
   ```json
   {
     "jwt": {
       "access_token_expiry": "1h",
       "refresh_token_expiry": "7d",
       "algorithm": "HS256"
     }
   }
   ```

---

## 🔍 Authentication Troubleshooting

### Common Issues

**1. Invalid API Key**
```json
{
  "error": {
    "code": "INVALID_API_KEY",
    "message": "API key is invalid or expired"
  }
}
```

**Solution**: Check key format and expiration:
```bash
# Verify key format (should start with 'rfs_key_')
echo "rfs_key_1234567890abcdef" | grep "^rfs_key_"

# Check key status
curl -X GET http://localhost:8321/api/auth/keys/verify \
  -H "Authorization: Bearer rfs_key_1234567890abcdef"
```

**2. JWT Token Expired**
```json
{
  "error": {
    "code": "TOKEN_EXPIRED",
    "message": "JWT token has expired"
  }
}
```

**Solution**: Refresh the token:
```bash
curl -X POST http://localhost:8321/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "your-refresh-token"}'
```

**3. Insufficient Permissions**
```json
{
  "error": {
    "code": "INSUFFICIENT_PERMISSIONS",
    "message": "API key lacks required permissions"
  }
}
```

**Solution**: Check and update permissions:
```bash
# Check current permissions
curl -X GET http://localhost:8321/api/auth/keys/current \
  -H "Authorization: Bearer your-api-key"

# Request permission upgrade from admin
```

### Debugging Authentication

Enable debug logging:
```bash
export RHOAI_LOG_LEVEL=debug
export RHOAI_AUTH_DEBUG=true
```

Check authentication status:
```bash
curl -X GET http://localhost:8321/api/auth/status \
  -H "Authorization: Bearer your-token"
```

**Response:**
```json
{
  "authenticated": true,
  "user": {
    "id": "user_123",
    "email": "john.doe@example.com"
  },
  "permissions": ["read", "write"],
  "token_type": "api_key",
  "expires_at": "2025-01-15T10:30:00.000Z"
}
```

---

## 🔗 Integration Examples

### CI/CD Pipeline

```yaml
# GitHub Actions example
name: Feature Estimation
on: [push]

jobs:
  estimate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Estimate Features
        env:
          RHOAI_API_KEY: ${{ secrets.RHOAI_API_KEY }}
        run: |
          python scripts/estimate_features.py
```

### Monitoring Dashboard

```python
import os
import requests

class FeatureSizingMonitor:
    def __init__(self):
        self.api_key = os.getenv('RHOAI_API_KEY')
        self.base_url = "http://localhost:8321"
        
    def check_health(self):
        response = requests.get(
            f"{self.base_url}/api/health",
            headers={"Authorization": f"Bearer {self.api_key}"}
        )
        return response.json()
```

---

## 📚 Related Documentation

- [API Endpoints](./endpoints.md) - Available API endpoints and usage
- [Getting Started](../user-guide/getting-started.md) - Basic setup and usage
- [Security Configuration](../deployment/configuration.md) - Production security setup

*For additional security questions or enterprise authentication needs, please contact the development team.*