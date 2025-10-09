package main

import (
	"fmt"
	"regexp"
	"time"
)

// JiraLink represents a link between a session artifact and a Jira issue
type JiraLink struct {
	Path      string    `json:"path"`      // Artifact file path (e.g., "transcript.txt")
	JiraKey   string    `json:"jiraKey"`   // Jira issue key (e.g., "PROJ-123")
	Timestamp time.Time `json:"timestamp"` // Push timestamp
	Status    string    `json:"status"`    // "success" | "failed"
	Error     string    `json:"error,omitempty"` // Error message if status is "failed"
}

// SessionArtifact represents a file generated during an agentic session
type SessionArtifact struct {
	Path         string    `json:"path"`         // Relative path within stateDir
	Size         int64     `json:"size"`         // File size in bytes
	MimeType     string    `json:"mimeType"`     // MIME type
	LastModified time.Time `json:"lastModified"` // Last modification timestamp
}

// JiraConfiguration represents project-scoped Jira connection settings
type JiraConfiguration struct {
	URL      string // Jira instance URL (e.g., "https://company.atlassian.net")
	Project  string // Default project key (e.g., "VTEAM")
	APIToken string // API token for authentication
}

// PushRequest represents a request to push artifacts to Jira
type PushRequest struct {
	IssueKey  string   `json:"issueKey"`  // Target Jira issue key
	Artifacts []string `json:"artifacts"` // Array of artifact paths to push
}

// PushResponse represents the response from a push operation
type PushResponse struct {
	Success     bool                   `json:"success"`     // Overall operation success
	JiraKey     string                 `json:"jiraKey"`     // Jira issue key
	Attachments []string               `json:"attachments"` // Successfully uploaded artifacts
	CommentID   string                 `json:"commentId,omitempty"` // Jira comment ID if created
	Errors      []ArtifactError        `json:"errors,omitempty"` // Per-artifact errors
}

// ArtifactError represents an error for a specific artifact
type ArtifactError struct {
	Path  string `json:"path"`  // Artifact path
	Error string `json:"error"` // Error message
}

// ValidateIssueRequest represents a request to validate a Jira issue
type ValidateIssueRequest struct {
	IssueKey string `json:"issueKey"` // Jira issue key to validate
}

// ValidateIssueResponse represents the response from issue validation
type ValidateIssueResponse struct {
	Valid bool               `json:"valid"`           // Whether the issue is accessible
	Issue *JiraIssueMetadata `json:"issue,omitempty"` // Issue metadata if valid
	Error string             `json:"error,omitempty"` // Error message if not valid
}

// JiraIssueMetadata represents basic metadata about a Jira issue
type JiraIssueMetadata struct {
	Key     string `json:"key"`     // Issue key (e.g., "PROJ-123")
	Summary string `json:"summary"` // Issue title
	Status  string `json:"status"`  // Issue status
	Project string `json:"project"` // Project key
}

// JiraLinksResponse represents the response containing all Jira links for a session
type JiraLinksResponse struct {
	Links []JiraLink `json:"links"` // Array of Jira links
}

// ArtifactListResponse represents the response containing all artifacts for a session
type ArtifactListResponse struct {
	Artifacts []SessionArtifact `json:"artifacts"` // Array of session artifacts
}

// ErrorResponse represents a structured error response
type ErrorResponse struct {
	Error     string `json:"error"`     // Human-readable error message
	Code      string `json:"code"`      // Error code
	Details   string `json:"details,omitempty"` // Additional error context
	Retryable bool   `json:"retryable"` // Whether the operation can be retried
}

// Error codes
const (
	ErrJiraConfigMissing      = "JIRA_CONFIG_MISSING"
	ErrJiraInvalidIssueKey    = "JIRA_INVALID_ISSUE_KEY"
	ErrJiraIssueNotFound      = "JIRA_ISSUE_NOT_FOUND"
	ErrJiraAuthFailed         = "JIRA_AUTH_FAILED"
	ErrJiraPermissionDenied   = "JIRA_PERMISSION_DENIED"
	ErrJiraNetworkError       = "JIRA_NETWORK_ERROR"
	ErrJiraRateLimit          = "JIRA_RATE_LIMIT"
	ErrArtifactTooLarge       = "ARTIFACT_TOO_LARGE"
	ErrArtifactNotFound       = "ARTIFACT_NOT_FOUND"
	ErrSessionNotFound        = "SESSION_NOT_FOUND"
	ErrUnauthorized           = "UNAUTHORIZED"
	ErrInternalError          = "INTERNAL_ERROR"
)

// Validation constants
const (
	MaxArtifactSize = 10 * 1024 * 1024 // 10MB Jira limit
	MaxErrorLength  = 1000
	MaxPathLength   = 255
)

var issueKeyRegex = regexp.MustCompile(`^[A-Z][A-Z0-9]+-[0-9]+$`)

// validateIssueKey validates the format of a Jira issue key
func validateIssueKey(key string) error {
	if !issueKeyRegex.MatchString(key) {
		return fmt.Errorf("invalid issue key format: %s (expected format: PROJECT-123)", key)
	}
	return nil
}

// validateArtifactSize validates that an artifact size is within Jira's limits
func validateArtifactSize(size int64) error {
	if size > MaxArtifactSize {
		return fmt.Errorf("artifact too large: %d bytes (max %d)", size, MaxArtifactSize)
	}
	return nil
}
