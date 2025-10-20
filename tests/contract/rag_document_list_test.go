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

// T018: Contract test for GET /api/projects/{projectName}/rag-databases/{dbName}/documents
func TestListRAGDocuments(t *testing.T) {
	gin.SetMode(gin.TestMode)

	projectName := "test-project"
	dbName := "test-db"

	tests := []struct {
		name           string
		projectName    string
		dbName         string
		queryParams    string
		setupAuth      func(c *gin.Context)
		expectedStatus int
		expectedError  string
		validateBody   func(t *testing.T, body map[string]interface{})
	}{
		{
			name:        "returns 200 with array of RAGDocument objects",
			projectName: projectName,
			dbName:      dbName,
			queryParams: "",
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusOK,
			validateBody: func(t *testing.T, body map[string]interface{}) {
				// Verify response structure
				documents, ok := body["documents"].([]interface{})
				assert.True(t, ok, "documents should be an array")

				totalCount, ok := body["totalCount"].(float64)
				assert.True(t, ok, "totalCount should be a number")
				assert.Equal(t, int(totalCount), len(documents))

				// If there are documents, verify structure
				if len(documents) > 0 {
					doc := documents[0].(map[string]interface{})
					assert.NotNil(t, doc["metadata"])
					assert.NotNil(t, doc["spec"])
					assert.NotNil(t, doc["status"])

					// Verify metadata
					metadata := doc["metadata"].(map[string]interface{})
					assert.NotEmpty(t, metadata["name"])
					assert.Equal(t, projectName, metadata["namespace"])

					// Verify spec
					spec := doc["spec"].(map[string]interface{})
					assert.Equal(t, dbName, spec["databaseRef"])
					assert.NotEmpty(t, spec["fileName"])
					assert.NotEmpty(t, spec["fileFormat"])
					assert.Greater(t, spec["fileSize"].(float64), float64(0))

					// Verify status
					status := doc["status"].(map[string]interface{})
					assert.NotEmpty(t, status["phase"])
				}
			},
		},
		{
			name:        "supports status query parameter filtering",
			projectName: projectName,
			dbName:      dbName,
			queryParams: "?status=Completed",
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusOK,
			validateBody: func(t *testing.T, body map[string]interface{}) {
				documents := body["documents"].([]interface{})

				// All returned documents should have Completed status
				for _, d := range documents {
					doc := d.(map[string]interface{})
					status := doc["status"].(map[string]interface{})
					assert.Equal(t, "Completed", status["phase"])
				}
			},
		},
		{
			name:        "filters by Processing status",
			projectName: projectName,
			dbName:      dbName,
			queryParams: "?status=Processing",
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusOK,
			validateBody: func(t *testing.T, body map[string]interface{}) {
				documents := body["documents"].([]interface{})

				// All returned documents should have Processing status
				for _, d := range documents {
					doc := d.(map[string]interface{})
					status := doc["status"].(map[string]interface{})
					assert.Equal(t, "Processing", status["phase"])
				}
			},
		},
		{
			name:        "filters by Failed status",
			projectName: projectName,
			dbName:      dbName,
			queryParams: "?status=Failed",
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusOK,
			validateBody: func(t *testing.T, body map[string]interface{}) {
				documents := body["documents"].([]interface{})

				// All returned documents should have Failed status
				for _, d := range documents {
					doc := d.(map[string]interface{})
					status := doc["status"].(map[string]interface{})
					assert.Equal(t, "Failed", status["phase"])

					// Failed documents should have error message
					assert.NotEmpty(t, status["errorMessage"])
				}
			},
		},
		{
			name:        "returns empty array for database with no documents",
			projectName: projectName,
			dbName:      "empty-db",
			queryParams: "",
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusOK,
			validateBody: func(t *testing.T, body map[string]interface{}) {
				documents := body["documents"].([]interface{})
				assert.Empty(t, documents)

				totalCount := body["totalCount"].(float64)
				assert.Equal(t, 0, int(totalCount))
			},
		},
		{
			name:        "returns 404 for non-existent database",
			projectName: projectName,
			dbName:      "non-existent-db",
			queryParams: "",
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusNotFound,
			expectedError:  "database.*not found",
		},
		{
			name:        "returns 403 for unauthorized user",
			projectName: projectName,
			dbName:      dbName,
			queryParams: "",
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
				fmt.Sprintf("/api/projects/%s/rag-databases/%s/documents%s",
					tt.projectName, tt.dbName, tt.queryParams),
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
				assert.Regexp(t, tt.expectedError, errorMsg)
			}

			if tt.validateBody != nil {
				tt.validateBody(t, responseBody)
			}
		})
	}
}

// TestListRAGDocuments_InvalidStatus verifies invalid status parameter handling
func TestListRAGDocuments_InvalidStatus(t *testing.T) {
	gin.SetMode(gin.TestMode)
	projectName := "test-project"
	dbName := "test-db"

	// Setup
	router := SetupContractTestRouter()
	router.Use(MockAuthMiddleware(projectName, "test-user@example.com"))

	// Request with invalid status
	req, err := http.NewRequest(http.MethodGet,
		fmt.Sprintf("/api/projects/%s/rag-databases/%s/documents?status=InvalidStatus",
			projectName, dbName),
		nil)
	require.NoError(t, err)
	req.Header.Set("Authorization", "Bearer test-token")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Should return 400 Bad Request or ignore invalid status
	// Implementation can choose either approach
	assert.Contains(t, []int{http.StatusOK, http.StatusBadRequest}, w.Code)

	if w.Code == http.StatusBadRequest {
		var responseBody map[string]interface{}
		err = json.Unmarshal(w.Body.Bytes(), &responseBody)
		require.NoError(t, err)

		errorMsg, _ := responseBody["error"].(string)
		if errorMsg == "" {
			errorMsg, _ = responseBody["message"].(string)
		}
		assert.Contains(t, errorMsg, "status")
	}
}

// TestListRAGDocuments_DocumentCounts verifies document counts by status
func TestListRAGDocuments_DocumentCounts(t *testing.T) {
	gin.SetMode(gin.TestMode)
	projectName := "test-project"
	dbName := "test-db"

	statuses := []string{"Uploaded", "Processing", "Completed", "Failed"}

	for _, status := range statuses {
		t.Run(status, func(t *testing.T) {
			// Setup
			router := SetupContractTestRouter()
			router.Use(MockAuthMiddleware(projectName, "test-user@example.com"))

			// Get all documents
			reqAll, err := http.NewRequest(http.MethodGet,
				fmt.Sprintf("/api/projects/%s/rag-databases/%s/documents", projectName, dbName),
				nil)
			require.NoError(t, err)
			reqAll.Header.Set("Authorization", "Bearer test-token")

			wAll := httptest.NewRecorder()
			router.ServeHTTP(wAll, reqAll)

			// Get filtered documents
			reqFiltered, err := http.NewRequest(http.MethodGet,
				fmt.Sprintf("/api/projects/%s/rag-databases/%s/documents?status=%s",
					projectName, dbName, status),
				nil)
			require.NoError(t, err)
			reqFiltered.Header.Set("Authorization", "Bearer test-token")

			wFiltered := httptest.NewRecorder()
			router.ServeHTTP(wFiltered, reqFiltered)

			if wAll.Code == http.StatusOK && wFiltered.Code == http.StatusOK {
				var allBody, filteredBody map[string]interface{}
				json.Unmarshal(wAll.Body.Bytes(), &allBody)
				json.Unmarshal(wFiltered.Body.Bytes(), &filteredBody)

				allCount := int(allBody["totalCount"].(float64))
				filteredCount := int(filteredBody["totalCount"].(float64))

				// Filtered count should not exceed total count
				assert.LessOrEqual(t, filteredCount, allCount)
			}
		})
	}
}