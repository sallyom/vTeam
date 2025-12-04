package handlers

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"ambient-code-backend/types"

	"github.com/gin-gonic/gin"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"
)

// AddRepositoryRequest represents the request body for adding a repository to a session
type AddRepositoryRequest struct {
	Name  string                 `json:"name" binding:"required"`
	Input types.RepositoryInput  `json:"input" binding:"required"`
	Output *types.RepositoryOutput `json:"output,omitempty"`
}

// UpdateRepositoryRequest represents the request body for updating a repository
type UpdateRepositoryRequest struct {
	Input types.RepositoryInput `json:"input" binding:"required"`
}

// AddRepositoryToSession clones a new repository into an active session's workspace
// POST /api/projects/:projectName/agentic-sessions/:sessionName/repos
func AddRepositoryToSession(c *gin.Context) {
	projectName := c.Param("projectName")
	sessionName := c.Param("sessionName")

	// Get user-scoped K8s clients
	reqK8s, reqDyn := GetK8sClientsForRequest(c)
	if reqK8s == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or missing token"})
		c.Abort()
		return
	}

	// Parse request body
	var req AddRepositoryRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid request: %v", err)})
		return
	}

	// Validate repository name
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Repository name is required"})
		return
	}

	// Get session CR to verify it exists and user has access
	session, err := getAgenticSession(c.Request.Context(), reqDyn, projectName, sessionName)
	if err != nil {
		log.Printf("Failed to get session %s/%s: %v", projectName, sessionName, err)
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	// Check if session is in a state that allows adding repos
	status, _, _ := unstructured.NestedMap(session.Object, "status")
	phase := "Unknown"
	if status != nil {
		if p, ok := status["phase"].(string); ok {
			phase = p
		}
	}

	// Allow adding repos in Pending or Running states (not Completed/Failed/Stopped)
	allowedPhases := map[string]bool{
		"Pending": true,
		"Running": true,
	}
	if !allowedPhases[phase] {
		c.JSON(http.StatusConflict, gin.H{
			"error": fmt.Sprintf("Cannot add repository to session in %s phase. Session must be Pending or Running.", phase),
		})
		return
	}

	// Build repository for CR spec
	ctx := c.Request.Context()

	// Convert AddRepositoryRequest to Repository type
	newRepo := types.Repository{
		Name:   req.Name,
		Input:  req.Input,
		Output: req.Output,
	}

	// Add repository to session CR's spec.repos array
	// Runner/operator will handle the actual cloning
	log.Printf("Adding repository %s to session %s/%s CR spec", req.Name, projectName, sessionName)
	if err := addRepoToSessionSpec(ctx, projectName, sessionName, newRepo); err != nil {
		log.Printf("Failed to update session spec with new repo: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to add repository to session: %v", err),
		})
		return
	}

	log.Printf("Repository %s added to session %s/%s spec successfully", req.Name, projectName, sessionName)

	// Notify runner via WebSocket that context changed (if session is running)
	// Runner will clone the repository when it detects the spec change
	if phase == "Running" {
		baseBranch := req.Input.BaseBranch
		if baseBranch == "" {
			baseBranch = req.Input.Branch
		}
		if baseBranch == "" {
			baseBranch = "main"
		}
		notifyRunnerContextChanged(sessionName, "repo_added", map[string]interface{}{
			"name":   req.Name,
			"url":    req.Input.URL,
			"branch": baseBranch,
		})
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Repository added successfully",
		"name":    req.Name,
		"path":    req.Name, // Path relative to workspace
	})
}

// RemoveRepositoryFromSession removes a repository from a session's workspace
// DELETE /api/projects/:projectName/agentic-sessions/:sessionName/repos/:repoName
func RemoveRepositoryFromSession(c *gin.Context) {
	projectName := c.Param("projectName")
	sessionName := c.Param("sessionName")
	repoName := c.Param("repoName")

	// Get user-scoped K8s clients
	reqK8s, reqDyn := GetK8sClientsForRequest(c)
	if reqK8s == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or missing token"})
		c.Abort()
		return
	}

	// Validate repository name
	repoName = strings.TrimSpace(repoName)
	if repoName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Repository name is required"})
		return
	}

	// Get session CR to verify it exists and user has access
	session, err := getAgenticSession(c.Request.Context(), reqDyn, projectName, sessionName)
	if err != nil {
		log.Printf("Failed to get session %s/%s: %v", projectName, sessionName, err)
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	// Check session phase
	status, _, _ := unstructured.NestedMap(session.Object, "status")
	phase := "Unknown"
	if status != nil {
		if p, ok := status["phase"].(string); ok {
			phase = p
		}
	}

	// Get workspace path
	stateBaseDir := os.Getenv("STATE_BASE_DIR")
	if stateBaseDir == "" {
		stateBaseDir = "/workspace"
	}
	sessionWorkspacePath := filepath.Join(stateBaseDir, "sessions", sessionName, "workspace")
	repoPath := filepath.Join(sessionWorkspacePath, repoName)

	// Check if repository exists
	if _, err := os.Stat(repoPath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Repository not found in workspace"})
		return
	}

	// Remove repository directory
	if err := os.RemoveAll(repoPath); err != nil {
		log.Printf("Failed to remove repository %s: %v", repoName, err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to remove repository: %v", err),
		})
		return
	}

	// Update session CR's spec.repos array
	ctx := c.Request.Context()
	if err := removeRepoFromSessionSpec(ctx, projectName, sessionName, repoName); err != nil {
		log.Printf("Failed to update session spec after repo removal: %v", err)
		// Directory removed but spec not updated - log warning
		log.Printf("Warning: Repository %s removed but session spec not updated", repoName)
	}

	// Notify runner if session is running
	if phase == "Running" {
		notifyRunnerContextChanged(sessionName, "repo_removed", map[string]interface{}{
			"name": repoName,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Repository removed successfully",
		"name":    repoName,
	})
}

// ListSessionRepositories lists all repositories in a session's workspace
// GET /api/projects/:projectName/agentic-sessions/:sessionName/repos
func ListSessionRepositories(c *gin.Context) {
	projectName := c.Param("projectName")
	sessionName := c.Param("sessionName")

	// Get user-scoped K8s clients
	_, reqDyn := GetK8sClientsForRequest(c)
	if reqDyn == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or missing token"})
		c.Abort()
		return
	}

	// Get session CR to verify it exists and user has access
	session, err := getAgenticSession(c.Request.Context(), reqDyn, projectName, sessionName)
	if err != nil {
		log.Printf("Failed to get session %s/%s: %v", projectName, sessionName, err)
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	// Get repositories from spec
	spec, _, _ := unstructured.NestedMap(session.Object, "spec")
	reposInterface, found, _ := unstructured.NestedSlice(session.Object, "spec", "repos")

	repos := []types.Repository{}
	if found && reposInterface != nil {
		for _, r := range reposInterface {
			if repoMap, ok := r.(map[string]interface{}); ok {
				repo := types.Repository{}

				// Parse name
				if name, ok := repoMap["name"].(string); ok {
					repo.Name = name
				}

				// Parse input
				if inputMap, ok := repoMap["input"].(map[string]interface{}); ok {
					repo.Input = parseRepositoryInput(inputMap)
				}

				// Parse output
				if outputMap, ok := repoMap["output"].(map[string]interface{}); ok {
					output := parseRepositoryOutput(outputMap)
					repo.Output = &output
				}

				repos = append(repos, repo)
			}
		}
	}

	// Get workspace path to verify which repos are actually cloned
	stateBaseDir := os.Getenv("STATE_BASE_DIR")
	if stateBaseDir == "" {
		stateBaseDir = "/workspace"
	}
	sessionWorkspacePath := filepath.Join(stateBaseDir, "sessions", sessionName, "workspace")

	// Add status for each repo
	type RepoStatus struct {
		types.Repository
		Cloned bool `json:"cloned"`
	}

	repoStatuses := []RepoStatus{}
	for _, repo := range repos {
		repoPath := filepath.Join(sessionWorkspacePath, repo.Name)
		_, err := os.Stat(filepath.Join(repoPath, ".git"))
		cloned := err == nil

		repoStatuses = append(repoStatuses, RepoStatus{
			Repository: repo,
			Cloned:     cloned,
		})
	}

	// Also include spec for backward compatibility
	c.JSON(http.StatusOK, gin.H{
		"repos": repoStatuses,
		"spec":  spec,
	})
}

// Helper functions

func getAgenticSession(ctx context.Context, dynClient dynamic.Interface, projectName, sessionName string) (*unstructured.Unstructured, error) {
	gvr := GetAgenticSessionV1Alpha1Resource()
	return dynClient.Resource(gvr).Namespace(projectName).Get(ctx, sessionName, v1.GetOptions{})
}

func addRepoToSessionSpec(ctx context.Context, projectName, sessionName string, repo types.Repository) error {
	// Use backend service account client (DynamicClient) for CR writes
	gvr := GetAgenticSessionV1Alpha1Resource()

	// Get current session
	session, err := DynamicClient.Resource(gvr).Namespace(projectName).Get(ctx, sessionName, v1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get session: %w", err)
	}

	// Get or initialize spec.repos
	spec, found, _ := unstructured.NestedMap(session.Object, "spec")
	if !found || spec == nil {
		spec = make(map[string]interface{})
	}

	repos, found, _ := unstructured.NestedSlice(session.Object, "spec", "repos")
	if !found {
		repos = []interface{}{}
	}

	// Convert repo to map
	repoMap := map[string]interface{}{
		"name": repo.Name,
		"input": map[string]interface{}{
			"url": repo.Input.URL,
		},
	}

	// Add optional fields
	if repo.Input.Branch != "" {
		repoMap["input"].(map[string]interface{})["branch"] = repo.Input.Branch
	}
	if repo.Input.BaseBranch != "" {
		repoMap["input"].(map[string]interface{})["baseBranch"] = repo.Input.BaseBranch
	}
	if repo.Input.FeatureBranch != "" {
		repoMap["input"].(map[string]interface{})["featureBranch"] = repo.Input.FeatureBranch
	}
	if repo.Input.AllowProtectedWork {
		repoMap["input"].(map[string]interface{})["allowProtectedWork"] = true
	}
	if repo.Input.Sync != nil {
		repoMap["input"].(map[string]interface{})["sync"] = map[string]interface{}{
			"url":    repo.Input.Sync.URL,
			"branch": repo.Input.Sync.Branch,
		}
	}

	if repo.Output != nil {
		repoMap["output"] = map[string]interface{}{
			"url":    repo.Output.URL,
			"branch": repo.Output.Branch,
		}
	}

	// Append new repo
	repos = append(repos, repoMap)

	// Update session
	if err := unstructured.SetNestedSlice(session.Object, repos, "spec", "repos"); err != nil {
		return fmt.Errorf("failed to set repos: %w", err)
	}

	// Write back to API
	_, err = DynamicClient.Resource(gvr).Namespace(projectName).Update(ctx, session, v1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("failed to update session: %w", err)
	}

	return nil
}

func removeRepoFromSessionSpec(ctx context.Context, projectName, sessionName, repoName string) error {
	gvr := GetAgenticSessionV1Alpha1Resource()

	// Get current session
	session, err := DynamicClient.Resource(gvr).Namespace(projectName).Get(ctx, sessionName, v1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get session: %w", err)
	}

	// Get repos array
	repos, found, _ := unstructured.NestedSlice(session.Object, "spec", "repos")
	if !found {
		return nil // No repos to remove
	}

	// Filter out the repo
	newRepos := []interface{}{}
	for _, r := range repos {
		if repoMap, ok := r.(map[string]interface{}); ok {
			if name, ok := repoMap["name"].(string); ok && name != repoName {
				newRepos = append(newRepos, r)
			}
		}
	}

	// Update session
	if err := unstructured.SetNestedSlice(session.Object, newRepos, "spec", "repos"); err != nil {
		return fmt.Errorf("failed to set repos: %w", err)
	}

	// Write back to API
	_, err = DynamicClient.Resource(gvr).Namespace(projectName).Update(ctx, session, v1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("failed to update session: %w", err)
	}

	return nil
}

func parseRepositoryInput(inputMap map[string]interface{}) types.RepositoryInput {
	input := types.RepositoryInput{}

	if url, ok := inputMap["url"].(string); ok {
		input.URL = url
	}
	if branch, ok := inputMap["branch"].(string); ok {
		input.Branch = branch
	}
	if baseBranch, ok := inputMap["baseBranch"].(string); ok {
		input.BaseBranch = baseBranch
	}
	if featureBranch, ok := inputMap["featureBranch"].(string); ok {
		input.FeatureBranch = featureBranch
	}
	if allowProtectedWork, ok := inputMap["allowProtectedWork"].(bool); ok {
		input.AllowProtectedWork = allowProtectedWork
	}
	if syncMap, ok := inputMap["sync"].(map[string]interface{}); ok {
		sync := &types.RepositorySync{}
		if url, ok := syncMap["url"].(string); ok {
			sync.URL = url
		}
		if branch, ok := syncMap["branch"].(string); ok {
			sync.Branch = branch
		}
		input.Sync = sync
	}

	return input
}

func parseRepositoryOutput(outputMap map[string]interface{}) types.RepositoryOutput {
	output := types.RepositoryOutput{}

	if url, ok := outputMap["url"].(string); ok {
		output.URL = url
	}
	if branch, ok := outputMap["branch"].(string); ok {
		output.Branch = branch
	}

	return output
}

func notifyRunnerContextChanged(sessionName string, eventType string, payload map[string]interface{}) {
	// TODO: Send WebSocket message to runner pod
	// This will be implemented when we add WebSocket support for runner notifications
	log.Printf("Context change notification for session %s: %s %v", sessionName, eventType, payload)
}
