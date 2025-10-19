// RAG-related TypeScript type definitions

export interface RAGDatabaseMetadata {
  name: string;
  namespace: string;
  uid: string;
  creationTimestamp: string;
  labels?: Record<string, string>;
}

export interface RAGDatabaseSpec {
  displayName: string;
  description?: string;
  projectName: string;
  storage: {
    size: string;
    storageClass?: string;
  };
  pgvectorConfig?: {
    version?: string;
    extensions?: string[];
  };
  importFrom?: {
    dumpFileUrl: string;
  };
}

export interface ProcessingProgress {
  totalFiles: number;
  processedFiles: number;
  failedFiles: number;
  currentPhase: 'ingestion' | 'extraction' | 'embedding' | 'loading' | 'completed';
  estimatedTimeRemainingMs: number;
}

export interface RAGDatabaseStatus {
  phase: 'Creating' | 'Processing' | 'Ready' | 'Failed' | 'Degraded';
  message?: string;
  endpoint?: string;
  databaseName?: string;
  documentCount: number;
  chunkCount: number;
  storageUsed?: string;
  processingProgress?: ProcessingProgress;
  health?: 'Healthy' | 'Degraded' | 'Unavailable';
  lastBackupTime?: string;
  lastAccessedTime?: string;
}

export interface RAGDatabase {
  metadata: RAGDatabaseMetadata;
  spec: RAGDatabaseSpec;
  status: RAGDatabaseStatus;
}

export interface RAGDocumentMetadata {
  name: string;
  namespace: string;
  uid: string;
  creationTimestamp: string;
  labels?: Record<string, string>;
}

export interface RAGDocumentSpec {
  databaseRef: string;
  fileName: string;
  fileFormat: string;
  fileSize: number;
  uploadedBy: string;
  checksum: string;
  storagePath: string;
}

export interface RAGDocumentStatus {
  phase: 'Uploaded' | 'Processing' | 'Completed' | 'Failed';
  chunkCount: number;
  processingTime?: number;
  errorMessage?: string;
  processedAt?: string;
}

export interface RAGDocument {
  metadata: RAGDocumentMetadata;
  spec: RAGDocumentSpec;
  status: RAGDocumentStatus;
}

export interface QueryRequest {
  query: string;
  maxChunks?: number;
  similarityThreshold?: number;
}

export interface DocumentChunk {
  documentId: string;
  documentName: string;
  chunkIndex: number;
  chunkText: string;
  pageNumber?: number;
  relevanceScore: number;
}

export interface QueryMetadata {
  queryTimeMs: number;
  chunksSearched: number;
  embeddingTimeMs: number;
  databaseEndpoint: string;
  timestamp: string;
}

export interface QueryResponse {
  query: string;
  answer: string;
  sources: DocumentChunk[];
  metadata: QueryMetadata;
}

export interface CreateRAGDatabaseRequest {
  displayName: string;
  description?: string;
  storageSize: string;
}

export interface ListRAGDatabasesResponse {
  databases: RAGDatabase[];
  totalCount: number;
}

export interface ListRAGDocumentsResponse {
  documents: RAGDocument[];
  totalCount: number;
}

export interface DocumentUploadResult {
  fileName: string;
  fileSize: number;
  reason?: string;
  crName?: string;
}

export interface DocumentUploadResponse {
  accepted: DocumentUploadResult[];
  rejected: DocumentUploadResult[];
}