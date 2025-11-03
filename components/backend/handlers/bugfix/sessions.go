package bugfix

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"ambient-code-backend/crd"
	"ambient-code-backend/git"
	"ambient-code-backend/github"
	"ambient-code-backend/handlers"
	"ambient-code-backend/types"

	"github.com/gin-gonic/gin"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// Package-level dependency for AgenticSession GVR (set from main)
var GetAgenticSessionResource func() schema.GroupVersionResource

// CreateProjectBugFixWorkflowSession handles POST /api/projects/:projectName/bugfix-workflows/:id/sessions
// Creates a new session (bug-review, bug-resolution-plan, bug-implement-fix, or generic) linked to the workflow
func CreateProjectBugFixWorkflowSession(c *gin.Context) {
	project := c.Param("projectName")
	workflowID := c.Param("id")

	var req types.CreateBugFixSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Validation failed: " + err.Error()})
		return
	}

	// Validate session type (now only 2 types: bug-review and bug-implement-fix)
	validTypes := map[string]bool{
		"bug-review":        true, // Includes assessment & planning
		"bug-implement-fix": true,
	}
	if !validTypes[req.SessionType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session type. Must be: bug-review or bug-implement-fix"})
		return
	}

	// Get K8s clients
	reqK8s, reqDyn := GetK8sClientsForRequest(c)
	if reqDyn == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing or invalid user token"})
		return
	}

	// Get workflow
	workflow, err := crd.GetProjectBugFixWorkflowCR(reqDyn, project, workflowID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get workflow", "details": err.Error()})
		return
	}
	if workflow == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Workflow not found"})
		return
	}

	// Check workflow is ready
	if workflow.Phase != "Ready" {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Workflow is not ready (current phase: %s)", workflow.Phase)})
		return
	}

	// Pre-flight check: For implementation sessions, check if PR already exists
	if req.SessionType == "bug-implement-fix" {
		userID, _ := c.Get("userID")
		userIDStr, _ := userID.(string)
		ctx := c.Request.Context()
		if reqK8s != nil && reqDyn != nil && userIDStr != "" {
			if githubToken, err := git.GetGitHubToken(ctx, reqK8s, reqDyn, project, userIDStr); err == nil {
				// Parse issue URL to get owner, repo, number
				if owner, repo, issueNum, err := github.ParseGitHubIssueURL(workflow.GithubIssueURL); err == nil {
					// Check for existing PRs linked to this issue
					if prs, err := github.GetIssuePullRequests(ctx, owner, repo, issueNum, githubToken); err == nil {
						// Look for open PRs
						for _, pr := range prs {
							if pr.State == "open" {
								// Found open PR - return conflict with PR details for frontend to handle
								log.Printf("Found existing open PR #%d for issue #%d, notifying user", pr.Number, issueNum)
								c.JSON(http.StatusConflict, gin.H{
									"error":      "PR already exists for this issue",
									"prNumber":   pr.Number,
									"prURL":      pr.URL,
									"prTitle":    pr.Title,
									"prBranch":   pr.Head.Ref,
									"prState":    pr.State,
									"issueURL":   workflow.GithubIssueURL,
									"workflowID": workflowID,
								})
								return
							}
						}
						log.Printf("No open PRs found for issue #%d, proceeding with implementation session", issueNum)
					} else {
						log.Printf("Warning: failed to check for existing PRs: %v (proceeding anyway)", err)
					}
				}
			}
		}
	}

	// Generate session name
	sessionName := fmt.Sprintf("%s-%s-%d", workflowID, req.SessionType, time.Now().Unix())

	// Build session title
	title := req.SessionType + " session"
	if req.Title != nil {
		title = *req.Title
	} else {
		// Auto-generate title based on session type
		switch req.SessionType {
		case "bug-review":
			title = fmt.Sprintf("Bug Review & Assessment: Issue #%d", workflow.GithubIssueNumber)
		case "bug-implement-fix":
			title = fmt.Sprintf("Implement Fix: Issue #%d", workflow.GithubIssueNumber)
		}
	}

	// Build description
	description := ""
	if req.Description != nil {
		description = *req.Description
	}

	// Build repositories list
	repos := make([]map[string]interface{}, 0)

	// Derive repo name from URL (e.g., "https://github.com/owner/repo.git" -> "repo")
	repoName := deriveRepoNameFromURL(workflow.ImplementationRepo.URL)

	// Both session types clone the base branch and push to feature branch
	// The feature branch is created on first push if it doesn't exist
	repoInput := map[string]interface{}{
		"url":    workflow.ImplementationRepo.URL,
		"branch": workflow.ImplementationRepo.Branch, // base branch (e.g., "main")
	}
	repoOutput := map[string]interface{}{
		"url":    workflow.ImplementationRepo.URL,
		"branch": workflow.BranchName, // feature branch (e.g., "bugfix/gh-210")
	}
	repos = append(repos, map[string]interface{}{
		"name":   repoName, // REQUIRED: runner uses this as workspace subdirectory and for push operations
		"input":  repoInput,
		"output": repoOutput,
	})

	// Build environment variables
	// NOTE: environmentVariables field is not currently in the AgenticSession CRD schema,
	// so these will be silently dropped when the CR is created. Include critical info
	// (like GitHub issue URL) directly in the prompt instead.
	envVars := map[string]string{
		"GITHUB_ISSUE_NUMBER": fmt.Sprintf("%d", workflow.GithubIssueNumber),
		"GITHUB_ISSUE_URL":    workflow.GithubIssueURL,
		"BUGFIX_WORKFLOW_ID":  workflowID,
		"SESSION_TYPE":        req.SessionType,
		"PROJECT_NAME":        project,
	}

	// Merge user-provided environment variables
	if req.EnvironmentVariables != nil {
		for k, v := range req.EnvironmentVariables {
			envVars[k] = v
		}
	}

	// Build prompt based on session type
	prompt := ""
	if req.Prompt != nil && *req.Prompt != "" {
		prompt = *req.Prompt
	} else {
		// Auto-generate prompt based on session type
		// Include the GitHub issue URL so Claude can fetch it
		switch req.SessionType {
		case "bug-review":
			// Check for existing Claude assessment (indicated by "claude" label)
			claudeAssessment := ""
			ctx := c.Request.Context()

			// Get GitHub token for API calls
			userID, _ := c.Get("userID")
			userIDStr, _ := userID.(string)
			reqK8s, reqDyn := handlers.GetK8sClientsForRequest(c)
			if reqK8s != nil && reqDyn != nil && userIDStr != "" {
				if githubToken, err := git.GetGitHubToken(ctx, reqK8s, reqDyn, project, userIDStr); err == nil {
					// Parse issue URL to get owner, repo, number
					if owner, repo, issueNum, err := github.ParseGitHubIssueURL(workflow.GithubIssueURL); err == nil {
						// Check for "claude" label
						if labels, err := github.GetIssueLabels(ctx, owner, repo, issueNum, githubToken); err == nil {
							hasClaudeLabel := false
							for _, label := range labels {
								if strings.ToLower(label.Name) == "claude" {
									hasClaudeLabel = true
									break
								}
							}

							// If claude label exists, fetch ALL Claude comments from the issue
							if hasClaudeLabel {
								log.Printf("Found 'claude' label on issue #%d, fetching all existing Claude comments", issueNum)
								if comments, err := github.GetIssueComments(ctx, owner, repo, issueNum, githubToken); err == nil {
									// Collect ALL comments from claude-bot or any user with "claude" in username
									claudeComments := []string{}
									for _, comment := range comments {
										userLogin := strings.ToLower(comment.User.Login)
										if strings.Contains(userLogin, "claude") || comment.User.Type == "Bot" {
											claudeComments = append(claudeComments, comment.Body)
											log.Printf("Found Claude comment from user: %s", comment.User.Login)
										}
									}
									if len(claudeComments) > 0 {
										// Join all Claude comments with separators
										claudeAssessment = strings.Join(claudeComments, "\n\n---\n\n")
										log.Printf("Collected %d Claude comment(s) for context", len(claudeComments))
									}
								}
							}
						}
					}
				}
			}

			// Build prompt with or without existing assessment
			basePrompt := fmt.Sprintf("Review the GitHub issue at %s and analyze the bug report. Focus on understanding the problem, reproduction steps, and affected components. Then create a detailed resolution plan with fix strategy. Follow any guidelines in CLAUDE.md if present in the repository.", workflow.GithubIssueURL)

			if claudeAssessment != "" {
				prompt = fmt.Sprintf("%s\n\nEXISTING CLAUDE ASSESSMENT:\n\n%s\n\nBuild on this existing analysis to create a comprehensive resolution plan. You can reference and extend the insights from the assessment above.", basePrompt, claudeAssessment)
			} else {
				prompt = basePrompt
			}

		case "bug-implement-fix":
			// Check for existing resolution plan (from bug-review session)
			resolutionPlan := ""
			ctx := c.Request.Context()

			// Get GitHub token for API calls
			userID, _ := c.Get("userID")
			userIDStr, _ := userID.(string)
			reqK8s, reqDyn := handlers.GetK8sClientsForRequest(c)
			if reqK8s != nil && reqDyn != nil && userIDStr != "" {
				if githubToken, err := git.GetGitHubToken(ctx, reqK8s, reqDyn, project, userIDStr); err == nil {
					// First priority: Check for bug-review Gist URL in workflow annotations
					if workflow.Annotations != nil && workflow.Annotations["bug-review-gist-url"] != "" {
						gistURL := workflow.Annotations["bug-review-gist-url"]
						log.Printf("Found bug-review Gist URL in annotations: %s", gistURL)
						if gistContent, err := github.GetGist(ctx, gistURL, githubToken); err == nil {
							resolutionPlan = gistContent
							log.Printf("Successfully fetched bug-review Gist content (%d bytes)", len(gistContent))
						} else {
							log.Printf("Warning: failed to fetch Gist content: %v", err)
						}
					}

					// Fallback: If no Gist found, try fetching GitHub comments (legacy behavior)
					if resolutionPlan == "" {
						// Parse issue URL to get owner, repo, number
						if owner, repo, issueNum, err := github.ParseGitHubIssueURL(workflow.GithubIssueURL); err == nil {
							// Check for "claude" label (indicates Claude has reviewed this issue)
							if labels, err := github.GetIssueLabels(ctx, owner, repo, issueNum, githubToken); err == nil {
								hasClaudeLabel := false
								for _, label := range labels {
									if strings.ToLower(label.Name) == "claude" {
										hasClaudeLabel = true
										break
									}
								}

								// If claude label exists, fetch ALL Claude comments from the issue
								if hasClaudeLabel {
									log.Printf("Found 'claude' label on issue #%d, fetching all Claude comments", issueNum)
									if comments, err := github.GetIssueComments(ctx, owner, repo, issueNum, githubToken); err == nil {
										// Collect ALL comments from claude-bot or any user with "claude" in username
										// This ensures we include both initial assessment AND implementation plan
										claudeComments := []string{}
										for _, comment := range comments {
											userLogin := strings.ToLower(comment.User.Login)
											if strings.Contains(userLogin, "claude") || comment.User.Type == "Bot" {
												claudeComments = append(claudeComments, comment.Body)
												log.Printf("Found Claude comment from user: %s", comment.User.Login)
											}
										}
										if len(claudeComments) > 0 {
											// Join all Claude comments with separators
											resolutionPlan = strings.Join(claudeComments, "\n\n---\n\n")
											log.Printf("Collected %d Claude comment(s) for context", len(claudeComments))
										}
									}
								}
							}
						}
					}
				}
			}

			// Build prompt with or without existing resolution plan
			basePrompt := fmt.Sprintf("Implement the fix for the bug described in %s. Make code changes, add tests, and prepare for review. Follow any guidelines in CLAUDE.md if present in the repository.", workflow.GithubIssueURL)

			if resolutionPlan != "" {
				prompt = fmt.Sprintf("%s\n\nRESOLUTION PLAN FROM BUG-REVIEW SESSION:\n\n%s\n\nImplement the fix following the strategy outlined in the resolution plan above.", basePrompt, resolutionPlan)
			} else {
				// No resolution plan found - Claude will analyze the issue and implement
				prompt = fmt.Sprintf("%s\n\nNote: No existing resolution plan was found. Please analyze the issue first to understand the root cause, then implement an appropriate fix.", basePrompt)
			}
		}
		// Add description to prompt if provided
		if description != "" {
			prompt = prompt + "\n\n" + description
		}
	}

	// Determine auto-push setting (default: true for bugfix sessions)
	autoPush := true
	if req.AutoPushOnComplete != nil {
		autoPush = *req.AutoPushOnComplete
	}

	// Determine LLM settings (use overrides if provided, otherwise defaults)
	model := "claude-sonnet-4-20250514"
	temperature := 0.7
	maxTokens := 4000

	if req.ResourceOverrides != nil {
		if req.ResourceOverrides.Model != nil {
			model = *req.ResourceOverrides.Model
		}
		if req.ResourceOverrides.Temperature != nil {
			temperature = *req.ResourceOverrides.Temperature
		}
		if req.ResourceOverrides.MaxTokens != nil {
			maxTokens = *req.ResourceOverrides.MaxTokens
		}
	}

	// Build AgenticSession spec (following CRD schema)
	// Note: project field is not in CRD - operator uses namespace to find ProjectSettings
	sessionSpec := map[string]interface{}{
		"prompt":             prompt, // REQUIRED field
		"displayName":        title,  // Use displayName instead of title
		"repos":              repos,
		"autoPushOnComplete": autoPush, // Auto-push changes to feature branch
		"llmSettings": map[string]interface{}{
			"model":       model,
			"temperature": temperature,
			"maxTokens":   maxTokens,
		},
	}

	// Add userContext from authenticated user (required for GitHub token minting)
	userID, _ := c.Get("userID")
	userIDStr, _ := userID.(string)
	if userIDStr != "" {
		sessionSpec["userContext"] = map[string]interface{}{
			"userId": strings.TrimSpace(userIDStr),
		}
	}

	// Add environment variables if any
	if len(envVars) > 0 {
		sessionSpec["environmentVariables"] = envVars
	}

	// Add interactive mode if requested (default is headless/false)
	if req.Interactive != nil && *req.Interactive {
		sessionSpec["interactive"] = true
	}

	// Add agent personas if provided
	if len(req.SelectedAgents) > 0 {
		if len(req.SelectedAgents) == 1 {
			sessionSpec["agentPersona"] = req.SelectedAgents[0]
		} else {
			// Multiple agents: use AGENT_PERSONAS env var
			envVars["AGENT_PERSONAS"] = joinStrings(req.SelectedAgents, ",")
			sessionSpec["environmentVariables"] = envVars
		}
	}

	// Add resource overrides if provided (infrastructure only - CPU, Memory, StorageClass, PriorityClass)
	// Note: Model/Temperature/MaxTokens/Timeout are handled separately in llmSettings and timeout fields
	if req.ResourceOverrides != nil {
		infraOverrides := make(map[string]interface{})
		if req.ResourceOverrides.CPU != "" {
			infraOverrides["cpu"] = req.ResourceOverrides.CPU
		}
		if req.ResourceOverrides.Memory != "" {
			infraOverrides["memory"] = req.ResourceOverrides.Memory
		}
		if req.ResourceOverrides.StorageClass != "" {
			infraOverrides["storageClass"] = req.ResourceOverrides.StorageClass
		}
		if req.ResourceOverrides.PriorityClass != "" {
			infraOverrides["priorityClass"] = req.ResourceOverrides.PriorityClass
		}
		if len(infraOverrides) > 0 {
			sessionSpec["resourceOverrides"] = infraOverrides
		}
	}

	// Build labels for linking to BugFix Workflow
	labels := map[string]string{
		"project":             project,
		"bugfix-workflow":     workflowID,
		"bugfix-session-type": req.SessionType,
		"bugfix-issue-number": fmt.Sprintf("%d", workflow.GithubIssueNumber),
	}

	// Create AgenticSession CR
	gvr := GetAgenticSessionResource()
	sessionObj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "vteam.ambient-code/v1alpha1",
			"kind":       "AgenticSession",
			"metadata": map[string]interface{}{
				"name":      sessionName,
				"namespace": project,
				"labels":    labels,
			},
			"spec": sessionSpec,
		},
	}

	created, err := reqDyn.Resource(gvr).Namespace(project).Create(context.TODO(), sessionObj, v1.CreateOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session", "details": err.Error()})
		return
	}

	// Provision runner token for session (creates Secret with K8s token for CR updates)
	// Use backend service account clients (not user clients) for this operation
	if err := handlers.ProvisionRunnerTokenForSession(c, handlers.K8sClient, handlers.DynamicClient, project, sessionName); err != nil {
		// Non-fatal: log and continue. Session will fail to start but can be debugged.
		log.Printf("Warning: failed to provision runner token for bugfix session %s/%s: %v", project, sessionName, err)
	}

	// Return created session info
	c.JSON(http.StatusCreated, gin.H{
		"id":          created.GetName(),
		"title":       title,
		"description": description,
		"sessionType": req.SessionType,
		"workflowID":  workflowID,
		"phase":       "Pending",
		"createdAt":   created.GetCreationTimestamp().Time.UTC().Format(time.RFC3339),
	})
}

// ListProjectBugFixWorkflowSessions handles GET /api/projects/:projectName/bugfix-workflows/:id/sessions
// Lists all sessions linked to a BugFix Workflow
func ListProjectBugFixWorkflowSessions(c *gin.Context) {
	project := c.Param("projectName")
	workflowID := c.Param("id")

	// Get K8s clients
	_, reqDyn := GetK8sClientsForRequest(c)
	if reqDyn == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing or invalid user token"})
		return
	}

	// Check workflow exists
	workflow, err := crd.GetProjectBugFixWorkflowCR(reqDyn, project, workflowID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get workflow", "details": err.Error()})
		return
	}
	if workflow == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Workflow not found"})
		return
	}

	// Query sessions by label selector
	gvr := GetAgenticSessionResource()
	selector := fmt.Sprintf("bugfix-workflow=%s,project=%s", workflowID, project)
	list, err := reqDyn.Resource(gvr).Namespace(project).List(c.Request.Context(), v1.ListOptions{LabelSelector: selector})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list sessions", "details": err.Error()})
		return
	}

	// Parse sessions
	sessions := make([]map[string]interface{}, 0, len(list.Items))
	for _, item := range list.Items {
		spec, _ := item.Object["spec"].(map[string]interface{})
		status, _ := item.Object["status"].(map[string]interface{})

		session := map[string]interface{}{
			"id":        item.GetName(),
			"title":     spec["displayName"], // Use displayName from CRD spec
			"createdAt": item.GetCreationTimestamp().Time.UTC().Format(time.RFC3339),
		}

		// Add session type from labels
		labels := item.GetLabels()
		if sessionType, ok := labels["bugfix-session-type"]; ok {
			session["sessionType"] = sessionType
		}

		// Add phase from status
		if phase, ok := status["phase"].(string); ok {
			session["phase"] = phase
		} else {
			session["phase"] = "Pending"
		}

		// Add completion time if available
		if completedAt, ok := status["completedAt"].(string); ok {
			session["completedAt"] = completedAt
		}

		sessions = append(sessions, session)
	}

	c.JSON(http.StatusOK, gin.H{"sessions": sessions})
}

// Helper function to join strings
func joinStrings(strs []string, sep string) string {
	result := ""
	for i, s := range strs {
		if i > 0 {
			result += sep
		}
		result += s
	}
	return result
}

// deriveRepoNameFromURL extracts the repository name from a Git URL
// Examples:
//
//	"https://github.com/owner/repo.git" -> "repo"
//	"https://github.com/owner/repo" -> "repo"
//	"git@github.com:owner/repo.git" -> "repo"
func deriveRepoNameFromURL(url string) string {
	// Remove trailing .git if present
	url = strings.TrimSuffix(url, ".git")

	// Extract the last path segment
	parts := strings.Split(url, "/")
	if len(parts) > 0 {
		name := parts[len(parts)-1]
		// For SSH URLs like "git@github.com:owner/repo", split on colon too
		if strings.Contains(name, ":") {
			colonParts := strings.Split(name, ":")
			if len(colonParts) > 0 {
				name = colonParts[len(colonParts)-1]
			}
		}
		return name
	}

	// Fallback to "repo" if extraction fails
	return "repo"
}
