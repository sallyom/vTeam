package bugfix

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"ambient-code-backend/bugfix"
	"ambient-code-backend/crd"
	"ambient-code-backend/github"
	"ambient-code-backend/websocket"

	"github.com/gin-gonic/gin"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"
)

// AgenticSessionWebhookEvent represents the webhook payload from K8s
type AgenticSessionWebhookEvent struct {
	Type   string                     `json:"type"`   // "ADDED", "MODIFIED", "DELETED"
	Object *unstructured.Unstructured `json:"object"` // The AgenticSession object
}

// HandleAgenticSessionWebhook processes webhook events for AgenticSession status changes
// This handler watches for BugFix session completions and performs appropriate actions
func HandleAgenticSessionWebhook(c *gin.Context) {
	var event AgenticSessionWebhookEvent
	if err := c.ShouldBindJSON(&event); err != nil {
		log.Printf("Failed to parse webhook event: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid webhook payload"})
		return
	}

	// Only process MODIFIED events (status changes)
	if event.Type != "MODIFIED" {
		c.JSON(http.StatusOK, gin.H{"status": "ignored", "reason": "not a modification"})
		return
	}

	// Extract session details
	labels := event.Object.GetLabels()
	workflowID := labels["bugfix-workflow"]
	sessionType := labels["bugfix-session-type"]
	project := labels["project"]

	// Process different session types
	switch sessionType {
	case "bug-review", "bug-resolution-plan", "bug-implement-fix":
		// Continue processing
	default:
		c.JSON(http.StatusOK, gin.H{"status": "ignored", "reason": fmt.Sprintf("session type %s not handled", sessionType)})
		return
	}

	// Check session status
	status, _ := event.Object.Object["status"].(map[string]interface{})
	phase, _ := status["phase"].(string)

	// Only process completed sessions
	if phase != "Completed" {
		c.JSON(http.StatusOK, gin.H{"status": "ignored", "reason": "session not completed"})
		return
	}

	// Route to appropriate handler based on session type
	switch sessionType {
	case "bug-review":
		handleBugReviewCompletion(c, event, workflowID, project)
	case "bug-resolution-plan":
		handleBugResolutionPlanCompletion(c, event, workflowID, project)
	case "bug-implement-fix":
		handleBugImplementFixCompletion(c, event, workflowID, project)
	default:
		c.JSON(http.StatusOK, gin.H{"status": "ignored", "reason": "unhandled session type"})
	}
}

// handleBugReviewCompletion processes completed bug-review sessions
func handleBugReviewCompletion(c *gin.Context, event AgenticSessionWebhookEvent, workflowID, project string) {
	// Get session output/findings
	status, _ := event.Object.Object["status"].(map[string]interface{})
	findings, _ := status["output"].(string)
	if findings == "" {
		// Try alternative field names
		findings, _ = status["findings"].(string)
		if findings == "" {
			findings, _ = status["result"].(string)
		}
	}

	if findings == "" {
		log.Printf("Bug-review session %s completed but no findings available", event.Object.GetName())
		c.JSON(http.StatusOK, gin.H{"status": "processed", "warning": "no findings to post"})
		return
	}

	// Get K8s client (using service account in production)
	_, reqDyn := GetK8sClientsForRequest(c)
	if reqDyn == nil {
		// In webhook context, use service account client
		reqDyn = GetServiceAccountDynamicClient()
	}

	// Get the BugFix Workflow to fetch GitHub details
	workflow, err := crd.GetProjectBugFixWorkflowCR(reqDyn, project, workflowID)
	if err != nil || workflow == nil {
		log.Printf("Failed to get BugFix Workflow %s: %v", workflowID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get workflow"})
		return
	}

	// Parse GitHub Issue URL
	owner, repo, issueNumber, err := github.ParseGitHubIssueURL(workflow.GithubIssueURL)
	if err != nil {
		log.Printf("Failed to parse GitHub Issue URL %s: %v", workflow.GithubIssueURL, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid GitHub Issue URL"})
		return
	}

	// Get GitHub token (from environment or secret)
	githubToken := GetGitHubToken()
	if githubToken == "" {
		log.Printf("GitHub token not configured")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "GitHub token not configured"})
		return
	}

	// Format the comment
	comment := formatBugReviewFindings(findings, event.Object.GetName())

	// Post comment to GitHub Issue
	ctx := context.Background()
	githubComment, err := github.AddComment(ctx, owner, repo, issueNumber, githubToken, comment)
	if err != nil {
		log.Printf("Failed to post comment to GitHub Issue: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to post GitHub comment", "details": err.Error()})
		return
	}

	// Broadcast success event
	websocket.BroadcastBugFixSessionCompleted(workflowID, event.Object.GetName(), "bug-review")

	// Update workflow with comment reference (optional)
	if workflow.Annotations == nil {
		workflow.Annotations = make(map[string]string)
	}
	workflow.Annotations["bug-review-comment-id"] = fmt.Sprintf("%d", githubComment.ID)
	workflow.Annotations["bug-review-comment-url"] = githubComment.URL

	// Update the workflow CR
	err = crd.UpsertProjectBugFixWorkflowCR(reqDyn, project, workflow)
	if err != nil {
		// Non-fatal: log but continue
		log.Printf("Failed to update workflow with comment reference: %v", err)
	}

	c.JSON(http.StatusOK, gin.H{
		"status":     "processed",
		"session":    event.Object.GetName(),
		"commentURL": githubComment.URL,
	})
}

// formatBugReviewFindings formats the session findings for GitHub comment
func formatBugReviewFindings(findings, sessionID string) string {
	var comment strings.Builder

	comment.WriteString("## 🔍 Bug Review Analysis\n\n")
	comment.WriteString("*Automated analysis from BugFix Workspace session: " + sessionID + "*\n\n")

	// Check if findings already have markdown formatting
	if strings.Contains(findings, "##") || strings.Contains(findings, "**") {
		// Findings already formatted, use as-is
		comment.WriteString(findings)
	} else {
		// Add basic formatting to plain text findings
		comment.WriteString("### Technical Analysis\n\n")
		comment.WriteString(findings)
	}

	comment.WriteString("\n\n---\n")
	comment.WriteString("*This analysis was generated automatically by the vTeam BugFix Workspace Bug-review session.*\n")

	return comment.String()
}

// handleBugResolutionPlanCompletion processes completed bug-resolution-plan sessions
// T064: Posts resolution plan to GitHub Issue
// T065: Updates workflow CR with bugfixMarkdownCreated=true
func handleBugResolutionPlanCompletion(c *gin.Context, event AgenticSessionWebhookEvent, workflowID, project string) {
	// Get session output (resolution plan)
	status, _ := event.Object.Object["status"].(map[string]interface{})
	resolutionPlan, _ := status["output"].(string)
	if resolutionPlan == "" {
		// Try alternative field names
		resolutionPlan, _ = status["result"].(string)
		if resolutionPlan == "" {
			resolutionPlan, _ = status["plan"].(string)
		}
	}

	if resolutionPlan == "" {
		log.Printf("Bug-resolution-plan session %s completed but no plan available", event.Object.GetName())
		c.JSON(http.StatusOK, gin.H{"status": "processed", "warning": "no resolution plan to post"})
		return
	}

	// Get K8s client
	_, reqDyn := GetK8sClientsForRequest(c)
	if reqDyn == nil {
		reqDyn = GetServiceAccountDynamicClient()
	}

	// Get the BugFix Workflow
	workflow, err := crd.GetProjectBugFixWorkflowCR(reqDyn, project, workflowID)
	if err != nil || workflow == nil {
		log.Printf("Failed to get BugFix Workflow %s: %v", workflowID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get workflow"})
		return
	}

	// Parse GitHub Issue URL
	owner, repo, issueNumber, err := github.ParseGitHubIssueURL(workflow.GithubIssueURL)
	if err != nil {
		log.Printf("Failed to parse GitHub Issue URL %s: %v", workflow.GithubIssueURL, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid GitHub Issue URL"})
		return
	}

	// Get GitHub token
	githubToken := GetGitHubToken()
	if githubToken == "" {
		log.Printf("GitHub token not configured")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "GitHub token not configured"})
		return
	}

	// Get user info for Git operations (from annotations or default)
	userEmail := workflow.Annotations["user-email"]
	if userEmail == "" {
		userEmail = "bugfix-bot@vteam.io" // Default email
	}
	userName := workflow.Annotations["user-name"]
	if userName == "" {
		userName = "BugFix Bot" // Default name
	}

	// Create/update bugfix.md file (T062/T063 already implemented)
	ctx := context.Background()
	err = bugfix.CreateOrUpdateBugfixMarkdown(
		ctx,
		workflow.SpecRepoURL,
		workflow.GithubIssueNumber,
		workflow.BranchName,
		githubToken,
		userEmail,
		userName,
		workflow.GithubIssueURL,
		workflow.JiraTaskURL,
		"Resolution Plan",
		resolutionPlan,
	)
	if err != nil {
		log.Printf("Failed to create/update bugfix.md: %v", err)
		// Continue anyway - we still want to post to GitHub
	}

	// T064: Format and post resolution plan comment to GitHub Issue
	comment := formatResolutionPlanComment(resolutionPlan, event.Object.GetName(), workflow.BugFolderCreated)

	githubComment, err := github.AddComment(ctx, owner, repo, issueNumber, githubToken, comment)
	if err != nil {
		log.Printf("Failed to post resolution plan to GitHub Issue: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to post GitHub comment", "details": err.Error()})
		return
	}

	// T065: Update workflow CR
	workflow.BugfixMarkdownCreated = true
	if workflow.Annotations == nil {
		workflow.Annotations = make(map[string]string)
	}
	workflow.Annotations["resolution-plan-comment-id"] = fmt.Sprintf("%d", githubComment.ID)
	workflow.Annotations["resolution-plan-comment-url"] = githubComment.URL

	// Update the workflow CR
	err = crd.UpsertProjectBugFixWorkflowCR(reqDyn, project, workflow)
	if err != nil {
		// Non-fatal: log but continue
		log.Printf("Failed to update workflow with resolution plan status: %v", err)
	}

	// Broadcast success event
	websocket.BroadcastBugFixSessionCompleted(workflowID, event.Object.GetName(), "bug-resolution-plan")

	c.JSON(http.StatusOK, gin.H{
		"status":               "processed",
		"session":              event.Object.GetName(),
		"commentURL":           githubComment.URL,
		"bugfixMarkdownCreated": workflow.BugfixMarkdownCreated,
	})
}

// formatResolutionPlanComment formats the resolution plan for GitHub comment
func formatResolutionPlanComment(plan, sessionID string, bugFolderCreated bool) string {
	var comment strings.Builder

	comment.WriteString("## 📋 Bug Resolution Plan\n\n")
	comment.WriteString("*Generated by BugFix Workspace session: " + sessionID + "*\n\n")

	// Check if plan already has markdown formatting
	if strings.Contains(plan, "##") || strings.Contains(plan, "**") {
		// Plan already formatted, use as-is
		comment.WriteString(plan)
	} else {
		// Add basic formatting to plain text plan
		comment.WriteString("### Proposed Resolution\n\n")
		comment.WriteString(plan)
	}

	// Add note about bugfix.md file if created
	if bugFolderCreated {
		comment.WriteString("\n\n### Documentation\n")
		comment.WriteString("The detailed resolution plan has been documented in the `bugfix.md` file in the spec repository.\n")
	}

	comment.WriteString("\n\n---\n")
	comment.WriteString("*This resolution plan was generated automatically by the vTeam BugFix Workspace Bug-resolution-plan session.*\n")

	return comment.String()
}

// handleBugImplementFixCompletion processes completed bug-implement-fix sessions
// T072: Updates bugfix.md with implementation details
func handleBugImplementFixCompletion(c *gin.Context, event AgenticSessionWebhookEvent, workflowID, project string) {
	// Get session output (implementation summary)
	status, _ := event.Object.Object["status"].(map[string]interface{})
	implementationSummary, _ := status["output"].(string)
	if implementationSummary == "" {
		// Try alternative field names
		implementationSummary, _ = status["result"].(string)
		if implementationSummary == "" {
			implementationSummary, _ = status["summary"].(string)
		}
	}

	if implementationSummary == "" {
		log.Printf("Bug-implement-fix session %s completed but no implementation summary available", event.Object.GetName())
		c.JSON(http.StatusOK, gin.H{"status": "processed", "warning": "no implementation details to update"})
		return
	}

	// Get K8s client
	_, reqDyn := GetK8sClientsForRequest(c)
	if reqDyn == nil {
		reqDyn = GetServiceAccountDynamicClient()
	}

	// Get the BugFix Workflow
	workflow, err := crd.GetProjectBugFixWorkflowCR(reqDyn, project, workflowID)
	if err != nil || workflow == nil {
		log.Printf("Failed to get BugFix Workflow %s: %v", workflowID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get workflow"})
		return
	}

	// Parse GitHub Issue URL
	owner, repo, issueNumber, err := github.ParseGitHubIssueURL(workflow.GithubIssueURL)
	if err != nil {
		log.Printf("Failed to parse GitHub Issue URL %s: %v", workflow.GithubIssueURL, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid GitHub Issue URL"})
		return
	}

	// Get GitHub token
	githubToken := GetGitHubToken()
	if githubToken == "" {
		log.Printf("GitHub token not configured")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "GitHub token not configured"})
		return
	}

	// Get user info for Git operations
	userEmail := workflow.Annotations["user-email"]
	if userEmail == "" {
		userEmail = "bugfix-bot@vteam.io"
	}
	userName := workflow.Annotations["user-name"]
	if userName == "" {
		userName = "BugFix Bot"
	}

	// T072: Update bugfix.md file with implementation details
	ctx := context.Background()
	err = bugfix.CreateOrUpdateBugfixMarkdown(
		ctx,
		workflow.SpecRepoURL,
		workflow.GithubIssueNumber,
		workflow.BranchName,
		githubToken,
		userEmail,
		userName,
		workflow.GithubIssueURL,
		workflow.JiraTaskURL,
		"Implementation Details",
		implementationSummary,
	)
	if err != nil {
		log.Printf("Failed to update bugfix.md with implementation details: %v", err)
		// Continue anyway - we still want to post to GitHub
	}

	// Format and post implementation summary comment to GitHub Issue
	comment := formatImplementationComment(implementationSummary, event.Object.GetName(), workflow.BranchName)

	githubComment, err := github.AddComment(ctx, owner, repo, issueNumber, githubToken, comment)
	if err != nil {
		log.Printf("Failed to post implementation summary to GitHub Issue: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to post GitHub comment", "details": err.Error()})
		return
	}

	// Update workflow CR
	workflow.ImplementationCompleted = true
	if workflow.Annotations == nil {
		workflow.Annotations = make(map[string]string)
	}
	workflow.Annotations["implementation-comment-id"] = fmt.Sprintf("%d", githubComment.ID)
	workflow.Annotations["implementation-comment-url"] = githubComment.URL

	// Update the workflow CR
	err = crd.UpsertProjectBugFixWorkflowCR(reqDyn, project, workflow)
	if err != nil {
		// Non-fatal: log but continue
		log.Printf("Failed to update workflow with implementation status: %v", err)
	}

	// Broadcast success event
	websocket.BroadcastBugFixSessionCompleted(workflowID, event.Object.GetName(), "bug-implement-fix")

	c.JSON(http.StatusOK, gin.H{
		"status":                  "processed",
		"session":                 event.Object.GetName(),
		"commentURL":              githubComment.URL,
		"implementationCompleted": workflow.ImplementationCompleted,
		"branchName":              workflow.BranchName,
	})
}

// formatImplementationComment formats the implementation summary for GitHub comment
func formatImplementationComment(summary, sessionID, branchName string) string {
	var comment strings.Builder

	comment.WriteString("## 🔧 Implementation Complete\n\n")
	comment.WriteString("*Generated by BugFix Workspace session: " + sessionID + "*\n\n")

	// Check if summary already has markdown formatting
	if strings.Contains(summary, "##") || strings.Contains(summary, "**") {
		// Summary already formatted, use as-is
		comment.WriteString(summary)
	} else {
		// Add basic formatting to plain text summary
		comment.WriteString("### Implementation Summary\n\n")
		comment.WriteString(summary)
	}

	comment.WriteString("\n\n### Branch Information\n")
	comment.WriteString(fmt.Sprintf("The fix has been implemented in branch: `%s`\n", branchName))
	comment.WriteString("\n")
	comment.WriteString("To review the changes:\n")
	comment.WriteString(fmt.Sprintf("```bash\ngit checkout %s\n```\n", branchName))

	comment.WriteString("\n\n---\n")
	comment.WriteString("*This implementation was completed automatically by the vTeam BugFix Workspace Bug-implement-fix session.*\n")

	return comment.String()
}

// WatchAgenticSessions sets up a watch for AgenticSession changes
// This is an alternative to webhooks using client-side watching
func WatchAgenticSessions(project string) error {
	client := GetServiceAccountDynamicClient()
	if client == nil {
		return fmt.Errorf("failed to get service account client")
	}

	gvr := GetAgenticSessionResource()

	// List sessions with bugfix labels
	labelSelector := fmt.Sprintf("project=%s,bugfix-workflow", project)
	watcher, err := client.Resource(gvr).Namespace(project).Watch(context.Background(), v1.ListOptions{
		LabelSelector: labelSelector,
	})
	if err != nil {
		return fmt.Errorf("failed to create watcher: %v", err)
	}

	// Process events in goroutine
	go func() {
		defer watcher.Stop()

		for event := range watcher.ResultChan() {
			obj, ok := event.Object.(*unstructured.Unstructured)
			if !ok {
				continue
			}

			// Process different session types that completed
			labels := obj.GetLabels()
			sessionType := labels["bugfix-session-type"]

			status, _ := obj.Object["status"].(map[string]interface{})
			phase, _ := status["phase"].(string)

			if phase == "Completed" {
				// Process the completion based on session type
				switch sessionType {
				case "bug-review", "bug-resolution-plan", "bug-implement-fix":
					processSessionCompletion(obj, sessionType)
				}
			}
		}
	}()

	return nil
}

// processSessionCompletion handles posting findings to GitHub based on session type
func processSessionCompletion(session *unstructured.Unstructured, sessionType string) {
	labels := session.GetLabels()
	workflowID := labels["bugfix-workflow"]
	project := labels["project"]

	// Get session output
	status, _ := session.Object["status"].(map[string]interface{})
	output, _ := status["output"].(string)
	if output == "" {
		// Try alternative field names
		output, _ = status["findings"].(string)
		if output == "" {
			output, _ = status["result"].(string)
		}
	}

	if output == "" {
		log.Printf("%s session %s completed but no output available", sessionType, session.GetName())
		return
	}

	// Get workflow details
	client := GetServiceAccountDynamicClient()
	workflow, err := crd.GetProjectBugFixWorkflowCR(client, project, workflowID)
	if err != nil || workflow == nil {
		log.Printf("Failed to get BugFix Workflow %s: %v", workflowID, err)
		return
	}

	// Parse GitHub URL
	owner, repo, issueNumber, err := github.ParseGitHubIssueURL(workflow.GithubIssueURL)
	if err != nil {
		log.Printf("Failed to parse GitHub Issue URL: %v", err)
		return
	}

	githubToken := GetGitHubToken()
	if githubToken == "" {
		log.Printf("GitHub token not configured")
		return
	}

	ctx := context.Background()

	// Route based on session type
	switch sessionType {
	case "bug-review":
		// Format and post bug review findings
		comment := formatBugReviewFindings(output, session.GetName())
		_, err = github.AddComment(ctx, owner, repo, issueNumber, githubToken, comment)
		if err != nil {
			log.Printf("Failed to post bug review comment to GitHub Issue: %v", err)
			return
		}
		log.Printf("Successfully posted Bug-review findings to GitHub Issue #%d", issueNumber)

	case "bug-resolution-plan":
		// Get user info for Git operations
		userEmail := workflow.Annotations["user-email"]
		if userEmail == "" {
			userEmail = "bugfix-bot@vteam.io"
		}
		userName := workflow.Annotations["user-name"]
		if userName == "" {
			userName = "BugFix Bot"
		}

		// Create/update bugfix.md file
		err = bugfix.CreateOrUpdateBugfixMarkdown(
			ctx,
			workflow.SpecRepoURL,
			workflow.GithubIssueNumber,
			workflow.BranchName,
			githubToken,
			userEmail,
			userName,
			workflow.GithubIssueURL,
			workflow.JiraTaskURL,
			"Resolution Plan",
			output,
		)
		if err != nil {
			log.Printf("Failed to create/update bugfix.md: %v", err)
		}

		// Post resolution plan comment
		comment := formatResolutionPlanComment(output, session.GetName(), workflow.BugFolderCreated)
		_, err = github.AddComment(ctx, owner, repo, issueNumber, githubToken, comment)
		if err != nil {
			log.Printf("Failed to post resolution plan to GitHub Issue: %v", err)
			return
		}

		// Update workflow CR
		workflow.BugfixMarkdownCreated = true
		err = crd.UpsertProjectBugFixWorkflowCR(client, project, workflow)
		if err != nil {
			log.Printf("Failed to update workflow with bugfixMarkdownCreated: %v", err)
		}

		log.Printf("Successfully posted resolution plan to GitHub Issue #%d", issueNumber)

	case "bug-implement-fix":
		// Get user info for Git operations
		userEmail := workflow.Annotations["user-email"]
		if userEmail == "" {
			userEmail = "bugfix-bot@vteam.io"
		}
		userName := workflow.Annotations["user-name"]
		if userName == "" {
			userName = "BugFix Bot"
		}

		// Update bugfix.md file with implementation details
		err = bugfix.CreateOrUpdateBugfixMarkdown(
			ctx,
			workflow.SpecRepoURL,
			workflow.GithubIssueNumber,
			workflow.BranchName,
			githubToken,
			userEmail,
			userName,
			workflow.GithubIssueURL,
			workflow.JiraTaskURL,
			"Implementation Details",
			output,
		)
		if err != nil {
			log.Printf("Failed to update bugfix.md: %v", err)
		}

		// Post implementation summary comment
		comment := formatImplementationComment(output, session.GetName(), workflow.BranchName)
		_, err = github.AddComment(ctx, owner, repo, issueNumber, githubToken, comment)
		if err != nil {
			log.Printf("Failed to post implementation summary to GitHub Issue: %v", err)
			return
		}

		// Update workflow CR
		workflow.ImplementationCompleted = true
		err = crd.UpsertProjectBugFixWorkflowCR(client, project, workflow)
		if err != nil {
			log.Printf("Failed to update workflow with implementationCompleted: %v", err)
		}

		log.Printf("Successfully posted implementation summary to GitHub Issue #%d", issueNumber)
	}

	// Broadcast completion
	websocket.BroadcastBugFixSessionCompleted(workflowID, session.GetName(), sessionType)
}

// GetGitHubToken retrieves the GitHub token from environment or K8s secret
// This is a placeholder - implement based on your token management strategy
func GetGitHubToken() string {
	// In production, this would retrieve from K8s secret or environment
	// For now, return from environment variable
	return os.Getenv("GITHUB_TOKEN")
}

// GetServiceAccountDynamicClient returns a K8s client using service account
// This is a placeholder - implement based on your K8s client configuration
func GetServiceAccountDynamicClient() dynamic.Interface {
	// This would be initialized during app startup with in-cluster config
	// For webhook handlers that don't have user context
	return nil // Placeholder
}