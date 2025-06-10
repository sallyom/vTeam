# Production Installation Guide

This guide covers installing and deploying the RHOAI AI Feature Sizing application in production environments, including [Llama Stack](https://llama-stack.readthedocs.io/en/latest/) infrastructure.

## 🏗️ Deployment Architecture

### Overview

The production deployment consists of:
- **Application Server**: RHOAI AI Feature Sizing application
- **Llama Stack Server**: AI inference and agent processing
- **Model Server**: Ollama or cloud-based model serving
- **Database**: PostgreSQL for persistent data (optional)
- **Load Balancer**: NGINX or cloud load balancer
- **Monitoring**: Prometheus, Grafana, logging stack

### Infrastructure Requirements

**Minimum Production Requirements:**
- **CPU**: 4+ cores per service
- **Memory**: 16GB+ RAM (32GB+ recommended for large models)
- **Storage**: 100GB+ SSD for models and data
- **Network**: 1Gbps+ bandwidth
- **GPU**: Optional but recommended for model inference

**Recommended Production Setup:**
- **CPU**: 8+ cores per service
- **Memory**: 32GB+ RAM
- **Storage**: 500GB+ NVMe SSD
- **Network**: 10Gbps+ bandwidth
- **GPU**: NVIDIA V100, A100, or equivalent

## 🐳 Container Deployment

### Docker Deployment

#### 1. Build Production Images

```dockerfile
# Dockerfile
FROM python:3.12-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

# Set working directory
WORKDIR /app

# Copy project files
COPY pyproject.toml uv.lock ./
COPY src/ ./src/
COPY stages/ ./stages/
COPY tools/ ./tools/
COPY prompts/ ./prompts/

# Install dependencies
RUN uv sync --frozen --no-dev

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Start application
CMD ["uv", "run", "python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

#### 2. Build and Push Images

```bash
# Build application image
docker build -t rhoai-feature-sizing:latest .

# Tag for registry
docker tag rhoai-feature-sizing:latest your-registry.com/rhoai-feature-sizing:v1.0.0

# Push to registry
docker push your-registry.com/rhoai-feature-sizing:v1.0.0
```

#### 3. Docker Compose Production Setup

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  app:
    image: your-registry.com/rhoai-feature-sizing:v1.0.0
    ports:
      - "8000:8000"
    environment:
      - LLAMA_STACK_BASE_URL=http://llama-stack:8321
      - DATABASE_URL=postgresql://user:password@postgres:5432/rhoai
      - JIRA_BASE_URL=${JIRA_BASE_URL}
      - JIRA_USERNAME=${JIRA_USERNAME}
      - JIRA_API_TOKEN=${JIRA_API_TOKEN}
      - LOG_LEVEL=INFO
      - ENVIRONMENT=production
    depends_on:
      - llama-stack
      - postgres
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '1.0'
        reservations:
          memory: 1G
          cpus: '0.5'

  llama-stack:
    image: llamastack/llamastack:latest
    ports:
      - "8321:8321"
    environment:
      - INFERENCE_MODEL=llama3.1:8b
      - LLAMA_STACK_PORT=8321
      - LLAMA_STACK_LOGGING=server=info;core=info
    volumes:
      - llama_models:/models
      - llama_config:/config
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 16G
          cpus: '4.0'
        reservations:
          memory: 8G
          cpus: '2.0'

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    environment:
      - OLLAMA_HOST=0.0.0.0
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 12G
          cpus: '6.0'

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=rhoai
      - POSTGRES_USER=rhoai_user
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U rhoai_user -d rhoai"]
      interval: 30s
      timeout: 10s
      retries: 3

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - app
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped
    command: redis-server --appendonly yes

volumes:
  postgres_data:
  llama_models:
  llama_config:
  ollama_data:
  redis_data:

networks:
  default:
    name: rhoai-network
```

## ☸️ Kubernetes Deployment

### 1. Namespace and ConfigMap

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: rhoai-feature-sizing
  labels:
    name: rhoai-feature-sizing

---
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: rhoai-config
  namespace: rhoai-feature-sizing
data:
  LOG_LEVEL: "INFO"
  ENVIRONMENT: "production"
  LLAMA_STACK_BASE_URL: "http://llama-stack-service:8321"
  LLAMA_STACK_TIMEOUT: "30"
  MAX_RETRIES: "3"
```

### 2. Secrets Management

```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: rhoai-secrets
  namespace: rhoai-feature-sizing
type: Opaque
data:
  # Base64 encoded values
  DATABASE_URL: <base64-encoded-database-url>
  JIRA_API_TOKEN: <base64-encoded-jira-token>
  JWT_SECRET: <base64-encoded-jwt-secret>
```

### 3. Application Deployment

```yaml
# k8s/app-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rhoai-app
  namespace: rhoai-feature-sizing
spec:
  replicas: 3
  selector:
    matchLabels:
      app: rhoai-app
  template:
    metadata:
      labels:
        app: rhoai-app
    spec:
      containers:
      - name: rhoai-app
        image: your-registry.com/rhoai-feature-sizing:v1.0.0
        ports:
        - containerPort: 8000
        env:
        - name: LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: rhoai-config
              key: LOG_LEVEL
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: rhoai-secrets
              key: DATABASE_URL
        - name: JIRA_API_TOKEN
          valueFrom:
            secretKeyRef:
              name: rhoai-secrets
              key: JIRA_API_TOKEN
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8000
          initialDelaySeconds: 10
          periodSeconds: 5
        volumeMounts:
        - name: app-config
          mountPath: /app/config
      volumes:
      - name: app-config
        configMap:
          name: rhoai-config

---
apiVersion: v1
kind: Service
metadata:
  name: rhoai-app-service
  namespace: rhoai-feature-sizing
spec:
  selector:
    app: rhoai-app
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8000
  type: ClusterIP
```

### 4. Llama Stack Deployment

```yaml
# k8s/llama-stack-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llama-stack
  namespace: rhoai-feature-sizing
spec:
  replicas: 2
  selector:
    matchLabels:
      app: llama-stack
  template:
    metadata:
      labels:
        app: llama-stack
    spec:
      containers:
      - name: llama-stack
        image: llamastack/llamastack:latest
        ports:
        - containerPort: 8321
        env:
        - name: INFERENCE_MODEL
          value: "llama3.1:8b"
        - name: LLAMA_STACK_PORT
          value: "8321"
        resources:
          requests:
            memory: "8Gi"
            cpu: "2000m"
          limits:
            memory: "16Gi"
            cpu: "4000m"
        volumeMounts:
        - name: model-storage
          mountPath: /models
        - name: config-storage
          mountPath: /config
      volumes:
      - name: model-storage
        persistentVolumeClaim:
          claimName: llama-models-pvc
      - name: config-storage
        persistentVolumeClaim:
          claimName: llama-config-pvc

---
apiVersion: v1
kind: Service
metadata:
  name: llama-stack-service
  namespace: rhoai-feature-sizing
spec:
  selector:
    app: llama-stack
  ports:
  - protocol: TCP
    port: 8321
    targetPort: 8321
  type: ClusterIP
```

### 5. Persistent Storage

```yaml
# k8s/storage.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: llama-models-pvc
  namespace: rhoai-feature-sizing
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: fast-ssd
  resources:
    requests:
      storage: 100Gi

---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: llama-config-pvc
  namespace: rhoai-feature-sizing
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: fast-ssd
  resources:
    requests:
      storage: 10Gi

---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-data-pvc
  namespace: rhoai-feature-sizing
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: fast-ssd
  resources:
    requests:
      storage: 50Gi
```

### 6. Ingress Configuration

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: rhoai-ingress
  namespace: rhoai-feature-sizing
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
  - hosts:
    - api.yourcompany.com
    secretName: rhoai-tls
  rules:
  - host: api.yourcompany.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: rhoai-app-service
            port:
              number: 80
```

## 🔧 Manual Installation

### 1. System Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y \
    python3.12 \
    python3.12-venv \
    python3.12-dev \
    build-essential \
    curl \
    git \
    nginx \
    postgresql \
    redis-server \
    supervisor

# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc
```

### 2. Application Setup

```bash
# Create application user
sudo useradd -m -s /bin/bash rhoai
sudo usermod -aG sudo rhoai

# Switch to application user
sudo su - rhoai

# Clone and setup application
git clone https://github.com/your-org/rhoai-ai-feature-sizing.git
cd rhoai-ai-feature-sizing

# Create virtual environment and install dependencies
uv venv /opt/rhoai/venv
source /opt/rhoai/venv/bin/activate
uv sync --frozen --no-dev
uv pip install -e .
```

### 3. Database Setup

```bash
# Setup PostgreSQL
sudo -u postgres createuser rhoai_user
sudo -u postgres createdb rhoai_db -O rhoai_user
sudo -u postgres psql -c "ALTER USER rhoai_user PASSWORD 'secure_password';"

# Run database migrations (if applicable)
cd /opt/rhoai
source venv/bin/activate
python -m alembic upgrade head
```

### 4. Llama Stack Installation

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull required models
ollama pull llama3.1:8b

# Install and setup Llama Stack
pip install llama-stack

# Create Llama Stack configuration
mkdir -p /opt/rhoai/llama-stack-config
cat > /opt/rhoai/llama-stack-config/config.yaml << EOF
server:
  host: 0.0.0.0
  port: 8321
  cors_origins: ["*"]

models:
  - model_id: llama3.1:8b
    provider: ollama
    config:
      url: http://localhost:11434

inference:
  provider: ollama
  config:
    url: http://localhost:11434

agents:
  provider: meta-reference
  config: {}

safety:
  provider: meta-reference
  config: {}
EOF
```

### 5. Service Configuration

```bash
# Create systemd service for application
sudo tee /etc/systemd/system/rhoai-app.service << EOF
[Unit]
Description=RHOAI Feature Sizing Application
After=network.target postgresql.service redis.service

[Service]
Type=exec
User=rhoai
Group=rhoai
WorkingDirectory=/opt/rhoai
Environment=PATH=/opt/rhoai/venv/bin
ExecStart=/opt/rhoai/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Create systemd service for Llama Stack
sudo tee /etc/systemd/system/llama-stack.service << EOF
[Unit]
Description=Llama Stack Server
After=network.target ollama.service

[Service]
Type=exec
User=rhoai
Group=rhoai
WorkingDirectory=/opt/rhoai
Environment=PATH=/opt/rhoai/venv/bin
ExecStart=/opt/rhoai/venv/bin/llama-stack-run --config /opt/rhoai/llama-stack-config/config.yaml
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start services
sudo systemctl daemon-reload
sudo systemctl enable rhoai-app llama-stack
sudo systemctl start rhoai-app llama-stack
```

### 6. NGINX Configuration

```nginx
# /etc/nginx/sites-available/rhoai
server {
    listen 80;
    server_name api.yourcompany.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourcompany.com;

    ssl_certificate /etc/ssl/certs/yourcompany.crt;
    ssl_certificate_key /etc/ssl/private/yourcompany.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /health {
        proxy_pass http://127.0.0.1:8000/health;
        access_log off;
    }
}
```

```bash
# Enable site and restart NGINX
sudo ln -s /etc/nginx/sites-available/rhoai /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 🌩️ Cloud Deployment

### AWS Deployment

#### 1. ECS with Fargate

```yaml
# aws/task-definition.json
{
  "family": "rhoai-feature-sizing",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "2048",
  "memory": "4096",
  "executionRoleArn": "arn:aws:iam::account:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::account:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "rhoai-app",
      "image": "your-registry.com/rhoai-feature-sizing:v1.0.0",
      "portMappings": [
        {
          "containerPort": 8000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "ENVIRONMENT",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:rhoai/database-url"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/rhoai-feature-sizing",
          "awslogs-region": "us-west-2",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3
      }
    }
  ]
}
```

#### 2. Infrastructure as Code (Terraform)

```hcl
# aws/main.tf
provider "aws" {
  region = var.aws_region
}

# VPC and Networking
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "rhoai-vpc"
  }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 1}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "rhoai-private-${count.index + 1}"
  }
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.${count.index + 10}.0/24"
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "rhoai-public-${count.index + 1}"
  }
}

# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "rhoai-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "rhoai-cluster"
  }
}

# Application Load Balancer
resource "aws_lb" "main" {
  name               = "rhoai-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = false

  tags = {
    Name = "rhoai-alb"
  }
}

# RDS Database
resource "aws_db_instance" "main" {
  identifier     = "rhoai-postgres"
  engine         = "postgres"
  engine_version = "15.3"
  instance_class = "db.t3.micro"
  
  allocated_storage     = 20
  max_allocated_storage = 100
  storage_encrypted     = true
  
  db_name  = "rhoai"
  username = "rhoai_user"
  password = var.db_password
  
  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name
  
  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"
  
  skip_final_snapshot = true
  deletion_protection = false

  tags = {
    Name = "rhoai-postgres"
  }
}
```

### Google Cloud Platform

```yaml
# gcp/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rhoai-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: rhoai-app
  template:
    metadata:
      labels:
        app: rhoai-app
    spec:
      containers:
      - name: rhoai-app
        image: gcr.io/your-project/rhoai-feature-sizing:v1.0.0
        ports:
        - containerPort: 8000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: rhoai-secrets
              key: database-url
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
```

## 📊 Monitoring and Observability

### 1. Prometheus Configuration

```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'rhoai-app'
    static_configs:
      - targets: ['localhost:8000']
    metrics_path: /metrics
    scrape_interval: 10s

  - job_name: 'llama-stack'
    static_configs:
      - targets: ['localhost:8321']
    metrics_path: /metrics
    scrape_interval: 15s

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']
```

### 2. Grafana Dashboard

```json
{
  "dashboard": {
    "title": "RHOAI Feature Sizing Metrics",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{method}} {{endpoint}}"
          }
        ]
      },
      {
        "title": "Response Time",
        "type": "graph", 
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "95th percentile"
          }
        ]
      }
    ]
  }
}
```

### 3. Logging Configuration

```yaml
# logging/fluentd.conf
<source>
  @type tail
  path /var/log/rhoai/*.log
  pos_file /var/log/fluentd/rhoai.log.pos
  tag rhoai.*
  format json
</source>

<match rhoai.**>
  @type elasticsearch
  host elasticsearch.logging.svc.cluster.local
  port 9200
  index_name rhoai-logs
  type_name _doc
</match>
```

## 🔐 Security Configuration

### 1. SSL/TLS Setup

```bash
# Generate SSL certificates with Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourcompany.com

# Auto-renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

### 2. Firewall Configuration

```bash
# UFW firewall rules
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Internal services (adjust as needed)
sudo ufw allow from 10.0.0.0/16 to any port 8000
sudo ufw allow from 10.0.0.0/16 to any port 8321
```

### 3. Secrets Management

```bash
# Using AWS Secrets Manager
aws secretsmanager create-secret \
  --name "rhoai/database-url" \
  --description "Database connection URL" \
  --secret-string "postgresql://user:password@host:5432/database"

# Using Kubernetes secrets
kubectl create secret generic rhoai-secrets \
  --from-literal=database-url="postgresql://user:password@host:5432/database" \
  --from-literal=jira-api-token="your-token"
```

## 🔄 Backup and Recovery

### 1. Database Backup

```bash
# Automated backup script
#!/bin/bash
BACKUP_DIR="/opt/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/rhoai_backup_$DATE.sql"

# Create backup
pg_dump -h localhost -U rhoai_user -d rhoai > "$BACKUP_FILE"

# Compress backup
gzip "$BACKUP_FILE"

# Upload to S3 (optional)
aws s3 cp "$BACKUP_FILE.gz" s3://your-backup-bucket/database/

# Clean old backups (keep last 7 days)
find "$BACKUP_DIR" -name "rhoai_backup_*.sql.gz" -mtime +7 -delete
```

### 2. Application Data Backup

```bash
# Backup configuration and models
tar -czf /opt/backups/rhoai_config_$(date +%Y%m%d).tar.gz \
  /opt/rhoai/config \
  /opt/rhoai/prompts \
  /opt/rhoai/.env
```

## 📋 Deployment Checklist

### Pre-Deployment
- [ ] Infrastructure provisioned and configured
- [ ] DNS records updated
- [ ] SSL certificates obtained
- [ ] Database initialized
- [ ] Secrets and environment variables configured
- [ ] Monitoring and logging setup

### Deployment
- [ ] Application images built and pushed
- [ ] Services deployed and running
- [ ] Health checks passing
- [ ] Database migrations applied
- [ ] Load balancer configured
- [ ] Ingress/routing configured

### Post-Deployment
- [ ] End-to-end testing completed
- [ ] Monitoring dashboards configured
- [ ] Alerting rules setup
- [ ] Backup procedures tested
- [ ] Documentation updated
- [ ] Team notified

---

## 🔗 Related Documentation

- [Configuration Guide](./configuration.md) - Advanced configuration options
- [Development Setup](../development/setup.md) - Development environment
- [API Documentation](../api/endpoints.md) - API reference

*For deployment support, please refer to our troubleshooting guide or contact the operations team.*