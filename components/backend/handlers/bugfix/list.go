package bugfix

import (
	"net/http"

	"ambient-code-backend/crd"

	"github.com/gin-gonic/gin"
)

// ListProjectBugFixWorkflows handles GET /api/projects/:projectName/bugfix-workflows
// Lists all BugFix Workspaces in a project
func ListProjectBugFixWorkflows(c *gin.Context) {
	project := c.Param("projectName")

	// Get K8s clients
	_, reqDyn := GetK8sClientsForRequest(c)
	if reqDyn == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing or invalid user token"})
		return
	}

	// List workflows from CRs
	workflows, err := crd.ListProjectBugFixWorkflowCRs(reqDyn, project)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list workflows", "details": err.Error()})
		return
	}

	// Return slim summaries (exclude full description for performance)
	summaries := make([]map[string]interface{}, 0, len(workflows))
	for _, w := range workflows {
		item := map[string]interface{}{
			"id":                w.ID,
			"githubIssueNumber": w.GithubIssueNumber,
			"githubIssueURL":    w.GithubIssueURL,
			"title":             w.Title,
			"branchName":        w.BranchName,
			"phase":             w.Phase,
			"project":           w.Project,
			"createdAt":         w.CreatedAt,
			"createdBy":         w.CreatedBy,
		}

		// Add Jira link if present
		if w.JiraTaskKey != nil {
			item["jiraTaskKey"] = *w.JiraTaskKey
		}

		// Add umbrella repo URL
		if w.UmbrellaRepo != nil {
			item["umbrellaRepoURL"] = w.UmbrellaRepo.URL
		}

		summaries = append(summaries, item)
	}

	c.JSON(http.StatusOK, gin.H{"workflows": summaries})
}
