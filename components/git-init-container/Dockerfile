# Build stage
FROM golang:1.23-alpine AS builder

# Install git (required for git operations)
RUN apk add --no-cache git

WORKDIR /build

# Copy go mod files from backend (since we're importing git package)
COPY components/backend/go.mod components/backend/go.sum ./
RUN go mod download

# Copy backend git package
COPY components/backend/git ./git/
COPY components/backend/types ./types/
COPY components/backend/gitlab ./gitlab/

# Copy init container code
COPY components/git-init-container/main.go ./

# Build the init container binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o git-init main.go

# Final stage
FROM alpine:3.19

# Install git and ca-certificates
RUN apk add --no-cache git ca-certificates

# Copy the binary from builder
COPY --from=builder /build/git-init /usr/local/bin/git-init

# Run as non-root user
RUN addgroup -g 1000 runner && \
    adduser -D -u 1000 -G runner runner

USER runner

ENTRYPOINT ["/usr/local/bin/git-init"]
