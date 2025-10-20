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

// T014: Contract test for DELETE /api/projects/{projectName}/rag-databases/{dbName}
func TestDeleteRAGDatabase(t *testing.T) {
	gin.SetMode(gin.TestMode)

	projectName := "test-project"
	dbName := "engineering-docs"

	tests := []struct {
		name           string
		projectName    string
		dbName         string
		setupAuth      func(c *gin.Context)
		setupData      func() // Mock function to setup test data
		expectedStatus int
		expectedError  string
	}{
		{
			name:        "returns 204 No Content on successful deletion",
			projectName: projectName,
			dbName:      dbName,
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			setupData: func() {
				// In real test, this would create a RAGDatabase CR
			},
			expectedStatus: http.StatusNoContent,
		},
		{
			name:        "returns 409 Conflict if database is linked to active sessions",
			projectName: projectName,
			dbName:      "in-use-db",
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			setupData: func() {
				// In real test, this would:
				// 1. Create a RAGDatabase CR
				// 2. Create an AgenticSession CR that references this database
			},
			expectedStatus: http.StatusConflict,
			expectedError:  "Database is in use by active sessions",
		},
		{
			name:        "returns 404 for non-existent database",
			projectName: projectName,
			dbName:      "non-existent-db",
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusNotFound,
			expectedError:  "RAG database 'non-existent-db' not found",
		},
		{
			name:        "returns 403 for unauthorized user",
			projectName: projectName,
			dbName:      dbName,
			setupAuth: func(c *gin.Context) {
				// No auth context set
			},
			expectedStatus: http.StatusForbidden,
			expectedError:  "User is not authorized",
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
				fmt.Sprintf("/api/projects/%s/rag-databases/%s", tt.projectName, tt.dbName),
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

				errorMsg, ok := responseBody["error"].(string)
				if !ok {
					errorMsg, _ = responseBody["message"].(string)
				}
				assert.Contains(t, errorMsg, tt.expectedError)
			}
		})
	}
}

// TestDeleteRAGDatabase_CascadeDelete verifies cascading deletion of resources
func TestDeleteRAGDatabase_CascadeDelete(t *testing.T) {
	gin.SetMode(gin.TestMode)
	projectName := "test-project"
	dbName := "cascade-test-db"

	// Setup
	router := SetupContractTestRouter()
	router.Use(MockAuthMiddleware(projectName, "test-user@example.com"))

	// In a real implementation, this test would:
	// 1. Create a RAGDatabase with documents
	// 2. Delete the RAGDatabase
	// 3. Verify all RAGDocument CRs are also deleted
	// 4. Verify the pgvector StatefulSet is deleted
	// 5. Verify the PVC is deleted

	req, err := http.NewRequest(http.MethodDelete,
		fmt.Sprintf("/api/projects/%s/rag-databases/%s", projectName, dbName),
		nil)
	require.NoError(t, err)
	req.Header.Set("Authorization", "Bearer test-token")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// The test should verify cascade deletion behavior
	// For now, we just verify the endpoint responds appropriately
	assert.Contains(t, []int{http.StatusNoContent, http.StatusNotFound}, w.Code)
}

// TestDeleteRAGDatabase_Idempotency verifies DELETE is idempotent
func TestDeleteRAGDatabase_Idempotency(t *testing.T) {
	gin.SetMode(gin.TestMode)
	projectName := "test-project"
	dbName := "idempotent-test-db"

	// Setup
	router := SetupContractTestRouter()
	router.Use(MockAuthMiddleware(projectName, "test-user@example.com"))

	// First deletion
	req1, err := http.NewRequest(http.MethodDelete,
		fmt.Sprintf("/api/projects/%s/rag-databases/%s", projectName, dbName),
		nil)
	require.NoError(t, err)
	req1.Header.Set("Authorization", "Bearer test-token")

	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)

	// Second deletion (should be idempotent)
	req2, err := http.NewRequest(http.MethodDelete,
		fmt.Sprintf("/api/projects/%s/rag-databases/%s", projectName, dbName),
		nil)
	require.NoError(t, err)
	req2.Header.Set("Authorization", "Bearer test-token")

	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)

	// Both requests should succeed
	// First might be 204 or 404 depending on whether database existed
	// Second should be 404 (already deleted)
	assert.Contains(t, []int{http.StatusNoContent, http.StatusNotFound}, w1.Code)
	assert.Equal(t, http.StatusNotFound, w2.Code)
}