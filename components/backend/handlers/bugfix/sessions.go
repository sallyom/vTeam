package bugfix

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"ambient-code-backend/crd"
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

	// Validate session type
	validTypes := map[string]bool{
		"bug-review":          true,
		"bug-resolution-plan": true,
		"bug-implement-fix":   true,
	}
	if !validTypes[req.SessionType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session type. Must be: bug-review, bug-resolution-plan, or bug-implement-fix"})
		return
	}

	// Get K8s clients
	_, reqDyn := GetK8sClientsForRequest(c)
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
			title = fmt.Sprintf("Bug Review: Issue #%d", workflow.GithubIssueNumber)
		case "bug-resolution-plan":
			title = fmt.Sprintf("Resolution Plan: Issue #%d", workflow.GithubIssueNumber)
		case "bug-implement-fix":
			title = fmt.Sprintf("Implement Fix: Issue #%d", workflow.GithubIssueNumber)
		}
	}

	// Build description
	description := ""
	if req.Description != nil {
		description = *req.Description
	}

	// Build repositories list (implementation repo using feature branch)
	repos := make([]map[string]interface{}, 0)

	repoInput := map[string]interface{}{
		"url":    workflow.ImplementationRepo.URL,
		"branch": workflow.BranchName, // Use feature branch (e.g., bugfix/gh-231)
	}
	repoOutput := map[string]interface{}{
		"url":    workflow.ImplementationRepo.URL,
		"branch": workflow.BranchName, // Push fixes to same feature branch
	}
	repos = append(repos, map[string]interface{}{
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
			prompt = fmt.Sprintf("Review the GitHub issue at %s and analyze the bug report. Focus on understanding the problem, reproduction steps, and affected components.", workflow.GithubIssueURL)
		case "bug-resolution-plan":
			prompt = fmt.Sprintf("Create a detailed resolution plan for the bug described in %s. Analyze the bug, identify root cause, and propose a fix strategy.", workflow.GithubIssueURL)
		case "bug-implement-fix":
			prompt = fmt.Sprintf("Implement the fix for the bug described in %s based on the resolution plan. Make code changes, add tests, and prepare for review.", workflow.GithubIssueURL)
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
	maxTokens := 8000
	timeout := 3600 // 1 hour default

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
		if req.ResourceOverrides.Timeout != nil {
			timeout = *req.ResourceOverrides.Timeout
		}
	}

	// Build AgenticSession spec (following CRD schema)
	// Note: project field is not in CRD - operator uses namespace to find ProjectSettings
	sessionSpec := map[string]interface{}{
		"prompt":             prompt,   // REQUIRED field
		"displayName":        title,    // Use displayName instead of title
		"repos":              repos,
		"timeout":            timeout,
		"autoPushOnComplete": autoPush, // Auto-push changes to feature branch
		"llmSettings": map[string]interface{}{
			"model":       model,
			"temperature": temperature,
			"maxTokens":   maxTokens,
		},
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
		"project":              project,
		"bugfix-workflow":      workflowID,
		"bugfix-session-type":  req.SessionType,
		"bugfix-issue-number":  fmt.Sprintf("%d", workflow.GithubIssueNumber),
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
