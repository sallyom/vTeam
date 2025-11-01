package bugfix

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"ambient-code-backend/crd"
	"ambient-code-backend/git"
	"ambient-code-backend/github"
	"ambient-code-backend/jira"
	"ambient-code-backend/types"
	"ambient-code-backend/websocket"

	"github.com/gin-gonic/gin"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// SyncProjectBugFixWorkflowToJira handles POST /api/projects/:projectName/bugfix-workflows/:id/sync-jira
// Syncs BugFix Workflow to Jira by creating or updating a Jira task
func SyncProjectBugFixWorkflowToJira(c *gin.Context) {
	project := c.Param("projectName")
	workflowID := c.Param("id")

	// Get K8s clients
	reqK8s, reqDyn := GetK8sClientsForRequest(c)
	if reqDyn == nil || reqK8s == nil {
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

	// Broadcast sync started
	websocket.BroadcastBugFixJiraSyncStarted(workflowID, workflow.GithubIssueNumber)

	// Get Jira configuration from runner secrets (following RFE pattern)
	secretName := "ambient-runner-secrets"
	// Check if project has custom runner secrets
	if gvr := GetProjectSettingsResource(); gvr.Resource != "" {
		if obj, err := reqDyn.Resource(gvr).Namespace(project).Get(c.Request.Context(), "projectsettings", v1.GetOptions{}); err == nil {
			if spec, ok := obj.Object["spec"].(map[string]interface{}); ok {
				if v, ok := spec["runnerSecretsName"].(string); ok && strings.TrimSpace(v) != "" {
					secretName = strings.TrimSpace(v)
				}
			}
		}
	}

	// Get runner secrets with Jira config
	sec, err := reqK8s.CoreV1().Secrets(project).Get(c.Request.Context(), secretName, v1.GetOptions{})
	if err != nil {
		websocket.BroadcastBugFixJiraSyncFailed(workflowID, workflow.GithubIssueNumber, "Failed to read runner secrets")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to read runner secret", "details": err.Error()})
		return
	}

	// Extract Jira config from secrets
	jiraURL := string(sec.Data["JIRA_URL"])
	jiraProject := string(sec.Data["JIRA_PROJECT"])
	jiraToken := string(sec.Data["JIRA_API_TOKEN"])

	if jiraURL == "" || jiraProject == "" || jiraToken == "" {
		websocket.BroadcastBugFixJiraSyncFailed(workflowID, workflow.GithubIssueNumber, "Jira not configured")
		// T056: Proper error handling for missing Jira config
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing Jira configuration in runner secret (JIRA_URL, JIRA_PROJECT, JIRA_API_TOKEN required)"})
		return
	}

	// Get auth header (Cloud vs Server)
	authHeader := jira.GetJiraAuthHeader(jiraURL, jiraToken)

	// T051: Determine if this is create or update
	isUpdate := workflow.JiraTaskKey != nil && *workflow.JiraTaskKey != ""
	var jiraTaskKey, jiraTaskURL string

	if isUpdate {
		// Update existing Jira task
		jiraTaskKey = *workflow.JiraTaskKey

		// T052 (Update path): Update existing Jira task description
		newDescription := buildJiraDescription(workflow)
		err = jira.UpdateJiraTask(c.Request.Context(), jiraTaskKey, newDescription, jiraURL, authHeader)
		if err != nil {
			// If update fails, it might be deleted - try creating new
			if strings.Contains(err.Error(), "404") || strings.Contains(err.Error(), "not found") {
				isUpdate = false
			} else {
				websocket.BroadcastBugFixJiraSyncFailed(workflowID, workflow.GithubIssueNumber, fmt.Sprintf("Failed to update Jira task: %v", err))
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Failed to update Jira task", "details": err.Error()})
				return
			}
		} else {
			jiraTaskURL = fmt.Sprintf("%s/browse/%s", strings.TrimRight(jiraURL, "/"), jiraTaskKey)
		}
	}

	if !isUpdate {
		// T052: Create new Jira task from GitHub Issue
		// NOTE: Using Feature Request type to reuse existing integration
		// TODO: After Jira Cloud migration, use proper Bug/Task type

		// Build fields for Jira issue
		fields := map[string]interface{}{
			"project":     map[string]string{"key": jiraProject},
			"summary":     fmt.Sprintf("Bug #%d: %s", workflow.GithubIssueNumber, workflow.Title),
			"description": buildJiraDescription(workflow),
			"issuetype":   map[string]string{"name": "Feature Request"}, // NOTE: Using Feature Request until Jira Cloud migration
		}

		// Create the issue
		jiraBase := strings.TrimRight(jiraURL, "/")
		jiraEndpoint := fmt.Sprintf("%s/rest/api/2/issue", jiraBase)

		payload := map[string]interface{}{"fields": fields}
		bodyBytes, err := json.Marshal(payload)
		if err != nil {
			websocket.BroadcastBugFixJiraSyncFailed(workflowID, workflow.GithubIssueNumber, "Failed to marshal request")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create Jira request", "details": err.Error()})
			return
		}

		req, err := http.NewRequestWithContext(c.Request.Context(), "POST", jiraEndpoint, bytes.NewReader(bodyBytes))
		if err != nil {
			websocket.BroadcastBugFixJiraSyncFailed(workflowID, workflow.GithubIssueNumber, "Failed to create request")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create Jira request", "details": err.Error()})
			return
		}

		req.Header.Set("Authorization", authHeader)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")

		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			websocket.BroadcastBugFixJiraSyncFailed(workflowID, workflow.GithubIssueNumber, fmt.Sprintf("Jira API failed: %v", err))
			// T056: Better error handling for connection failures
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Jira API request failed", "details": err.Error()})
			return
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)

		// T056: Handle various HTTP status codes properly
		switch resp.StatusCode {
		case 201:
			// Success
		case 401, 403:
			websocket.BroadcastBugFixJiraSyncFailed(workflowID, workflow.GithubIssueNumber, "Jira authentication failed")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Jira authentication failed", "details": string(body)})
			return
		case 404:
			websocket.BroadcastBugFixJiraSyncFailed(workflowID, workflow.GithubIssueNumber, "Jira project not found")
			c.JSON(http.StatusBadRequest, gin.H{"error": "Jira project not found", "details": string(body)})
			return
		default:
			websocket.BroadcastBugFixJiraSyncFailed(workflowID, workflow.GithubIssueNumber, fmt.Sprintf("Jira API error: %s", string(body)))
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": fmt.Sprintf("Failed to create Jira issue (status %d)", resp.StatusCode), "details": string(body)})
			return
		}

		var result map[string]interface{}
		if err := json.Unmarshal(body, &result); err != nil {
			websocket.BroadcastBugFixJiraSyncFailed(workflowID, workflow.GithubIssueNumber, "Invalid Jira response")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse Jira response", "details": err.Error()})
			return
		}

		jiraTaskKey, ok := result["key"].(string)
		if !ok {
			websocket.BroadcastBugFixJiraSyncFailed(workflowID, workflow.GithubIssueNumber, "No key in Jira response")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Jira response missing key field"})
			return
		}

		jiraTaskURL = fmt.Sprintf("%s/browse/%s", jiraBase, jiraTaskKey)

		// T053: Create remote link in Jira pointing to GitHub Issue
		err = jira.AddJiraRemoteLink(c.Request.Context(), jiraTaskKey, workflow.GithubIssueURL,
			fmt.Sprintf("GitHub Issue #%d", workflow.GithubIssueNumber), jiraURL, authHeader)
		if err != nil {
			// Non-fatal: Log but continue
			fmt.Printf("Warning: Failed to create Jira remote link: %v\n", err)
		}

		// T054: Add comment to GitHub Issue with Jira link
		userID, _ := c.Get("userID")
		userIDStr, _ := userID.(string)
		githubToken, err := git.GetGitHubToken(c.Request.Context(), reqK8s, reqDyn, project, userIDStr)
		if err == nil && githubToken != "" {
			owner, repo, issueNumber, err := github.ParseGitHubIssueURL(workflow.GithubIssueURL)
			if err == nil {
				comment := formatGitHubJiraLinkComment(jiraTaskKey, jiraTaskURL)
				ctx := context.Background()
				_, err = github.AddComment(ctx, owner, repo, issueNumber, githubToken, comment)
				if err != nil {
					// Non-fatal: Log but continue
					fmt.Printf("Warning: Failed to add Jira link to GitHub Issue: %v\n", err)
				}
			}
		}
	}

	// T055: Update BugFixWorkflow CR with jiraTaskKey, jiraTaskURL, and lastSyncedAt
	workflow.JiraTaskKey = &jiraTaskKey
	workflow.JiraTaskURL = &jiraTaskURL
	syncedAt := time.Now().UTC().Format(time.RFC3339)
	workflow.LastSyncedAt = &syncedAt

	err = crd.UpsertProjectBugFixWorkflowCR(reqDyn, workflow)
	if err != nil {
		// Try to continue even if CR update fails
		fmt.Printf("Warning: Failed to update workflow CR with Jira info: %v\n", err)
	}

	// Broadcast success
	websocket.BroadcastBugFixJiraSyncCompleted(workflowID, jiraTaskKey, jiraTaskURL, workflow.GithubIssueNumber, !isUpdate)

	// Return sync result
	c.JSON(http.StatusOK, gin.H{
		"workflowId":  workflowID,
		"jiraTaskKey": jiraTaskKey,
		"jiraTaskURL": jiraTaskURL,
		"created":     !isUpdate,
		"syncedAt":    syncedAt,
		"message":     getSuccessMessage(!isUpdate, jiraTaskKey),
	})
}

// buildJiraDescription builds the Jira issue description from the workflow
func buildJiraDescription(workflow *types.BugFixWorkflow) string {
	var desc strings.Builder

	desc.WriteString("This issue is synchronized from GitHub Issue:\n")
	desc.WriteString(workflow.GithubIssueURL)
	desc.WriteString("\n\n")

	if workflow.Description != "" {
		desc.WriteString("## Description\n")
		desc.WriteString(workflow.Description)
		desc.WriteString("\n\n")
	}

	desc.WriteString("## Details\n")
	desc.WriteString(fmt.Sprintf("- GitHub Issue: #%d\n", workflow.GithubIssueNumber))
	desc.WriteString(fmt.Sprintf("- Branch: %s\n", workflow.BranchName))
	desc.WriteString(fmt.Sprintf("- Created: %s\n", workflow.CreatedAt))

	desc.WriteString("\n---\n")
	desc.WriteString("*This issue is automatically synchronized from vTeam BugFix Workspace*\n")
	desc.WriteString("*Note: Currently created as Feature Request. Will use proper Bug/Task type after Jira Cloud migration.*\n")

	return desc.String()
}

// formatGitHubJiraLinkComment formats the comment to post on GitHub Issue
func formatGitHubJiraLinkComment(jiraTaskKey, jiraTaskURL string) string {
	return fmt.Sprintf("## 🔗 Jira Task Created\n\nThis bug has been synchronized to Jira:\n- **Task**: [%s](%s)\n\n*Synchronized by vTeam BugFix Workspace*", jiraTaskKey, jiraTaskURL)
}

// getSuccessMessage returns appropriate success message
func getSuccessMessage(created bool, jiraTaskKey string) string {
	if created {
		return fmt.Sprintf("Created Jira task %s", jiraTaskKey)
	}
	return fmt.Sprintf("Updated Jira task %s", jiraTaskKey)
}