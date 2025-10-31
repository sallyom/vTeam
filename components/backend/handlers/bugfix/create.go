package bugfix

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"ambient-code-backend/bugfix"
	"ambient-code-backend/crd"
	"ambient-code-backend/git"
	"ambient-code-backend/github"
	"ambient-code-backend/types"

	"github.com/gin-gonic/gin"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
)

// Package-level dependencies (set from main)
var (
	GetK8sClientsForRequest func(*gin.Context) (*kubernetes.Clientset, dynamic.Interface)
)

// CreateProjectBugFixWorkflow handles POST /api/projects/:projectName/bugfix-workflows
// Creates a new BugFix Workspace from either GitHub Issue URL or text description
func CreateProjectBugFixWorkflow(c *gin.Context) {
	project := c.Param("projectName")

	var req types.CreateBugFixWorkflowRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Validation failed: " + err.Error()})
		return
	}

	// Validate that either GitHub Issue URL or text description is provided
	if req.GithubIssueURL == nil && req.TextDescription == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Either githubIssueURL or textDescription must be provided"})
		return
	}

	if req.GithubIssueURL != nil && req.TextDescription != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot provide both githubIssueURL and textDescription"})
		return
	}

	// Get K8s clients
	reqK8s, reqDyn := GetK8sClientsForRequest(c)
	if reqK8s == nil || reqDyn == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing or invalid user token"})
		return
	}

	// Get user ID
	userID, _ := c.Get("userID")
	userIDStr, ok := userID.(string)
	if !ok || userIDStr == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User identity required"})
		return
	}

	// Get GitHub token
	ctx := c.Request.Context()
	githubToken, err := git.GetGitHubToken(ctx, reqK8s, reqDyn, project, userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to get GitHub token", "details": err.Error()})
		return
	}

	var githubIssue *github.GitHubIssue
	var githubIssueURL string

	// Flow 1: From GitHub Issue URL
	if req.GithubIssueURL != nil {
		githubIssueURL = *req.GithubIssueURL

		// Validate GitHub Issue exists and is accessible
		issue, err := github.ValidateIssueURL(ctx, githubIssueURL, githubToken)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid GitHub Issue", "details": err.Error()})
			return
		}
		githubIssue = issue
	}

	// Flow 2: From text description (create GitHub Issue automatically)
	if req.TextDescription != nil {
		td := req.TextDescription

		// Parse target repository
		owner, repo, err := git.ParseGitHubURL(td.TargetRepository)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid target repository URL", "details": err.Error()})
			return
		}

		// Generate issue body from template
		reproSteps := ""
		if td.ReproductionSteps != nil {
			reproSteps = *td.ReproductionSteps
		}
		expectedBehavior := ""
		if td.ExpectedBehavior != nil {
			expectedBehavior = *td.ExpectedBehavior
		}
		actualBehavior := ""
		if td.ActualBehavior != nil {
			actualBehavior = *td.ActualBehavior
		}
		additionalContext := ""
		if td.AdditionalContext != nil {
			additionalContext = *td.AdditionalContext
		}

		issueBody := github.GenerateIssueTemplate(
			td.Title,
			td.Symptoms,
			reproSteps,
			expectedBehavior,
			actualBehavior,
			additionalContext,
		)

		// Create GitHub Issue
		createReq := &github.CreateIssueRequest{
			Title: td.Title,
			Body:  issueBody,
		}

		issue, err := github.CreateIssue(ctx, owner, repo, githubToken, createReq)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to create GitHub Issue", "details": err.Error()})
			return
		}

		githubIssue = issue
		githubIssueURL = issue.URL
	}

	// Check for duplicate workspace (same issue number)
	owner, repo, err := git.ParseGitHubURL(req.UmbrellaRepo.URL)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid umbrella repository URL", "details": err.Error()})
		return
	}

	branch := "main"
	if req.BranchName != nil && *req.BranchName != "" {
		branch = *req.BranchName
	} else {
		// Auto-generate branch name
		branch = fmt.Sprintf("bugfix/gh-%d", githubIssue.Number)
	}

	// Check if bug folder already exists (duplicate detection)
	exists, err := bugfix.CheckBugFolderExists(ctx, owner, repo, branch, githubIssue.Number, githubToken)
	if err == nil && exists {
		c.JSON(http.StatusConflict, gin.H{
			"error": fmt.Sprintf("BugFix Workspace already exists for issue #%d (folder bug-%d/ found)", githubIssue.Number, githubIssue.Number),
		})
		return
	}

	// Generate workspace ID
	workspaceID := fmt.Sprintf("bugfix-%d", time.Now().Unix())

	// Create BugFixWorkflow object
	workflow := &types.BugFixWorkflow{
		ID:                githubIssue.Number,
		GithubIssueNumber: githubIssue.Number,
		GithubIssueURL:    githubIssueURL,
		Title:             githubIssue.Title,
		Description:       githubIssue.Body,
		BranchName:        branch,
		UmbrellaRepo:      &req.UmbrellaRepo,
		SupportingRepos:   req.SupportingRepos,
		Project:           project,
		CreatedBy:         userIDStr,
		CreatedAt:         time.Now().UTC().Format(time.RFC3339),
		Phase:             "Initializing",
		Message:           "Creating bug folder in spec repository...",
	}

	// Create bug folder in spec repository
	// Note: This is done synchronously for simplicity, but could be made async with a worker
	userEmail := ""
	userName := ""
	// TODO: Get user email/name from user context if available

	err = bugfix.CreateBugFolder(ctx, req.UmbrellaRepo.URL, githubIssue.Number, branch, githubToken, userEmail, userName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create bug folder", "details": err.Error()})
		return
	}

	// Update workflow status
	workflow.Phase = "Ready"
	workflow.Message = "Workspace ready for sessions"
	workflow.BugFolderCreated = true

	// Create BugFixWorkflow CR
	if err := crd.UpsertProjectBugFixWorkflowCR(reqDyn, workflow); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create workflow CR", "details": err.Error()})
		return
	}

	// Return created workflow
	c.JSON(http.StatusCreated, gin.H{
		"id":                workflow.ID,
		"githubIssueNumber": workflow.GithubIssueNumber,
		"githubIssueURL":    workflow.GithubIssueURL,
		"title":             workflow.Title,
		"description":       workflow.Description,
		"branchName":        workflow.BranchName,
		"phase":             workflow.Phase,
		"message":           workflow.Message,
		"bugFolderCreated":  workflow.BugFolderCreated,
		"createdAt":         workflow.CreatedAt,
	})
}
