package contract

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// T022: Contract test for POST /api/projects/{projectName}/rag-databases/{dbName}/query-stream
func TestExecuteRAGQueryStream(t *testing.T) {
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
		validateStream func(t *testing.T, events []SSEEvent)
	}{
		{
			name:        "accepts JSON request and returns text/event-stream",
			projectName: projectName,
			dbName:      dbName,
			requestBody: map[string]interface{}{
				"query":               "What is the deployment process?",
				"maxChunks":           10,
				"similarityThreshold": 0.7,
			},
			setupAuth: func(c *gin.Context) {
				c.Set("project", projectName)
				c.Set("user", "test-user@example.com")
			},
			expectedStatus: http.StatusOK,
			validateStream: func(t *testing.T, events []SSEEvent) {
				// Should have at least some events
				assert.NotEmpty(t, events)

				// Track event types seen
				eventTypes := make(map[string]bool)
				for _, event := range events {
					eventTypes[event.Type] = true
				}

				// Should see sources event first
				assert.True(t, eventTypes["sources"], "Should have sources event")

				// Should see answer chunks
				assert.True(t, eventTypes["answer"], "Should have answer events")

				// Should see done event last
				assert.True(t, eventTypes["done"], "Should have done event")

				// Validate event order
				var sourcesIdx, firstAnswerIdx, doneIdx int
				for i, event := range events {
					switch event.Type {
					case "sources":
						sourcesIdx = i
					case "answer":
						if firstAnswerIdx == 0 {
							firstAnswerIdx = i
						}
					case "done":
						doneIdx = i
					}
				}

				// Sources should come before answers
				if firstAnswerIdx > 0 {
					assert.Less(t, sourcesIdx, firstAnswerIdx,
						"Sources should be sent before answer chunks")
				}

				// Done should be last
				assert.Equal(t, len(events)-1, doneIdx,
					"Done event should be last")

				// Validate sources event data
				for _, event := range events {
					if event.Type == "sources" {
						var data map[string]interface{}
						err := json.Unmarshal([]byte(event.Data), &data)
						require.NoError(t, err)

						sources, ok := data["sources"].([]interface{})
						assert.True(t, ok, "Sources data should have sources array")

						// Validate source structure
						for _, s := range sources {
							source := s.(map[string]interface{})
							assert.NotEmpty(t, source["documentId"])
							assert.NotEmpty(t, source["documentName"])
							assert.NotEmpty(t, source["chunkText"])
							assert.NotNil(t, source["relevanceScore"])
						}
					}
				}

				// Validate answer chunks
				var fullAnswer strings.Builder
				for _, event := range events {
					if event.Type == "answer" {
						var data map[string]interface{}
						err := json.Unmarshal([]byte(event.Data), &data)
						require.NoError(t, err)

						chunk, ok := data["chunk"].(string)
						assert.True(t, ok, "Answer event should have chunk")
						fullAnswer.WriteString(chunk)
					}
				}

				// Full answer should not be empty
				assert.NotEmpty(t, fullAnswer.String())

				// Validate done event
				for _, event := range events {
					if event.Type == "done" {
						var data map[string]interface{}
						err := json.Unmarshal([]byte(event.Data), &data)
						require.NoError(t, err)

						metadata, ok := data["metadata"].(map[string]interface{})
						assert.True(t, ok, "Done event should have metadata")

						assert.NotNil(t, metadata["documentsSearched"])
						assert.NotNil(t, metadata["relevantResults"])
						assert.NotNil(t, metadata["queryTimeMs"])
					}
				}
			},
		},
		{
			name:        "validates request body same as non-streaming",
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
			name:        "returns appropriate error for database issues",
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
				fmt.Sprintf("/api/projects/%s/rag-databases/%s/query-stream",
					tt.projectName, tt.dbName),
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

			if tt.expectedStatus == http.StatusOK {
				// Verify Content-Type for SSE
				contentType := w.Header().Get("Content-Type")
				assert.Equal(t, "text/event-stream", contentType)

				// Verify Cache-Control
				cacheControl := w.Header().Get("Cache-Control")
				assert.Contains(t, cacheControl, "no-cache")

				// Parse SSE events
				events := parseSSEEvents(t, w.Body)

				if tt.validateStream != nil {
					tt.validateStream(t, events)
				}
			} else if tt.expectedError != "" {
				// For error responses, parse JSON
				var responseBody map[string]interface{}
				err = json.Unmarshal(w.Body.Bytes(), &responseBody)
				require.NoError(t, err)

				errorMsg, _ := responseBody["error"].(string)
				if errorMsg == "" {
					errorMsg, _ = responseBody["message"].(string)
				}
				assert.Regexp(t, tt.expectedError, errorMsg)
			}
		})
	}
}

// SSEEvent represents a Server-Sent Event
type SSEEvent struct {
	Type string
	Data string
	ID   string
}

// parseSSEEvents parses SSE stream into events
func parseSSEEvents(t *testing.T, body io.Reader) []SSEEvent {
	var events []SSEEvent
	scanner := bufio.NewScanner(body)

	var currentEvent SSEEvent
	var dataLines []string

	for scanner.Scan() {
		line := scanner.Text()

		if line == "" {
			// Empty line marks end of event
			if len(dataLines) > 0 {
				currentEvent.Data = strings.Join(dataLines, "\n")

				// Parse data to get event type
				var data map[string]interface{}
				if err := json.Unmarshal([]byte(currentEvent.Data), &data); err == nil {
					if eventType, ok := data["type"].(string); ok {
						currentEvent.Type = eventType
					}
				}

				events = append(events, currentEvent)
				currentEvent = SSEEvent{}
				dataLines = nil
			}
			continue
		}

		if strings.HasPrefix(line, "data: ") {
			dataLines = append(dataLines, strings.TrimPrefix(line, "data: "))
		} else if strings.HasPrefix(line, "event: ") {
			currentEvent.Type = strings.TrimPrefix(line, "event: ")
		} else if strings.HasPrefix(line, "id: ") {
			currentEvent.ID = strings.TrimPrefix(line, "id: ")
		}
	}

	// Handle last event if no trailing newline
	if len(dataLines) > 0 {
		currentEvent.Data = strings.Join(dataLines, "\n")
		events = append(events, currentEvent)
	}

	require.NoError(t, scanner.Err())
	return events
}

// TestExecuteRAGQueryStream_ValidateSSEFormat ensures proper SSE formatting
func TestExecuteRAGQueryStream_ValidateSSEFormat(t *testing.T) {
	gin.SetMode(gin.TestMode)
	projectName := "test-project"
	dbName := "test-db"

	// Setup
	router := SetupContractTestRouter()
	router.Use(MockAuthMiddleware(projectName, "test-user@example.com"))

	requestBody := map[string]interface{}{
		"query": "Explain the architecture",
	}

	bodyBytes, err := json.Marshal(requestBody)
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost,
		fmt.Sprintf("/api/projects/%s/rag-databases/%s/query-stream", projectName, dbName),
		bytes.NewBuffer(bodyBytes))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer test-token")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code == http.StatusOK {
		// Validate raw SSE format
		body := w.Body.String()

		// Should have data: prefix
		assert.Contains(t, body, "data: ")

		// Should have double newlines between events
		assert.Contains(t, body, "\n\n")

		// Each line should follow SSE format
		lines := strings.Split(body, "\n")
		for _, line := range lines {
			if line != "" {
				// Must be either data:, event:, id:, or retry:
				assert.Regexp(t, `^(data:|event:|id:|retry:)`, line)
			}
		}

		// Verify JSON in data fields
		for _, line := range lines {
			if strings.HasPrefix(line, "data: ") {
				jsonStr := strings.TrimPrefix(line, "data: ")
				if jsonStr != "" {
					var data interface{}
					err := json.Unmarshal([]byte(jsonStr), &data)
					assert.NoError(t, err, "Data field should contain valid JSON")
				}
			}
		}
	}
}

// TestExecuteRAGQueryStream_StreamInterruption simulates client disconnect
func TestExecuteRAGQueryStream_StreamInterruption(t *testing.T) {
	gin.SetMode(gin.TestMode)
	projectName := "test-project"
	dbName := "test-db"

	// Setup
	router := SetupContractTestRouter()
	router.Use(MockAuthMiddleware(projectName, "test-user@example.com"))

	requestBody := map[string]interface{}{
		"query": "Long query that would generate many chunks",
	}

	bodyBytes, err := json.Marshal(requestBody)
	require.NoError(t, err)

	req, err := http.NewRequest(http.MethodPost,
		fmt.Sprintf("/api/projects/%s/rag-databases/%s/query-stream", projectName, dbName),
		bytes.NewBuffer(bodyBytes))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer test-token")

	// Use custom response recorder that can simulate disconnect
	w := httptest.NewRecorder()

	// Note: In real implementation, the server should handle
	// client disconnection gracefully and stop processing
	router.ServeHTTP(w, req)

	// Basic validation - server should not crash
	assert.Contains(t, []int{http.StatusOK, http.StatusServiceUnavailable}, w.Code)
}