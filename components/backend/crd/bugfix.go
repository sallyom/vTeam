package crd

import (
	"context"
	"fmt"
	"log"

	"ambient-code-backend/types"

	"k8s.io/apimachinery/pkg/api/errors"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
)

// GetBugFixWorkflowResourceFunc is a function type that returns the BugFixWorkflow GVR
type GetBugFixWorkflowResourceFunc func() schema.GroupVersionResource

// GetBugFixWorkflowResource is set by main package
var GetBugFixWorkflowResource GetBugFixWorkflowResourceFunc

// BugFixWorkflowToCRObject converts a BugFixWorkflow to a Kubernetes CR object
func BugFixWorkflowToCRObject(workflow *types.BugFixWorkflow) map[string]interface{} {
	// Build spec
	spec := map[string]interface{}{
		"githubIssueNumber": workflow.GithubIssueNumber,
		"githubIssueURL":    workflow.GithubIssueURL,
		"title":             workflow.Title,
		"description":       workflow.Description,
		"branchName":        workflow.BranchName,
		"workspacePath":     workflow.WorkspacePath,
	}

	// Optional fields
	if workflow.JiraTaskKey != nil && *workflow.JiraTaskKey != "" {
		spec["jiraTaskKey"] = *workflow.JiraTaskKey
	}
	if workflow.JiraTaskURL != nil && *workflow.JiraTaskURL != "" {
		spec["jiraTaskURL"] = *workflow.JiraTaskURL
	}
	if workflow.LastSyncedAt != nil && *workflow.LastSyncedAt != "" {
		spec["lastSyncedAt"] = *workflow.LastSyncedAt
	}
	if workflow.CreatedBy != "" {
		spec["createdBy"] = workflow.CreatedBy
	}

	// Implementation repo (required)
	implRepo := map[string]interface{}{"url": workflow.ImplementationRepo.URL}
	if workflow.ImplementationRepo.Branch != nil {
		implRepo["branch"] = *workflow.ImplementationRepo.Branch
	}
	spec["implementationRepo"] = implRepo

	// Build status
	status := map[string]interface{}{
		"phase":                   workflow.Phase,
		"message":                 workflow.Message,
		"implementationCompleted": workflow.ImplementationCompleted,
	}

	// Build labels
	labels := map[string]string{
		"project":             workflow.Project,
		"bugfix-workflow":     workflow.ID,
		"bugfix-issue-number": fmt.Sprintf("%d", workflow.GithubIssueNumber),
	}

	// Build metadata
	metadata := map[string]interface{}{
		"name":      workflow.ID,
		"namespace": workflow.Project,
		"labels":    labels,
	}

	// Add annotations if present
	if len(workflow.Annotations) > 0 {
		metadata["annotations"] = workflow.Annotations
	}

	return map[string]interface{}{
		"apiVersion": "vteam.ambient-code/v1alpha1",
		"kind":       "BugFixWorkflow",
		"metadata":   metadata,
		"spec":       spec,
		"status":     status,
	}
}

// GetProjectBugFixWorkflowCR retrieves a BugFixWorkflow custom resource by ID
func GetProjectBugFixWorkflowCR(dyn dynamic.Interface, project, id string) (*types.BugFixWorkflow, error) {
	if dyn == nil {
		return nil, fmt.Errorf("no dynamic client provided")
	}
	if project == "" || id == "" {
		return nil, fmt.Errorf("project and id are required")
	}

	gvr := GetBugFixWorkflowResource()
	obj, err := dyn.Resource(gvr).Namespace(project).Get(context.TODO(), id, v1.GetOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			return nil, nil // Not found is not an error
		}
		return nil, fmt.Errorf("failed to get BugFixWorkflow CR: %v", err)
	}

	// Parse the unstructured object into BugFixWorkflow
	workflow := &types.BugFixWorkflow{
		ID:      id,
		Project: project,
	}

	spec, found, _ := unstructured.NestedMap(obj.Object, "spec")
	if found {
		// Parse githubIssueNumber with type safety - handle both int64 and float64
		// JSON unmarshaling can produce either depending on the source
		if val, ok := spec["githubIssueNumber"].(int64); ok {
			workflow.GithubIssueNumber = int(val)
		} else if val, ok := spec["githubIssueNumber"].(float64); ok {
			workflow.GithubIssueNumber = int(val)
		} else if spec["githubIssueNumber"] != nil {
			// Log warning if type assertion fails - helps debug unexpected types
			log.Printf("Warning: githubIssueNumber has unexpected type %T in BugFixWorkflow %s/%s",
				spec["githubIssueNumber"], project, id)
		}
		if val, ok := spec["githubIssueURL"].(string); ok {
			workflow.GithubIssueURL = val
		}
		if val, ok := spec["title"].(string); ok {
			workflow.Title = val
		}
		if val, ok := spec["description"].(string); ok {
			workflow.Description = val
		}
		if val, ok := spec["branchName"].(string); ok {
			workflow.BranchName = val
		}
		if val, ok := spec["workspacePath"].(string); ok {
			workflow.WorkspacePath = val
		}
		if val, ok := spec["createdBy"].(string); ok {
			workflow.CreatedBy = val
		}
		if val, ok := spec["jiraTaskKey"].(string); ok && val != "" {
			workflow.JiraTaskKey = &val
		}
		if val, ok := spec["jiraTaskURL"].(string); ok && val != "" {
			workflow.JiraTaskURL = &val
		}
		if val, ok := spec["lastSyncedAt"].(string); ok && val != "" {
			workflow.LastSyncedAt = &val
		}

		// Parse implementationRepo (required field)
		if implMap, ok := spec["implementationRepo"].(map[string]interface{}); ok {
			repo := types.GitRepository{}
			if url, ok := implMap["url"].(string); ok && url != "" {
				repo.URL = url
			} else {
				// Critical field missing - return error instead of zero value
				return nil, fmt.Errorf("BugFixWorkflow %s/%s missing required field: implementationRepo.url", project, id)
			}
			if branch, ok := implMap["branch"].(string); ok && branch != "" {
				repo.Branch = &branch
			}
			workflow.ImplementationRepo = repo
		} else {
			// implementationRepo is required
			return nil, fmt.Errorf("BugFixWorkflow %s/%s missing required field: implementationRepo", project, id)
		}
	}

	// Parse status
	status, found, _ := unstructured.NestedMap(obj.Object, "status")
	if found {
		if val, ok := status["phase"].(string); ok {
			workflow.Phase = val
		}
		if val, ok := status["message"].(string); ok {
			workflow.Message = val
		}
		if val, ok := status["implementationCompleted"].(bool); ok {
			workflow.ImplementationCompleted = val
		}
	}

	// Parse metadata timestamps and annotations
	if metadata, found, _ := unstructured.NestedMap(obj.Object, "metadata"); found {
		if creationTimestamp, ok := metadata["creationTimestamp"].(string); ok {
			workflow.CreatedAt = creationTimestamp
		}
		// Parse annotations
		if annotations, ok := metadata["annotations"].(map[string]interface{}); ok {
			workflow.Annotations = make(map[string]string)
			for k, v := range annotations {
				if strVal, ok := v.(string); ok {
					workflow.Annotations[k] = strVal
				}
			}
		}
	}

	return workflow, nil
}

// ListProjectBugFixWorkflowCRs lists all BugFixWorkflow custom resources in a project
func ListProjectBugFixWorkflowCRs(dyn dynamic.Interface, project string) ([]types.BugFixWorkflow, error) {
	if dyn == nil {
		return nil, fmt.Errorf("no dynamic client provided")
	}
	if project == "" {
		return nil, fmt.Errorf("project is required")
	}

	gvr := GetBugFixWorkflowResource()
	list, err := dyn.Resource(gvr).Namespace(project).List(context.TODO(), v1.ListOptions{
		LabelSelector: fmt.Sprintf("project=%s", project),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list BugFixWorkflow CRs: %v", err)
	}

	workflows := make([]types.BugFixWorkflow, 0, len(list.Items))
	for _, item := range list.Items {
		id := item.GetName()
		workflow, err := GetProjectBugFixWorkflowCR(dyn, project, id)
		if err != nil {
			continue // Skip items that fail to parse
		}
		if workflow != nil {
			workflows = append(workflows, *workflow)
		}
	}

	return workflows, nil
}

// UpsertProjectBugFixWorkflowCR creates or updates a BugFixWorkflow custom resource
func UpsertProjectBugFixWorkflowCR(dyn dynamic.Interface, workflow *types.BugFixWorkflow) error {
	if workflow.Project == "" {
		// Only manage CRD for project-scoped workflows
		return nil
	}
	if dyn == nil {
		return fmt.Errorf("no dynamic client provided")
	}

	gvr := GetBugFixWorkflowResource()

	// Try to get existing CR first to check if it exists and preserve metadata
	existing, err := dyn.Resource(gvr).Namespace(workflow.Project).Get(context.TODO(), workflow.ID, v1.GetOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			// CR doesn't exist, create it
			obj := &unstructured.Unstructured{Object: BugFixWorkflowToCRObject(workflow)}
			_, err := dyn.Resource(gvr).Namespace(workflow.Project).Create(context.TODO(), obj, v1.CreateOptions{})
			if err != nil {
				return fmt.Errorf("failed to create BugFixWorkflow CR: %v", err)
			}
			return nil
		}
		return fmt.Errorf("failed to get BugFixWorkflow CR: %v", err)
	}

	// CR exists, update it while preserving critical metadata
	obj := &unstructured.Unstructured{Object: BugFixWorkflowToCRObject(workflow)}

	// Preserve metadata from existing CR (resourceVersion is required for updates)
	obj.SetResourceVersion(existing.GetResourceVersion())
	obj.SetUID(existing.GetUID())
	obj.SetCreationTimestamp(existing.GetCreationTimestamp())

	// Preserve existing annotations and merge with new ones
	existingAnnotations := existing.GetAnnotations()
	if existingAnnotations == nil {
		existingAnnotations = make(map[string]string)
	}
	// Merge workflow.Annotations into existing annotations
	if workflow.Annotations != nil {
		for k, v := range workflow.Annotations {
			existingAnnotations[k] = v
		}
	}
	obj.SetAnnotations(existingAnnotations)

	_, err = dyn.Resource(gvr).Namespace(workflow.Project).Update(context.TODO(), obj, v1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("failed to update BugFixWorkflow CR: %v", err)
	}
	return nil
}

// DeleteProjectBugFixWorkflowCR deletes a BugFixWorkflow custom resource
func DeleteProjectBugFixWorkflowCR(dyn dynamic.Interface, project, id string) error {
	if dyn == nil {
		return fmt.Errorf("no dynamic client provided")
	}
	if project == "" || id == "" {
		return fmt.Errorf("project and id are required")
	}

	gvr := GetBugFixWorkflowResource()
	err := dyn.Resource(gvr).Namespace(project).Delete(context.TODO(), id, v1.DeleteOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			return nil // Already deleted is not an error
		}
		return fmt.Errorf("failed to delete BugFixWorkflow CR: %v", err)
	}
	return nil
}

// UpdateBugFixWorkflowStatus updates only the status subresource of a BugFixWorkflow CR
func UpdateBugFixWorkflowStatus(dyn dynamic.Interface, workflow *types.BugFixWorkflow) error {
	if workflow.Project == "" || workflow.ID == "" {
		return fmt.Errorf("project and id are required")
	}
	if dyn == nil {
		return fmt.Errorf("no dynamic client provided")
	}

	gvr := GetBugFixWorkflowResource()

	// Get current CR
	obj, err := dyn.Resource(gvr).Namespace(workflow.Project).Get(context.TODO(), workflow.ID, v1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get BugFixWorkflow for status update: %v", err)
	}

	// Update status fields
	status := map[string]interface{}{
		"phase":                   workflow.Phase,
		"message":                 workflow.Message,
		"implementationCompleted": workflow.ImplementationCompleted,
	}
	obj.Object["status"] = status

	// Update the status subresource
	_, err = dyn.Resource(gvr).Namespace(workflow.Project).UpdateStatus(context.TODO(), obj, v1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("failed to update BugFixWorkflow status: %v", err)
	}

	return nil
}
