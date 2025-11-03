package bugfix

import (
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"ambient-code-backend/crd"
	"ambient-code-backend/git"
	"ambient-code-backend/github"
	"ambient-code-backend/types"

	"github.com/gin-gonic/gin"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
)

// Package-level dependencies (set from main)
var (
	GetK8sClientsForRequest    func(*gin.Context) (*kubernetes.Clientset, dynamic.Interface)
	GetProjectSettingsResource func() schema.GroupVersionResource
)

// Input validation constants to prevent oversized inputs
const (
	MaxTitleLength             = 200   // GitHub Issue title limit is 256, use 200 for safety
	MaxSymptomsLength          = 10000 // ~10KB for symptoms description
	MaxReproductionStepsLength = 10000 // ~10KB for reproduction steps
	MaxExpectedBehaviorLength  = 5000  // ~5KB for expected behavior
	MaxActualBehaviorLength    = 5000  // ~5KB for actual behavior
	MaxAdditionalContextLength = 10000 // ~10KB for additional context
	MaxBranchNameLength        = 255   // Git branch name limit
)

// validBranchNameRegex defines allowed characters in branch names
// Allows: letters, numbers, hyphens, underscores, forward slashes, and dots
// Prevents: shell metacharacters, backticks, quotes, semicolons, pipes, etc.
var validBranchNameRegex = regexp.MustCompile(`^[a-zA-Z0-9/_.-]+$`)

// validateBranchName checks if a branch name is safe to use in git operations
// Returns error if the branch name contains potentially dangerous characters
func validateBranchName(branchName string) error {
	if branchName == "" {
		return fmt.Errorf("branch name cannot be empty")
	}
	if !validBranchNameRegex.MatchString(branchName) {
		return fmt.Errorf("branch name contains invalid characters (allowed: a-z, A-Z, 0-9, /, _, -, .)")
	}
	// Prevent branch names that start with special characters
	if strings.HasPrefix(branchName, ".") || strings.HasPrefix(branchName, "-") {
		return fmt.Errorf("branch name cannot start with '.' or '-'")
	}
	// Prevent branch names with ".." (path traversal) or "//" (double slashes)
	if strings.Contains(branchName, "..") || strings.Contains(branchName, "//") {
		return fmt.Errorf("branch name cannot contain '..' or '//'")
	}
	return nil
}

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

		// Validate text description fields
		if strings.TrimSpace(td.Title) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Title is required"})
			return
		}
		titleLen := len(strings.TrimSpace(td.Title))
		if titleLen < 10 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Title must be at least 10 characters"})
			return
		}
		if titleLen > MaxTitleLength {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   fmt.Sprintf("Title exceeds maximum length of %d characters", MaxTitleLength),
				"current": titleLen,
				"max":     MaxTitleLength,
			})
			return
		}

		if strings.TrimSpace(td.Symptoms) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Symptoms are required"})
			return
		}
		symptomsLen := len(strings.TrimSpace(td.Symptoms))
		if symptomsLen < 20 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Symptoms must be at least 20 characters"})
			return
		}
		if symptomsLen > MaxSymptomsLength {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   fmt.Sprintf("Symptoms exceed maximum length of %d characters", MaxSymptomsLength),
				"current": symptomsLen,
				"max":     MaxSymptomsLength,
			})
			return
		}
		if strings.TrimSpace(td.TargetRepository) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Target repository is required"})
			return
		}

		// Parse target repository
		owner, repo, err := git.ParseGitHubURL(td.TargetRepository)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid target repository URL", "details": err.Error()})
			return
		}

		// Validate optional field lengths
		if td.ReproductionSteps != nil && len(*td.ReproductionSteps) > MaxReproductionStepsLength {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   fmt.Sprintf("Reproduction steps exceed maximum length of %d characters", MaxReproductionStepsLength),
				"current": len(*td.ReproductionSteps),
				"max":     MaxReproductionStepsLength,
			})
			return
		}
		if td.ExpectedBehavior != nil && len(*td.ExpectedBehavior) > MaxExpectedBehaviorLength {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   fmt.Sprintf("Expected behavior exceeds maximum length of %d characters", MaxExpectedBehaviorLength),
				"current": len(*td.ExpectedBehavior),
				"max":     MaxExpectedBehaviorLength,
			})
			return
		}
		if td.ActualBehavior != nil && len(*td.ActualBehavior) > MaxActualBehaviorLength {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   fmt.Sprintf("Actual behavior exceeds maximum length of %d characters", MaxActualBehaviorLength),
				"current": len(*td.ActualBehavior),
				"max":     MaxActualBehaviorLength,
			})
			return
		}
		if td.AdditionalContext != nil && len(*td.AdditionalContext) > MaxAdditionalContextLength {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   fmt.Sprintf("Additional context exceeds maximum length of %d characters", MaxAdditionalContextLength),
				"current": len(*td.AdditionalContext),
				"max":     MaxAdditionalContextLength,
			})
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

	// Auto-generate branch name if not provided
	var branch string
	if req.BranchName != nil && *req.BranchName != "" {
		branch = *req.BranchName
		// Validate user-provided branch name for security
		if err := validateBranchName(branch); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid branch name", "details": err.Error()})
			return
		}
	} else {
		// Auto-generate branch name: bugfix/gh-{issue-number}
		branch = fmt.Sprintf("bugfix/gh-%d", githubIssue.Number)
	}

	// Create feature branch in implementation repository
	err = git.CreateBranchInRepo(ctx, req.ImplementationRepo, branch, githubToken)
	if err != nil {
		// If branch already exists, that's okay - continue
		if !strings.Contains(err.Error(), "already exists") {
			c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to create feature branch", "details": err.Error()})
			return
		}
		log.Printf("Branch %s already exists in implementation repo, continuing...", branch)
	} else {
		log.Printf("Created branch %s in implementation repo %s", branch, req.ImplementationRepo.URL)
	}

	// Create BugFixWorkflow object
	workflow := &types.BugFixWorkflow{
		ID:                 fmt.Sprintf("%d", githubIssue.Number),
		GithubIssueNumber:  githubIssue.Number,
		GithubIssueURL:     githubIssueURL,
		Title:              githubIssue.Title,
		Description:        githubIssue.Body,
		BranchName:         branch,
		ImplementationRepo: req.ImplementationRepo, // The repository containing the code/bug
		Project:            project,
		CreatedBy:          userIDStr,
		CreatedAt:          time.Now().UTC().Format(time.RFC3339),
		Phase:              "Ready", // No initialization needed - ready to create sessions immediately
		Message:            "Workspace ready for sessions",
	}

	// Create BugFixWorkflow CR (spec + initial status)
	if err := crd.UpsertProjectBugFixWorkflowCR(reqDyn, workflow); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create workflow CR", "details": err.Error()})
		return
	}

	// Update workflow status (must be done separately for status subresource)
	if err := crd.UpdateBugFixWorkflowStatus(reqDyn, workflow); err != nil {
		log.Printf("Failed to update workflow status for #%d: %v", githubIssue.Number, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update workflow status", "details": err.Error()})
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
		"createdAt":         workflow.CreatedAt,
	})
}
