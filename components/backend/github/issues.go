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
	User struct {
		Login string `json:"login"`
		Type  string `json:"type"`
	} `json:"user"`
}

// GitHubLabel represents a label on a GitHub Issue
type GitHubLabel struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

// GitHubPullRequest represents a pull request
type GitHubPullRequest struct {
	Number int    `json:"number"`
	Title  string `json:"title"`
	State  string `json:"state"` // "open", "closed"
	URL    string `json:"html_url"`
	Head   struct {
		Ref string `json:"ref"` // branch name
	} `json:"head"`
	Base struct {
		Ref string `json:"ref"` // target branch name
	} `json:"base"`
	Merged bool `json:"merged"`
}

// CreatePullRequestRequest represents the request to create a PR
type CreatePullRequestRequest struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	Head  string `json:"head"`  // source branch
	Base  string `json:"base"`  // target branch (e.g., "main")
	Draft bool   `json:"draft"` // create as draft PR
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

// GetIssueLabels retrieves all labels for a GitHub Issue
func GetIssueLabels(ctx context.Context, owner, repo string, issueNumber int, token string) ([]GitHubLabel, error) {
	// GET /repos/{owner}/{repo}/issues/{issue_number}/labels
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/issues/%d/labels", owner, repo, issueNumber)

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
		var labels []GitHubLabel
		if err := json.Unmarshal(body, &labels); err != nil {
			return nil, fmt.Errorf("failed to parse labels response: %v", err)
		}
		return labels, nil
	case 404:
		return nil, fmt.Errorf("issue #%d not found in %s/%s", issueNumber, owner, repo)
	case 401, 403:
		return nil, fmt.Errorf("authentication failed or no access to issue #%d", issueNumber)
	case 429:
		resetTime := resp.Header.Get("X-RateLimit-Reset")
		return nil, fmt.Errorf("GitHub API rate limit exceeded (reset at %s)", resetTime)
	default:
		return nil, fmt.Errorf("GitHub API error (status %d): %s", resp.StatusCode, string(body))
	}
}

// GetIssueComments retrieves all comments for a GitHub Issue
func GetIssueComments(ctx context.Context, owner, repo string, issueNumber int, token string) ([]GitHubComment, error) {
	// GET /repos/{owner}/{repo}/issues/{issue_number}/comments
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/issues/%d/comments", owner, repo, issueNumber)

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
		var comments []GitHubComment
		if err := json.Unmarshal(body, &comments); err != nil {
			return nil, fmt.Errorf("failed to parse comments response: %v", err)
		}
		return comments, nil
	case 404:
		return nil, fmt.Errorf("issue #%d not found in %s/%s", issueNumber, owner, repo)
	case 401, 403:
		return nil, fmt.Errorf("authentication failed or no access to issue #%d", issueNumber)
	case 429:
		resetTime := resp.Header.Get("X-RateLimit-Reset")
		return nil, fmt.Errorf("GitHub API rate limit exceeded (reset at %s)", resetTime)
	default:
		return nil, fmt.Errorf("GitHub API error (status %d): %s", resp.StatusCode, string(body))
	}
}

// GetIssuePullRequests gets all pull requests that reference an issue
// Returns PRs that mention the issue in their body or are linked via keywords (fixes, closes, etc.)
func GetIssuePullRequests(ctx context.Context, owner, repo string, issueNumber int, token string) ([]GitHubPullRequest, error) {
	// Search for PRs that reference this issue
	// GitHub doesn't have a direct API for "PRs linked to issue", so we search for PRs mentioning the issue
	searchQuery := fmt.Sprintf("repo:%s/%s type:pr #%d", owner, repo, issueNumber)
	apiURL := fmt.Sprintf("https://api.github.com/search/issues?q=%s", searchQuery)

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
		var searchResult struct {
			Items []GitHubPullRequest `json:"items"`
		}
		if err := json.Unmarshal(body, &searchResult); err != nil {
			return nil, fmt.Errorf("failed to parse search response: %v", err)
		}
		return searchResult.Items, nil
	case 429:
		resetTime := resp.Header.Get("X-RateLimit-Reset")
		return nil, fmt.Errorf("GitHub API rate limit exceeded (reset at %s)", resetTime)
	default:
		return nil, fmt.Errorf("GitHub API error (status %d): %s", resp.StatusCode, string(body))
	}
}

// CreatePullRequest creates a new pull request
func CreatePullRequest(ctx context.Context, owner, repo, token string, request *CreatePullRequestRequest) (*GitHubPullRequest, error) {
	if request.Title == "" || request.Head == "" || request.Base == "" {
		return nil, fmt.Errorf("title, head, and base are required")
	}

	// POST /repos/{owner}/{repo}/pulls
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/pulls", owner, repo)

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
		var pr GitHubPullRequest
		if err := json.Unmarshal(body, &pr); err != nil {
			return nil, fmt.Errorf("failed to parse PR response: %v", err)
		}
		return &pr, nil
	case 401, 403:
		return nil, fmt.Errorf("authentication failed or no permission to create PR in %s/%s", owner, repo)
	case 404:
		return nil, fmt.Errorf("repository not found: %s/%s", owner, repo)
	case 422:
		// Validation failed - could be PR already exists or branch doesn't exist
		return nil, fmt.Errorf("validation failed: %s", string(body))
	case 429:
		resetTime := resp.Header.Get("X-RateLimit-Reset")
		return nil, fmt.Errorf("GitHub API rate limit exceeded (reset at %s)", resetTime)
	default:
		return nil, fmt.Errorf("GitHub API error (status %d): %s", resp.StatusCode, string(body))
	}
}

// AddPullRequestComment adds a comment to a pull request
func AddPullRequestComment(ctx context.Context, owner, repo string, prNumber int, token, commentBody string) (*GitHubComment, error) {
	if commentBody == "" {
		return nil, fmt.Errorf("comment body is required")
	}

	// POST /repos/{owner}/{repo}/issues/{issue_number}/comments
	// Note: GitHub's API treats PR comments the same as issue comments
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/issues/%d/comments", owner, repo, prNumber)

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
			return nil, fmt.Errorf("failed to parse comment response: %v", err)
		}
		return &comment, nil
	case 401, 403:
		return nil, fmt.Errorf("authentication failed or no permission to comment on PR #%d", prNumber)
	case 404:
		return nil, fmt.Errorf("PR #%d not found in %s/%s", prNumber, owner, repo)
	case 429:
		resetTime := resp.Header.Get("X-RateLimit-Reset")
		return nil, fmt.Errorf("GitHub API rate limit exceeded (reset at %s)", resetTime)
	default:
		return nil, fmt.Errorf("GitHub API error (status %d): %s", resp.StatusCode, string(body))
	}
}

// GitHubGist represents a GitHub Gist
type GitHubGist struct {
	ID          string `json:"id"`
	URL         string `json:"html_url"`
	Description string `json:"description"`
	Public      bool   `json:"public"`
}

// CreateGistRequest represents the request to create a Gist
type CreateGistRequest struct {
	Description string                       `json:"description"`
	Public      bool                         `json:"public"`
	Files       map[string]CreateGistFile    `json:"files"`
}

// CreateGistFile represents a file in a Gist
type CreateGistFile struct {
	Content string `json:"content"`
}

// CreateGist creates a new GitHub Gist
func CreateGist(ctx context.Context, token string, description string, filename string, content string, public bool) (*GitHubGist, error) {
	if filename == "" || content == "" {
		return nil, fmt.Errorf("filename and content are required")
	}

	// POST /gists
	apiURL := "https://api.github.com/gists"

	request := CreateGistRequest{
		Description: description,
		Public:      public,
		Files: map[string]CreateGistFile{
			filename: {Content: content},
		},
	}

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
		var gist GitHubGist
		if err := json.Unmarshal(body, &gist); err != nil {
			return nil, fmt.Errorf("failed to parse Gist response: %v", err)
		}
		return &gist, nil
	case 401, 403:
		return nil, fmt.Errorf("authentication failed or no permission to create Gists")
	case 404:
		return nil, fmt.Errorf("Gists API endpoint not found")
	case 422:
		return nil, fmt.Errorf("validation failed: %s", string(body))
	case 429:
		resetTime := resp.Header.Get("X-RateLimit-Reset")
		return nil, fmt.Errorf("GitHub API rate limit exceeded (reset at %s)", resetTime)
	default:
		return nil, fmt.Errorf("GitHub API error (status %d): %s", resp.StatusCode, string(body))
	}
}

// GetGist fetches the content of a Gist by its URL
// Returns the raw content of the first file in the Gist
func GetGist(ctx context.Context, gistURL, token string) (string, error) {
	// Extract gist ID from URL (e.g., https://gist.github.com/username/abc123 -> abc123)
	parts := strings.Split(strings.TrimSuffix(gistURL, "/"), "/")
	if len(parts) < 1 {
		return "", fmt.Errorf("invalid Gist URL format")
	}
	gistID := parts[len(parts)-1]

	// GET /gists/{gist_id}
	apiURL := fmt.Sprintf("https://api.github.com/gists/%s", gistID)

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %v", err)
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "vTeam-Backend")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("GitHub API request failed: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	switch resp.StatusCode {
	case 200:
		var gist struct {
			Files map[string]struct {
				Content string `json:"content"`
			} `json:"files"`
		}
		if err := json.Unmarshal(body, &gist); err != nil {
			return "", fmt.Errorf("failed to parse Gist response: %v", err)
		}
		// Return content of first file
		for _, file := range gist.Files {
			return file.Content, nil
		}
		return "", fmt.Errorf("Gist has no files")
	case 404:
		return "", fmt.Errorf("Gist not found")
	case 401, 403:
		return "", fmt.Errorf("authentication failed or no permission to access Gist")
	case 429:
		resetTime := resp.Header.Get("X-RateLimit-Reset")
		return "", fmt.Errorf("GitHub API rate limit exceeded (reset at %s)", resetTime)
	default:
		return "", fmt.Errorf("GitHub API error (status %d): %s", resp.StatusCode, string(body))
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
