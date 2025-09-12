FROM registry.redhat.io/ubi9/python-311@sha256:ed423c14020369e28f1a9ecb6ea74eb1e23b521c9fd82e3690bb53300086c571

WORKDIR /app

# Ensure proper permissions for the app directory
USER root
RUN dnf -y install nc && dnf clean all
RUN chown -R 1001:0 /app && chmod -R g+rwX /app
COPY startup.sh ./

RUN chmod +x startup.sh && chown 1001:0 startup.sh

USER 1001

# Set UV cache directory to app directory where we have permissions
ENV UV_CACHE_DIR=/app/.cache/uv
RUN mkdir -p /app/.cache/uv

COPY pyproject.toml ./
COPY uv.lock ./
COPY README.md ./

RUN pip install uv && uv sync --frozen

COPY src ./src
COPY ui ./ui
COPY data ./data
COPY deployment.yml ./

# Install UI dependencies
WORKDIR /app/ui

# Configure npm to use user directory for global installs
RUN mkdir -p /app/.npm-global
ENV NPM_CONFIG_PREFIX=/app/.npm-global
ENV PATH=/app/.npm-global/bin:$PATH

RUN npm i -g pnpm
WORKDIR /app

RUN uv run generate

RUN chmod -R g+w .venv/

ENV HOME=/app
RUN mkdir -p /app/.config/llamactl && chmod -R 777 /app/.config

EXPOSE 4501

CMD ["./startup.sh"]
