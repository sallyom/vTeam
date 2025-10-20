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

// T012: Contract test for GET /api/projects/{projectName}/rag-databases
func TestListRAGDatabases(t *testing.T) {
	gin.SetMode(gin.TestMode)

	projectName := "test-project"

	tests := []struct {
		name           string
		projectName    string
		setupAuth      func(c *gin.Context)
		expectedStatus int
		expectedError  string
		validateBody   func(t *testing.T, body map[string]interface{})
	}{
		{
			name:        "returns 200 with array of RAGDatabase objects",
			projectName: projectName,
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusOK,
			validateBody: func(t *testing.T, body map[string]interface{}) {
				// Verify response structure
				assert.NotNil(t, body["databases"])
				databases, ok := body["databases"].([]interface{})
				assert.True(t, ok, "databases should be an array")

				assert.NotNil(t, body["totalCount"])
				totalCount, ok := body["totalCount"].(float64)
				assert.True(t, ok, "totalCount should be a number")

				// totalCount should match array length
				assert.Equal(t, int(totalCount), len(databases))

				// If there are databases, verify their structure
				if len(databases) > 0 {
					db := databases[0].(map[string]interface{})
					assert.NotNil(t, db["metadata"])
					assert.NotNil(t, db["spec"])
					assert.NotNil(t, db["status"])

					// Verify metadata fields
					metadata := db["metadata"].(map[string]interface{})
					assert.NotEmpty(t, metadata["name"])
					assert.Equal(t, projectName, metadata["namespace"])
					assert.NotEmpty(t, metadata["uid"])
					assert.NotEmpty(t, metadata["creationTimestamp"])

					// Verify spec fields
					spec := db["spec"].(map[string]interface{})
					assert.NotNil(t, spec["projectName"])

					// Verify status fields
					status := db["status"].(map[string]interface{})
					assert.NotNil(t, status["phase"])
					assert.NotNil(t, status["health"])
				}
			},
		},
		{
			name:        "returns empty array for project with no databases",
			projectName: "empty-project",
			setupAuth: func(c *gin.Context) {
				c.Set("project", "empty-project")
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusOK,
			validateBody: func(t *testing.T, body map[string]interface{}) {
				databases, ok := body["databases"].([]interface{})
				assert.True(t, ok, "databases should be an array")
				assert.Empty(t, databases, "databases array should be empty")

				totalCount, ok := body["totalCount"].(float64)
				assert.True(t, ok, "totalCount should be a number")
				assert.Equal(t, 0, int(totalCount))
			},
		},
		{
			name:        "returns 403 for unauthorized user",
			projectName: projectName,
			setupAuth: func(c *gin.Context) {
				// No project or user set - simulating unauthorized access
			},
			expectedStatus: http.StatusForbidden,
			expectedError:  "User is not authorized to access project",
		},
		{
			name:        "returns 403 for user not in project",
			projectName: projectName,
			setupAuth: func(c *gin.Context) {
				c.Set("project", "different-project") // User has access to different project
				c.Set("user", "other-user@example.com")
			},
			expectedStatus: http.StatusForbidden,
			expectedError:  "User is not authorized to access project",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup
			router := SetupContractTestRouter()

			// Create request
			req, err := http.NewRequest(http.MethodGet,
				fmt.Sprintf("/api/projects/%s/rag-databases", tt.projectName),
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
				assert.Contains(t, responseBody["error"], tt.expectedError)
			}

			if tt.validateBody != nil {
				tt.validateBody(t, responseBody)
			}
		})
	}
}

// TestListRAGDatabases_Pagination tests pagination support (if implemented)
func TestListRAGDatabases_Pagination(t *testing.T) {
	gin.SetMode(gin.TestMode)
	projectName := "test-project"

	// Setup
	router := SetupContractTestRouter()
	router.Use(MockAuthMiddleware(projectName, "test-user@example.com"))

	// Test with pagination parameters
	req, err := http.NewRequest(http.MethodGet,
		fmt.Sprintf("/api/projects/%s/rag-databases?page=2&pageSize=10", projectName),
		nil)
	require.NoError(t, err)
	req.Header.Set("Authorization", "Bearer test-token")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Should still return 200 even if pagination is not implemented
	// The backend can choose to ignore pagination params
	assert.Equal(t, http.StatusOK, w.Code)

	var responseBody map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &responseBody)
	require.NoError(t, err)

	// Verify basic structure is maintained
	assert.NotNil(t, responseBody["databases"])
	assert.NotNil(t, responseBody["totalCount"])
}