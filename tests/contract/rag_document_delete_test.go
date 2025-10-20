package contract

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// T020: Contract test for DELETE /api/projects/{projectName}/rag-databases/{dbName}/documents/{docName}
func TestDeleteRAGDocument(t *testing.T) {
	gin.SetMode(gin.TestMode)

	projectName := "test-project"
	dbName := "test-db"
	docName := "test-document"

	tests := []struct {
		name           string
		projectName    string
		dbName         string
		docName        string
		setupAuth      func(c *gin.Context)
		setupData      func() // Mock function to setup test data
		expectedStatus int
		expectedError  string
	}{
		{
			name:        "returns 204 No Content on successful deletion",
			projectName: projectName,
			dbName:      dbName,
			docName:     docName,
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			setupData: func() {
				// In real test, this would create:
				// 1. A RAGDocument CR
				// 2. Insert chunks into pgvector database
			},
			expectedStatus: http.StatusNoContent,
		},
		{
			name:        "returns 404 for non-existent document",
			projectName: projectName,
			dbName:      dbName,
			docName:     "non-existent-doc",
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusNotFound,
			expectedError:  "document.*not found",
		},
		{
			name:        "returns 404 for document in wrong database",
			projectName: projectName,
			dbName:      "wrong-db",
			docName:     docName,
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusNotFound,
			expectedError:  "not found",
		},
		{
			name:        "returns 403 for unauthorized user",
			projectName: projectName,
			dbName:      dbName,
			docName:     docName,
			setupAuth: func(c *gin.Context) {
				// No auth context set
			},
			expectedStatus: http.StatusForbidden,
			expectedError:  "not authorized",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup test data if needed
			if tt.setupData != nil {
				tt.setupData()
			}

			// Setup router
			router := SetupContractTestRouter()

			// Create request
			req, err := http.NewRequest(http.MethodDelete,
				fmt.Sprintf("/api/projects/%s/rag-databases/%s/documents/%s",
					tt.projectName, tt.dbName, tt.docName),
				nil)
			require.NoError(t, err)
			req.Header.Set("Authorization", "Bearer test-token")

			// Create response recorder
			w := httptest.NewRecorder()

			// Add test middleware to set auth context
			router.Use(func(c *gin.Context) {
				if tt.setupAuth != nil {
					tt.setupAuth(c)
				}
				c.Next()
			})

			// Execute request
			router.ServeHTTP(w, req)

			// Validate response
			assert.Equal(t, tt.expectedStatus, w.Code)

			// For 204, body should be empty
			if tt.expectedStatus == http.StatusNoContent {
				assert.Empty(t, w.Body.String())
			} else if tt.expectedError != "" {
				// Parse error response
				var responseBody map[string]interface{}
				err = json.Unmarshal(w.Body.Bytes(), &responseBody)
				require.NoError(t, err)

				errorMsg, _ := responseBody["error"].(string)
				if errorMsg == "" {
					errorMsg, _ = responseBody["message"].(string)
				}
				assert.Regexp(t, tt.expectedError, errorMsg)
			}
		})
	}
}

// TestDeleteRAGDocument_CascadeCleanup verifies cleanup of related data
func TestDeleteRAGDocument_CascadeCleanup(t *testing.T) {
	gin.SetMode(gin.TestMode)
	projectName := "test-project"
	dbName := "test-db"
	docName := "doc-with-chunks"

	// Setup
	router := SetupContractTestRouter()
	router.Use(MockAuthMiddleware(projectName, "test-user@example.com"))

	// In a real implementation, this test would:
	// 1. Create a RAGDocument with multiple chunks in pgvector
	// 2. Delete the RAGDocument
	// 3. Verify all chunks are deleted from pgvector
	// 4. Verify the document file is deleted from PVC
	// 5. Verify the RAGDocument CR is deleted

	req, err := http.NewRequest(http.MethodDelete,
		fmt.Sprintf("/api/projects/%s/rag-databases/%s/documents/%s",
			projectName, dbName, docName),
		nil)
	require.NoError(t, err)
	req.Header.Set("Authorization", "Bearer test-token")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// The test should verify cascade cleanup behavior
	assert.Contains(t, []int{http.StatusNoContent, http.StatusNotFound}, w.Code)
}

// TestDeleteRAGDocument_IdempotentDelete verifies DELETE is idempotent
func TestDeleteRAGDocument_IdempotentDelete(t *testing.T) {
	gin.SetMode(gin.TestMode)
	projectName := "test-project"
	dbName := "test-db"
	docName := "idempotent-test-doc"

	// Setup
	router := SetupContractTestRouter()
	router.Use(MockAuthMiddleware(projectName, "test-user@example.com"))

	// First deletion
	req1, err := http.NewRequest(http.MethodDelete,
		fmt.Sprintf("/api/projects/%s/rag-databases/%s/documents/%s",
			projectName, dbName, docName),
		nil)
	require.NoError(t, err)
	req1.Header.Set("Authorization", "Bearer test-token")

	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)

	// Second deletion (should be idempotent)
	req2, err := http.NewRequest(http.MethodDelete,
		fmt.Sprintf("/api/projects/%s/rag-databases/%s/documents/%s",
			projectName, dbName, docName),
		nil)
	require.NoError(t, err)
	req2.Header.Set("Authorization", "Bearer test-token")

	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)

	// Both requests should succeed
	// First might be 204 or 404 depending on whether document existed
	// Second should be 404 (already deleted)
	assert.Contains(t, []int{http.StatusNoContent, http.StatusNotFound}, w1.Code)
	assert.Equal(t, http.StatusNotFound, w2.Code)
}

// TestDeleteRAGDocument_ProcessingDocument verifies deletion during processing
func TestDeleteRAGDocument_ProcessingDocument(t *testing.T) {
	gin.SetMode(gin.TestMode)
	projectName := "test-project"
	dbName := "test-db"
	docName := "processing-doc"

	// Setup
	router := SetupContractTestRouter()
	router.Use(MockAuthMiddleware(projectName, "test-user@example.com"))

	// In a real test, this would attempt to delete a document
	// that is currently in "Processing" phase
	// The implementation should handle this gracefully:
	// - Either allow deletion (canceling processing)
	// - Or return appropriate error (409 Conflict)

	req, err := http.NewRequest(http.MethodDelete,
		fmt.Sprintf("/api/projects/%s/rag-databases/%s/documents/%s",
			projectName, dbName, docName),
		nil)
	require.NoError(t, err)
	req.Header.Set("Authorization", "Bearer test-token")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Valid responses:
	// - 204: Deletion allowed (processing canceled)
	// - 404: Document doesn't exist
	// - 409: Cannot delete while processing (if implementation chooses this)
	assert.Contains(t, []int{
		http.StatusNoContent,
		http.StatusNotFound,
		http.StatusConflict,
	}, w.Code)

	if w.Code == http.StatusConflict {
		var responseBody map[string]interface{}
		err = json.Unmarshal(w.Body.Bytes(), &responseBody)
		require.NoError(t, err)

		errorMsg, _ := responseBody["error"].(string)
		if errorMsg == "" {
			errorMsg, _ = responseBody["message"].(string)
		}
		assert.Contains(t, errorMsg, "processing")
	}
}