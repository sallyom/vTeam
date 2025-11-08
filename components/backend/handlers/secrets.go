package handlers

import (
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// Runner secrets management
// Config is stored in ProjectSettings.spec.runnerSecretsName
// The Secret lives in the project namespace and stores key/value pairs for runners

// ListNamespaceSecrets handles GET /api/projects/:projectName/secrets -> { items: [{name, createdAt}] }
func ListNamespaceSecrets(c *gin.Context) {
	projectName := c.Param("projectName")
	reqK8s, _ := GetK8sClientsForRequest(c)

	list, err := reqK8s.CoreV1().Secrets(projectName).List(c.Request.Context(), v1.ListOptions{})
	if err != nil {
		log.Printf("Failed to list secrets in %s: %v", projectName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list secrets"})
		return
	}

	type Item struct {
		Name      string `json:"name"`
		CreatedAt string `json:"createdAt,omitempty"`
		Type      string `json:"type"`
	}
	items := []Item{}
	for _, s := range list.Items {
		// Only include runner/session secrets: Opaque + annotated
		if s.Type != corev1.SecretTypeOpaque {
			continue
		}
		if s.Annotations == nil || s.Annotations["ambient-code.io/runner-secret"] != "true" {
			continue
		}
		it := Item{Name: s.Name, Type: string(s.Type)}
		if !s.CreationTimestamp.IsZero() {
			it.CreatedAt = s.CreationTimestamp.Format(time.RFC3339)
		}
		items = append(items, it)
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

// GetRunnerSecretsConfig handles GET /api/projects/:projectName/runner-secrets/config
func GetRunnerSecretsConfig(c *gin.Context) {
	projectName := c.Param("projectName")
	_, reqDyn := GetK8sClientsForRequest(c)

	gvr := GetProjectSettingsResource()
	// ProjectSettings is a singleton per namespace named 'projectsettings'
	obj, err := reqDyn.Resource(gvr).Namespace(projectName).Get(c.Request.Context(), "projectsettings", v1.GetOptions{})
	if err != nil && !errors.IsNotFound(err) {
		log.Printf("Failed to read ProjectSettings for %s: %v", projectName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read runner secrets config"})
		return
	}

	runnerSecretName := ""
	githubAuthSecretName := ""
	jiraConnectionSecretName := ""
	if obj != nil {
		if spec, ok := obj.Object["spec"].(map[string]interface{}); ok {
			if v, ok := spec["runnerSecretsName"].(string); ok {
				runnerSecretName = v
			}
			if v, ok := spec["githubAuthSecretName"].(string); ok {
				githubAuthSecretName = v
			}
			if v, ok := spec["jiraConnectionSecretName"].(string); ok {
				jiraConnectionSecretName = v
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"secretName":               runnerSecretName, // Legacy field
		"runnerSecretName":         runnerSecretName,
		"githubAuthSecretName":     githubAuthSecretName,
		"jiraConnectionSecretName": jiraConnectionSecretName,
	})
}

// UpdateRunnerSecretsConfig handles PUT /api/projects/:projectName/runner-secrets/config
func UpdateRunnerSecretsConfig(c *gin.Context) {
	projectName := c.Param("projectName")
	_, reqDyn := GetK8sClientsForRequest(c)

	var req struct {
		SecretName               string `json:"secretName"`               // Legacy field, maps to RunnerSecretName
		RunnerSecretName         string `json:"runnerSecretName"`         // ANTHROPIC_API_KEY only
		GithubAuthSecretName     string `json:"githubAuthSecretName"`     // GIT_TOKEN, GIT_USER_NAME, GIT_USER_EMAIL
		JiraConnectionSecretName string `json:"jiraConnectionSecretName"` // JIRA_* keys
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Handle legacy secretName field
	if req.SecretName != "" && req.RunnerSecretName == "" {
		req.RunnerSecretName = req.SecretName
	}

	// Operator owns ProjectSettings. If it exists, update; otherwise, return not found.
	gvr := GetProjectSettingsResource()
	obj, err := reqDyn.Resource(gvr).Namespace(projectName).Get(c.Request.Context(), "projectsettings", v1.GetOptions{})
	if errors.IsNotFound(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "ProjectSettings not found. Ensure the namespace is labeled ambient-code.io/managed=true and wait for operator."})
		return
	}
	if err != nil {
		log.Printf("Failed to read ProjectSettings for %s: %v", projectName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read runner secrets config"})
		return
	}

	// Update spec with all three secret names
	spec, _ := obj.Object["spec"].(map[string]interface{})
	if spec == nil {
		spec = map[string]interface{}{}
		obj.Object["spec"] = spec
	}
	if req.RunnerSecretName != "" {
		spec["runnerSecretsName"] = req.RunnerSecretName
	}
	if req.GithubAuthSecretName != "" {
		spec["githubAuthSecretName"] = req.GithubAuthSecretName
	}
	if req.JiraConnectionSecretName != "" {
		spec["jiraConnectionSecretName"] = req.JiraConnectionSecretName
	}

	if _, err := reqDyn.Resource(gvr).Namespace(projectName).Update(c.Request.Context(), obj, v1.UpdateOptions{}); err != nil {
		log.Printf("Failed to update ProjectSettings for %s: %v", projectName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update runner secrets config"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"secretName":               req.RunnerSecretName, // Legacy
		"runnerSecretName":         req.RunnerSecretName,
		"githubAuthSecretName":     req.GithubAuthSecretName,
		"jiraConnectionSecretName": req.JiraConnectionSecretName,
	})
}

// ListRunnerSecrets handles GET /api/projects/:projectName/runner-secrets -> { data: { key: value } }
// Merges secrets from all three sources: runner-secret, github-auth, jira-connection
func ListRunnerSecrets(c *gin.Context) {
	projectName := c.Param("projectName")
	reqK8s, reqDyn := GetK8sClientsForRequest(c)

	// Read config to get all secret names
	gvr := GetProjectSettingsResource()
	obj, err := reqDyn.Resource(gvr).Namespace(projectName).Get(c.Request.Context(), "projectsettings", v1.GetOptions{})
	if err != nil && !errors.IsNotFound(err) {
		log.Printf("Failed to read ProjectSettings for %s: %v", projectName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read runner secrets config"})
		return
	}

	runnerSecretName := ""
	githubAuthSecretName := ""
	jiraConnectionSecretName := ""
	if obj != nil {
		if spec, ok := obj.Object["spec"].(map[string]interface{}); ok {
			if v, ok := spec["runnerSecretsName"].(string); ok {
				runnerSecretName = v
			}
			if v, ok := spec["githubAuthSecretName"].(string); ok {
				githubAuthSecretName = v
			}
			if v, ok := spec["jiraConnectionSecretName"].(string); ok {
				jiraConnectionSecretName = v
			}
		}
	}

	// Merge secrets from all three sources
	out := map[string]string{}

	// Helper to fetch and merge a secret
	fetchSecret := func(secretName string) {
		if secretName == "" {
			return
		}
		sec, err := reqK8s.CoreV1().Secrets(projectName).Get(c.Request.Context(), secretName, v1.GetOptions{})
		if err != nil {
			if !errors.IsNotFound(err) {
				log.Printf("Failed to get Secret %s/%s: %v", projectName, secretName, err)
			}
			return
		}
		for k, v := range sec.Data {
			out[k] = string(v)
		}
	}

	fetchSecret(runnerSecretName)
	fetchSecret(githubAuthSecretName)
	fetchSecret(jiraConnectionSecretName)

	c.JSON(http.StatusOK, gin.H{"data": out})
}

// UpdateRunnerSecrets handles PUT /api/projects/:projectName/runner-secrets { data: { key: value } }
// Splits data into appropriate secrets: runner-secret, github-auth, jira-connection
func UpdateRunnerSecrets(c *gin.Context) {
	projectName := c.Param("projectName")
	reqK8s, reqDyn := GetK8sClientsForRequest(c)

	var req struct {
		Data map[string]string `json:"data" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Read config for secret names
	gvr := GetProjectSettingsResource()
	obj, err := reqDyn.Resource(gvr).Namespace(projectName).Get(c.Request.Context(), "projectsettings", v1.GetOptions{})
	if err != nil && !errors.IsNotFound(err) {
		log.Printf("Failed to read ProjectSettings for %s: %v", projectName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read runner secrets config"})
		return
	}

	runnerSecretName := "ambient-runner-secrets"
	githubAuthSecretName := "github-auth"
	jiraConnectionSecretName := "jira-connection"
	if obj != nil {
		if spec, ok := obj.Object["spec"].(map[string]interface{}); ok {
			if v, ok := spec["runnerSecretsName"].(string); ok && strings.TrimSpace(v) != "" {
				runnerSecretName = strings.TrimSpace(v)
			}
			if v, ok := spec["githubAuthSecretName"].(string); ok && strings.TrimSpace(v) != "" {
				githubAuthSecretName = strings.TrimSpace(v)
			}
			if v, ok := spec["jiraConnectionSecretName"].(string); ok && strings.TrimSpace(v) != "" {
				jiraConnectionSecretName = strings.TrimSpace(v)
			}
		}
	}

	// Split data by key prefix
	runnerData := make(map[string]string)
	githubData := make(map[string]string)
	jiraData := make(map[string]string)

	for k, v := range req.Data {
		switch {
		case k == "ANTHROPIC_API_KEY":
			runnerData[k] = v
		case k == "GIT_TOKEN" || k == "GIT_USER_NAME" || k == "GIT_USER_EMAIL":
			githubData[k] = v
		case strings.HasPrefix(k, "JIRA_"):
			jiraData[k] = v
		default:
			// Unknown keys go to runner-secret for backwards compat
			runnerData[k] = v
		}
	}

	// Helper function to create or update a secret
	upsertSecret := func(secretName string, data map[string]string) error {
		if len(data) == 0 {
			return nil // Nothing to update
		}

		sec, err := reqK8s.CoreV1().Secrets(projectName).Get(c.Request.Context(), secretName, v1.GetOptions{})
		if errors.IsNotFound(err) {
			// Create new Secret
			newSec := &corev1.Secret{
				ObjectMeta: v1.ObjectMeta{
					Name:      secretName,
					Namespace: projectName,
					Labels:    map[string]string{"app": "ambient-runner-secrets"},
					Annotations: map[string]string{
						"ambient-code.io/runner-secret": "true",
					},
				},
				Type:       corev1.SecretTypeOpaque,
				StringData: data,
			}
			_, err := reqK8s.CoreV1().Secrets(projectName).Create(c.Request.Context(), newSec, v1.CreateOptions{})
			return err
		} else if err != nil {
			return err
		} else {
			// Update existing - replace Data
			sec.Type = corev1.SecretTypeOpaque
			sec.Data = map[string][]byte{}
			for k, v := range data {
				sec.Data[k] = []byte(v)
			}
			_, err := reqK8s.CoreV1().Secrets(projectName).Update(c.Request.Context(), sec, v1.UpdateOptions{})
			return err
		}
	}

	// Update all three secrets
	if err := upsertSecret(runnerSecretName, runnerData); err != nil {
		log.Printf("Failed to upsert runner secret %s/%s: %v", projectName, runnerSecretName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update runner secrets"})
		return
	}
	if err := upsertSecret(githubAuthSecretName, githubData); err != nil {
		log.Printf("Failed to upsert github auth secret %s/%s: %v", projectName, githubAuthSecretName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update github auth secrets"})
		return
	}
	if err := upsertSecret(jiraConnectionSecretName, jiraData); err != nil {
		log.Printf("Failed to upsert jira connection secret %s/%s: %v", projectName, jiraConnectionSecretName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update jira connection secrets"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "runner secrets updated"})
}
