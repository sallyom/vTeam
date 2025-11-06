package sessions

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"ambient-code-backend/handlers"
	"ambient-code-backend/types"

	"github.com/gin-gonic/gin"
	"k8s.io/apimachinery/pkg/api/errors"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

func CreateSession(c *gin.Context) {
	project := c.GetString("project")
	// Use backend service account clients for CR writes
	if DynamicClient == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "backend not initialized"})
		return
	}
	var req types.CreateAgenticSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validation for multi-repo can be added here if needed

	// Set defaults for LLM settings if not provided
	llmSettings := types.LLMSettings{
		Model:       "sonnet",
		Temperature: 0.7,
		MaxTokens:   4000,
	}
	if req.LLMSettings != nil {
		if req.LLMSettings.Model != "" {
			llmSettings.Model = req.LLMSettings.Model
		}
		if req.LLMSettings.Temperature != 0 {
			llmSettings.Temperature = req.LLMSettings.Temperature
		}
		if req.LLMSettings.MaxTokens != 0 {
			llmSettings.MaxTokens = req.LLMSettings.MaxTokens
		}
	}

	timeout := 300
	if req.Timeout != nil {
		timeout = *req.Timeout
	}

	// Generate unique name
	timestamp := time.Now().Unix()
	name := fmt.Sprintf("agentic-session-%d", timestamp)

	// Create the custom resource
	// Metadata
	metadata := map[string]interface{}{
		"name":      name,
		"namespace": project,
	}
	if len(req.Labels) > 0 {
		labels := map[string]interface{}{}
		for k, v := range req.Labels {
			labels[k] = v
		}
		metadata["labels"] = labels
	}
	if len(req.Annotations) > 0 {
		annotations := map[string]interface{}{}
		for k, v := range req.Annotations {
			annotations[k] = v
		}
		metadata["annotations"] = annotations
	}

	session := map[string]interface{}{
		"apiVersion": "vteam.ambient-code/v1alpha1",
		"kind":       "AgenticSession",
		"metadata":   metadata,
		"spec": map[string]interface{}{
			"prompt":      req.Prompt,
			"displayName": req.DisplayName,
			"project":     project,
			"llmSettings": map[string]interface{}{
				"model":       llmSettings.Model,
				"temperature": llmSettings.Temperature,
				"maxTokens":   llmSettings.MaxTokens,
			},
			"timeout": timeout,
		},
		"status": map[string]interface{}{
			"phase": "Pending",
		},
	}

	// Optional environment variables passthrough (always, independent of git config presence)
	envVars := make(map[string]string)
	for k, v := range req.EnvironmentVariables {
		envVars[k] = v
	}

	// Handle session continuation
	if req.ParentSessionID != "" {
		envVars["PARENT_SESSION_ID"] = req.ParentSessionID
		// Add annotation to track continuation lineage
		if metadata["annotations"] == nil {
			metadata["annotations"] = make(map[string]interface{})
		}
		annotations := metadata["annotations"].(map[string]interface{})
		annotations["vteam.ambient-code/parent-session-id"] = req.ParentSessionID
		log.Printf("Creating continuation session from parent %s", req.ParentSessionID)

		// Clean up temp-content pod from parent session to free the PVC
		// This prevents Multi-Attach errors when the new session tries to mount the same workspace
		reqK8s, _ := handlers.GetK8sClientsForRequest(c)
		if reqK8s != nil {
			tempPodName := fmt.Sprintf("temp-content-%s", req.ParentSessionID)
			if err := reqK8s.CoreV1().Pods(project).Delete(c.Request.Context(), tempPodName, v1.DeleteOptions{}); err != nil {
				if !errors.IsNotFound(err) {
					log.Printf("CreateSession: failed to delete temp-content pod %s (non-fatal): %v", tempPodName, err)
				}
			} else {
				log.Printf("CreateSession: deleted temp-content pod %s to free PVC for continuation", tempPodName)
			}
		}
	}

	if len(envVars) > 0 {
		spec := session["spec"].(map[string]interface{})
		spec["environmentVariables"] = envVars
	}

	// Interactive flag
	if req.Interactive != nil {
		session["spec"].(map[string]interface{})["interactive"] = *req.Interactive
	}

	// AutoPushOnComplete flag
	if req.AutoPushOnComplete != nil {
		session["spec"].(map[string]interface{})["autoPushOnComplete"] = *req.AutoPushOnComplete
	}

	// Set multi-repo configuration on spec
	{
		spec := session["spec"].(map[string]interface{})
		// Multi-repo pass-through (unified repos)
		if len(req.Repos) > 0 {
			arr := make([]map[string]interface{}, 0, len(req.Repos))
			for _, r := range req.Repos {
				m := map[string]interface{}{}
				in := map[string]interface{}{"url": r.Input.URL}
				if r.Input.Branch != nil {
					in["branch"] = *r.Input.Branch
				}
				m["input"] = in
				if r.Output != nil {
					out := map[string]interface{}{"url": r.Output.URL}
					if r.Output.Branch != nil {
						out["branch"] = *r.Output.Branch
					}
					m["output"] = out
				}
				// Remove default repo status; status will be set explicitly when pushed/abandoned
				// m["status"] intentionally unset at creation time
				arr = append(arr, m)
			}
			spec["repos"] = arr
		}
		if req.MainRepoIndex != nil {
			spec["mainRepoIndex"] = *req.MainRepoIndex
		}
	}

	// Handle RFE workflow branch management
	{
		rfeWorkflowID := ""
		// Check if RFE workflow ID is in labels
		if len(req.Labels) > 0 {
			if id, ok := req.Labels["rfe-workflow"]; ok {
				rfeWorkflowID = id
			}
		}

		// If linked to an RFE workflow, fetch it and set the branch
		if rfeWorkflowID != "" {
			// Get request-scoped dynamic client for fetching RFE workflow
			_, reqDyn := handlers.GetK8sClientsForRequest(c)
			if reqDyn != nil {
				rfeGvr := handlers.GetRFEWorkflowResource()
				if rfeGvr != (schema.GroupVersionResource{}) {
					rfeObj, err := reqDyn.Resource(rfeGvr).Namespace(project).Get(c.Request.Context(), rfeWorkflowID, v1.GetOptions{})
					if err == nil {
						rfeWf := handlers.RfeFromUnstructured(rfeObj)
						if rfeWf != nil && rfeWf.BranchName != "" {
							// Access spec from session object
							spec := session["spec"].(map[string]interface{})

							// Override branch for all repos to use feature branch
							if repos, ok := spec["repos"].([]map[string]interface{}); ok {
								for i := range repos {
									// Always override input branch with feature branch
									if input, ok := repos[i]["input"].(map[string]interface{}); ok {
										input["branch"] = rfeWf.BranchName
									}
									// Always override output branch with feature branch
									if output, ok := repos[i]["output"].(map[string]interface{}); ok {
										output["branch"] = rfeWf.BranchName
									}
								}
							}

							log.Printf("Set RFE branch %s for session %s", rfeWf.BranchName, name)
						}
					} else {
						log.Printf("Warning: Failed to fetch RFE workflow %s: %v", rfeWorkflowID, err)
					}
				}
			}
		}
	}

	// Add userContext derived from authenticated caller; ignore client-supplied userId
	{
		uidVal, _ := c.Get("userID")
		uid, _ := uidVal.(string)
		uid = strings.TrimSpace(uid)
		if uid != "" {
			displayName := ""
			if v, ok := c.Get("userName"); ok {
				if s, ok2 := v.(string); ok2 {
					displayName = s
				}
			}
			groups := []string{}
			if v, ok := c.Get("userGroups"); ok {
				if gg, ok2 := v.([]string); ok2 {
					groups = gg
				}
			}
			// Fallbacks for non-identity fields only
			if displayName == "" && req.UserContext != nil {
				displayName = req.UserContext.DisplayName
			}
			if len(groups) == 0 && req.UserContext != nil {
				groups = req.UserContext.Groups
			}
			session["spec"].(map[string]interface{})["userContext"] = map[string]interface{}{
				"userId":      uid,
				"displayName": displayName,
				"groups":      groups,
			}
		}
	}

	// Add botAccount if provided
	if req.BotAccount != nil {
		session["spec"].(map[string]interface{})["botAccount"] = map[string]interface{}{
			"name": req.BotAccount.Name,
		}
	}

	// Add resourceOverrides if provided
	if req.ResourceOverrides != nil {
		resourceOverrides := make(map[string]interface{})
		if req.ResourceOverrides.CPU != "" {
			resourceOverrides["cpu"] = req.ResourceOverrides.CPU
		}
		if req.ResourceOverrides.Memory != "" {
			resourceOverrides["memory"] = req.ResourceOverrides.Memory
		}
		if req.ResourceOverrides.StorageClass != "" {
			resourceOverrides["storageClass"] = req.ResourceOverrides.StorageClass
		}
		if req.ResourceOverrides.PriorityClass != "" {
			resourceOverrides["priorityClass"] = req.ResourceOverrides.PriorityClass
		}
		if len(resourceOverrides) > 0 {
			session["spec"].(map[string]interface{})["resourceOverrides"] = resourceOverrides
		}
	}

	gvr := GetAgenticSessionV1Alpha1Resource()
	obj := &unstructured.Unstructured{Object: session}

	created, err := DynamicClient.Resource(gvr).Namespace(project).Create(context.TODO(), obj, v1.CreateOptions{})
	if err != nil {
		log.Printf("Failed to create agentic session in project %s: %v", project, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create agentic session"})
		return
	}

	// Best-effort prefill of agent markdown into PVC workspace for immediate UI availability
	// Uses AGENT_PERSONAS or AGENT_PERSONA if provided in request environment variables
	func() {
		defer func() { _ = recover() }()
		personasCsv := ""
		if v, ok := req.EnvironmentVariables["AGENT_PERSONAS"]; ok && strings.TrimSpace(v) != "" {
			personasCsv = v
		} else if v, ok := req.EnvironmentVariables["AGENT_PERSONA"]; ok && strings.TrimSpace(v) != "" {
			personasCsv = v
		}
		if strings.TrimSpace(personasCsv) == "" {
			return
		}
		// content service removed; skip workspace path handling
		// Write each agent markdown
		for _, p := range strings.Split(personasCsv, ",") {
			persona := strings.TrimSpace(p)
			if persona == "" {
				continue
			}
			// ambient-content removed: skip agent prefill writes
		}
	}()

	// Preferred method: provision a per-session ServiceAccount token for the runner (backend SA)
	if err := ProvisionRunnerTokenForSession(c, K8sClient, DynamicClient, project, name); err != nil {
		// Non-fatal: log and continue. Operator may retry later if implemented.
		log.Printf("Warning: failed to provision runner token for session %s/%s: %v", project, name, err)
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Agentic session created successfully",
		"name":    name,
		"uid":     created.GetUID(),
	})
}
