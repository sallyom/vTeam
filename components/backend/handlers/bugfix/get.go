package bugfix

import (
	"net/http"

	"ambient-code-backend/crd"

	"github.com/gin-gonic/gin"
)

// GetProjectBugFixWorkflow handles GET /api/projects/:projectName/bugfix-workflows/:id
// Retrieves a specific BugFix Workspace by ID
func GetProjectBugFixWorkflow(c *gin.Context) {
	project := c.Param("projectName")
	id := c.Param("id")

	// Get K8s clients
	_, reqDyn := GetK8sClientsForRequest(c)
	if reqDyn == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing or invalid user token"})
		return
	}

	// Get workflow from CR
	workflow, err := crd.GetProjectBugFixWorkflowCR(reqDyn, project, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get workflow", "details": err.Error()})
		return
	}

	if workflow == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Workflow not found"})
		return
	}

	// Return workflow details
	response := map[string]interface{}{
		"id":                      workflow.ID,
		"githubIssueNumber":       workflow.GithubIssueNumber,
		"githubIssueURL":          workflow.GithubIssueURL,
		"title":                   workflow.Title,
		"description":             workflow.Description,
		"branchName":              workflow.BranchName,
		"project":                 workflow.Project,
		"phase":                   workflow.Phase,
		"message":                 workflow.Message,
		"implementationCompleted": workflow.ImplementationCompleted,
		"createdAt":               workflow.CreatedAt,
		"createdBy":               workflow.CreatedBy,
	}

	// Add optional fields
	if workflow.JiraTaskKey != nil {
		response["jiraTaskKey"] = *workflow.JiraTaskKey
	}
	if workflow.JiraTaskURL != nil {
		response["jiraTaskURL"] = *workflow.JiraTaskURL
	}
	if workflow.LastSyncedAt != nil {
		response["lastSyncedAt"] = *workflow.LastSyncedAt
	}
	if workflow.WorkspacePath != "" {
		response["workspacePath"] = workflow.WorkspacePath
	}

	// Add implementation repository
	implRepo := map[string]interface{}{"url": workflow.ImplementationRepo.URL}
	if workflow.ImplementationRepo.Branch != nil {
		implRepo["branch"] = *workflow.ImplementationRepo.Branch
	}
	response["implementationRepo"] = implRepo

	c.JSON(http.StatusOK, response)
}
