# Multi-stage build for RHOAI AI Feature Sizing with LlamaDeploy
FROM python:3.11-slim as base

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
COPY pyproject.toml uv.lock* ./

# Install Python dependencies
RUN uv sync --no-dev --frozen

# Copy source code
COPY src/ ./src/
COPY deployment.yml ./
COPY deploy.py ./

# Create necessary directories
RUN mkdir -p uploads/temp uploads/workflow_temp output/python-rag output/session-contexts

# Install Node.js and pnpm for UI build (if needed)
FROM base as ui-builder
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm

# Copy UI source
COPY ui/ ./ui/
WORKDIR /app/ui

# Install UI dependencies and build
RUN pnpm install --frozen-lockfile
RUN pnpm build

# Final production stage
FROM base as production

# Copy built UI from ui-builder stage
COPY --from=ui-builder /app/ui/dist ./ui/dist
COPY --from=ui-builder /app/ui/package.json ./ui/

# Copy the rest of the application
COPY --from=ui-builder /app ./

# Create non-root user for OpenShift security
RUN groupadd -r appuser && useradd -r -g appuser appuser \
    && chown -R appuser:appuser /app \
    && chmod -R 755 /app

USER appuser

# Expose ports
EXPOSE 4501 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Start the application
CMD ["uv", "run", "python", "deploy.py"]
