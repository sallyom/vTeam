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

// T015: Contract test for GET /api/projects/{projectName}/rag-databases/{dbName}/status
func TestGetRAGDatabaseStatus(t *testing.T) {
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
			name:        "returns 200 with health, phase, and processingProgress",
			projectName: projectName,
			dbName:      dbName,
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusOK,
			validateBody: func(t *testing.T, body map[string]interface{}) {
				// Verify required status fields
				assert.NotNil(t, body["phase"])
				assert.NotNil(t, body["health"])

				// Verify phase is valid
				phase := body["phase"].(string)
				validPhases := []string{"Creating", "Processing", "Ready", "Failed", "Degraded"}
				assert.Contains(t, validPhases, phase)

				// Verify health is valid
				health := body["health"].(string)
				validHealth := []string{"Healthy", "Degraded", "Unavailable"}
				assert.Contains(t, validHealth, health)

				// Verify metrics are included
				assert.Contains(t, body, "documentCount")
				assert.Contains(t, body, "chunkCount")
				assert.Contains(t, body, "storageUsed")

				// Verify numeric fields are correct type
				docCount, ok := body["documentCount"].(float64)
				assert.True(t, ok, "documentCount should be a number")
				assert.GreaterOrEqual(t, docCount, float64(0))

				chunkCount, ok := body["chunkCount"].(float64)
				assert.True(t, ok, "chunkCount should be a number")
				assert.GreaterOrEqual(t, chunkCount, float64(0))

				// If phase is Processing, processingProgress should be present
				if phase == "Processing" {
					assert.NotNil(t, body["processingProgress"])
					progress := body["processingProgress"].(map[string]interface{})
					assert.NotNil(t, progress["totalFiles"])
					assert.NotNil(t, progress["processedFiles"])
					assert.NotNil(t, progress["currentPhase"])
				}

				// If phase is Ready, endpoint should be present
				if phase == "Ready" {
					assert.NotEmpty(t, body["endpoint"])
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
			expectedError:  "not found",
		},
		{
			name:        "returns 403 for unauthorized user",
			projectName: projectName,
			dbName:      dbName,
			setupAuth: func(c *gin.Context) {
				// No auth context set
			},
			expectedStatus: http.StatusForbidden,
			expectedError:  "not authorized",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup
			router := SetupContractTestRouter()

			// Create request
			req, err := http.NewRequest(http.MethodGet,
				fmt.Sprintf("/api/projects/%s/rag-databases/%s/status", tt.projectName, tt.dbName),
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
				errorMsg, _ := responseBody["error"].(string)
				if errorMsg == "" {
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

// TestGetRAGDatabaseStatus_ProcessingProgress verifies processing progress details
func TestGetRAGDatabaseStatus_ProcessingProgress(t *testing.T) {
	gin.SetMode(gin.TestMode)
	projectName := "test-project"
	dbName := "processing-db"

	// Setup
	router := SetupContractTestRouter()
	router.Use(MockAuthMiddleware(projectName, "test-user@example.com"))

	req, err := http.NewRequest(http.MethodGet,
		fmt.Sprintf("/api/projects/%s/rag-databases/%s/status", projectName, dbName),
		nil)
	require.NoError(t, err)
	req.Header.Set("Authorization", "Bearer test-token")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// If database exists and is in Processing phase
	if w.Code == http.StatusOK {
		var responseBody map[string]interface{}
		err = json.Unmarshal(w.Body.Bytes(), &responseBody)
		require.NoError(t, err)

		if responseBody["phase"] == "Processing" {
			progress := responseBody["processingProgress"].(map[string]interface{})

			// Verify all progress fields
			assert.NotNil(t, progress["totalFiles"])
			assert.NotNil(t, progress["processedFiles"])
			assert.NotNil(t, progress["failedFiles"])
			assert.NotNil(t, progress["currentPhase"])

			// Verify currentPhase is valid
			currentPhase := progress["currentPhase"].(string)
			validPhases := []string{"ingestion", "extraction", "embedding", "loading", "completed"}
			assert.Contains(t, validPhases, currentPhase)

			// Verify counts are consistent
			total := int(progress["totalFiles"].(float64))
			processed := int(progress["processedFiles"].(float64))
			failed := int(progress["failedFiles"].(float64))

			assert.GreaterOrEqual(t, total, 0)
			assert.GreaterOrEqual(t, processed, 0)
			assert.GreaterOrEqual(t, failed, 0)
			assert.LessOrEqual(t, processed, total)
			assert.LessOrEqual(t, failed, total)

			// If estimatedTimeRemainingMs is present, verify it's positive
			if remaining, ok := progress["estimatedTimeRemainingMs"]; ok && remaining != nil {
				remainingMs := int(remaining.(float64))
				assert.GreaterOrEqual(t, remainingMs, 0)
			}
		}
	}
}