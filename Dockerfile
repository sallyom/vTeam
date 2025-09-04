# Multi-stage build for RHOAI AI Feature Sizing with LlamaDeploy
# For Apple Silicon Macs use: linux/arm64
# For Intel Macs use: linux/amd64
FROM --platform=linux/amd64 python:3.11-slim AS base

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV UV_NO_CACHE=1

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install uv for dependency management
RUN pip install --no-cache-dir uv

# Create application directory
WORKDIR /app

# Copy dependency files
COPY pyproject.toml uv.lock* README.md ./

# Install Python dependencies
RUN uv sync --no-dev --frozen && chmod -R g+w .venv

# Copy source code
COPY src/ ./src/
COPY deployment.yml ./
COPY deploy.py ./

# Create necessary directories
RUN mkdir -p output/python-rag output/session-contexts

# Install Node.js for UI build
FROM base AS ui-builder
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Copy UI source
COPY ui/ ./ui/
WORKDIR /app/ui

# Install UI dependencies and build
RUN npm install
RUN npm run build

# Final production stage
FROM base AS production

# Copy built UI from ui-builder stage
COPY --from=ui-builder /app/ui/dist ./ui/dist
COPY --from=ui-builder /app/ui/package.json ./ui/

# Copy Python application files (avoiding node_modules)
COPY --from=ui-builder /app/src ./src
COPY --from=ui-builder /app/output ./output
COPY --from=ui-builder /app/deploy.py ./
COPY --from=ui-builder /app/deployment.yml ./
COPY --from=ui-builder /app/pyproject.toml ./
COPY --from=ui-builder /app/uv.lock* ./
COPY --from=ui-builder /app/README.md ./

# Set permissions for OpenShift (any user can access)
# Include .venv directory for uv operations
RUN chmod -R g+w /app/src /app/output /app/deploy.py /app/deployment.yml /app/.venv && \
    chmod g+w /tmp

# Expose ports
EXPOSE 4501 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Start the application
CMD ["uv", "run", "python", "deploy.py"]
