package bugfix

import (
	"net/http"

	"ambient-code-backend/crd"

	"github.com/gin-gonic/gin"
)

// GetProjectBugFixWorkflowStatus handles GET /api/projects/:projectName/bugfix-workflows/:id/status
// Returns workflow status including phase, message, and boolean flags
func GetProjectBugFixWorkflowStatus(c *gin.Context) {
	project := c.Param("projectName")
	id := c.Param("id")

	// Get K8s clients
	_, reqDyn := GetK8sClientsForRequest(c)
	if reqDyn == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing or invalid user token"})
		return
	}

	// Get workflow
	workflow, err := crd.GetProjectBugFixWorkflowCR(reqDyn, project, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get workflow", "details": err.Error()})
		return
	}
	if workflow == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Workflow not found"})
		return
	}

	// Return status fields
	status := map[string]interface{}{
		"id":                      workflow.ID,
		"phase":                   workflow.Phase,
		"message":                 workflow.Message,
		"implementationCompleted": workflow.ImplementationCompleted,
		"githubIssueNumber":       workflow.GithubIssueNumber,
		"githubIssueURL":          workflow.GithubIssueURL,
	}

	// Add Jira sync status if available
	if workflow.JiraTaskKey != nil {
		status["jiraTaskKey"] = *workflow.JiraTaskKey
		status["jiraSynced"] = true
		if workflow.LastSyncedAt != nil {
			status["lastSyncedAt"] = *workflow.LastSyncedAt
		}
	} else {
		status["jiraSynced"] = false
	}

	c.JSON(http.StatusOK, status)
}
