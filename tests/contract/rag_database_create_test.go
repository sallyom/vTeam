package contract

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// T011: Contract test for POST /api/projects/{projectName}/rag-databases
func TestCreateRAGDatabase(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// Mock project name
	projectName := "test-project"

	tests := []struct {
		name           string
		projectName    string
		requestBody    interface{}
		setupAuth      func(c *gin.Context)
		expectedStatus int
		expectedError  string
		validateBody   func(t *testing.T, body map[string]interface{})
	}{
		{
			name:        "valid request creates RAGDatabase CR",
			projectName: projectName,
			requestBody: map[string]interface{}{
				"displayName":  "Engineering Documentation",
				"description":  "Technical docs for engineering team",
				"storageSize": "5Gi",
			},
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusCreated,
			validateBody: func(t *testing.T, body map[string]interface{}) {
				// Verify response contains required fields
				assert.NotNil(t, body["metadata"])
				metadata := body["metadata"].(map[string]interface{})
				assert.NotEmpty(t, metadata["name"])
				assert.Equal(t, projectName, metadata["namespace"])
				assert.NotEmpty(t, metadata["uid"])

				assert.NotNil(t, body["spec"])
				spec := body["spec"].(map[string]interface{})
				assert.Equal(t, "Engineering Documentation", spec["displayName"])

				assert.NotNil(t, body["status"])
				status := body["status"].(map[string]interface{})
				assert.Equal(t, "Creating", status["phase"])
			},
		},
		{
			name:        "missing displayName returns 400",
			projectName: projectName,
			requestBody: map[string]interface{}{
				"description": "Missing required field",
				"storageSize": "5Gi",
			},
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "displayName is required",
		},
		{
			name:        "displayName too long returns 400",
			projectName: projectName,
			requestBody: map[string]interface{}{
				"displayName": string(make([]byte, 101)), // 101 chars
				"storageSize": "5Gi",
			},
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "displayName must be between 1 and 100 characters",
		},
		{
			name:        "invalid storageSize returns 400",
			projectName: projectName,
			requestBody: map[string]interface{}{
				"displayName": "Test Database",
				"storageSize": "10Gi", // exceeds 5Gi limit
			},
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "storageSize must not exceed 5Gi",
		},
		{
			name:        "non-project member returns 403",
			projectName: projectName,
			requestBody: map[string]interface{}{
				"displayName": "Test Database",
			},
			setupAuth: func(c *gin.Context) {
				// No project or user set - simulating unauthorized access
			},
			expectedStatus: http.StatusForbidden,
			expectedError:  "User is not authorized to access project",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup
			router := setupTestRouter()

			// Marshal request body
			bodyBytes, err := json.Marshal(tt.requestBody)
			require.NoError(t, err)

			// Create request
			req, err := http.NewRequest(http.MethodPost,
				fmt.Sprintf("/api/projects/%s/rag-databases", tt.projectName),
				bytes.NewBuffer(bodyBytes))
			require.NoError(t, err)
			req.Header.Set("Content-Type", "application/json")
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

// TestCreateRAGDatabase_NameConflict tests that duplicate names return 409
func TestCreateRAGDatabase_NameConflict(t *testing.T) {
	gin.SetMode(gin.TestMode)
	projectName := "test-project"

	// Setup
	router := setupTestRouter()

	// Add test middleware
	router.Use(func(c *gin.Context) {
		c.Set("project", projectName)
		c.Set("user", "test-user@example.com")
		c.Next()
	})

	requestBody := map[string]interface{}{
		"displayName": "Existing Database",
		"storageSize": "5Gi",
	}

	bodyBytes, err := json.Marshal(requestBody)
	require.NoError(t, err)

	// First request should succeed
	req1, err := http.NewRequest(http.MethodPost,
		fmt.Sprintf("/api/projects/%s/rag-databases", projectName),
		bytes.NewBuffer(bodyBytes))
	require.NoError(t, err)
	req1.Header.Set("Content-Type", "application/json")
	req1.Header.Set("Authorization", "Bearer test-token")

	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)

	// First request should succeed (if backend is implemented)
	// For contract test, we're testing the expected behavior

	// Second request with same name should return 409
	req2, err := http.NewRequest(http.MethodPost,
		fmt.Sprintf("/api/projects/%s/rag-databases", projectName),
		bytes.NewBuffer(bodyBytes))
	require.NoError(t, err)
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("Authorization", "Bearer test-token")

	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)

	// Expect 409 Conflict
	assert.Equal(t, http.StatusConflict, w2.Code)

	var responseBody map[string]interface{}
	err = json.Unmarshal(w2.Body.Bytes(), &responseBody)
	require.NoError(t, err)

	assert.Contains(t, responseBody["error"], "already exists")
}

// setupTestRouter returns a router configured for testing
func setupTestRouter() *gin.Engine {
	return SetupContractTestRouter()
}