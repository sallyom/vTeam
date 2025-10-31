package bugfix

import (
	"net/http"

	"ambient-code-backend/crd"

	"github.com/gin-gonic/gin"
)

// DeleteProjectBugFixWorkflow handles DELETE /api/projects/:projectName/bugfix-workflows/:id
// Deletes a BugFix Workspace (CR only, does not delete git branch or GitHub Issue)
func DeleteProjectBugFixWorkflow(c *gin.Context) {
	project := c.Param("projectName")
	id := c.Param("id")

	// Get K8s clients
	_, reqDyn := GetK8sClientsForRequest(c)
	if reqDyn == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing or invalid user token"})
		return
	}

	// Check if workflow exists
	workflow, err := crd.GetProjectBugFixWorkflowCR(reqDyn, project, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check workflow", "details": err.Error()})
		return
	}

	if workflow == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Workflow not found"})
		return
	}

	// Delete the CR (Kubernetes will cascade delete owned resources)
	if err := crd.DeleteProjectBugFixWorkflowCR(reqDyn, project, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete workflow", "details": err.Error()})
		return
	}

	// Return success
	c.JSON(http.StatusOK, gin.H{
		"message": "Workflow deleted successfully",
		"note":    "Git branch and GitHub Issue are not deleted. Manual cleanup required if desired.",
	})
}
