package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// UploadRAGDocuments handles POST /api/projects/:projectName/rag-databases/:dbName/documents
func UploadRAGDocuments(c *gin.Context) {
	// TODO: Implement document upload
	// 1. Parse multipart/form-data files[] (max 50 files)
	// 2. Validate each file: size (<= 100MB), format
	// 3. Generate SHA-256 checksum for each file
	// 4. Store files to PVC
	// 5. Create RAGDocument CR for each valid file
	// 6. Return 202 Accepted with {accepted: [], rejected: []}
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}

// ListRAGDocuments handles GET /api/projects/:projectName/rag-databases/:dbName/documents
func ListRAGDocuments(c *gin.Context) {
	// TODO: Implement document listing
	// 1. Extract projectName, dbName, and optional status query param
	// 2. Call k8s client to list RAGDocument CRs with label selector
	// 3. Filter by status if query param provided
	// 4. Return 200 with {documents: [], totalCount: N}
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}

// GetRAGDocument handles GET /api/projects/:projectName/rag-databases/:dbName/documents/:docName
func GetRAGDocument(c *gin.Context) {
	// TODO: Implement get single document
	// 1. Extract projectName, dbName, docName from URL path
	// 2. Call k8s client to get RAGDocument CR
	// 3. Return 200 with full RAGDocument (metadata, spec, status)
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}

// DeleteRAGDocument handles DELETE /api/projects/:projectName/rag-databases/:dbName/documents/:docName
func DeleteRAGDocument(c *gin.Context) {
	// TODO: Implement document deletion
	// 1. Extract projectName, dbName, docName from URL path
	// 2. Delete document file from PVC
	// 3. Delete chunks from pgvector database
	// 4. Call k8s client to delete RAGDocument CR
	// 5. Return 204 No Content on success
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}