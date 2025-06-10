# Configuration Guide

This document covers all configuration options for the RHOAI AI Feature Sizing application and [Llama Stack](https://llama-stack.readthedocs.io/en/latest/) integration.

## 📋 Configuration Overview

The application supports multiple configuration methods:
- **Environment Variables** - Primary configuration method
- **Configuration Files** - JSON/YAML configuration files
- **Command Line Arguments** - Runtime parameter overrides
- **Secrets Management** - Secure credential handling

### Configuration Precedence

Configuration values are loaded in this order (highest to lowest priority):
1. Command line arguments
2. Environment variables
3. Configuration files
4. Default values

## 🌐 Environment Variables

### Core Application Settings

```bash
# Application Configuration
RHOAI_APP_NAME="RHOAI Feature Sizing"
RHOAI_VERSION="1.0.0"
RHOAI_ENVIRONMENT="production"  # development, staging, production
RHOAI_DEBUG="false"
RHOAI_LOG_LEVEL="INFO"  # DEBUG, INFO, WARNING, ERROR, CRITICAL
RHOAI_LOG_FILE="/var/log/rhoai/app.log"
RHOAI_LOG_FORMAT="json"  # json, text
RHOAI_TIMEZONE="UTC"

# Server Configuration
RHOAI_HOST="0.0.0.0"
RHOAI_PORT="8000"
RHOAI_WORKERS="4"
RHOAI_MAX_WORKERS="8"
RHOAI_WORKER_TIMEOUT="30"
RHOAI_KEEP_ALIVE="5"
RHOAI_MAX_REQUESTS="1000"
RHOAI_MAX_REQUESTS_JITTER="50"

# Security Configuration
RHOAI_SECRET_KEY="your-secret-key-here"
RHOAI_JWT_SECRET="your-jwt-secret-here"
RHOAI_JWT_ALGORITHM="HS256"
RHOAI_JWT_EXPIRY="3600"  # seconds
RHOAI_CORS_ORIGINS="https://yourapp.com,https://admin.yourapp.com"
RHOAI_CORS_METHODS="GET,POST,PUT,DELETE,OPTIONS"
RHOAI_CORS_HEADERS="*"
RHOAI_ALLOWED_HOSTS="yourapp.com,admin.yourapp.com"
```

### Llama Stack Configuration

```bash
# Llama Stack Server
LLAMA_STACK_BASE_URL="http://localhost:8321"
LLAMA_STACK_API_KEY=""  # Optional API key
LLAMA_STACK_TIMEOUT="30"
LLAMA_STACK_MAX_RETRIES="3"
LLAMA_STACK_RETRY_DELAY="1"  # seconds
LLAMA_STACK_CLIENT_LOG="INFO"  # DEBUG, INFO, WARNING, ERROR
LLAMA_STACK_LOG_FILE="/var/log/rhoai/llama-stack.log"

# Model Configuration
INFERENCE_MODEL="llama3.1:8b"
EMBEDDING_MODEL="sentence-transformers/all-MiniLM-L6-v2"
OLLAMA_HOST="http://localhost:11434"
OLLAMA_TIMEOUT="60"
OLLAMA_MAX_PARALLEL_REQUESTS="4"

# Llama Stack Logging
LLAMA_STACK_LOGGING="server=info;core=info;agents=debug"
# Categories: all, core, server, router, inference, agents, safety, eval, tools, client
# Levels: debug, info, warning, error, critical
```

### Database Configuration

```bash
# Primary Database (Optional)
DATABASE_URL="postgresql://user:password@localhost:5432/rhoai"
DATABASE_POOL_SIZE="5"
DATABASE_MAX_OVERFLOW="10"
DATABASE_POOL_TIMEOUT="30"
DATABASE_POOL_RECYCLE="3600"
DATABASE_ECHO="false"  # Log SQL queries

# Redis Cache (Optional)
REDIS_URL="redis://localhost:6379/0"
REDIS_PASSWORD=""
REDIS_DB="0"
REDIS_TIMEOUT="5"
REDIS_MAX_CONNECTIONS="10"
CACHE_TTL="3600"  # seconds
CACHE_KEY_PREFIX="rhoai:"
```

### JIRA Integration

```bash
# JIRA Configuration
JIRA_BASE_URL="https://yourcompany.atlassian.net"
JIRA_USERNAME="your-email@company.com"
JIRA_API_TOKEN="your-api-token"
JIRA_PROJECT_KEY="PROJ"
JIRA_DEFAULT_ISSUE_TYPE="Story"
JIRA_DEFAULT_PRIORITY="Medium"
JIRA_TIMEOUT="30"
JIRA_MAX_RETRIES="3"
JIRA_RETRY_DELAY="2"

# JIRA Custom Fields
JIRA_STORY_POINTS_FIELD="customfield_10106"
JIRA_CONFIDENCE_FIELD="customfield_10107"
JIRA_COMPLEXITY_FIELD="customfield_10108"
JIRA_AI_ESTIMATED_FIELD="customfield_10109"

# JIRA Ticket Templates
JIRA_TEMPLATE_DIR="/opt/rhoai/templates/jira"
JIRA_DEFAULT_TEMPLATE="feature_story.md"
```

### External API Integration

```bash
# Search APIs (Optional)
TAVILY_SEARCH_API_KEY="your-tavily-api-key"
BRAVE_SEARCH_API_KEY="your-brave-api-key"
SERPER_API_KEY="your-serper-api-key"

# Notification Services (Optional)
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
SLACK_CHANNEL="#feature-estimates"
TEAMS_WEBHOOK_URL="https://outlook.office.com/webhook/..."
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."

# Email Configuration (Optional)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USERNAME="your-email@company.com"
SMTP_PASSWORD="your-app-password"
SMTP_USE_TLS="true"
SMTP_FROM_EMAIL="noreply@company.com"
SMTP_FROM_NAME="RHOAI Feature Sizing"
```

### Performance and Limits

```bash
# Rate Limiting
RATE_LIMIT_ENABLED="true"
RATE_LIMIT_REQUESTS_PER_MINUTE="60"
RATE_LIMIT_BURST_SIZE="10"
RATE_LIMIT_STORAGE="redis"  # memory, redis
RATE_LIMIT_KEY_FUNC="ip"  # ip, user, api_key

# Request Limits
MAX_REQUEST_SIZE="10MB"
MAX_FEATURE_DESCRIPTION_LENGTH="10000"
MAX_BATCH_SIZE="50"
MAX_CONCURRENT_REQUESTS="10"
REQUEST_TIMEOUT="300"  # seconds

# Feature Processing Limits
MAX_ACCEPTANCE_CRITERIA="20"
MAX_TECHNICAL_REQUIREMENTS="15"
MIN_CONFIDENCE_THRESHOLD="60"
DEFAULT_CONFIDENCE_THRESHOLD="80"
MAX_STORY_POINTS="21"

# Model Context Limits
MAX_CONTEXT_LENGTH="4096"
MAX_TOKENS_PER_REQUEST="2048"
MODEL_TEMPERATURE="0.7"
MODEL_TOP_P="0.9"
MODEL_TOP_K="40"
```

### Monitoring and Observability

```bash
# Metrics Configuration
METRICS_ENABLED="true"
METRICS_PORT="9090"
METRICS_PATH="/metrics"
PROMETHEUS_NAMESPACE="rhoai"
PROMETHEUS_SUBSYSTEM="feature_sizing"

# Health Check Configuration
HEALTH_CHECK_ENABLED="true"
HEALTH_CHECK_PATH="/health"
READY_CHECK_PATH="/ready"
HEALTH_CHECK_TIMEOUT="10"

# Tracing Configuration
TRACING_ENABLED="true"
JAEGER_ENDPOINT="http://localhost:14268/api/traces"
JAEGER_SERVICE_NAME="rhoai-feature-sizing"
TRACING_SAMPLE_RATE="0.1"

# Log Aggregation
LOG_AGGREGATION_ENABLED="true"
FLUENTD_HOST="localhost"
FLUENTD_PORT="24224"
LOG_SHIPPING_ENABLED="true"
LOG_RETENTION_DAYS="30"
```

## 📄 Configuration Files

### Main Configuration File

```json
// config/production.json
{
  "app": {
    "name": "RHOAI Feature Sizing",
    "version": "1.0.0",
    "environment": "production",
    "debug": false,
    "timezone": "UTC"
  },
  "server": {
    "host": "0.0.0.0",
    "port": 8000,
    "workers": 4,
    "timeout": 30,
    "keep_alive": 5
  },
  "llama_stack": {
    "base_url": "http://localhost:8321",
    "timeout": 30,
    "max_retries": 3,
    "retry_delay": 1,
    "default_model": "llama3.1:8b",
    "embedding_model": "sentence-transformers/all-MiniLM-L6-v2"
  },
  "estimation": {
    "default_confidence_threshold": 80,
    "min_confidence_threshold": 60,
    "max_story_points": 21,
    "complexity_factors": ["technical", "business", "integration"],
    "estimation_methods": ["story_points", "hours", "t_shirt_sizes"],
    "default_estimation_method": "story_points"
  },
  "jira": {
    "project_key": "PROJ",
    "default_issue_type": "Story",
    "default_priority": "Medium",
    "timeout": 30,
    "max_retries": 3,
    "custom_fields": {
      "story_points": "customfield_10106",
      "confidence_level": "customfield_10107",
      "complexity_breakdown": "customfield_10108",
      "ai_estimated": "customfield_10109"
    },
    "components": ["AI Estimated"],
    "labels": ["ai-estimated", "feature-sizing"],
    "auto_assign": false,
    "create_subtasks": false
  },
  "security": {
    "cors": {
      "origins": ["https://yourapp.com"],
      "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      "headers": ["*"],
      "credentials": true
    },
    "rate_limiting": {
      "enabled": true,
      "requests_per_minute": 60,
      "burst_size": 10,
      "storage": "redis"
    },
    "authentication": {
      "jwt": {
        "algorithm": "HS256",
        "expiry": 3600,
        "refresh_expiry": 86400
      },
      "api_keys": {
        "enabled": true,
        "default_expiry": 2592000
      }
    }
  },
  "monitoring": {
    "metrics": {
      "enabled": true,
      "port": 9090,
      "namespace": "rhoai",
      "subsystem": "feature_sizing"
    },
    "health_checks": {
      "enabled": true,
      "timeout": 10,
      "interval": 30
    },
    "tracing": {
      "enabled": true,
      "sample_rate": 0.1,
      "service_name": "rhoai-feature-sizing"
    }
  },
  "logging": {
    "level": "INFO",
    "format": "json",
    "file": "/var/log/rhoai/app.log",
    "rotation": {
      "enabled": true,
      "max_size": "100MB",
      "backup_count": 5
    },
    "aggregation": {
      "enabled": true,
      "endpoint": "http://fluentd:24224"
    }
  },
  "performance": {
    "max_request_size": "10MB",
    "max_batch_size": 50,
    "max_concurrent_requests": 10,
    "request_timeout": 300,
    "cache": {
      "enabled": true,
      "ttl": 3600,
      "max_size": 1000
    }
  }
}
```

### Environment-Specific Configurations

```yaml
# config/development.yaml
app:
  environment: development
  debug: true
  log_level: DEBUG

server:
  host: localhost
  port: 8000
  workers: 1
  reload: true

llama_stack:
  base_url: http://localhost:8321
  timeout: 60
  log_level: DEBUG

security:
  cors:
    origins: ["http://localhost:3000", "http://localhost:8080"]
  authentication:
    enabled: false
  rate_limiting:
    enabled: false

monitoring:
  metrics:
    enabled: false
  tracing:
    enabled: false

---
# config/staging.yaml
app:
  environment: staging
  debug: false
  log_level: INFO

server:
  workers: 2

security:
  cors:
    origins: ["https://staging.yourapp.com"]
  authentication:
    enabled: true
  rate_limiting:
    enabled: true
    requests_per_minute: 120

monitoring:
  metrics:
    enabled: true
  tracing:
    enabled: true
    sample_rate: 0.5
```

### Model Configuration

```yaml
# config/models.yaml
models:
  llama3_1_8b:
    model_id: "llama3.1:8b"
    provider: "ollama"
    capabilities: ["text_generation", "reasoning", "analysis"]
    context_length: 4096
    recommended_for: ["production", "detailed_analysis"]
    performance:
      speed: "medium"
      quality: "high"
      memory_usage: "medium"
    config:
      temperature: 0.7
      top_p: 0.9
      top_k: 40
      max_tokens: 2048

  llama3_2_3b:
    model_id: "llama3.2:3b"
    provider: "ollama"
    capabilities: ["text_generation", "reasoning"]
    context_length: 2048
    recommended_for: ["development", "quick_estimates"]
    performance:
      speed: "fast"
      quality: "good"
      memory_usage: "low"
    config:
      temperature: 0.8
      top_p: 0.95
      max_tokens: 1024

embedding_models:
  all_minilm_l6_v2:
    model_id: "sentence-transformers/all-MiniLM-L6-v2"
    dimensions: 384
    max_sequence_length: 256
    recommended_for: ["feature_similarity", "search"]

prompts:
  refinement:
    template_file: "prompts/refine_feature.md"
    max_length: 4000
    include_examples: true
  
  estimation:
    template_file: "prompts/estimate_feature.md"
    max_length: 3000
    include_context: true
    
  jira_formatting:
    template_file: "prompts/format_jira.md"
    max_length: 2000
```

### Prompt Configuration

```yaml
# config/prompts.yaml
prompt_templates:
  feature_refinement:
    file: "prompts/refine_feature.md"
    variables:
      - feature_description
      - project_context
      - team_context
    max_length: 4000
    temperature: 0.7
    
  feature_estimation:
    file: "prompts/estimate_feature.md"
    variables:
      - refined_feature
      - estimation_context
      - historical_data
    max_length: 3000
    temperature: 0.6
    
  jira_ticket_creation:
    file: "prompts/create_jira_ticket.md"
    variables:
      - feature_data
      - estimation_data
      - project_config
    max_length: 2000
    temperature: 0.5

prompt_engineering:
  use_few_shot_examples: true
  examples_per_prompt: 3
  context_window_management: true
  adaptive_prompting: false
  
validation:
  required_fields:
    - feature_description
    - acceptance_criteria
  min_description_length: 20
  max_description_length: 10000
  confidence_threshold: 0.6
```

## 🔧 Runtime Configuration

### Command Line Arguments

```bash
# Basic usage
python main.py --host 0.0.0.0 --port 8000 --workers 4

# Configuration file override
python main.py --config config/production.json

# Environment override
python main.py --env production

# Debug mode
python main.py --debug --log-level DEBUG

# Feature processing
python main.py process-feature \
  --description "Add user authentication" \
  --output results.json \
  --confidence-threshold 80

# Batch processing
python main.py process-batch \
  --input features.txt \
  --output-dir results/ \
  --parallel \
  --max-workers 4

# JIRA integration
python main.py create-jira-tickets \
  --input estimations.json \
  --project PROJ \
  --issue-type Story \
  --dry-run
```

### Configuration Validation

```python
# config/validation.py
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
from enum import Enum

class Environment(str, Enum):
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"

class LogLevel(str, Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"

class AppConfig(BaseModel):
    name: str = Field(default="RHOAI Feature Sizing")
    version: str = Field(default="1.0.0")
    environment: Environment = Field(default=Environment.DEVELOPMENT)
    debug: bool = Field(default=False)
    log_level: LogLevel = Field(default=LogLevel.INFO)
    timezone: str = Field(default="UTC")

class ServerConfig(BaseModel):
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8000, ge=1, le=65535)
    workers: int = Field(default=1, ge=1, le=32)
    timeout: int = Field(default=30, ge=1)
    keep_alive: int = Field(default=5, ge=1)

class LlamaStackConfig(BaseModel):
    base_url: str = Field(default="http://localhost:8321")
    api_key: Optional[str] = None
    timeout: int = Field(default=30, ge=1)
    max_retries: int = Field(default=3, ge=0, le=10)
    retry_delay: int = Field(default=1, ge=0)
    default_model: str = Field(default="llama3.1:8b")
    
    @validator('base_url')
    def validate_url(cls, v):
        if not v.startswith(('http://', 'https://')):
            raise ValueError('Base URL must start with http:// or https://')
        return v

class EstimationConfig(BaseModel):
    default_confidence_threshold: int = Field(default=80, ge=0, le=100)
    min_confidence_threshold: int = Field(default=60, ge=0, le=100)
    max_story_points: int = Field(default=21, ge=1)
    complexity_factors: List[str] = Field(default=["technical", "business", "integration"])
    estimation_methods: List[str] = Field(default=["story_points", "hours"])

class RhoaiConfig(BaseModel):
    app: AppConfig = Field(default_factory=AppConfig)
    server: ServerConfig = Field(default_factory=ServerConfig)
    llama_stack: LlamaStackConfig = Field(default_factory=LlamaStackConfig)
    estimation: EstimationConfig = Field(default_factory=EstimationConfig)
    
    class Config:
        env_prefix = "RHOAI_"
        case_sensitive = False
        
# Usage
def load_config(config_file: Optional[str] = None) -> RhoaiConfig:
    """Load and validate configuration."""
    if config_file:
        with open(config_file) as f:
            config_data = json.load(f)
        return RhoaiConfig(**config_data)
    else:
        return RhoaiConfig()  # Load from environment variables
```

## 🔒 Security Configuration

### Authentication Configuration

```json
{
  "authentication": {
    "enabled": true,
    "methods": ["api_key", "jwt", "oauth2"],
    "default_method": "api_key",
    "api_keys": {
      "enabled": true,
      "prefix": "rfs_key_",
      "length": 32,
      "default_expiry": 2592000,
      "max_expiry": 31536000,
      "permissions": {
        "read": ["features:read", "models:read", "config:read"],
        "write": ["features:write", "features:estimate", "jira:create"],
        "admin": ["*"]
      }
    },
    "jwt": {
      "algorithm": "HS256",
      "access_token_expiry": 3600,
      "refresh_token_expiry": 86400,
      "issuer": "rhoai-feature-sizing",
      "audience": "rhoai-api"
    },
    "oauth2": {
      "providers": {
        "google": {
          "client_id": "${GOOGLE_CLIENT_ID}",
          "client_secret": "${GOOGLE_CLIENT_SECRET}",
          "scopes": ["openid", "email", "profile"]
        },
        "azure": {
          "client_id": "${AZURE_CLIENT_ID}",
          "client_secret": "${AZURE_CLIENT_SECRET}",
          "tenant_id": "${AZURE_TENANT_ID}"
        }
      }
    }
  }
}
```

### TLS/SSL Configuration

```json
{
  "tls": {
    "enabled": true,
    "cert_file": "/etc/ssl/certs/rhoai.crt",
    "key_file": "/etc/ssl/private/rhoai.key",
    "ca_file": "/etc/ssl/certs/ca.crt",
    "protocols": ["TLSv1.2", "TLSv1.3"],
    "ciphers": "HIGH:!aNULL:!MD5",
    "verify_client": false,
    "hsts": {
      "enabled": true,
      "max_age": 31536000,
      "include_subdomains": true,
      "preload": true
    }
  }
}
```

## 📊 Monitoring Configuration

### Metrics Configuration

```yaml
# config/monitoring.yaml
metrics:
  enabled: true
  port: 9090
  path: "/metrics"
  namespace: "rhoai"
  subsystem: "feature_sizing"
  
  custom_metrics:
    - name: "features_processed_total"
      type: "counter"
      description: "Total number of features processed"
      labels: ["method", "status"]
      
    - name: "estimation_accuracy"
      type: "histogram"
      description: "Estimation accuracy distribution"
      buckets: [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0]
      
    - name: "llama_stack_request_duration"
      type: "histogram"
      description: "Llama Stack request duration"
      buckets: [0.1, 0.5, 1.0, 2.0, 5.0, 10.0]

alerting:
  enabled: true
  rules_file: "config/alert_rules.yaml"
  
  notification_channels:
    slack:
      webhook_url: "${SLACK_WEBHOOK_URL}"
      channel: "#alerts"
      username: "RHOAI Monitor"
      
    email:
      smtp_host: "${SMTP_HOST}"
      smtp_port: 587
      username: "${SMTP_USERNAME}"
      password: "${SMTP_PASSWORD}"
      from: "alerts@yourcompany.com"
      to: ["ops@yourcompany.com"]

health_checks:
  enabled: true
  endpoint: "/health"
  timeout: 10
  interval: 30
  
  checks:
    - name: "database"
      type: "postgresql"
      enabled: true
      timeout: 5
      
    - name: "llama_stack"
      type: "http"
      url: "${LLAMA_STACK_BASE_URL}/health"
      timeout: 10
      
    - name: "redis"
      type: "redis"
      enabled: true
      timeout: 5
      
    - name: "disk_space"
      type: "disk"
      path: "/var/log"
      threshold: 85  # percentage
```

### Logging Configuration

```json
{
  "logging": {
    "version": 1,
    "disable_existing_loggers": false,
    "formatters": {
      "json": {
        "class": "pythonjsonlogger.jsonlogger.JsonFormatter",
        "format": "%(asctime)s %(name)s %(levelname)s %(message)s"
      },
      "detailed": {
        "format": "%(asctime)s - %(name)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s"
      }
    },
    "handlers": {
      "console": {
        "class": "logging.StreamHandler",
        "level": "INFO",
        "formatter": "json",
        "stream": "ext://sys.stdout"
      },
      "file": {
        "class": "logging.handlers.RotatingFileHandler",
        "level": "INFO",
        "formatter": "json",
        "filename": "/var/log/rhoai/app.log",
        "maxBytes": 104857600,
        "backupCount": 5
      },
      "error_file": {
        "class": "logging.handlers.RotatingFileHandler",
        "level": "ERROR",
        "formatter": "detailed",
        "filename": "/var/log/rhoai/error.log",
        "maxBytes": 52428800,
        "backupCount": 3
      }
    },
    "loggers": {
      "rhoai": {
        "level": "INFO",
        "handlers": ["console", "file", "error_file"],
        "propagate": false
      },
      "llama_stack_client": {
        "level": "WARNING",
        "handlers": ["file"],
        "propagate": false
      },
      "uvicorn": {
        "level": "INFO",
        "handlers": ["console"],
        "propagate": false
      }
    },
    "root": {
      "level": "WARNING",
      "handlers": ["console"]
    }
  }
}
```

## 🧪 Testing Configuration

```json
{
  "testing": {
    "environment": "test",
    "database_url": "sqlite:///test.db",
    "llama_stack": {
      "base_url": "http://localhost:8322",
      "mock_responses": true,
      "timeout": 5
    },
    "jira": {
      "base_url": "http://localhost:8080",
      "mock_server": true
    },
    "fixtures": {
      "load_sample_data": true,
      "data_directory": "tests/fixtures"
    },
    "coverage": {
      "minimum_threshold": 80,
      "exclude_files": ["tests/*", "migrations/*"]
    }
  }
}
```

## 📋 Configuration Best Practices

### 1. Environment Separation

```bash
# Use separate configurations for each environment
config/
├── base.json                # Common settings
├── development.json         # Development overrides
├── staging.json            # Staging overrides
├── production.json         # Production overrides
└── testing.json           # Test overrides
```

### 2. Secret Management

```bash
# Never store secrets in configuration files
# Use environment variables or secret management systems

# Good - Environment variable
export JIRA_API_TOKEN="your-secret-token"

# Good - Secret management
aws secretsmanager get-secret-value --secret-id rhoai/jira-token

# Bad - Configuration file
{
  "jira": {
    "api_token": "your-secret-token"  // Never do this!
  }
}
```

### 3. Configuration Validation

```python
# Always validate configuration at startup
def validate_config():
    """Validate critical configuration settings."""
    required_vars = [
        "LLAMA_STACK_BASE_URL",
        "RHOAI_SECRET_KEY"
    ]
    
    missing = [var for var in required_vars if not os.getenv(var)]
    if missing:
        raise ValueError(f"Missing required environment variables: {missing}")
    
    # Validate URLs
    llama_stack_url = os.getenv("LLAMA_STACK_BASE_URL")
    if not llama_stack_url.startswith(('http://', 'https://')):
        raise ValueError("LLAMA_STACK_BASE_URL must be a valid URL")
```

### 4. Configuration Templates

```bash
# Provide configuration templates for different setups

# .env.example
RHOAI_ENVIRONMENT=development
RHOAI_DEBUG=true
RHOAI_LOG_LEVEL=DEBUG
LLAMA_STACK_BASE_URL=http://localhost:8321
JIRA_BASE_URL=https://yourcompany.atlassian.net
JIRA_USERNAME=your-email@company.com
JIRA_API_TOKEN=your-api-token-here

# docker-compose.override.yml.example
version: '3.8'
services:
  app:
    environment:
      - RHOAI_DEBUG=true
      - RHOAI_LOG_LEVEL=DEBUG
    volumes:
      - ./config/development.json:/app/config/config.json
```

## 🔧 Configuration Management Tools

### 1. Configuration Loading Script

```python
#!/usr/bin/env python3
# scripts/load_config.py

import os
import json
import yaml
from pathlib import Path
from typing import Dict, Any

def load_config(
    config_file: str = None,
    environment: str = None
) -> Dict[str, Any]:
    """Load configuration from file and environment variables."""
    
    # Start with base configuration
    config = load_base_config()
    
    # Load environment-specific config
    if environment:
        env_config = load_environment_config(environment)
        config = merge_configs(config, env_config)
    
    # Load specific config file
    if config_file:
        file_config = load_config_file(config_file)
        config = merge_configs(config, file_config)
    
    # Override with environment variables
    env_overrides = load_env_overrides()
    config = merge_configs(config, env_overrides)
    
    return config

def validate_config(config: Dict[str, Any]) -> None:
    """Validate configuration settings."""
    # Implement validation logic
    pass

if __name__ == "__main__":
    import sys
    env = sys.argv[1] if len(sys.argv) > 1 else "development"
    config = load_config(environment=env)
    validate_config(config)
    print(json.dumps(config, indent=2))
```

### 2. Configuration Migration Tool

```python
#!/usr/bin/env python3
# scripts/migrate_config.py

def migrate_config_v1_to_v2(old_config: Dict[str, Any]) -> Dict[str, Any]:
    """Migrate configuration from v1 to v2 format."""
    new_config = {
        "version": "2.0",
        "app": {
            "name": old_config.get("app_name", "RHOAI Feature Sizing"),
            "version": old_config.get("version", "1.0.0"),
            "environment": old_config.get("env", "development")
        },
        "server": {
            "host": old_config.get("host", "0.0.0.0"),
            "port": old_config.get("port", 8000)
        }
        # ... more migration logic
    }
    return new_config
```

---

## 🔗 Related Documentation

- [Installation Guide](./installation.md) - Deployment instructions
- [API Documentation](../api/endpoints.md) - API configuration options
- [Development Setup](../development/setup.md) - Development configuration

*For configuration support or questions about specific settings, please refer to the troubleshooting section or contact the development team.*