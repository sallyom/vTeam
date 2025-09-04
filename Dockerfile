# Multi-stage build for RHOAI AI Feature Sizing with LlamaDeploy
# For Apple Silicon Macs use: linux/arm64
# For Intel Macs use: linux/amd64
FROM --platform=linux/arm64 python:3.11-slim as base

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
RUN uv sync --no-dev --frozen

# Copy source code
COPY src/ ./src/
COPY deployment.yml ./
COPY deploy.py ./

# Create necessary directories
RUN mkdir -p output/python-rag output/session-contexts

# Install Node.js and pnpm for UI build (if needed)
FROM base as ui-builder
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm

# Copy UI source
COPY ui/ ./ui/
WORKDIR /app/ui

# Install UI dependencies and build
RUN npm install
RUN npm run build

# Final production stage
FROM base as production

# Copy built UI from ui-builder stage
COPY --from=ui-builder /app/ui/dist ./ui/dist
COPY --from=ui-builder /app/ui/package.json ./ui/

# Copy the rest of the application
COPY --from=ui-builder /app ./

# Set permissions for OpenShift (any user can access)
RUN chmod -R g+w /app && \
    chmod g+w /tmp

# Expose ports
EXPOSE 4501 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Start the application
CMD ["uv", "run", "python", "deploy.py"]
