package types

import (
	"time"
)

// RAGDatabaseSpec defines the desired state of a RAG database
type RAGDatabaseSpec struct {
	DisplayName    string                `json:"displayName"`
	Description    string                `json:"description,omitempty"`
	ProjectName    string                `json:"projectName"`
	Storage        RAGDatabaseStorage    `json:"storage"`
	PgvectorConfig *PgvectorConfig       `json:"pgvectorConfig,omitempty"`
	ImportFrom     *RAGDatabaseImport    `json:"importFrom,omitempty"`
}

// RAGDatabaseStorage defines storage configuration
type RAGDatabaseStorage struct {
	Size         string `json:"size"`
	StorageClass string `json:"storageClass,omitempty"`
}

// PgvectorConfig defines PostgreSQL and pgvector configuration
type PgvectorConfig struct {
	Version    string   `json:"version,omitempty"`
	Extensions []string `json:"extensions,omitempty"`
}

// RAGDatabaseImport defines import configuration
type RAGDatabaseImport struct {
	DumpFileURL string `json:"dumpFileUrl"`
}

// RAGDatabaseStatus defines the observed state of a RAG database
type RAGDatabaseStatus struct {
	Phase               string              `json:"phase"`
	Message             string              `json:"message,omitempty"`
	Endpoint            string              `json:"endpoint,omitempty"`
	DatabaseName        string              `json:"databaseName,omitempty"`
	DocumentCount       int                 `json:"documentCount"`
	ChunkCount          int                 `json:"chunkCount"`
	StorageUsed         string              `json:"storageUsed,omitempty"`
	ProcessingProgress  *ProcessingProgress `json:"processingProgress,omitempty"`
	Health              string              `json:"health,omitempty"`
	LastBackupTime      *time.Time          `json:"lastBackupTime,omitempty"`
	LastAccessedTime    *time.Time          `json:"lastAccessedTime,omitempty"`
}

// ProcessingProgress tracks document processing progress
type ProcessingProgress struct {
	TotalFiles               int    `json:"totalFiles"`
	ProcessedFiles           int    `json:"processedFiles"`
	FailedFiles              int    `json:"failedFiles"`
	CurrentPhase             string `json:"currentPhase"`
	EstimatedTimeRemainingMs int64  `json:"estimatedTimeRemainingMs"`
}

// RAGDocumentSpec defines the desired state of a RAG document
type RAGDocumentSpec struct {
	DatabaseRef  string `json:"databaseRef"`
	FileName     string `json:"fileName"`
	FileFormat   string `json:"fileFormat"`
	FileSize     int64  `json:"fileSize"`
	UploadedBy   string `json:"uploadedBy"`
	Checksum     string `json:"checksum"`
	StoragePath  string `json:"storagePath"`
}

// RAGDocumentStatus defines the observed state of a RAG document
type RAGDocumentStatus struct {
	Phase          string     `json:"phase"`
	ChunkCount     int        `json:"chunkCount"`
	ProcessingTime int64      `json:"processingTime,omitempty"`
	ErrorMessage   string     `json:"errorMessage,omitempty"`
	ProcessedAt    *time.Time `json:"processedAt,omitempty"`
}

// QueryRequest defines the request for RAG queries
type QueryRequest struct {
	Query                string  `json:"query" binding:"required,min=1,max=2000"`
	MaxChunks            int     `json:"maxChunks,omitempty"`
	SimilarityThreshold  float64 `json:"similarityThreshold,omitempty"`
}

// QueryResponse defines the response for RAG queries
type QueryResponse struct {
	Query    string           `json:"query"`
	Answer   string           `json:"answer"`
	Sources  []DocumentChunk  `json:"sources"`
	Metadata QueryMetadata    `json:"metadata"`
}

// DocumentChunk represents a chunk of a document with relevance score
type DocumentChunk struct {
	DocumentID     string  `json:"documentId"`
	DocumentName   string  `json:"documentName"`
	ChunkIndex     int     `json:"chunkIndex"`
	ChunkText      string  `json:"chunkText"`
	PageNumber     int     `json:"pageNumber,omitempty"`
	RelevanceScore float64 `json:"relevanceScore"`
}

// QueryMetadata contains metadata about query execution
type QueryMetadata struct {
	QueryTimeMs      int64     `json:"queryTimeMs"`
	ChunksSearched   int       `json:"chunksSearched"`
	EmbeddingTimeMs  int64     `json:"embeddingTimeMs"`
	DatabaseEndpoint string    `json:"databaseEndpoint"`
	Timestamp        time.Time `json:"timestamp"`
}

// CreateRAGDatabaseRequest defines the request to create a RAG database
type CreateRAGDatabaseRequest struct {
	DisplayName string             `json:"displayName" binding:"required,min=1,max=100"`
	Description string             `json:"description,omitempty"`
	StorageSize string             `json:"storageSize" binding:"required"`
}

// ListRAGDatabasesResponse defines the response for listing RAG databases
type ListRAGDatabasesResponse struct {
	Databases  []RAGDatabase `json:"databases"`
	TotalCount int           `json:"totalCount"`
}

// RAGDatabase represents a complete RAG database with metadata, spec, and status
type RAGDatabase struct {
	Metadata RAGDatabaseMetadata `json:"metadata"`
	Spec     RAGDatabaseSpec     `json:"spec"`
	Status   RAGDatabaseStatus   `json:"status"`
}

// RAGDatabaseMetadata contains Kubernetes metadata
type RAGDatabaseMetadata struct {
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	UID               string            `json:"uid"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels,omitempty"`
}

// RAGDocument represents a complete RAG document with metadata, spec, and status
type RAGDocument struct {
	Metadata RAGDocumentMetadata `json:"metadata"`
	Spec     RAGDocumentSpec     `json:"spec"`
	Status   RAGDocumentStatus   `json:"status"`
}

// RAGDocumentMetadata contains Kubernetes metadata
type RAGDocumentMetadata struct {
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	UID               string            `json:"uid"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels,omitempty"`
}

// ListRAGDocumentsResponse defines the response for listing RAG documents
type ListRAGDocumentsResponse struct {
	Documents  []RAGDocument `json:"documents"`
	TotalCount int           `json:"totalCount"`
}

// DocumentUploadResponse defines the response for document upload
type DocumentUploadResponse struct {
	Accepted []DocumentUploadResult `json:"accepted"`
	Rejected []DocumentUploadResult `json:"rejected"`
}

// DocumentUploadResult contains the result of a single document upload
type DocumentUploadResult struct {
	FileName string `json:"fileName"`
	FileSize int64  `json:"fileSize"`
	Reason   string `json:"reason,omitempty"`
	CRName   string `json:"crName,omitempty"`
}