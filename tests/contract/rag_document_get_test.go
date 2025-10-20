package contract

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// T019: Contract test for GET /api/projects/{projectName}/rag-databases/{dbName}/documents/{docName}
func TestGetRAGDocument(t *testing.T) {
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
		expectedStatus int
		expectedError  string
		validateBody   func(t *testing.T, body map[string]interface{})
	}{
		{
			name:        "returns 200 with spec and status",
			projectName: projectName,
			dbName:      dbName,
			docName:     docName,
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusOK,
			validateBody: func(t *testing.T, body map[string]interface{}) {
				// Verify complete structure
				assert.NotNil(t, body["metadata"])
				assert.NotNil(t, body["spec"])
				assert.NotNil(t, body["status"])

				// Verify metadata
				metadata := body["metadata"].(map[string]interface{})
				assert.Equal(t, docName, metadata["name"])
				assert.Equal(t, projectName, metadata["namespace"])
				assert.NotEmpty(t, metadata["uid"])
				assert.NotEmpty(t, metadata["creationTimestamp"])

				// Verify spec fields
				spec := body["spec"].(map[string]interface{})
				assert.Equal(t, dbName, spec["databaseRef"])
				assert.NotEmpty(t, spec["fileName"])
				assert.NotEmpty(t, spec["fileFormat"])
				assert.Greater(t, spec["fileSize"].(float64), float64(0))
				assert.LessOrEqual(t, spec["fileSize"].(float64), float64(104857600)) // <= 100MB
				assert.NotEmpty(t, spec["uploadedBy"])
				assert.NotEmpty(t, spec["uploadTimestamp"])
				assert.NotEmpty(t, spec["storagePath"])

				// Verify checksum format
				checksum := spec["checksum"].(string)
				assert.Regexp(t, `^sha256:[a-f0-9]{64}$`, checksum)

				// Verify status fields
				status := body["status"].(map[string]interface{})
				phase := status["phase"].(string)
				assert.Contains(t, []string{"Uploaded", "Processing", "Completed", "Failed"}, phase)

				// Phase-specific validations
				if phase == "Completed" {
					assert.NotNil(t, status["chunkCount"])
					chunkCount := int(status["chunkCount"].(float64))
					assert.GreaterOrEqual(t, chunkCount, 0)
					assert.NotEmpty(t, status["processingTime"])
				}

				if phase == "Failed" {
					assert.NotEmpty(t, status["errorMessage"])
				}

				if phase == "Processing" || phase == "Completed" || phase == "Failed" {
					assert.NotEmpty(t, status["processingStartTime"])
					if phase == "Completed" || phase == "Failed" {
						assert.NotEmpty(t, status["processingEndTime"])
					}
				}
			},
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
			// Setup
			router := SetupContractTestRouter()

			// Create request
			req, err := http.NewRequest(http.MethodGet,
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

// TestGetRAGDocument_ProcessingTimeValidation verifies processing time format
func TestGetRAGDocument_ProcessingTimeValidation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	projectName := "test-project"
	dbName := "test-db"
	docName := "completed-doc"

	// Setup
	router := SetupContractTestRouter()
	router.Use(MockAuthMiddleware(projectName, "test-user@example.com"))

	req, err := http.NewRequest(http.MethodGet,
		fmt.Sprintf("/api/projects/%s/rag-databases/%s/documents/%s",
			projectName, dbName, docName),
		nil)
	require.NoError(t, err)
	req.Header.Set("Authorization", "Bearer test-token")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code == http.StatusOK {
		var responseBody map[string]interface{}
		err = json.Unmarshal(w.Body.Bytes(), &responseBody)
		require.NoError(t, err)

		status := responseBody["status"].(map[string]interface{})
		if status["phase"] == "Completed" && status["processingTime"] != nil {
			// Verify processingTime format (e.g., "45s", "2m30s")
			processingTime := status["processingTime"].(string)
			assert.Regexp(t, `^\d+[hms](\d+[ms])?$`, processingTime)
		}

		// Verify timestamp formats
		if status["processingStartTime"] != nil {
			startTime := status["processingStartTime"].(string)
			_, err := time.Parse(time.RFC3339, startTime)
			assert.NoError(t, err, "processingStartTime should be valid RFC3339")
		}

		if status["processingEndTime"] != nil {
			endTime := status["processingEndTime"].(string)
			_, err := time.Parse(time.RFC3339, endTime)
			assert.NoError(t, err, "processingEndTime should be valid RFC3339")
		}
	}
}

// TestGetRAGDocument_FileFormatConsistency verifies file format matches extension
func TestGetRAGDocument_FileFormatConsistency(t *testing.T) {
	gin.SetMode(gin.TestMode)
	projectName := "test-project"
	dbName := "test-db"

	fileTests := []struct {
		docName        string
		expectedFormat string
	}{
		{"document-pdf", "pdf"},
		{"report-docx", "docx"},
		{"data-xlsx", "xlsx"},
		{"readme-md", "md"},
		{"notes-txt", "txt"},
	}

	for _, ft := range fileTests {
		t.Run(ft.docName, func(t *testing.T) {
			// Setup
			router := SetupContractTestRouter()
			router.Use(MockAuthMiddleware(projectName, "test-user@example.com"))

			req, err := http.NewRequest(http.MethodGet,
				fmt.Sprintf("/api/projects/%s/rag-databases/%s/documents/%s",
					projectName, dbName, ft.docName),
				nil)
			require.NoError(t, err)
			req.Header.Set("Authorization", "Bearer test-token")

			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code == http.StatusOK {
				var responseBody map[string]interface{}
				err = json.Unmarshal(w.Body.Bytes(), &responseBody)
				require.NoError(t, err)

				spec := responseBody["spec"].(map[string]interface{})
				fileName := spec["fileName"].(string)
				fileFormat := spec["fileFormat"].(string)

				// If the document follows naming convention, verify format
				if ft.expectedFormat != "" {
					assert.Equal(t, ft.expectedFormat, fileFormat)
					assert.Contains(t, fileName, fmt.Sprintf(".%s", ft.expectedFormat))
				}
			}
		})
	}
}