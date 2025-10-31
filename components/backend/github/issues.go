package github

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// GitHubIssue represents a GitHub Issue (subset of fields)
type GitHubIssue struct {
	Number int    `json:"number"`
	Title  string `json:"title"`
	Body   string `json:"body"`
	State  string `json:"state"`
	URL    string `json:"html_url"`
}

// GitHubComment represents a comment on a GitHub Issue
type GitHubComment struct {
	ID   int    `json:"id"`
	Body string `json:"body"`
	URL  string `json:"html_url"`
}

// CreateIssueRequest represents the request body for creating an issue
type CreateIssueRequest struct {
	Title     string   `json:"title"`
	Body      string   `json:"body"`
	Labels    []string `json:"labels,omitempty"`
	Assignees []string `json:"assignees,omitempty"`
}

// UpdateIssueRequest represents the request body for updating an issue
type UpdateIssueRequest struct {
	Title *string  `json:"title,omitempty"`
	Body  *string  `json:"body,omitempty"`
	State *string  `json:"state,omitempty"` // "open" or "closed"
	Labels []string `json:"labels,omitempty"`
}

// AddCommentRequest represents the request body for adding a comment
type AddCommentRequest struct {
	Body string `json:"body"`
}

// ParseGitHubIssueURL parses a GitHub Issue URL and extracts owner, repo, and issue number
// Example: https://github.com/owner/repo/issues/123 -> owner, repo, 123
func ParseGitHubIssueURL(issueURL string) (owner, repo string, issueNumber int, err error) {
	// Pattern: https://github.com/{owner}/{repo}/issues/{number}
	pattern := `^https?://github\.com/([^/]+)/([^/]+)/issues/(\d+)/?$`
	re := regexp.MustCompile(pattern)
	matches := re.FindStringSubmatch(strings.TrimSpace(issueURL))

	if len(matches) != 4 {
		return "", "", 0, fmt.Errorf("invalid GitHub Issue URL format: expected https://github.com/owner/repo/issues/NUMBER")
	}

	owner = matches[1]
	repo = matches[2]
	issueNumber, err = strconv.Atoi(matches[3])
	if err != nil {
		return "", "", 0, fmt.Errorf("invalid issue number in URL: %v", err)
	}

	return owner, repo, issueNumber, nil
}

// ValidateIssueURL validates that a GitHub Issue exists and is accessible
// Returns the issue details if valid, error if not found or inaccessible
func ValidateIssueURL(ctx context.Context, issueURL, token string) (*GitHubIssue, error) {
	owner, repo, issueNumber, err := ParseGitHubIssueURL(issueURL)
	if err != nil {
		return nil, err
	}

	// GET /repos/{owner}/{repo}/issues/{issue_number}
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/issues/%d", owner, repo, issueNumber)

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %v", err)
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "vTeam-Backend")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("GitHub API request failed: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	switch resp.StatusCode {
	case 200:
		var issue GitHubIssue
		if err := json.Unmarshal(body, &issue); err != nil {
			return nil, fmt.Errorf("failed to parse GitHub Issue response: %v", err)
		}
		return &issue, nil
	case 404:
		return nil, fmt.Errorf("GitHub Issue not found: %s", issueURL)
	case 410:
		return nil, fmt.Errorf("GitHub Issue has been deleted: %s", issueURL)
	case 401, 403:
		return nil, fmt.Errorf("authentication failed or no access to GitHub Issue: %s", issueURL)
	case 429:
		// Rate limit exceeded
		resetTime := resp.Header.Get("X-RateLimit-Reset")
		return nil, fmt.Errorf("GitHub API rate limit exceeded (reset at %s)", resetTime)
	default:
		return nil, fmt.Errorf("GitHub API error (status %d): %s", resp.StatusCode, string(body))
	}
}

// CreateIssue creates a new GitHub Issue
// Returns the created issue details including issue number and URL
func CreateIssue(ctx context.Context, owner, repo, token string, request *CreateIssueRequest) (*GitHubIssue, error) {
	if request.Title == "" || request.Body == "" {
		return nil, fmt.Errorf("title and body are required")
	}

	// POST /repos/{owner}/{repo}/issues
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/issues", owner, repo)

	bodyBytes, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %v", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", apiURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %v", err)
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "vTeam-Backend")
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("GitHub API request failed: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	switch resp.StatusCode {
	case 201:
		var issue GitHubIssue
		if err := json.Unmarshal(body, &issue); err != nil {
			return nil, fmt.Errorf("failed to parse GitHub Issue response: %v", err)
		}
		return &issue, nil
	case 401, 403:
		return nil, fmt.Errorf("authentication failed or no permission to create issues in %s/%s", owner, repo)
	case 404:
		return nil, fmt.Errorf("repository not found: %s/%s", owner, repo)
	case 429:
		resetTime := resp.Header.Get("X-RateLimit-Reset")
		return nil, fmt.Errorf("GitHub API rate limit exceeded (reset at %s)", resetTime)
	default:
		return nil, fmt.Errorf("GitHub API error (status %d): %s", resp.StatusCode, string(body))
	}
}

// UpdateIssue updates an existing GitHub Issue
func UpdateIssue(ctx context.Context, owner, repo string, issueNumber int, token string, request *UpdateIssueRequest) (*GitHubIssue, error) {
	// PATCH /repos/{owner}/{repo}/issues/{issue_number}
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/issues/%d", owner, repo, issueNumber)

	bodyBytes, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %v", err)
	}

	req, err := http.NewRequestWithContext(ctx, "PATCH", apiURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %v", err)
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "vTeam-Backend")
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("GitHub API request failed: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	switch resp.StatusCode {
	case 200:
		var issue GitHubIssue
		if err := json.Unmarshal(body, &issue); err != nil {
			return nil, fmt.Errorf("failed to parse GitHub Issue response: %v", err)
		}
		return &issue, nil
	case 401, 403:
		return nil, fmt.Errorf("authentication failed or no permission to update issue #%d", issueNumber)
	case 404:
		return nil, fmt.Errorf("issue #%d not found in %s/%s", issueNumber, owner, repo)
	case 429:
		resetTime := resp.Header.Get("X-RateLimit-Reset")
		return nil, fmt.Errorf("GitHub API rate limit exceeded (reset at %s)", resetTime)
	default:
		return nil, fmt.Errorf("GitHub API error (status %d): %s", resp.StatusCode, string(body))
	}
}

// AddComment adds a comment to a GitHub Issue
// Returns the created comment details
func AddComment(ctx context.Context, owner, repo string, issueNumber int, token, commentBody string) (*GitHubComment, error) {
	if commentBody == "" {
		return nil, fmt.Errorf("comment body is required")
	}

	// POST /repos/{owner}/{repo}/issues/{issue_number}/comments
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/issues/%d/comments", owner, repo, issueNumber)

	request := AddCommentRequest{Body: commentBody}
	bodyBytes, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %v", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", apiURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %v", err)
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "vTeam-Backend")
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("GitHub API request failed: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	switch resp.StatusCode {
	case 201:
		var comment GitHubComment
		if err := json.Unmarshal(body, &comment); err != nil {
			return nil, fmt.Errorf("failed to parse GitHub comment response: %v", err)
		}
		return &comment, nil
	case 401, 403:
		return nil, fmt.Errorf("authentication failed or no permission to comment on issue #%d", issueNumber)
	case 404:
		return nil, fmt.Errorf("issue #%d not found in %s/%s", issueNumber, owner, repo)
	case 429:
		resetTime := resp.Header.Get("X-RateLimit-Reset")
		return nil, fmt.Errorf("GitHub API rate limit exceeded (reset at %s)", resetTime)
	default:
		return nil, fmt.Errorf("GitHub API error (status %d): %s", resp.StatusCode, string(body))
	}
}

// GenerateIssueTemplate generates a standardized GitHub Issue body from text description
func GenerateIssueTemplate(title, symptoms, reproSteps, expectedBehavior, actualBehavior, additionalContext string) string {
	var template strings.Builder

	template.WriteString("## Bug Description\n\n")
	template.WriteString(symptoms)
	template.WriteString("\n\n")

	if reproSteps != "" {
		template.WriteString("## Reproduction Steps\n\n")
		template.WriteString(reproSteps)
		template.WriteString("\n\n")
	}

	if expectedBehavior != "" {
		template.WriteString("## Expected Behavior\n\n")
		template.WriteString(expectedBehavior)
		template.WriteString("\n\n")
	}

	if actualBehavior != "" {
		template.WriteString("## Actual Behavior\n\n")
		template.WriteString(actualBehavior)
		template.WriteString("\n\n")
	}

	if additionalContext != "" {
		template.WriteString("## Additional Context\n\n")
		template.WriteString(additionalContext)
		template.WriteString("\n\n")
	}

	template.WriteString("---\n")
	template.WriteString("*This issue was automatically created by vTeam BugFix Workspace*\n")

	return template.String()
}
