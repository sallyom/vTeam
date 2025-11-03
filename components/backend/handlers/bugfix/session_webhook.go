package bugfix

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"

	"ambient-code-backend/crd"
	"ambient-code-backend/git"
	"ambient-code-backend/github"
	"ambient-code-backend/websocket"

	"github.com/gin-gonic/gin"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
)

// AgenticSessionWebhookEvent represents the webhook payload from K8s
type AgenticSessionWebhookEvent struct {
	Type   string                     `json:"type"`   // "ADDED", "MODIFIED", "DELETED"
	Object *unstructured.Unstructured `json:"object"` // The AgenticSession object
}

// HandleAgenticSessionWebhook processes webhook events for AgenticSession status changes
// This handler watches for BugFix session completions and performs appropriate actions
func HandleAgenticSessionWebhook(c *gin.Context) {
	log.Printf("=== BugFix Webhook Called ===")

	var event AgenticSessionWebhookEvent
	if err := c.ShouldBindJSON(&event); err != nil {
		log.Printf("ERROR: Failed to parse webhook event: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid webhook payload"})
		return
	}

	log.Printf("Webhook event type: %s, object: %s", event.Type, event.Object.GetName())

	// Only process MODIFIED events (status changes)
	if event.Type != "MODIFIED" {
		log.Printf("Ignoring event type: %s", event.Type)
		c.JSON(http.StatusOK, gin.H{"status": "ignored", "reason": "not a modification"})
		return
	}

	// Extract session details
	labels := event.Object.GetLabels()
	workflowID := labels["bugfix-workflow"]
	sessionType := labels["bugfix-session-type"]
	project := labels["project"]

	log.Printf("Processing bugfix session: workflow=%s, type=%s, project=%s, session=%s", workflowID, sessionType, project, event.Object.GetName())

	// Process different session types (now only 2 types: bug-review and bug-implement-fix)
	switch sessionType {
	case "bug-review", "bug-implement-fix":
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
	case "bug-implement-fix":
		handleBugImplementFixCompletion(c, event, workflowID, project)
	default:
		c.JSON(http.StatusOK, gin.H{"status": "ignored", "reason": "unhandled session type"})
	}
}

// handleBugReviewCompletion processes completed bug-review sessions
func handleBugReviewCompletion(c *gin.Context, event AgenticSessionWebhookEvent, workflowID, project string) {
	sessionName := event.Object.GetName()
	log.Printf("handleBugReviewCompletion: session=%s, workflow=%s, project=%s", sessionName, workflowID, project)

	// Get K8s clients (try user token first, fall back to service account)
	_, reqDyn := GetK8sClientsForRequest(c)
	if reqDyn == nil {
		// In webhook context, use service account clients
		log.Printf("No user token, using service account client")
		reqDyn = GetServiceAccountDynamicClient()
	}

	if reqDyn == nil {
		log.Printf("ERROR: No dynamic client available (service account client is nil)")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "K8s client not initialized"})
		return
	}

	// Get the BugFix Workflow to fetch GitHub details
	log.Printf("Fetching BugFixWorkflow CR: project=%s, id=%s", project, workflowID)
	workflow, err := crd.GetProjectBugFixWorkflowCR(reqDyn, project, workflowID)
	if err != nil || workflow == nil {
		log.Printf("ERROR: Failed to get BugFix Workflow %s in project %s: %v", workflowID, project, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get workflow"})
		return
	}
	log.Printf("Successfully fetched BugFixWorkflow: %s", workflowID)

	// Get session output from status.result field
	status, _ := event.Object.Object["status"].(map[string]interface{})
	findings, _ := status["result"].(string)
	log.Printf("Session status.result length: %d bytes", len(findings))

	if findings == "" {
		// Session completed but didn't produce output (likely confirmed existing assessment)
		log.Printf("Bug-review session %s completed with no new findings - existing assessment confirmed", sessionName)

		// Update workflow status to mark assessment as complete
		workflow.AssessmentStatus = "complete"
		if err := crd.UpdateBugFixWorkflowStatus(reqDyn, workflow); err != nil {
			log.Printf("Failed to update workflow assessment status: %v", err)
		}

		c.JSON(http.StatusOK, gin.H{"status": "processed", "message": "existing assessment confirmed"})
		return
	}

	// Parse GitHub Issue URL
	log.Printf("Parsing GitHub Issue URL: %s", workflow.GithubIssueURL)
	owner, repo, issueNumber, err := github.ParseGitHubIssueURL(workflow.GithubIssueURL)
	if err != nil {
		log.Printf("ERROR: Failed to parse GitHub Issue URL %s: %v", workflow.GithubIssueURL, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid GitHub Issue URL"})
		return
	}
	log.Printf("Parsed issue: owner=%s, repo=%s, issue=%d", owner, repo, issueNumber)

	// Get GitHub token from K8s secret (webhook uses service account, no user context)
	ctx := context.Background()
	githubToken, err := git.GetGitHubToken(ctx, K8sClient, DynamicClient, project, "")
	if err != nil || githubToken == "" {
		log.Printf("ERROR: Failed to get GitHub token: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "GitHub token not configured"})
		return
	}
	log.Printf("GitHub token obtained (length: %d)", len(githubToken))

	// Create a Gist with the full detailed analysis
	gistFilename := fmt.Sprintf("bug-review-issue-%d.md", issueNumber)
	gistDescription := fmt.Sprintf("Bug Review & Assessment for Issue #%d", issueNumber)
	log.Printf("Creating Gist with detailed analysis (%d bytes)", len(findings))
	gist, err := github.CreateGist(ctx, githubToken, gistDescription, gistFilename, findings, true)
	if err != nil {
		log.Printf("ERROR: Failed to create Gist: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create Gist", "details": err.Error()})
		return
	}
	log.Printf("Successfully created Gist: %s", gist.URL)

	// Format a short summary comment with link to Gist
	comment := formatBugReviewSummary(gist.URL, event.Object.GetName())
	log.Printf("Formatted summary comment (length: %d bytes)", len(comment))

	// Post short summary comment to GitHub Issue
	log.Printf("Posting summary comment to GitHub Issue #%d", issueNumber)
	githubComment, err := github.AddComment(ctx, owner, repo, issueNumber, githubToken, comment)
	if err != nil {
		log.Printf("ERROR: Failed to post comment to GitHub Issue: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to post GitHub comment", "details": err.Error()})
		return
	}
	log.Printf("Successfully posted summary comment to GitHub Issue (comment ID: %d)", githubComment.ID)

	// Add 'claude' label to the issue to mark that Claude has assessed it
	// This enables the pattern: future bug-review sessions will detect this and reuse the assessment
	labels, err := github.GetIssueLabels(ctx, owner, repo, issueNumber, githubToken)
	if err != nil {
		log.Printf("Warning: failed to get issue labels: %v", err)
	} else {
		// Check if 'claude' label already exists
		hasClaudeLabel := false
		labelNames := make([]string, 0, len(labels)+1)
		for _, label := range labels {
			labelNames = append(labelNames, label.Name)
			if strings.ToLower(label.Name) == "claude" {
				hasClaudeLabel = true
			}
		}

		// Add 'claude' label if it doesn't exist
		if !hasClaudeLabel {
			labelNames = append(labelNames, "claude")
			updateReq := &github.UpdateIssueRequest{
				Labels: labelNames, // Include all existing labels + new 'claude' label
			}
			_, err = github.UpdateIssue(ctx, owner, repo, issueNumber, githubToken, updateReq)
			if err != nil {
				log.Printf("Warning: failed to add 'claude' label to issue: %v", err)
			} else {
				log.Printf("Added 'claude' label to GitHub Issue #%d", issueNumber)
			}
		}
	}

	// Broadcast success event
	websocket.BroadcastBugFixSessionCompleted(workflowID, event.Object.GetName(), "bug-review")

	// Update workflow with comment reference, Gist URL, and assessment status
	if workflow.Annotations == nil {
		workflow.Annotations = make(map[string]string)
	}
	workflow.Annotations["bug-review-comment-id"] = fmt.Sprintf("%d", githubComment.ID)
	workflow.Annotations["bug-review-comment-url"] = githubComment.URL
	workflow.Annotations["bug-review-gist-url"] = gist.URL
	workflow.AssessmentStatus = "complete"

	// Update the workflow CR
	err = crd.UpsertProjectBugFixWorkflowCR(reqDyn, workflow)
	if err != nil {
		// Non-fatal: log but continue
		log.Printf("Failed to update workflow with comment reference: %v", err)
	}

	// Also update status subresource
	if err := crd.UpdateBugFixWorkflowStatus(reqDyn, workflow); err != nil {
		log.Printf("Failed to update workflow assessment status: %v", err)
	}

	c.JSON(http.StatusOK, gin.H{
		"status":     "processed",
		"session":    event.Object.GetName(),
		"commentURL": githubComment.URL,
	})
}

// formatBugReviewSummary creates a short summary comment with link to detailed Gist
func formatBugReviewSummary(gistURL, sessionID string) string {
	var comment strings.Builder

	comment.WriteString("## 🔍 Bug Review & Assessment Complete\n\n")
	comment.WriteString(fmt.Sprintf("📄 **[View Full Analysis](%s)** (detailed assessment and implementation plan)\n\n", gistURL))
	comment.WriteString(fmt.Sprintf("*Session: `%s`*\n\n", sessionID))
	comment.WriteString("---\n")
	comment.WriteString("*Generated by vTeam BugFix Workspace*\n")

	return comment.String()
}

// handleBugImplementFixCompletion processes completed bug-implement-fix sessions
func handleBugImplementFixCompletion(c *gin.Context, event AgenticSessionWebhookEvent, workflowID, project string) {
	sessionName := event.Object.GetName()

	// Get session output from status.result
	status, _ := event.Object.Object["status"].(map[string]interface{})
	implementationSummary, _ := status["result"].(string)

	if implementationSummary == "" {
		log.Printf("Bug-implement-fix session %s completed but no implementation summary in status.result", sessionName)
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

	// Get GitHub token from K8s secret (webhook uses service account, no user context)
	ctx := context.Background()
	githubToken, err := git.GetGitHubToken(ctx, K8sClient, DynamicClient, project, "")
	if err != nil || githubToken == "" {
		log.Printf("ERROR: Failed to get GitHub token: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "GitHub token not configured"})
		return
	}

	// Check for existing PR first (regardless of autoCreatePR setting)
	// This ensures we can include PR link in the comment
	var existingPR *github.GitHubPullRequest
	var prCreatedBy string

	// First check workflow annotations for PR info
	var prURL *string
	if workflow.Annotations != nil && workflow.Annotations["github-pr-url"] != "" {
		prURLValue := workflow.Annotations["github-pr-url"]
		prURL = &prURLValue
		log.Printf("Found PR URL in workflow annotations: %s", prURLValue)
	} else {
		// Query GitHub for existing PRs linked to this issue
		prs, err := github.GetIssuePullRequests(ctx, owner, repo, issueNumber, githubToken)
		if err != nil {
			log.Printf("Warning: failed to check for existing PRs: %v", err)
		} else {
			// Look for open PR from our branch
			for i := range prs {
				pr := &prs[i]
				if pr.State == "open" && pr.Head.Ref == workflow.BranchName {
					existingPR = pr
					prURL = &pr.URL
					// Check if PR was created by vTeam (check annotations)
					if workflow.Annotations != nil && workflow.Annotations["github-pr-number"] == fmt.Sprintf("%d", pr.Number) {
						prCreatedBy = "vteam"
					} else {
						prCreatedBy = "external" // Created by GitHub Action or manually
					}
					log.Printf("Found existing PR #%d from branch %s", pr.Number, workflow.BranchName)
					break
				}
			}
		}
	}

	// Create a Gist with the full implementation details
	gistFilename := fmt.Sprintf("implementation-issue-%d.md", issueNumber)
	gistDescription := fmt.Sprintf("Implementation Details for Issue #%d", issueNumber)
	log.Printf("Creating Gist with implementation details (%d bytes)", len(implementationSummary))
	gist, err := github.CreateGist(ctx, githubToken, gistDescription, gistFilename, implementationSummary, true)
	if err != nil {
		log.Printf("ERROR: Failed to create Gist: %v", err)
		// Non-fatal: continue with inline comment fallback
		comment := formatImplementationComment(implementationSummary, sessionName, workflow.BranchName, workflow.ImplementationRepo.URL, prURL)
		githubComment, err := github.AddComment(ctx, owner, repo, issueNumber, githubToken, comment)
		if err != nil {
			log.Printf("Failed to post implementation summary to GitHub Issue: %v", err)
		} else {
			log.Printf("Posted implementation summary to GitHub Issue #%d (comment ID: %d)", issueNumber, githubComment.ID)
			if workflow.Annotations == nil {
				workflow.Annotations = make(map[string]string)
			}
			workflow.Annotations["implementation-comment-id"] = fmt.Sprintf("%d", githubComment.ID)
			workflow.Annotations["implementation-comment-url"] = githubComment.URL
		}
	} else {
		log.Printf("Successfully created implementation Gist: %s", gist.URL)

		// Format short summary comment with link to Gist and PR info
		comment := formatImplementationSummary(gist.URL, sessionName, workflow.BranchName, workflow.ImplementationRepo.URL, prURL)

		// Post short summary comment to GitHub Issue
		log.Printf("Posting implementation summary to GitHub Issue #%d", issueNumber)
		githubComment, err := github.AddComment(ctx, owner, repo, issueNumber, githubToken, comment)
		if err != nil {
			log.Printf("Failed to post implementation summary to GitHub Issue: %v", err)
		} else {
			log.Printf("Posted implementation summary to GitHub Issue #%d (comment ID: %d)", issueNumber, githubComment.ID)
			if workflow.Annotations == nil {
				workflow.Annotations = make(map[string]string)
			}
			workflow.Annotations["implementation-comment-id"] = fmt.Sprintf("%d", githubComment.ID)
			workflow.Annotations["implementation-comment-url"] = githubComment.URL
			workflow.Annotations["implementation-gist-url"] = gist.URL
		}
	}

	// If PR exists, track it in annotations for reference
	if existingPR != nil {
		if workflow.Annotations == nil {
			workflow.Annotations = make(map[string]string)
		}
		if workflow.Annotations["github-pr-number"] == "" {
			workflow.Annotations["github-pr-number"] = fmt.Sprintf("%d", existingPR.Number)
			workflow.Annotations["github-pr-url"] = existingPR.URL
			workflow.Annotations["github-pr-state"] = existingPR.State
			workflow.Annotations["pr-created-by"] = prCreatedBy
			log.Printf("Tracked existing PR #%d in workflow annotations", existingPR.Number)
		}
	}

	// Save workflow annotations
	err = crd.UpsertProjectBugFixWorkflowCR(reqDyn, workflow)
	if err != nil {
		// Non-fatal: log but continue
		log.Printf("Failed to update workflow annotations: %v", err)
	}

	// Update status subresource
	workflow.ImplementationCompleted = true
	err = crd.UpdateBugFixWorkflowStatus(reqDyn, workflow)
	if err != nil {
		// Non-fatal: log but continue
		log.Printf("Failed to update workflow status (implementationCompleted): %v", err)
	}

	// Broadcast success event
	websocket.BroadcastBugFixSessionCompleted(workflowID, event.Object.GetName(), "bug-implement-fix")

	response := gin.H{
		"status":                  "processed",
		"session":                 event.Object.GetName(),
		"implementationCompleted": workflow.ImplementationCompleted,
		"branchName":              workflow.BranchName,
	}

	// Add PR info to response
	if workflow.Annotations != nil {
		if prNumber := workflow.Annotations["github-pr-number"]; prNumber != "" {
			response["prNumber"] = prNumber
			response["prURL"] = workflow.Annotations["github-pr-url"]
			response["prCreatedBy"] = workflow.Annotations["pr-created-by"]
		}
		if commentURL := workflow.Annotations["implementation-comment-url"]; commentURL != "" {
			response["commentURL"] = commentURL
		}
	}

	c.JSON(http.StatusOK, response)
}

// formatImplementationSummary creates a short summary comment with link to detailed Gist
func formatImplementationSummary(gistURL, sessionID, branchName, repoURL string, prURL *string) string {
	var comment strings.Builder

	comment.WriteString("## 🔧 Implementation Complete\n\n")
	comment.WriteString(fmt.Sprintf("📄 **[View Implementation Details](%s)** (full summary and code changes)\n\n", gistURL))

	comment.WriteString("### 📋 Next Steps\n\n")

	// If PR already exists, link to it
	if prURL != nil && *prURL != "" {
		comment.WriteString(fmt.Sprintf("✅ **Pull Request exists**: [View PR](%s)\n\n", *prURL))
	} else {
		// No PR exists - guide user to create one
		comment.WriteString("**Create a Pull Request** to merge these changes:\n\n")
		branchURL := fmt.Sprintf("%s/tree/%s", strings.TrimSuffix(repoURL, ".git"), branchName)
		comment.WriteString(fmt.Sprintf("1. 🌿 View changes: [%s](%s)\n", branchName, branchURL))
		comment.WriteString(fmt.Sprintf("2. 🔀 Click \"Contribute\" → \"Open pull request\" on GitHub\n"))
		comment.WriteString(fmt.Sprintf("3. 📝 Review the changes and submit the PR\n\n"))
	}

	comment.WriteString("**To review locally:**\n")
	comment.WriteString(fmt.Sprintf("```bash\ngit fetch origin %s\ngit checkout %s\n```\n", branchName, branchName))

	comment.WriteString("\n---\n")
	comment.WriteString(fmt.Sprintf("*Session: `%s`*  \n", sessionID))
	comment.WriteString("*Generated by vTeam BugFix Workspace*\n")

	return comment.String()
}

// formatImplementationComment formats the implementation summary for GitHub comment (fallback if Gist fails)
func formatImplementationComment(summary, sessionID, branchName, repoURL string, prURL *string) string {
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

	comment.WriteString("\n\n### 📋 Next Steps\n\n")

	// If PR already exists, link to it
	if prURL != nil && *prURL != "" {
		comment.WriteString(fmt.Sprintf("✅ **Pull Request exists**: [View PR](%s)\n\n", *prURL))
	} else {
		// No PR exists - guide user to create one
		comment.WriteString("**Create a Pull Request** to merge these changes:\n\n")
		branchURL := fmt.Sprintf("%s/tree/%s", strings.TrimSuffix(repoURL, ".git"), branchName)
		comment.WriteString(fmt.Sprintf("1. 🌿 View changes: [%s](%s)\n", branchName, branchURL))
		comment.WriteString(fmt.Sprintf("2. 🔀 Click \"Contribute\" → \"Open pull request\" on GitHub\n"))
		comment.WriteString(fmt.Sprintf("3. 📝 Review the changes and submit the PR\n\n"))
	}

	comment.WriteString("**To review locally:**\n")
	comment.WriteString(fmt.Sprintf("```bash\ngit fetch origin %s\ngit checkout %s\n```\n", branchName, branchName))

	comment.WriteString("\n---\n")
	comment.WriteString("*This implementation was completed automatically by the vTeam BugFix Workspace.*\n")

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
				case "bug-review", "bug-implement-fix":
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
	sessionName := session.GetName()

	// Get service account client
	dynClient := GetServiceAccountDynamicClient()

	// Get workflow details (needed for issue number)
	workflow, err := crd.GetProjectBugFixWorkflowCR(dynClient, project, workflowID)
	if err != nil || workflow == nil {
		log.Printf("Failed to get BugFix Workflow %s: %v", workflowID, err)
		return
	}

	// Get session output from status.result (runner now always populates this)
	status, _ := session.Object["status"].(map[string]interface{})
	output, _ := status["result"].(string)

	if output == "" {
		// Session completed with empty output (should be rare with updated runner)
		log.Printf("%s session %s completed with empty status.result", sessionType, sessionName)
		if sessionType == "bug-review" {
			// Mark assessment as complete even if empty
			workflow.AssessmentStatus = "complete"
			if err := crd.UpdateBugFixWorkflowStatus(dynClient, workflow); err != nil {
				log.Printf("Failed to update workflow assessment status: %v", err)
			}
		}
		return
	}

	// Parse GitHub URL
	owner, repo, issueNumber, err := github.ParseGitHubIssueURL(workflow.GithubIssueURL)
	if err != nil {
		log.Printf("Failed to parse GitHub Issue URL: %v", err)
		return
	}

	// Get GitHub token from K8s secret (webhook uses service account, no user context)
	ctx := context.Background()
	githubToken, err := git.GetGitHubToken(ctx, K8sClient, DynamicClient, project, "")
	if err != nil || githubToken == "" {
		log.Printf("ERROR: Failed to get GitHub token: %v", err)
		return
	}

	// Route based on session type
	switch sessionType {
	case "bug-review":
		// Create a Gist with the full detailed analysis
		gistFilename := fmt.Sprintf("bug-review-issue-%d.md", issueNumber)
		gistDescription := fmt.Sprintf("Bug Review & Assessment for Issue #%d", issueNumber)
		log.Printf("Creating Gist with detailed analysis (%d bytes)", len(output))
		gist, err := github.CreateGist(ctx, githubToken, gistDescription, gistFilename, output, true)
		if err != nil {
			log.Printf("ERROR: Failed to create Gist: %v", err)
			return
		}
		log.Printf("Successfully created Gist: %s", gist.URL)

		// Format a short summary comment with link to Gist
		comment := formatBugReviewSummary(gist.URL, session.GetName())

		// Post short summary comment to GitHub Issue
		githubComment, err := github.AddComment(ctx, owner, repo, issueNumber, githubToken, comment)
		if err != nil {
			log.Printf("Failed to post bug review comment to GitHub Issue: %v", err)
			return
		}
		log.Printf("Successfully posted Bug Review & Assessment to GitHub Issue #%d (comment: %s)", issueNumber, githubComment.URL)

		// Add 'claude' label to mark that Claude has assessed this issue
		labels, err := github.GetIssueLabels(ctx, owner, repo, issueNumber, githubToken)
		if err != nil {
			log.Printf("Warning: failed to get issue labels: %v", err)
		} else {
			hasClaudeLabel := false
			labelNames := make([]string, 0, len(labels)+1)
			for _, label := range labels {
				labelNames = append(labelNames, label.Name)
				if strings.ToLower(label.Name) == "claude" {
					hasClaudeLabel = true
				}
			}

			if !hasClaudeLabel {
				labelNames = append(labelNames, "claude")
				updateReq := &github.UpdateIssueRequest{Labels: labelNames}
				_, err = github.UpdateIssue(ctx, owner, repo, issueNumber, githubToken, updateReq)
				if err != nil {
					log.Printf("Warning: failed to add 'claude' label: %v", err)
				} else {
					log.Printf("Added 'claude' label to GitHub Issue #%d", issueNumber)
				}
			}
		}

		// Update workflow annotations with Gist URL and comment reference
		if workflow.Annotations == nil {
			workflow.Annotations = make(map[string]string)
		}
		workflow.Annotations["bug-review-comment-id"] = fmt.Sprintf("%d", githubComment.ID)
		workflow.Annotations["bug-review-comment-url"] = githubComment.URL
		workflow.Annotations["bug-review-gist-url"] = gist.URL
		workflow.AssessmentStatus = "complete"

		// Update workflow CR
		if err := crd.UpsertProjectBugFixWorkflowCR(dynClient, workflow); err != nil {
			log.Printf("Warning: failed to update workflow annotations: %v", err)
		}

		// Update status subresource
		if err := crd.UpdateBugFixWorkflowStatus(dynClient, workflow); err != nil {
			log.Printf("Warning: failed to update workflow status: %v", err)
		}

	case "bug-implement-fix":
		// Check for existing PR first (regardless of autoCreatePR setting)
		// This ensures we can include PR link in the comment
		var existingPR *github.GitHubPullRequest
		var prCreatedBy string

		// First check workflow annotations for PR info
		var prURL *string
		if workflow.Annotations != nil && workflow.Annotations["github-pr-url"] != "" {
			prURLValue := workflow.Annotations["github-pr-url"]
			prURL = &prURLValue
			log.Printf("Found PR URL in workflow annotations: %s", prURLValue)
		} else {
			// Query GitHub for existing PRs linked to this issue
			prs, err := github.GetIssuePullRequests(ctx, owner, repo, issueNumber, githubToken)
			if err != nil {
				log.Printf("Warning: failed to check for existing PRs: %v", err)
			} else {
				// Look for open PR from our branch
				for i := range prs {
					pr := &prs[i]
					if pr.State == "open" && pr.Head.Ref == workflow.BranchName {
						existingPR = pr
						prURL = &pr.URL
						if workflow.Annotations != nil && workflow.Annotations["github-pr-number"] == fmt.Sprintf("%d", pr.Number) {
							prCreatedBy = "vteam"
						} else {
							prCreatedBy = "external"
						}
						log.Printf("Found existing PR #%d from branch %s", pr.Number, workflow.BranchName)
						break
					}
				}
			}
		}

		// Create a Gist with the full implementation details
		gistFilename := fmt.Sprintf("implementation-issue-%d.md", issueNumber)
		gistDescription := fmt.Sprintf("Implementation Details for Issue #%d", issueNumber)
		log.Printf("Creating Gist with implementation details (%d bytes)", len(output))
		gist, err := github.CreateGist(ctx, githubToken, gistDescription, gistFilename, output, true)
		if err != nil {
			log.Printf("ERROR: Failed to create Gist: %v (falling back to inline comment)", err)
			// Fallback to inline comment if Gist creation fails
			comment := formatImplementationComment(output, session.GetName(), workflow.BranchName, workflow.ImplementationRepo.URL, prURL)
			_, err = github.AddComment(ctx, owner, repo, issueNumber, githubToken, comment)
			if err != nil {
				log.Printf("Failed to post implementation summary to GitHub Issue: %v", err)
			} else {
				log.Printf("Posted implementation summary to GitHub Issue #%d", issueNumber)
			}
		} else {
			log.Printf("Successfully created implementation Gist: %s", gist.URL)

			// Format short summary comment with link to Gist and PR info
			comment := formatImplementationSummary(gist.URL, session.GetName(), workflow.BranchName, workflow.ImplementationRepo.URL, prURL)

			// Post short summary comment to GitHub Issue
			log.Printf("Posting implementation summary to GitHub Issue #%d", issueNumber)
			_, err = github.AddComment(ctx, owner, repo, issueNumber, githubToken, comment)
			if err != nil {
				log.Printf("Failed to post implementation summary to GitHub Issue: %v", err)
			} else {
				log.Printf("Posted implementation summary to GitHub Issue #%d", issueNumber)
			}
		}

		// If PR exists, track it in annotations for reference
		if existingPR != nil {
			if workflow.Annotations == nil {
				workflow.Annotations = make(map[string]string)
			}
			if workflow.Annotations["github-pr-number"] == "" {
				workflow.Annotations["github-pr-number"] = fmt.Sprintf("%d", existingPR.Number)
				workflow.Annotations["github-pr-url"] = existingPR.URL
				workflow.Annotations["github-pr-state"] = existingPR.State
				workflow.Annotations["pr-created-by"] = prCreatedBy
				_ = crd.UpsertProjectBugFixWorkflowCR(dynClient, workflow)
				log.Printf("Tracked existing PR #%d in workflow annotations", existingPR.Number)
			}
		}

		// Update workflow status
		workflow.ImplementationCompleted = true
		err = crd.UpdateBugFixWorkflowStatus(dynClient, workflow)
		if err != nil {
			log.Printf("Failed to update workflow status (implementationCompleted): %v", err)
		}

		log.Printf("Successfully processed implementation completion for Issue #%d", issueNumber)
	}

	// Broadcast completion
	websocket.BroadcastBugFixSessionCompleted(workflowID, session.GetName(), sessionType)
}

// Package-level variables for bugfix handlers (set from main package)
var (
	K8sClient     *kubernetes.Clientset
	DynamicClient dynamic.Interface
)

// GetServiceAccountK8sClient returns the backend service account K8s client
func GetServiceAccountK8sClient() *kubernetes.Clientset {
	return K8sClient
}

// GetServiceAccountDynamicClient returns the backend service account dynamic client
func GetServiceAccountDynamicClient() dynamic.Interface {
	return DynamicClient
}
