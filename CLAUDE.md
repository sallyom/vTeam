# vteam-rfes Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-10-20

## Active Technologies
- RAG Component Integration (001-add-a-rag) - IN PROGRESS

## Project Structure
The RAG implementation is being developed in the main vTeam repository:
```
../vTeam/components/
├── backend/          # Go REST API handlers
├── operator/         # Kubernetes reconcilers
├── frontend/         # Next.js pages and components
├── manifests/        # K8s CRDs, schemas, deployments
└── runners/          # Claude Code runner integration
```

## RAG Implementation Status

### Completed Tasks
#### Phase 3.1: Setup & Infrastructure ✅
- T001-T008: All CRDs, schemas, templates, and stub files created
- T027: Backend RAG types defined
- T028: K8s client wrappers (partial)
- T049: Frontend TypeScript types

#### Phase 3.2: Contract Tests (TDD) ✅
- T011-T022: All contract tests written for RAG APIs
- Tests verify failing state before implementation

#### Phase 3.3: Core Implementation ✅
- T029-T034: RAG Database handlers (Create, List, Get, Delete, Status, Import)
- T035-T038: RAG Document handlers (Upload, List, Get, Delete)
- T039-T042: RAG Query handlers with vector search and SSE streaming
- Embedding service client implemented
- pgvector integration with pgx driver

### Current Phase: 3.4 Operator Implementation
Next tasks involve implementing Kubernetes operators:
- T043-T045: RAGDatabase reconciler (provision pgvector, health checks, metrics)
- T046-T048: RAGDocument reconciler (trigger docs2db jobs, track processing)

### Pending Implementation
- Operator reconcilers (T043-T048)
- Frontend hooks and pages (T050-T060)
- Runner integration (T061-T062)
- Integration testing (T063-T069)

## Commands
```bash
# Run contract tests (should fail initially per TDD)
cd ../vTeam/components/backend
make test-contract

# Check RAG implementation files
find ../vTeam/components -name "*rag*" -o -name "*RAG*"
```

## Code Style
- Go: Follow vTeam backend standards (see main CLAUDE.md)
- TypeScript: Use types (not interfaces), no `any`, Shadcn components
- Tests: TDD approach - write failing tests first

## Recent Changes
- 001-add-a-rag: Infrastructure setup complete, contract tests pending

<!-- MANUAL ADDITIONS START -->
## RAG Feature Overview
The RAG (Retrieval-Augmented Generation) feature enables vTeam agentic sessions to access and query proprietary document collections. Key components:

- **RAGDatabase CRD**: Manages pgvector database lifecycle for document storage
- **RAGDocument CRD**: Tracks individual document processing status
- **pgvector**: PostgreSQL with vector extensions for semantic search
- **docs2db**: Document processing pipeline (ingestion → chunking → embedding)
- **Query API**: Semantic search with source attribution

## RAG API Endpoints
```
# Database Management
POST   /api/projects/:projectName/rag-databases
GET    /api/projects/:projectName/rag-databases
GET    /api/projects/:projectName/rag-databases/:dbName
DELETE /api/projects/:projectName/rag-databases/:dbName
GET    /api/projects/:projectName/rag-databases/:dbName/status
POST   /api/projects/:projectName/rag-databases/import-dump

# Document Management
POST   /api/projects/:projectName/rag-databases/:dbName/documents
GET    /api/projects/:projectName/rag-databases/:dbName/documents
GET    /api/projects/:projectName/rag-databases/:dbName/documents/:docName
DELETE /api/projects/:projectName/rag-databases/:dbName/documents/:docName

# Query Endpoints
POST   /api/projects/:projectName/rag-databases/:dbName/query
POST   /api/projects/:projectName/rag-databases/:dbName/query-stream
```

See `specs/001-add-a-rag/` for detailed specifications and `tasks.md` for implementation plan.
<!-- MANUAL ADDITIONS END -->