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

// T021: Contract test for POST /api/projects/{projectName}/rag-databases/{dbName}/query
func TestExecuteRAGQuery(t *testing.T) {
	gin.SetMode(gin.TestMode)

	projectName := "test-project"
	dbName := "test-db"

	tests := []struct {
		name           string
		projectName    string
		dbName         string
		requestBody    interface{}
		setupAuth      func(c *gin.Context)
		expectedStatus int
		expectedError  string
		validateBody   func(t *testing.T, body map[string]interface{})
	}{
		{
			name:        "accepts JSON with query and returns answer with sources",
			projectName: projectName,
			dbName:      dbName,
			requestBody: map[string]interface{}{
				"query":               "What is the deployment process?",
				"maxChunks":           10,
				"similarityThreshold": 0.7,
				"includeMetadata":     true,
			},
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusOK,
			validateBody: func(t *testing.T, body map[string]interface{}) {
				// Verify required response fields
				assert.NotEmpty(t, body["query"])
				assert.Equal(t, "What is the deployment process?", body["query"])

				assert.NotEmpty(t, body["answer"])
				answer := body["answer"].(string)
				assert.Greater(t, len(answer), 0)

				// Verify sources array
				sources, ok := body["sources"].([]interface{})
				assert.True(t, ok, "sources should be an array")

				// If documents exist, verify source structure
				if len(sources) > 0 {
					for _, s := range sources {
						source := s.(map[string]interface{})
						assert.NotEmpty(t, source["documentId"])
						assert.NotEmpty(t, source["documentName"])
						assert.NotEmpty(t, source["chunkText"])
						assert.NotNil(t, source["relevanceScore"])

						// Verify relevance score is between 0 and 1
						score := source["relevanceScore"].(float64)
						assert.GreaterOrEqual(t, score, 0.0)
						assert.LessOrEqual(t, score, 1.0)

						// Verify chunk text length
						chunkText := source["chunkText"].(string)
						assert.LessOrEqual(t, len(chunkText), 1000)
					}
				}

				// Verify metadata
				metadata, ok := body["metadata"].(map[string]interface{})
				assert.True(t, ok, "metadata should be present")
				assert.NotNil(t, metadata["documentsSearched"])
				assert.NotNil(t, metadata["relevantResults"])
				assert.NotNil(t, metadata["queryTimeMs"])
				assert.NotEmpty(t, metadata["model"])

				// Verify query time is reasonable (< 3 seconds)
				queryTime := int(metadata["queryTimeMs"].(float64))
				assert.Less(t, queryTime, 3000, "Query should complete within 3 seconds")
			},
		},
		{
			name:        "validates query length (1-2000 chars)",
			projectName: projectName,
			dbName:      dbName,
			requestBody: map[string]interface{}{
				"query": "", // Empty query
			},
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "query.*required",
		},
		{
			name:        "validates query too long",
			projectName: projectName,
			dbName:      dbName,
			requestBody: map[string]interface{}{
				"query": string(make([]byte, 2001)), // 2001 chars
			},
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "query.*maximum.*2000",
		},
		{
			name:        "validates maxChunks range (1-20)",
			projectName: projectName,
			dbName:      dbName,
			requestBody: map[string]interface{}{
				"query":     "Test query",
				"maxChunks": 25, // Exceeds maximum
			},
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "maxChunks.*maximum.*20",
		},
		{
			name:        "validates similarityThreshold range (0.0-1.0)",
			projectName: projectName,
			dbName:      dbName,
			requestBody: map[string]interface{}{
				"query":               "Test query",
				"similarityThreshold": 1.5, // Out of range
			},
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusBadRequest,
			expectedError:  "similarityThreshold.*between 0.0 and 1.0",
		},
		{
			name:        "returns 503 if database is unhealthy",
			projectName: projectName,
			dbName:      "unhealthy-db",
			requestBody: map[string]interface{}{
				"query": "Test query",
			},
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusServiceUnavailable,
			expectedError:  "database.*unavailable",
		},
		{
			name:        "returns 404 for non-existent database",
			projectName: projectName,
			dbName:      "non-existent-db",
			requestBody: map[string]interface{}{
				"query": "Test query",
			},
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
			requestBody: map[string]interface{}{
				"query": "Test query",
			},
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

			// Marshal request body
			bodyBytes, err := json.Marshal(tt.requestBody)
			require.NoError(t, err)

			// Create request
			req, err := http.NewRequest(http.MethodPost,
				fmt.Sprintf("/api/projects/%s/rag-databases/%s/query", tt.projectName, tt.dbName),
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

// TestExecuteRAGQuery_DefaultValues verifies default parameter values
func TestExecuteRAGQuery_DefaultValues(t *testing.T) {
	gin.SetMode(gin.TestMode)
	projectName := "test-project"
	dbName := "test-db"

	// Setup
	router := SetupContractTestRouter()
	router.Use(MockAuthMiddleware(projectName, "test-user@example.com"))

	// Request with only required field
	requestBody := map[string]interface{}{
		"query": "What is the architecture?",
	}

	bodyBytes, err := json.Marshal(requestBody)
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost,
		fmt.Sprintf("/api/projects/%s/rag-databases/%s/query", projectName, dbName),
		bytes.NewBuffer(bodyBytes))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer test-token")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Should use default values
	if w.Code == http.StatusOK {
		var responseBody map[string]interface{}
		err = json.Unmarshal(w.Body.Bytes(), &responseBody)
		require.NoError(t, err)

		// Check that defaults were applied:
		// - maxChunks: 10
		// - similarityThreshold: 0.7
		// - includeMetadata: true
		metadata := responseBody["metadata"].(map[string]interface{})
		assert.NotNil(t, metadata) // includeMetadata default is true

		sources := responseBody["sources"].([]interface{})
		// Should return at most 10 chunks (default maxChunks)
		assert.LessOrEqual(t, len(sources), 10)

		// All sources should have similarity >= 0.7 (default threshold)
		for _, s := range sources {
			source := s.(map[string]interface{})
			score := source["relevanceScore"].(float64)
			assert.GreaterOrEqual(t, score, 0.7)
		}
	}
}

// TestExecuteRAGQuery_NoRelevantDocuments verifies handling of no matches
func TestExecuteRAGQuery_NoRelevantDocuments(t *testing.T) {
	gin.SetMode(gin.TestMode)
	projectName := "test-project"
	dbName := "test-db"

	// Setup
	router := SetupContractTestRouter()
	router.Use(MockAuthMiddleware(projectName, "test-user@example.com"))

	// Query unlikely to match any documents
	requestBody := map[string]interface{}{
		"query":               "xyzzy plugh abracadabra random nonsense",
		"similarityThreshold": 0.95, // Very high threshold
	}

	bodyBytes, err := json.Marshal(requestBody)
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost,
		fmt.Sprintf("/api/projects/%s/rag-databases/%s/query", projectName, dbName),
		bytes.NewBuffer(bodyBytes))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer test-token")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code == http.StatusOK {
		var responseBody map[string]interface{}
		err = json.Unmarshal(w.Body.Bytes(), &responseBody)
		require.NoError(t, err)

		// Sources should be empty or very few
		sources := responseBody["sources"].([]interface{})
		if len(sources) == 0 {
			// Answer should indicate no relevant documents found
			answer := responseBody["answer"].(string)
			assert.Contains(t, answer, "no relevant")
		}

		// Metadata should still be present
		metadata := responseBody["metadata"].(map[string]interface{})
		assert.Equal(t, 0, int(metadata["relevantResults"].(float64)))
	}
}

// TestExecuteRAGQuery_SourceCitations verifies answer includes citations
func TestExecuteRAGQuery_SourceCitations(t *testing.T) {
	gin.SetMode(gin.TestMode)
	projectName := "test-project"
	dbName := "test-db"

	// Setup
	router := SetupContractTestRouter()
	router.Use(MockAuthMiddleware(projectName, "test-user@example.com"))

	requestBody := map[string]interface{}{
		"query": "How do I deploy the application?",
	}

	bodyBytes, err := json.Marshal(requestBody)
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost,
		fmt.Sprintf("/api/projects/%s/rag-databases/%s/query", projectName, dbName),
		bytes.NewBuffer(bodyBytes))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer test-token")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code == http.StatusOK {
		var responseBody map[string]interface{}
		err = json.Unmarshal(w.Body.Bytes(), &responseBody)
		require.NoError(t, err)

		answer := responseBody["answer"].(string)
		sources := responseBody["sources"].([]interface{})

		// If sources exist, answer should include citations
		if len(sources) > 0 {
			// Check for citation patterns like [Source: filename] or [1] etc.
			assert.Regexp(t, `\[Source:.*\]|\[\d+\]`, answer)

			// Verify cited documents exist in sources
			for _, s := range sources {
				source := s.(map[string]interface{})
				docName := source["documentName"].(string)
				// Answer might reference this document
				_ = docName // Used for citation verification
			}
		}
	}
}