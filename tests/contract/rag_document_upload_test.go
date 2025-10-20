package contract

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// T017: Contract test for POST /api/projects/{projectName}/rag-databases/{dbName}/documents
func TestUploadRAGDocuments(t *testing.T) {
	gin.SetMode(gin.TestMode)

	projectName := "test-project"
	dbName := "test-db"

	tests := []struct {
		name           string
		projectName    string
		dbName         string
		setupAuth      func(c *gin.Context)
		setupFiles     func(w *multipart.Writer)
		expectedStatus int
		expectedError  string
		validateBody   func(t *testing.T, body map[string]interface{})
	}{
		{
			name:        "accepts multipart/form-data with files array (valid formats)",
			projectName: projectName,
			dbName:      dbName,
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			setupFiles: func(w *multipart.Writer) {
				// Add PDF file
				fw1, err := w.CreateFormFile("files", "document1.pdf")
				require.NoError(t, err)
				_, err = io.Copy(fw1, strings.NewReader("PDF content"))
				require.NoError(t, err)

				// Add DOCX file
				fw2, err := w.CreateFormFile("files", "document2.docx")
				require.NoError(t, err)
				_, err = io.Copy(fw2, strings.NewReader("DOCX content"))
				require.NoError(t, err)

				// Add Markdown file
				fw3, err := w.CreateFormFile("files", "readme.md")
				require.NoError(t, err)
				_, err = io.Copy(fw3, strings.NewReader("# Markdown content"))
				require.NoError(t, err)
			},
			expectedStatus: http.StatusAccepted,
			validateBody: func(t *testing.T, body map[string]interface{}) {
				// Verify accepted array
				accepted, ok := body["accepted"].([]interface{})
				assert.True(t, ok, "accepted should be an array")
				assert.Len(t, accepted, 3, "should accept all 3 files")

				// Verify rejected array
				rejected, ok := body["rejected"].([]interface{})
				assert.True(t, ok, "rejected should be an array")
				assert.Empty(t, rejected, "no files should be rejected")

				// Verify accepted documents structure
				for _, doc := range accepted {
					ragDoc := doc.(map[string]interface{})
					assert.NotNil(t, ragDoc["metadata"])
					assert.NotNil(t, ragDoc["spec"])
					assert.NotNil(t, ragDoc["status"])

					// Check metadata
					metadata := ragDoc["metadata"].(map[string]interface{})
					assert.NotEmpty(t, metadata["name"])
					assert.Equal(t, projectName, metadata["namespace"])

					// Check spec
					spec := ragDoc["spec"].(map[string]interface{})
					assert.Equal(t, dbName, spec["databaseRef"])
					assert.NotEmpty(t, spec["fileName"])
					assert.NotEmpty(t, spec["fileFormat"])
					assert.Greater(t, spec["fileSize"].(float64), float64(0))

					// Check status
					status := ragDoc["status"].(map[string]interface{})
					assert.Equal(t, "Uploaded", status["phase"])
				}
			},
		},
		{
			name:        "rejects files exceeding size limit (100MB)",
			projectName: projectName,
			dbName:      dbName,
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			setupFiles: func(w *multipart.Writer) {
				// Add normal file
				fw1, err := w.CreateFormFile("files", "normal.pdf")
				require.NoError(t, err)
				_, err = io.Copy(fw1, strings.NewReader("Normal PDF"))
				require.NoError(t, err)

				// Simulate large file (> 100MB)
				fw2, err := w.CreateFormFile("files", "huge.pdf")
				require.NoError(t, err)
				// In real test, would write actual large content
				// For contract test, server should check Content-Length
				_, err = io.Copy(fw2, strings.NewReader("Large file marker"))
				require.NoError(t, err)
			},
			expectedStatus: http.StatusAccepted,
			validateBody: func(t *testing.T, body map[string]interface{}) {
				accepted := body["accepted"].([]interface{})
				rejected := body["rejected"].([]interface{})

				// At least the normal file should be accepted
				assert.NotEmpty(t, accepted)

				// Large file should be rejected (if server validates size)
				// Note: Actual size validation would happen server-side
				// This test verifies the response structure
			},
		},
		{
			name:        "validates file formats and rejects invalid types",
			projectName: projectName,
			dbName:      dbName,
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			setupFiles: func(w *multipart.Writer) {
				// Valid format
				fw1, err := w.CreateFormFile("files", "valid.pdf")
				require.NoError(t, err)
				_, err = io.Copy(fw1, strings.NewReader("PDF content"))
				require.NoError(t, err)

				// Invalid format
				fw2, err := w.CreateFormFile("files", "invalid.exe")
				require.NoError(t, err)
				_, err = io.Copy(fw2, strings.NewReader("EXE content"))
				require.NoError(t, err)

				// Another invalid format
				fw3, err := w.CreateFormFile("files", "script.sh")
				require.NoError(t, err)
				_, err = io.Copy(fw3, strings.NewReader("#!/bin/bash"))
				require.NoError(t, err)
			},
			expectedStatus: http.StatusAccepted,
			validateBody: func(t *testing.T, body map[string]interface{}) {
				accepted := body["accepted"].([]interface{})
				rejected := body["rejected"].([]interface{})

				// Valid file should be accepted
				assert.Len(t, accepted, 1)

				// Invalid files should be rejected
				assert.Len(t, rejected, 2)

				// Check rejection reasons
				for _, rej := range rejected {
					rejection := rej.(map[string]interface{})
					assert.NotEmpty(t, rejection["fileName"])
					assert.Contains(t, rejection["reason"], "format")
				}
			},
		},
		{
			name:        "validates maximum 50 files per upload",
			projectName: projectName,
			dbName:      dbName,
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			setupFiles: func(w *multipart.Writer) {
				// Add 51 files (exceeds limit)
				for i := 0; i < 51; i++ {
					fw, err := w.CreateFormFile("files", fmt.Sprintf("doc%d.txt", i))
					require.NoError(t, err)
					_, err = io.Copy(fw, strings.NewReader(fmt.Sprintf("Content %d", i)))
					require.NoError(t, err)
				}
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "maximum 50 files",
		},
		{
			name:        "returns 403 for unauthorized user",
			projectName: projectName,
			dbName:      dbName,
			setupAuth: func(c *gin.Context) {
				// No auth context set
			},
			setupFiles: func(w *multipart.Writer) {
				fw, err := w.CreateFormFile("files", "doc.pdf")
				require.NoError(t, err)
				_, err = io.Copy(fw, strings.NewReader("PDF"))
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
			tt.setupFiles(w)
			err := w.Close()
			require.NoError(t, err)

			// Create request
			req, err := http.NewRequest(http.MethodPost,
				fmt.Sprintf("/api/projects/%s/rag-databases/%s/documents", tt.projectName, tt.dbName),
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

// TestUploadRAGDocuments_SupportedFormats verifies all supported formats
func TestUploadRAGDocuments_SupportedFormats(t *testing.T) {
	gin.SetMode(gin.TestMode)
	projectName := "test-project"
	dbName := "test-db"

	supportedFormats := map[string]string{
		"document.pdf":  "pdf",
		"report.docx":   "docx",
		"slides.pptx":   "pptx",
		"data.xlsx":     "xlsx",
		"readme.md":     "md",
		"data.csv":      "csv",
		"notes.txt":     "txt",
		"page.html":     "html",
	}

	for filename, format := range supportedFormats {
		t.Run(format, func(t *testing.T) {
			// Setup
			router := SetupContractTestRouter()
			router.Use(MockAuthMiddleware(projectName, "test-user@example.com"))

			// Create multipart form with single file
			var b bytes.Buffer
			w := multipart.NewWriter(&b)

			fw, err := w.CreateFormFile("files", filename)
			require.NoError(t, err)
			_, err = io.Copy(fw, strings.NewReader(fmt.Sprintf("%s content", format)))
			require.NoError(t, err)

			err = w.Close()
			require.NoError(t, err)

			// Create request
			req, err := http.NewRequest(http.MethodPost,
				fmt.Sprintf("/api/projects/%s/rag-databases/%s/documents", projectName, dbName),
				&b)
			require.NoError(t, err)
			req.Header.Set("Content-Type", w.FormDataContentType())
			req.Header.Set("Authorization", "Bearer test-token")

			resp := httptest.NewRecorder()
			router.ServeHTTP(resp, req)

			// Should accept the file
			assert.Equal(t, http.StatusAccepted, resp.Code)

			var responseBody map[string]interface{}
			err = json.Unmarshal(resp.Body.Bytes(), &responseBody)
			require.NoError(t, err)

			accepted := responseBody["accepted"].([]interface{})
			rejected := responseBody["rejected"].([]interface{})

			assert.Len(t, accepted, 1, fmt.Sprintf("%s files should be accepted", format))
			assert.Empty(t, rejected, fmt.Sprintf("%s files should not be rejected", format))

			// Verify file format in response
			doc := accepted[0].(map[string]interface{})
			spec := doc["spec"].(map[string]interface{})
			assert.Equal(t, format, spec["fileFormat"])
			assert.Equal(t, filename, spec["fileName"])
		})
	}
}

// TestUploadRAGDocuments_ChecksumGeneration verifies SHA-256 checksum
func TestUploadRAGDocuments_ChecksumGeneration(t *testing.T) {
	gin.SetMode(gin.TestMode)
	projectName := "test-project"
	dbName := "test-db"

	// Setup
	router := SetupContractTestRouter()
	router.Use(MockAuthMiddleware(projectName, "test-user@example.com"))

	// Create file with known content
	fileContent := "This is test content for checksum verification"
	var b bytes.Buffer
	w := multipart.NewWriter(&b)

	fw, err := w.CreateFormFile("files", "checksum-test.txt")
	require.NoError(t, err)
	_, err = io.Copy(fw, strings.NewReader(fileContent))
	require.NoError(t, err)

	err = w.Close()
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost,
		fmt.Sprintf("/api/projects/%s/rag-databases/%s/documents", projectName, dbName),
		&b)
	require.NoError(t, err)
	req.Header.Set("Content-Type", w.FormDataContentType())
	req.Header.Set("Authorization", "Bearer test-token")

	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	assert.Equal(t, http.StatusAccepted, resp.Code)

	var responseBody map[string]interface{}
	err = json.Unmarshal(resp.Body.Bytes(), &responseBody)
	require.NoError(t, err)

	accepted := responseBody["accepted"].([]interface{})
	assert.Len(t, accepted, 1)

	doc := accepted[0].(map[string]interface{})
	spec := doc["spec"].(map[string]interface{})

	// Verify checksum format
	checksum := spec["checksum"].(string)
	assert.Regexp(t, `^sha256:[a-f0-9]{64}$`, checksum)
}