# Multi-stage build for frontend and backend
FROM node:18-alpine as frontend-builder

# Set working directory for frontend
WORKDIR /frontend

# Copy frontend package files
COPY frontend/package*.json ./
COPY frontend/yarn.lock ./

# Install frontend dependencies
RUN npm install

# Copy frontend source code
COPY frontend/ ./

# Build the frontend for production
RUN npm run build

# Backend stage
FROM python:3.12-slim as backend

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    nginx \
    && rm -rf /var/lib/apt/lists/*

# Copy pyproject.toml and install Python dependencies
COPY pyproject.toml ./
RUN pip install --no-cache-dir -e .

# Copy source code
COPY src/ ./src/

# Install the Python package in development mode
RUN pip install --no-cache-dir -e .

# Copy built frontend from frontend-builder stage
COPY --from=frontend-builder /frontend/dist /var/www/html

# Create nginx configuration for serving frontend and proxying API
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    \
    # Serve frontend static files \
    location / { \
        root /var/www/html; \
        try_files $uri $uri/ /index.html; \
        add_header Cache-Control "no-cache, no-store, must-revalidate"; \
        add_header Pragma "no-cache"; \
        add_header Expires "0"; \
    } \
    \
    # Proxy API requests to backend \
    location /api/ { \
        proxy_pass http://127.0.0.1:8000/; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $scheme; \
    } \
    \
    # Health check endpoint \
    location /health { \
        proxy_pass http://127.0.0.1:8000/health; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $scheme; \
    } \
}' > /etc/nginx/sites-available/default

# Create directory for SQLite databases
RUN mkdir -p /tmp

# Expose the nginx port (frontend + API proxy)
EXPOSE 80

# Set environment variables
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Create startup script that runs both nginx and the Python API
RUN echo '#!/bin/bash \
set -e \
echo "Starting nginx..." \
nginx -g "daemon on;" \
echo "Starting Python API..." \
exec python -m rhoai_ai_feature_sizing.run_api' > /app/start.sh && \
chmod +x /app/start.sh

# Default command to run both services
CMD ["/app/start.sh"] 