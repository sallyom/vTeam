package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// Setup test router
func setupTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.Default()
	return r
}

// T004: Contract test for GET /artifacts endpoint
func TestListSessionArtifacts(t *testing.T) {
	router := setupTestRouter()
	router.GET("/api/projects/:projectName/sessions/:sessionName/artifacts", listSessionArtifacts)

	t.Run("returns 200 with artifact array", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/projects/test-project/sessions/test-session/artifacts", nil)
		req.Header.Set("Authorization", "Bearer test-token")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		// This test MUST fail until implementation is complete
		assert.Equal(t, http.StatusOK, w.Code)

		var response ArtifactListResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.NotNil(t, response.Artifacts)
	})

	t.Run("returns 404 for non-existent session", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/projects/test-project/sessions/non-existent/artifacts", nil)
		req.Header.Set("Authorization", "Bearer test-token")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("returns 401 for invalid user token", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/projects/test-project/sessions/test-session/artifacts", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}

// T005: Contract test for POST /jira/validate endpoint
func TestValidateSessionJiraIssue(t *testing.T) {
	router := setupTestRouter()
	router.POST("/api/projects/:projectName/sessions/:sessionName/jira/validate", validateSessionJiraIssue)

	t.Run("returns 200 with valid=true for valid issue", func(t *testing.T) {
		payload := ValidateIssueRequest{IssueKey: "PROJ-123"}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/api/projects/test-project/sessions/test-session/jira/validate", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer test-token")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		// This test MUST fail until implementation is complete
		assert.Equal(t, http.StatusOK, w.Code)

		var response ValidateIssueResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.True(t, response.Valid)
		assert.NotNil(t, response.Issue)
	})

	t.Run("returns 200 with valid=false for invalid issue key", func(t *testing.T) {
		payload := ValidateIssueRequest{IssueKey: "INVALID"}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/api/projects/test-project/sessions/test-session/jira/validate", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer test-token")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response ValidateIssueResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.False(t, response.Valid)
	})

	t.Run("returns 400 for malformed request", func(t *testing.T) {
		req, _ := http.NewRequest("POST", "/api/projects/test-project/sessions/test-session/jira/validate", bytes.NewBuffer([]byte("invalid json")))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer test-token")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})
}

// T006: Contract test for POST /jira endpoint
func TestPushSessionToJira(t *testing.T) {
	router := setupTestRouter()
	router.POST("/api/projects/:projectName/sessions/:sessionName/jira", pushSessionToJira)

	t.Run("returns 200 with success=true", func(t *testing.T) {
		payload := PushRequest{
			IssueKey:  "PROJ-123",
			Artifacts: []string{"transcript.txt", "result_summary.txt"},
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/api/projects/test-project/sessions/test-session/jira", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer test-token")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		// This test MUST fail until implementation is complete
		assert.Equal(t, http.StatusOK, w.Code)

		var response PushResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.True(t, response.Success)
		assert.Equal(t, "PROJ-123", response.JiraKey)
		assert.NotEmpty(t, response.Attachments)
	})

	t.Run("handles partial failures", func(t *testing.T) {
		payload := PushRequest{
			IssueKey:  "PROJ-123",
			Artifacts: []string{"valid.txt", "too_large.log"},
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/api/projects/test-project/sessions/test-session/jira", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer test-token")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response PushResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.False(t, response.Success) // Partial failure
		assert.NotEmpty(t, response.Errors)
	})

	t.Run("returns 400 for missing Jira config", func(t *testing.T) {
		payload := PushRequest{
			IssueKey:  "PROJ-123",
			Artifacts: []string{"transcript.txt"},
		}
		body, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "/api/projects/no-jira/sessions/test-session/jira", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer test-token")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)

		var response ErrorResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.Equal(t, ErrJiraConfigMissing, response.Code)
	})
}

// T007: Contract test for GET /jira endpoint
func TestGetSessionJiraLinks(t *testing.T) {
	router := setupTestRouter()
	router.GET("/api/projects/:projectName/sessions/:sessionName/jira", getSessionJiraLinks)

	t.Run("returns 200 with links array", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/projects/test-project/sessions/test-session/jira", nil)
		req.Header.Set("Authorization", "Bearer test-token")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		// This test MUST fail until implementation is complete
		assert.Equal(t, http.StatusOK, w.Code)

		var response JiraLinksResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.NotNil(t, response.Links)
	})

	t.Run("returns empty array for session with no links", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/projects/test-project/sessions/no-links/jira", nil)
		req.Header.Set("Authorization", "Bearer test-token")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response JiraLinksResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.Empty(t, response.Links)
	})

	t.Run("returns 404 for non-existent session", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/api/projects/test-project/sessions/non-existent/jira", nil)
		req.Header.Set("Authorization", "Bearer test-token")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})
}
