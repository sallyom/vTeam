# vteam-rfes Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-10-19

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

### Completed Tasks (Phase 3.1: Setup & Infrastructure)
- ✅ T001: RAGDatabase CRD created (`manifests/crds/ragdatabases-crd.yaml`)
- ✅ T002: RAGDocument CRD created (`manifests/crds/ragdocuments-crd.yaml`)
- ✅ T003: pgvector schema created (`manifests/schemas/pgvector-schema.sql`)
- ✅ T004: pgvector StatefulSet template (`manifests/deployments/pgvector-statefulset.yaml`)
- ✅ T005: docs2db Job template (`manifests/deployments/docs2db-job-template.yaml`)
- ✅ T006-T008: Backend/Operator/Frontend stub files created
- ✅ T027: Backend RAG types defined (`backend/types/rag.go`)
- ✅ T028: K8s client wrappers stubbed (`backend/k8s/rag_client.go`)
- ✅ T049: Frontend TypeScript types (`frontend/src/types/rag.ts`)

### Current Phase: 3.2 Contract Tests (TDD)
Next tasks involve writing failing contract tests before implementation:
- T011-T022: Backend API contract tests
- T023-T024: Operator reconciler integration tests
- T025-T026: Frontend component tests

### Pending Implementation
- Backend handlers (T029-T042) - Stub functions exist, need implementation
- Operator reconcilers (T043-T048) - Stub files exist
- Frontend hooks and pages (T050-T060) - Types defined, components pending
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

See `specs/001-add-a-rag/` for detailed specifications and `tasks.md` for implementation plan.
<!-- MANUAL ADDITIONS END -->