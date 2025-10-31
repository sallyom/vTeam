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
		"bugFolderCreated":        workflow.BugFolderCreated,
		"bugfixMarkdownCreated":   workflow.BugfixMarkdownCreated,
		"createdAt":               workflow.CreatedAt,
		"createdBy":               workflow.CreatedBy,
	}

	// Add optional fields
	if workflow.JiraTaskKey != nil {
		response["jiraTaskKey"] = *workflow.JiraTaskKey
	}
	if workflow.LastSyncedAt != nil {
		response["lastSyncedAt"] = *workflow.LastSyncedAt
	}
	if workflow.WorkspacePath != "" {
		response["workspacePath"] = workflow.WorkspacePath
	}

	// Add repositories
	if workflow.UmbrellaRepo != nil {
		u := map[string]interface{}{"url": workflow.UmbrellaRepo.URL}
		if workflow.UmbrellaRepo.Branch != nil {
			u["branch"] = *workflow.UmbrellaRepo.Branch
		}
		response["umbrellaRepo"] = u
	}

	if len(workflow.SupportingRepos) > 0 {
		repos := make([]map[string]interface{}, 0, len(workflow.SupportingRepos))
		for _, r := range workflow.SupportingRepos {
			rm := map[string]interface{}{"url": r.URL}
			if r.Branch != nil {
				rm["branch"] = *r.Branch
			}
			repos = append(repos, rm)
		}
		response["supportingRepos"] = repos
	}

	c.JSON(http.StatusOK, response)
}
