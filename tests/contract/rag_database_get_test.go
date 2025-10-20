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

// T013: Contract test for GET /api/projects/{projectName}/rag-databases/{dbName}
func TestGetRAGDatabase(t *testing.T) {
	gin.SetMode(gin.TestMode)

	projectName := "test-project"
	dbName := "engineering-docs"

	tests := []struct {
		name           string
		projectName    string
		dbName         string
		setupAuth      func(c *gin.Context)
		expectedStatus int
		expectedError  string
		validateBody   func(t *testing.T, body map[string]interface{})
	}{
		{
			name:        "returns 200 with full RAGDatabase spec and status",
			projectName: projectName,
			dbName:      dbName,
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusOK,
			validateBody: func(t *testing.T, body map[string]interface{}) {
				// Verify complete RAGDatabase structure
				assert.NotNil(t, body["metadata"])
				assert.NotNil(t, body["spec"])
				assert.NotNil(t, body["status"])

				// Verify metadata
				metadata := body["metadata"].(map[string]interface{})
				assert.Equal(t, dbName, metadata["name"])
				assert.Equal(t, projectName, metadata["namespace"])
				assert.NotEmpty(t, metadata["uid"])
				assert.NotEmpty(t, metadata["creationTimestamp"])

				// Verify spec
				spec := body["spec"].(map[string]interface{})
				assert.Equal(t, projectName, spec["projectName"])
				assert.NotNil(t, spec["storage"])

				// Verify status
				status := body["status"].(map[string]interface{})
				assert.NotNil(t, status["phase"])
				assert.NotNil(t, status["health"])

				// Verify status includes metrics
				assert.Contains(t, status, "documentCount")
				assert.Contains(t, status, "chunkCount")
				assert.Contains(t, status, "storageUsed")

				// Verify endpoint is included if database is Ready
				if status["phase"] == "Ready" {
					assert.NotEmpty(t, status["endpoint"])
				}
			},
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
			expectedError:  "User is not authorized to access project",
		},
		{
			name:        "returns 404 for database in different project",
			projectName: "different-project",
			dbName:      dbName,
			setupAuth: func(c *gin.Context) {
				c.Set("project", "different-project")
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusNotFound,
			expectedError:  "not found",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup
			router := SetupContractTestRouter()

			// Create request
			req, err := http.NewRequest(http.MethodGet,
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

			// Parse response body
			var responseBody map[string]interface{}
			err = json.Unmarshal(w.Body.Bytes(), &responseBody)
			require.NoError(t, err)

			if tt.expectedError != "" {
				errorMsg, ok := responseBody["error"].(string)
				if !ok {
					// Check if error is in message field
					errorMsg, _ = responseBody["message"].(string)
				}
				assert.Contains(t, errorMsg, tt.expectedError)
			}

			if tt.validateBody != nil {
				tt.validateBody(t, responseBody)
			}
		})
	}
}

// TestGetRAGDatabase_StatusConsistency verifies status fields are consistent
func TestGetRAGDatabase_StatusConsistency(t *testing.T) {
	gin.SetMode(gin.TestMode)
	projectName := "test-project"
	dbName := "test-db"

	// Setup
	router := SetupContractTestRouter()
	router.Use(MockAuthMiddleware(projectName, "test-user@example.com"))

	req, err := http.NewRequest(http.MethodGet,
		fmt.Sprintf("/api/projects/%s/rag-databases/%s", projectName, dbName),
		nil)
	require.NoError(t, err)
	req.Header.Set("Authorization", "Bearer test-token")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// If database exists, verify status consistency
	if w.Code == http.StatusOK {
		var responseBody map[string]interface{}
		err = json.Unmarshal(w.Body.Bytes(), &responseBody)
		require.NoError(t, err)

		status := responseBody["status"].(map[string]interface{})
		phase := status["phase"].(string)

		// Verify phase-dependent fields
		switch phase {
		case "Creating":
			// Should not have endpoint yet
			assert.Empty(t, status["endpoint"])
		case "Ready":
			// Must have endpoint
			assert.NotEmpty(t, status["endpoint"])
			assert.NotNil(t, status["health"])
		case "Failed":
			// Should have error message
			assert.NotEmpty(t, status["message"])
		}

		// ProcessingProgress should only exist during Processing phase
		if phase != "Processing" {
			assert.Nil(t, status["processingProgress"])
		}
	}
}