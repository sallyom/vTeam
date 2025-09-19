# Use Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies + debugging tools + git for spek-kit
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    ca-certificates \
    gnupg \
    strace \
    procps \
    lsof \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 18+ (required for Claude Code)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# Copy requirements first for better Docker layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code


# Copy the application files with proper permissions
COPY main.py /app/
COPY spek_kit_integration.py /app/
COPY git_integration.py /app/
COPY agent_loader.py /app/
COPY auth_handler.py /app/
COPY agents/ /app/agents/
COPY CLAUDE.md /app/
RUN chmod 755 /app/main.py && chmod 644 /app/spek_kit_integration.py && chmod 644 /app/git_integration.py && chmod 644 /app/agent_loader.py && chmod 644 /app/auth_handler.py && chmod 644 /app/CLAUDE.md && chmod 755 /app/agents && chmod 644 /app/agents/*

# Set OpenShift-compatible environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV NODE_OPTIONS="--max-old-space-size=2048"
ENV HOME=/app
ENV SHELL=/bin/bash
ENV TERM=xterm-256color

# OpenShift runs with random UID - don't set USER directive
# Ensure /app directory is accessible to any UID, and make agent files world-readable as fallback
RUN chmod -R g=u /app && chmod -R g=u /usr/local && chmod g=u /etc/passwd && \
    chmod -R a+r /app/agents/

# Run the application
CMD ["python", "main.py"]
