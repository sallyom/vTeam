package contract

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// T016: Contract test for POST /api/projects/{projectName}/rag-databases/import-dump
func TestImportRAGDatabaseDump(t *testing.T) {
	gin.SetMode(gin.TestMode)

	projectName := "test-project"

	tests := []struct {
		name           string
		projectName    string
		setupAuth      func(c *gin.Context)
		setupForm      func(w *multipart.Writer)
		expectedStatus int
		expectedError  string
		validateBody   func(t *testing.T, body map[string]interface{})
	}{
		{
			name:        "accepts multipart/form-data with dumpFile and databaseName",
			projectName: projectName,
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			setupForm: func(w *multipart.Writer) {
				// Add dumpFile field
				fw, err := w.CreateFormFile("dumpFile", "backup.sql")
				require.NoError(t, err)
				_, err = io.Copy(fw, strings.NewReader("-- PostgreSQL database dump\nCREATE TABLE documents..."))
				require.NoError(t, err)

				// Add databaseName field
				err = w.WriteField("databaseName", "imported-db")
				require.NoError(t, err)

				// Add optional displayName field
				err = w.WriteField("displayName", "Imported Database")
				require.NoError(t, err)
			},
			expectedStatus: http.StatusAccepted,
			validateBody: func(t *testing.T, body map[string]interface{}) {
				// Verify response contains RAGDatabase
				assert.NotNil(t, body["metadata"])
				assert.NotNil(t, body["spec"])
				assert.NotNil(t, body["status"])

				// Verify metadata
				metadata := body["metadata"].(map[string]interface{})
				assert.Equal(t, "imported-db", metadata["name"])
				assert.Equal(t, projectName, metadata["namespace"])

				// Verify spec
				spec := body["spec"].(map[string]interface{})
				assert.Equal(t, "Imported Database", spec["displayName"])

				// Verify status shows Processing
				status := body["status"].(map[string]interface{})
				assert.Equal(t, "Processing", status["phase"])
			},
		},
		{
			name:        "returns 400 for missing dumpFile",
			projectName: projectName,
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			setupForm: func(w *multipart.Writer) {
				// Only add databaseName, no dumpFile
				err := w.WriteField("databaseName", "test-db")
				require.NoError(t, err)
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "dumpFile is required",
		},
		{
			name:        "returns 400 for missing databaseName",
			projectName: projectName,
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			setupForm: func(w *multipart.Writer) {
				// Only add dumpFile, no databaseName
				fw, err := w.CreateFormFile("dumpFile", "backup.sql")
				require.NoError(t, err)
				_, err = io.Copy(fw, strings.NewReader("-- PostgreSQL dump"))
				require.NoError(t, err)
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "databaseName is required",
		},
		{
			name:        "returns 403 for unauthorized user",
			projectName: projectName,
			setupAuth: func(c *gin.Context) {
				// No auth context set
			},
			setupForm: func(w *multipart.Writer) {
				fw, err := w.CreateFormFile("dumpFile", "backup.sql")
				require.NoError(t, err)
				_, err = io.Copy(fw, strings.NewReader("-- PostgreSQL dump"))
				require.NoError(t, err)

				err = w.WriteField("databaseName", "test-db")
				require.NoError(t, err)
			},
			expectedStatus: http.StatusForbidden,
			expectedError:  "not authorized",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup
			router := SetupContractTestRouter()

			// Create multipart form
			var b bytes.Buffer
			w := multipart.NewWriter(&b)
			tt.setupForm(w)
			err := w.Close()
			require.NoError(t, err)

			// Create request
			req, err := http.NewRequest(http.MethodPost,
				fmt.Sprintf("/api/projects/%s/rag-databases/import-dump", tt.projectName),
				&b)
			require.NoError(t, err)
			req.Header.Set("Content-Type", w.FormDataContentType())
			req.Header.Set("Authorization", "Bearer test-token")

			// Create response recorder
			resp := httptest.NewRecorder()

			// Add test middleware to set auth context
			router.Use(func(c *gin.Context) {
				if tt.setupAuth != nil {
					tt.setupAuth(c)
				}
				c.Next()
			})

			// Execute request
			router.ServeHTTP(resp, req)

			// Validate response
			assert.Equal(t, tt.expectedStatus, resp.Code)

			// Parse response body
			var responseBody map[string]interface{}
			err = json.Unmarshal(resp.Body.Bytes(), &responseBody)
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

// TestImportRAGDatabaseDump_FileSizeLimit verifies file size validation
func TestImportRAGDatabaseDump_FileSizeLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	projectName := "test-project"

	// Setup
	router := SetupContractTestRouter()
	router.Use(MockAuthMiddleware(projectName, "test-user@example.com"))

	// Create large file content (simulate > 5GB file)
	// In real test, would use actual large file or mock
	var b bytes.Buffer
	w := multipart.NewWriter(&b)

	fw, err := w.CreateFormFile("dumpFile", "huge-backup.sql")
	require.NoError(t, err)

	// Write header indicating large file
	_, err = fw.Write([]byte("-- Large PostgreSQL dump file"))
	require.NoError(t, err)

	err = w.WriteField("databaseName", "large-db")
	require.NoError(t, err)

	err = w.Close()
	require.NoError(t, err)

	// Create request
	req, err := http.NewRequest(http.MethodPost,
		fmt.Sprintf("/api/projects/%s/rag-databases/import-dump", projectName),
		&b)
	require.NoError(t, err)
	req.Header.Set("Content-Type", w.FormDataContentType())
	req.Header.Set("Authorization", "Bearer test-token")

	// Note: In real implementation, the server should check Content-Length
	// or stream the file to validate size before processing
	req.ContentLength = 6 * 1024 * 1024 * 1024 // 6GB

	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	// Should reject files > 5GB
	assert.Equal(t, http.StatusBadRequest, resp.Code)

	var responseBody map[string]interface{}
	err = json.Unmarshal(resp.Body.Bytes(), &responseBody)
	require.NoError(t, err)

	errorMsg, _ := responseBody["error"].(string)
	if errorMsg == "" {
		errorMsg, _ = responseBody["message"].(string)
	}
	assert.Contains(t, errorMsg, "exceeds maximum size")
}

// TestImportRAGDatabaseDump_InvalidSQLFile verifies SQL file validation
func TestImportRAGDatabaseDump_InvalidSQLFile(t *testing.T) {
	gin.SetMode(gin.TestMode)
	projectName := "test-project"

	// Setup
	router := SetupContractTestRouter()
	router.Use(MockAuthMiddleware(projectName, "test-user@example.com"))

	var b bytes.Buffer
	w := multipart.NewWriter(&b)

	// Create file with non-SQL extension
	fw, err := w.CreateFormFile("dumpFile", "data.txt")
	require.NoError(t, err)
	_, err = io.Copy(fw, strings.NewReader("This is not a SQL dump"))
	require.NoError(t, err)

	err = w.WriteField("databaseName", "test-db")
	require.NoError(t, err)

	err = w.Close()
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost,
		fmt.Sprintf("/api/projects/%s/rag-databases/import-dump", projectName),
		&b)
	require.NoError(t, err)
	req.Header.Set("Content-Type", w.FormDataContentType())
	req.Header.Set("Authorization", "Bearer test-token")

	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	// Should validate file format
	assert.Equal(t, http.StatusBadRequest, resp.Code)

	var responseBody map[string]interface{}
	err = json.Unmarshal(resp.Body.Bytes(), &responseBody)
	require.NoError(t, err)

	errorMsg, _ := responseBody["error"].(string)
	if errorMsg == "" {
		errorMsg, _ = responseBody["message"].(string)
	}
	assert.Contains(t, strings.ToLower(errorMsg), "sql")
}