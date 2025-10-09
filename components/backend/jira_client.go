package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// loadJiraConfig reads Jira configuration from runner secret in the given namespace
func loadJiraConfig(ctx context.Context, clientset *kubernetes.Clientset, namespace string) (*JiraConfiguration, error) {
	// Get project settings to determine runner secret name
	secretName := "ambient-runner-secrets" // Default

	// Get the secret
	secret, err := clientset.CoreV1().Secrets(namespace).Get(ctx, secretName, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get runner secret: %w", err)
	}

	// Extract Jira configuration
	jiraURL := string(secret.Data["JIRA_URL"])
	jiraProject := string(secret.Data["JIRA_PROJECT"])
	jiraAPIToken := string(secret.Data["JIRA_API_TOKEN"])

	// Validate required fields
	if jiraURL == "" || jiraProject == "" || jiraAPIToken == "" {
		return nil, fmt.Errorf("missing required Jira configuration (JIRA_URL, JIRA_PROJECT, JIRA_API_TOKEN)")
	}

	return &JiraConfiguration{
		URL:      jiraURL,
		Project:  jiraProject,
		APIToken: jiraAPIToken,
	}, nil
}

// validateIssue checks if a Jira issue exists and is accessible
func validateIssue(config *JiraConfiguration, issueKey string) (*JiraIssueMetadata, error) {
	// Validate issue key format first
	if err := validateIssueKey(issueKey); err != nil {
		return nil, err
	}

	// Create HTTP client with timeout
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	// Build request URL
	url := fmt.Sprintf("%s/rest/api/2/issue/%s", config.URL, issueKey)

	// Create request
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", config.APIToken))
	req.Header.Set("Accept", "application/json")

	// Execute request with retry logic
	resp, err := executeWithRetry(client, req, 3)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	// Handle response
	switch resp.StatusCode {
	case http.StatusOK:
		// Parse response
		var jiraIssue struct {
			Key    string `json:"key"`
			Fields struct {
				Summary string `json:"summary"`
				Status  struct {
					Name string `json:"name"`
				} `json:"status"`
				Project struct {
					Key string `json:"key"`
				} `json:"project"`
			} `json:"fields"`
		}

		if err := json.NewDecoder(resp.Body).Decode(&jiraIssue); err != nil {
			return nil, fmt.Errorf("failed to parse response: %w", err)
		}

		return &JiraIssueMetadata{
			Key:     jiraIssue.Key,
			Summary: jiraIssue.Fields.Summary,
			Status:  jiraIssue.Fields.Status.Name,
			Project: jiraIssue.Fields.Project.Key,
		}, nil

	case http.StatusNotFound:
		return nil, fmt.Errorf("issue not found: %s", issueKey)

	case http.StatusUnauthorized, http.StatusForbidden:
		return nil, fmt.Errorf("authentication failed or permission denied")

	default:
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("unexpected status code %d: %s", resp.StatusCode, string(body))
	}
}

// uploadAttachment uploads a file as an attachment to a Jira issue
func uploadAttachment(config *JiraConfiguration, issueKey string, filename string, reader io.Reader) error {
	// Create HTTP client with timeout
	client := &http.Client{
		Timeout: 60 * time.Second, // Longer timeout for file uploads
	}

	// Build request URL
	url := fmt.Sprintf("%s/rest/api/2/issue/%s/attachments", config.URL, issueKey)

	// Create multipart form
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	// Add file field
	part, err := writer.CreateFormFile("file", filepath.Base(filename))
	if err != nil {
		return fmt.Errorf("failed to create form file: %w", err)
	}

	// Copy file content
	if _, err := io.Copy(part, reader); err != nil {
		return fmt.Errorf("failed to copy file content: %w", err)
	}

	// Close writer
	if err := writer.Close(); err != nil {
		return fmt.Errorf("failed to close writer: %w", err)
	}

	// Create request
	req, err := http.NewRequest("POST", url, body)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", config.APIToken))
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("X-Atlassian-Token", "no-check")

	// Execute request with retry logic
	resp, err := executeWithRetry(client, req, 3)
	if err != nil {
		return fmt.Errorf("upload failed: %w", err)
	}
	defer resp.Body.Close()

	// Handle response
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("upload failed with status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// createComment adds a comment to a Jira issue
func createComment(config *JiraConfiguration, issueKey string, commentBody string) (string, error) {
	// Create HTTP client with timeout
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	// Build request URL
	url := fmt.Sprintf("%s/rest/api/2/issue/%s/comment", config.URL, issueKey)

	// Create request body
	payload := map[string]string{
		"body": commentBody,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal payload: %w", err)
	}

	// Create request
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", config.APIToken))
	req.Header.Set("Content-Type", "application/json")

	// Execute request with retry logic
	resp, err := executeWithRetry(client, req, 3)
	if err != nil {
		return "", fmt.Errorf("comment creation failed: %w", err)
	}
	defer resp.Body.Close()

	// Handle response
	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("comment creation failed with status %d: %s", resp.StatusCode, string(body))
	}

	// Parse response to get comment ID
	var result struct {
		ID string `json:"id"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to parse response: %w", err)
	}

	return result.ID, nil
}

// executeWithRetry executes an HTTP request with exponential backoff retry logic
func executeWithRetry(client *http.Client, req *http.Request, maxRetries int) (*http.Response, error) {
	var resp *http.Response
	var err error

	for attempt := 0; attempt <= maxRetries; attempt++ {
		// Clone request body if needed (for retries)
		var bodyBytes []byte
		if req.Body != nil {
			bodyBytes, _ = io.ReadAll(req.Body)
			req.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
		}

		// Execute request
		resp, err = client.Do(req)

		// Success - return immediately
		if err == nil && resp.StatusCode < 500 && resp.StatusCode != http.StatusTooManyRequests {
			return resp, nil
		}

		// Rate limit - wait and retry
		if resp != nil && resp.StatusCode == http.StatusTooManyRequests {
			if attempt < maxRetries {
				waitTime := time.Duration(1<<uint(attempt)) * time.Second // Exponential backoff: 1s, 2s, 4s
				time.Sleep(waitTime)

				// Restore request body for retry
				if bodyBytes != nil {
					req.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
				}
				continue
			}
		}

		// Network error - retry
		if err != nil && attempt < maxRetries {
			waitTime := time.Duration(1<<uint(attempt)) * time.Second
			time.Sleep(waitTime)

			// Restore request body for retry
			if bodyBytes != nil {
				req.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
			}
			continue
		}

		// Max retries exceeded or non-retryable error
		break
	}

	return resp, err
}

// mapHTTPErrorToCode maps HTTP errors to ErrorResponse codes
func mapHTTPErrorToCode(statusCode int, err error) (string, bool) {
	switch statusCode {
	case http.StatusUnauthorized:
		return ErrJiraAuthFailed, false
	case http.StatusForbidden:
		return ErrJiraPermissionDenied, false
	case http.StatusNotFound:
		return ErrJiraIssueNotFound, false
	case http.StatusTooManyRequests:
		return ErrJiraRateLimit, true
	case http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout:
		return ErrJiraNetworkError, true
	default:
		if err != nil {
			return ErrJiraNetworkError, true
		}
		return ErrInternalError, false
	}
}
