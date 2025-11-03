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
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
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
			// Refresh attachments for updates (in case new Gists were added)
			jiraBase := strings.TrimRight(jiraURL, "/")
			attachGistsToJira(c, workflow, jiraBase, jiraTaskKey, authHeader, reqK8s, reqDyn, project)
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

		// Log response for debugging
		fmt.Printf("Jira API response status: %d, body length: %d bytes\n", resp.StatusCode, len(body))
		fmt.Printf("Response content-type: %s\n", resp.Header.Get("Content-Type"))
		if len(body) > 0 {
			// Show first 500 chars to help debug
			preview := string(body)
			if len(preview) > 500 {
				preview = preview[:500]
			}
			fmt.Printf("Response body preview: %s\n", preview)
		}

		// T056: Handle various HTTP status codes properly
		switch resp.StatusCode {
		case 201:
			// Success - continue to parse response
			fmt.Printf("Jira API success (201), attempting to parse JSON\n")
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

		// Parse JSON response
		var result map[string]interface{}
		if err := json.Unmarshal(body, &result); err != nil {
			// Log the raw response for debugging
			fmt.Printf("ERROR: Failed to parse Jira response as JSON: %v\n", err)
			bodyLen := len(body)
			fmt.Printf("Response body (first 500 chars): %s\n", string(body[:min(500, bodyLen)]))
			websocket.BroadcastBugFixJiraSyncFailed(workflowID, workflow.GithubIssueNumber, "Invalid Jira response")
			c.JSON(http.StatusInternalServerError, gin.H{
				"error":           "Failed to parse Jira response",
				"details":         err.Error(),
				"responsePreview": string(body[:min(200, bodyLen)]),
			})
			return
		}

		var ok bool
		jiraTaskKey, ok = result["key"].(string)
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

		// Attach Gist markdown files to Jira issue
		attachGistsToJira(c, workflow, jiraBase, jiraTaskKey, authHeader, reqK8s, reqDyn, project)

		// T054: Add comment to GitHub Issue with Jira link
		userID, _ := c.Get("userID")
		userIDStr, _ := userID.(string)
		githubToken, err := git.GetGitHubToken(c.Request.Context(), reqK8s, reqDyn, project, userIDStr)
		if err == nil && githubToken != "" {
			owner, repo, issueNumber, err := github.ParseGitHubIssueURL(workflow.GithubIssueURL)
			if err == nil {
				comment := formatGitHubJiraLinkComment(jiraTaskKey, jiraTaskURL, workflow)
				ctx := context.Background()
				_, err = github.AddComment(ctx, owner, repo, issueNumber, githubToken, comment)
				if err != nil {
					// Non-fatal: Log but continue
					fmt.Printf("Warning: Failed to add Jira link to GitHub Issue: %v\n", err)
				} else {
					fmt.Printf("Posted Jira link comment to GitHub Issue #%d\n", issueNumber)
				}
			}
		}
	}

	// Note: Only post GitHub comment on initial creation, not on updates
	// This prevents spamming the GitHub Issue with repeated sync comments

	// T055: Update BugFixWorkflow CR with jiraTaskKey, jiraTaskURL, and lastSyncedAt
	// Use backend service account client for CR write (following handlers/sessions.go:417 pattern)
	workflow.JiraTaskKey = &jiraTaskKey
	workflow.JiraTaskURL = &jiraTaskURL
	syncedAt := time.Now().UTC().Format(time.RFC3339)
	workflow.LastSyncedAt = &syncedAt

	serviceAccountClient := GetServiceAccountDynamicClient()
	err = crd.UpsertProjectBugFixWorkflowCR(serviceAccountClient, workflow)
	if err != nil {
		// Log error and continue - Jira sync itself succeeded
		fmt.Printf("Warning: Failed to update workflow CR with Jira info: %v\n", err)
	} else {
		fmt.Printf("Successfully updated workflow CR with Jira info: %s -> %s\n", workflowID, jiraTaskKey)
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
// Includes comprehensive information and references to attached Gist files
func buildJiraDescription(workflow *types.BugFixWorkflow) string {
	var desc strings.Builder

	// Header with source
	desc.WriteString("h1. Bug Report\n\n")
	desc.WriteString("*Source:* [GitHub Issue #")
	desc.WriteString(fmt.Sprintf("%d", workflow.GithubIssueNumber))
	desc.WriteString("|")
	desc.WriteString(workflow.GithubIssueURL)
	desc.WriteString("]\n\n")
	desc.WriteString("----\n\n")

	// Description
	if workflow.Description != "" {
		desc.WriteString("h2. Description\n\n")
		desc.WriteString(workflow.Description)
		desc.WriteString("\n\n")
	}

	// Repository and branch information
	desc.WriteString("h2. Repository Information\n\n")
	desc.WriteString(fmt.Sprintf("* *Repository:* %s\n", workflow.ImplementationRepo.URL))
	baseBranch := "main"
	if workflow.ImplementationRepo.Branch != nil && *workflow.ImplementationRepo.Branch != "" {
		baseBranch = *workflow.ImplementationRepo.Branch
	}
	desc.WriteString(fmt.Sprintf("* *Base Branch:* {{%s}}\n", baseBranch))
	desc.WriteString(fmt.Sprintf("* *Feature Branch:* {{%s}}\n", workflow.BranchName))
	desc.WriteString("\n")

	// Status information
	desc.WriteString("h2. Workflow Status\n\n")
	desc.WriteString(fmt.Sprintf("* *Created:* %s\n", workflow.CreatedAt))
	desc.WriteString(fmt.Sprintf("* *Phase:* %s\n", workflow.Phase))

	if workflow.AssessmentStatus != "" {
		desc.WriteString(fmt.Sprintf("* *Assessment:* %s\n", workflow.AssessmentStatus))
	}
	if workflow.ImplementationCompleted {
		desc.WriteString("* *Implementation:* {color:green}✓ Complete{color}\n")
	} else {
		desc.WriteString("* *Implementation:* Pending\n")
	}
	desc.WriteString("\n")

	// Analysis documents section
	hasGists := false
	if workflow.Annotations != nil {
		if bugReviewGist := workflow.Annotations["bug-review-gist-url"]; bugReviewGist != "" {
			hasGists = true
		}
		if implGist := workflow.Annotations["implementation-gist-url"]; implGist != "" {
			hasGists = true
		}
	}

	if hasGists {
		desc.WriteString("h2. Analysis Documents\n\n")
		desc.WriteString("_Detailed analysis reports are attached to this issue as markdown files. Original Gist links:_\n\n")

		if workflow.Annotations != nil {
			if bugReviewGist := workflow.Annotations["bug-review-gist-url"]; bugReviewGist != "" {
				desc.WriteString("* *Bug Review & Assessment:* [bug-review.md attachment|")
				desc.WriteString(bugReviewGist)
				desc.WriteString("]\n")
			}
			if implGist := workflow.Annotations["implementation-gist-url"]; implGist != "" {
				desc.WriteString("* *Implementation Details:* [implementation.md attachment|")
				desc.WriteString(implGist)
				desc.WriteString("]\n")
			}
		}
		desc.WriteString("\n")
	}

	// PR information if available
	if workflow.Annotations != nil {
		if prURL := workflow.Annotations["github-pr-url"]; prURL != "" {
			prNumber := workflow.Annotations["github-pr-number"]
			prState := workflow.Annotations["github-pr-state"]
			desc.WriteString("h2. Pull Request\n\n")
			desc.WriteString(fmt.Sprintf("* *PR:* [#%s|%s]\n", prNumber, prURL))
			desc.WriteString(fmt.Sprintf("* *State:* %s\n", prState))
			desc.WriteString("\n")
		}
	}

	// Footer
	desc.WriteString("----\n")
	desc.WriteString("_Synchronized from vTeam BugFix Workspace | [View in vTeam|")
	desc.WriteString(workflow.GithubIssueURL)
	desc.WriteString("]_\n")

	return desc.String()
}

// formatGitHubJiraLinkComment formats the comment to post on GitHub Issue when creating new Jira task
func formatGitHubJiraLinkComment(jiraTaskKey, jiraTaskURL string, workflow *types.BugFixWorkflow) string {
	var comment strings.Builder

	comment.WriteString("## 🔗 Jira Task Created\n\n")
	comment.WriteString(fmt.Sprintf("This bug has been synchronized to Jira: [**%s**](%s)\n\n", jiraTaskKey, jiraTaskURL))

	// Add links to analysis documents if available
	if workflow.Annotations != nil {
		hasGists := false
		if bugReviewGist := workflow.Annotations["bug-review-gist-url"]; bugReviewGist != "" {
			if !hasGists {
				comment.WriteString("### 📄 Analysis Documents\n\n")
				hasGists = true
			}
			comment.WriteString(fmt.Sprintf("- [Bug Review & Assessment](%s)\n", bugReviewGist))
		}
		if implGist := workflow.Annotations["implementation-gist-url"]; implGist != "" {
			if !hasGists {
				comment.WriteString("### 📄 Analysis Documents\n\n")
				hasGists = true
			}
			comment.WriteString(fmt.Sprintf("- [Implementation Details](%s)\n", implGist))
		}
		if hasGists {
			comment.WriteString("\n")
		}
	}

	comment.WriteString("*Synchronized by vTeam BugFix Workspace*")

	return comment.String()
}

// formatGitHubJiraUpdateComment formats the comment to post on GitHub Issue when updating Jira task
func formatGitHubJiraUpdateComment(jiraTaskKey, jiraTaskURL string, workflow *types.BugFixWorkflow) string {
	var comment strings.Builder

	comment.WriteString("## 🔄 Jira Task Updated\n\n")
	comment.WriteString(fmt.Sprintf("Jira task [**%s**](%s) has been updated with the latest information.\n\n", jiraTaskKey, jiraTaskURL))

	// Add links to analysis documents if available
	if workflow.Annotations != nil {
		hasGists := false
		if bugReviewGist := workflow.Annotations["bug-review-gist-url"]; bugReviewGist != "" {
			if !hasGists {
				comment.WriteString("### 📄 Latest Analysis\n\n")
				hasGists = true
			}
			comment.WriteString(fmt.Sprintf("- [Bug Review & Assessment](%s)\n", bugReviewGist))
		}
		if implGist := workflow.Annotations["implementation-gist-url"]; implGist != "" {
			if !hasGists {
				comment.WriteString("### 📄 Latest Analysis\n\n")
				hasGists = true
			}
			comment.WriteString(fmt.Sprintf("- [Implementation Details](%s)\n", implGist))
		}
		if hasGists {
			comment.WriteString("\n")
		}
	}

	comment.WriteString("*Synchronized by vTeam BugFix Workspace*")

	return comment.String()
}

// getSuccessMessage returns appropriate success message
func getSuccessMessage(created bool, jiraTaskKey string) string {
	if created {
		return fmt.Sprintf("Created Jira task %s", jiraTaskKey)
	}
	return fmt.Sprintf("Updated Jira task %s", jiraTaskKey)
}

// attachGistsToJira fetches Gist content and attaches it as markdown files to the Jira issue
// Only attaches if the file doesn't already exist to prevent duplicates
func attachGistsToJira(c *gin.Context, workflow *types.BugFixWorkflow, jiraBase, jiraTaskKey, authHeader string, reqK8s *kubernetes.Clientset, reqDyn dynamic.Interface, project string) {
	if workflow.Annotations == nil {
		return
	}

	// Get GitHub token for fetching Gists
	userID, _ := c.Get("userID")
	userIDStr, _ := userID.(string)
	githubToken, err := git.GetGitHubToken(c.Request.Context(), reqK8s, reqDyn, project, userIDStr)
	if err != nil || githubToken == "" {
		fmt.Printf("Warning: Cannot attach Gists - failed to get GitHub token: %v\n", err)
		return
	}

	ctx := c.Request.Context()

	// Get existing attachments to avoid duplicates
	existingAttachments, err := jira.GetJiraIssueAttachments(ctx, jiraBase, jiraTaskKey, authHeader)
	if err != nil {
		fmt.Printf("Warning: Failed to get existing Jira attachments: %v (will attempt upload anyway)\n", err)
		existingAttachments = make(map[string]bool) // Continue with empty map
	}

	// Attach bug-review Gist if available
	if bugReviewGist := workflow.Annotations["bug-review-gist-url"]; bugReviewGist != "" {
		filename := fmt.Sprintf("bug-review-issue-%d.md", workflow.GithubIssueNumber)

		if existingAttachments[filename] {
			fmt.Printf("Skipping %s - already attached to %s\n", filename, jiraTaskKey)
		} else {
			fmt.Printf("Fetching bug-review Gist from %s\n", bugReviewGist)
			gistContent, err := github.GetGist(ctx, bugReviewGist, githubToken)
			if err != nil {
				fmt.Printf("Warning: Failed to fetch bug-review Gist: %v\n", err)
			} else {
				if attachErr := jira.AttachFileToJiraIssue(ctx, jiraBase, jiraTaskKey, authHeader, filename, []byte(gistContent)); attachErr != nil {
					fmt.Printf("Warning: Failed to attach %s to %s: %v\n", filename, jiraTaskKey, attachErr)
				} else {
					fmt.Printf("Successfully attached %s to %s\n", filename, jiraTaskKey)
				}
			}
		}
	}

	// Attach implementation Gist if available
	if implGist := workflow.Annotations["implementation-gist-url"]; implGist != "" {
		filename := fmt.Sprintf("implementation-issue-%d.md", workflow.GithubIssueNumber)

		if existingAttachments[filename] {
			fmt.Printf("Skipping %s - already attached to %s\n", filename, jiraTaskKey)
		} else {
			fmt.Printf("Fetching implementation Gist from %s\n", implGist)
			gistContent, err := github.GetGist(ctx, implGist, githubToken)
			if err != nil {
				fmt.Printf("Warning: Failed to fetch implementation Gist: %v\n", err)
			} else {
				if attachErr := jira.AttachFileToJiraIssue(ctx, jiraBase, jiraTaskKey, authHeader, filename, []byte(gistContent)); attachErr != nil {
					fmt.Printf("Warning: Failed to attach %s to %s: %v\n", filename, jiraTaskKey, attachErr)
				} else {
					fmt.Printf("Successfully attached %s to %s\n", filename, jiraTaskKey)
				}
			}
		}
	}
}
