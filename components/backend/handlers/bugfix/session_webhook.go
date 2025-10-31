package bugfix

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

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
// This handler watches for Bug-review session completions and posts findings to GitHub
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

	// Only process bug-review sessions
	if sessionType != "bug-review" {
		c.JSON(http.StatusOK, gin.H{"status": "ignored", "reason": "not a bug-review session"})
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

	// Get session output/findings
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

			// Only process bug-review sessions that completed
			labels := obj.GetLabels()
			sessionType := labels["bugfix-session-type"]
			if sessionType != "bug-review" {
				continue
			}

			status, _ := obj.Object["status"].(map[string]interface{})
			phase, _ := status["phase"].(string)

			if phase == "Completed" {
				// Process the completion
				processSessionCompletion(obj)
			}
		}
	}()

	return nil
}

// processSessionCompletion handles posting findings to GitHub
func processSessionCompletion(session *unstructured.Unstructured) {
	labels := session.GetLabels()
	workflowID := labels["bugfix-workflow"]
	project := labels["project"]

	// Extract findings from session
	status, _ := session.Object["status"].(map[string]interface{})
	findings, _ := status["output"].(string)
	if findings == "" {
		findings, _ = status["findings"].(string)
		if findings == "" {
			findings, _ = status["result"].(string)
		}
	}

	if findings == "" {
		log.Printf("Bug-review session %s completed but no findings available", session.GetName())
		return
	}

	// Get workflow details
	client := GetServiceAccountDynamicClient()
	workflow, err := crd.GetProjectBugFixWorkflowCR(client, project, workflowID)
	if err != nil || workflow == nil {
		log.Printf("Failed to get BugFix Workflow %s: %v", workflowID, err)
		return
	}

	// Parse GitHub URL and post comment
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

	comment := formatBugReviewFindings(findings, session.GetName())
	ctx := context.Background()

	_, err = github.AddComment(ctx, owner, repo, issueNumber, githubToken, comment)
	if err != nil {
		log.Printf("Failed to post comment to GitHub Issue: %v", err)
		return
	}

	log.Printf("Successfully posted Bug-review findings to GitHub Issue #%d", issueNumber)

	// Broadcast completion
	websocket.BroadcastBugFixSessionCompleted(workflowID, session.GetName(), "bug-review")
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