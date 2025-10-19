package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// CreateRAGDatabase handles POST /api/projects/:projectName/rag-databases
func CreateRAGDatabase(c *gin.Context) {
	// TODO: Implement RAG database creation
	// 1. Parse CreateRAGDatabaseRequest from JSON body
	// 2. Validate displayName (1-100 chars), storageSize (max 5Gi)
	// 3. Check project membership authorization
	// 4. Generate unique CR name from displayName
	// 5. Call k8s client to create RAGDatabase CR
	// 6. Return 201 Created with RAGDatabase JSON
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}

// ListRAGDatabases handles GET /api/projects/:projectName/rag-databases
func ListRAGDatabases(c *gin.Context) {
	// TODO: Implement RAG database listing
	// 1. Extract projectName from URL path
	// 2. Call k8s client to list RAGDatabase CRs in namespace
	// 3. Return 200 with {databases: [], totalCount: N}
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}

// GetRAGDatabase handles GET /api/projects/:projectName/rag-databases/:dbName
func GetRAGDatabase(c *gin.Context) {
	// TODO: Implement get single RAG database
	// 1. Extract projectName and dbName from URL path
	// 2. Call k8s client to get RAGDatabase CR
	// 3. Return 200 with full RAGDatabase (metadata, spec, status)
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}

// DeleteRAGDatabase handles DELETE /api/projects/:projectName/rag-databases/:dbName
func DeleteRAGDatabase(c *gin.Context) {
	// TODO: Implement RAG database deletion
	// 1. Extract projectName and dbName from URL path
	// 2. Check if database is linked to active sessions
	// 3. Call k8s client to delete RAGDatabase CR
	// 4. Return 204 No Content on success
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}

// GetRAGDatabaseStatus handles GET /api/projects/:projectName/rag-databases/:dbName/status
func GetRAGDatabaseStatus(c *gin.Context) {
	// TODO: Implement RAG database status endpoint
	// 1. Extract projectName and dbName from URL path
	// 2. Call k8s client to get RAGDatabase CR
	// 3. Return 200 with status object
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}

// ImportRAGDatabaseDump handles POST /api/projects/:projectName/rag-databases/import-dump
func ImportRAGDatabaseDump(c *gin.Context) {
	// TODO: Implement RAG database import from dump
	// 1. Parse multipart/form-data (dumpFile, databaseName, displayName)
	// 2. Validate dumpFile size and format
	// 3. Store dump file to PVC
	// 4. Create RAGDatabase CR with import configuration
	// 5. Return 202 Accepted with RAGDatabase
	c.JSON(http.StatusNotImplemented, gin.H{"error": "not implemented"})
}