package sessions

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/gin-gonic/gin"
	rbacv1 "k8s.io/api/rbac/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
)

// Package-level variables for session handlers (set from main package)
var (
	GetAgenticSessionV1Alpha1Resource func() schema.GroupVersionResource
	DynamicClient                     dynamic.Interface
	K8sClient                         *kubernetes.Clientset
	GetGitHubToken                    func(context.Context, *kubernetes.Clientset, dynamic.Interface, string, string) (string, error)
	DeriveRepoFolderFromURL           func(string) string
)

// setRepoStatus updates status.repos[idx] with status and diff info
func setRepoStatus(dyn dynamic.Interface, project, sessionName string, repoIndex int, newStatus string) error {
	gvr := GetAgenticSessionV1Alpha1Resource()
	item, err := dyn.Resource(gvr).Namespace(project).Get(context.TODO(), sessionName, v1.GetOptions{})
	if err != nil {
		return err
	}

	// Get repo name from spec.repos[repoIndex]
	spec, _ := item.Object["spec"].(map[string]interface{})
	specRepos, _ := spec["repos"].([]interface{})
	if repoIndex < 0 || repoIndex >= len(specRepos) {
		return fmt.Errorf("repo index out of range")
	}
	specRepo, _ := specRepos[repoIndex].(map[string]interface{})
	repoName := ""
	if name, ok := specRepo["name"].(string); ok {
		repoName = name
	} else if input, ok := specRepo["input"].(map[string]interface{}); ok {
		if url, ok := input["url"].(string); ok {
			repoName = DeriveRepoFolderFromURL(url)
		}
	}
	if repoName == "" {
		repoName = fmt.Sprintf("repo-%d", repoIndex)
	}

	// Ensure status.repos exists
	if item.Object["status"] == nil {
		item.Object["status"] = make(map[string]interface{})
	}
	status := item.Object["status"].(map[string]interface{})
	statusRepos, _ := status["repos"].([]interface{})
	if statusRepos == nil {
		statusRepos = []interface{}{}
	}

	// Find or create status entry for this repo
	repoStatus := map[string]interface{}{
		"name":         repoName,
		"status":       newStatus,
		"last_updated": time.Now().Format(time.RFC3339),
	}

	// Update existing or append new
	found := false
	for i, r := range statusRepos {
		if rm, ok := r.(map[string]interface{}); ok {
			if n, ok := rm["name"].(string); ok && n == repoName {
				rm["status"] = newStatus
				rm["last_updated"] = time.Now().Format(time.RFC3339)
				statusRepos[i] = rm
				found = true
				break
			}
		}
	}
	if !found {
		statusRepos = append(statusRepos, repoStatus)
	}

	status["repos"] = statusRepos
	item.Object["status"] = status

	updated, err := dyn.Resource(gvr).Namespace(project).UpdateStatus(context.TODO(), item, v1.UpdateOptions{})
	if err != nil {
		log.Printf("setRepoStatus: update failed project=%s session=%s repoIndex=%d status=%s err=%v", project, sessionName, repoIndex, newStatus, err)
		return err
	}
	if updated != nil {
		log.Printf("setRepoStatus: update ok project=%s session=%s repo=%s status=%s", project, sessionName, repoName, newStatus)
	}
	return nil
}

// ensureRunnerRolePermissions updates the runner role to ensure it has all required permissions
// This is useful for existing sessions that were created before we added new permissions
func ensureRunnerRolePermissions(c *gin.Context, reqK8s *kubernetes.Clientset, project string, sessionName string) error {
	roleName := fmt.Sprintf("ambient-session-%s-role", sessionName)

	// Get existing role
	existingRole, err := reqK8s.RbacV1().Roles(project).Get(c.Request.Context(), roleName, v1.GetOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			log.Printf("Role %s not found for session %s - will be created by operator", roleName, sessionName)
			return nil
		}
		return fmt.Errorf("get role: %w", err)
	}

	// Check if role has selfsubjectaccessreviews permission
	hasSelfSubjectAccessReview := false
	for _, rule := range existingRole.Rules {
		for _, apiGroup := range rule.APIGroups {
			if apiGroup == "authorization.k8s.io" {
				for _, resource := range rule.Resources {
					if resource == "selfsubjectaccessreviews" {
						hasSelfSubjectAccessReview = true
						break
					}
				}
			}
		}
	}

	if hasSelfSubjectAccessReview {
		log.Printf("Role %s already has selfsubjectaccessreviews permission", roleName)
		return nil
	}

	// Add missing permission
	log.Printf("Updating role %s to add selfsubjectaccessreviews permission", roleName)
	existingRole.Rules = append(existingRole.Rules, rbacv1.PolicyRule{
		APIGroups: []string{"authorization.k8s.io"},
		Resources: []string{"selfsubjectaccessreviews"},
		Verbs:     []string{"create"},
	})

	_, err = reqK8s.RbacV1().Roles(project).Update(c.Request.Context(), existingRole, v1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("update role: %w", err)
	}

	log.Printf("Successfully updated role %s with selfsubjectaccessreviews permission", roleName)
	return nil
}
