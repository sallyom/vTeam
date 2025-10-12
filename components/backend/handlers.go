package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	authnv1 "k8s.io/api/authentication/v1"
	authv1 "k8s.io/api/authorization/v1"
	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
)

// feature flags and small helpers
var (
	boolPtr = func(b bool) *bool { return &b }
)

// getK8sClientsForRequest returns K8s typed and dynamic clients using the caller's token when provided.
// It supports both Authorization: Bearer and X-Forwarded-Access-Token and NEVER falls back to the backend service account.
// Returns nil, nil if no valid user token is provided - all API operations require user authentication.
func getK8sClientsForRequest(c *gin.Context) (*kubernetes.Clientset, dynamic.Interface) {
	// Prefer Authorization header (Bearer <token>)
	rawAuth := c.GetHeader("Authorization")
	rawFwd := c.GetHeader("X-Forwarded-Access-Token")
	tokenSource := "none"
	token := rawAuth

	if token != "" {
		tokenSource = "authorization"
		parts := strings.SplitN(token, " ", 2)
		if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
			token = strings.TrimSpace(parts[1])
		} else {
			token = strings.TrimSpace(token)
		}
	}
	// Fallback to X-Forwarded-Access-Token
	if token == "" {
		if rawFwd != "" {
			tokenSource = "x-forwarded-access-token"
		}
		token = rawFwd
	}

	// Debug: basic auth header state (do not log token)
	hasAuthHeader := strings.TrimSpace(rawAuth) != ""
	hasFwdToken := strings.TrimSpace(rawFwd) != ""

	if token != "" && baseKubeConfig != nil {
		cfg := *baseKubeConfig
		cfg.BearerToken = token
		// Ensure we do NOT fall back to the in-cluster SA token or other auth providers
		cfg.BearerTokenFile = ""
		cfg.AuthProvider = nil
		cfg.ExecProvider = nil
		cfg.Username = ""
		cfg.Password = ""

		kc, err1 := kubernetes.NewForConfig(&cfg)
		dc, err2 := dynamic.NewForConfig(&cfg)

		if err1 == nil && err2 == nil {

			// Best-effort update last-used for service account tokens
			updateAccessKeyLastUsedAnnotation(c)
			return kc, dc
		}
		// Token provided but client build failed – treat as invalid token
		log.Printf("Failed to build user-scoped k8s clients (source=%s tokenLen=%d) typedErr=%v dynamicErr=%v for %s", tokenSource, len(token), err1, err2, c.FullPath())
		return nil, nil
	} else {
		// No token provided
		log.Printf("No user token found for %s (hasAuthHeader=%t hasFwdToken=%t)", c.FullPath(), hasAuthHeader, hasFwdToken)
		return nil, nil
	}
}

// updateAccessKeyLastUsedAnnotation attempts to update the ServiceAccount's last-used annotation
// when the incoming token is a ServiceAccount JWT. Uses the backend service account client strictly
// for this telemetry update and only for SAs labeled app=ambient-access-key. Best-effort; errors ignored.
func updateAccessKeyLastUsedAnnotation(c *gin.Context) {
	// Parse Authorization header
	rawAuth := c.GetHeader("Authorization")
	parts := strings.SplitN(rawAuth, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return
	}
	token := strings.TrimSpace(parts[1])
	if token == "" {
		return
	}

	// Decode JWT payload (second segment)
	segs := strings.Split(token, ".")
	if len(segs) < 2 {
		return
	}
	payloadB64 := segs[1]
	// JWT uses base64url without padding; add padding if necessary
	if m := len(payloadB64) % 4; m != 0 {
		payloadB64 += strings.Repeat("=", 4-m)
	}
	data, err := base64.URLEncoding.DecodeString(payloadB64)
	if err != nil {
		return
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(data, &payload); err != nil {
		return
	}
	// Expect sub like: system:serviceaccount:<namespace>:<sa-name>
	sub, _ := payload["sub"].(string)
	const prefix = "system:serviceaccount:"
	if !strings.HasPrefix(sub, prefix) {
		return
	}
	rest := strings.TrimPrefix(sub, prefix)
	parts2 := strings.SplitN(rest, ":", 2)
	if len(parts2) != 2 {
		return
	}
	ns := parts2[0]
	saName := parts2[1]

	// Backend client must exist
	if k8sClient == nil {
		return
	}

	// Ensure the SA is an Ambient access key (label check) before writing
	saObj, err := k8sClient.CoreV1().ServiceAccounts(ns).Get(c.Request.Context(), saName, v1.GetOptions{})
	if err != nil {
		return
	}
	if saObj.Labels == nil || saObj.Labels["app"] != "ambient-access-key" {
		return
	}

	// Patch the annotation
	now := time.Now().Format(time.RFC3339)
	patch := map[string]interface{}{
		"metadata": map[string]interface{}{
			"annotations": map[string]string{
				"ambient-code.io/last-used-at": now,
			},
		},
	}
	b, err := json.Marshal(patch)
	if err != nil {
		return
	}
	_, err = k8sClient.CoreV1().ServiceAccounts(ns).Patch(c.Request.Context(), saName, types.MergePatchType, b, v1.PatchOptions{})
	if err != nil && !errors.IsNotFound(err) {
		log.Printf("Failed to update last-used annotation for SA %s/%s: %v", ns, saName, err)
	}
}

// extractServiceAccountFromAuth extracts namespace and ServiceAccount name from the Authorization Bearer JWT 'sub' claim
// Returns (namespace, saName, true) when a SA subject is present, otherwise ("","",false)
func extractServiceAccountFromAuth(c *gin.Context) (string, string, bool) {
	rawAuth := c.GetHeader("Authorization")
	parts := strings.SplitN(rawAuth, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return "", "", false
	}
	token := strings.TrimSpace(parts[1])
	if token == "" {
		return "", "", false
	}
	segs := strings.Split(token, ".")
	if len(segs) < 2 {
		return "", "", false
	}
	payloadB64 := segs[1]
	if m := len(payloadB64) % 4; m != 0 {
		payloadB64 += strings.Repeat("=", 4-m)
	}
	data, err := base64.URLEncoding.DecodeString(payloadB64)
	if err != nil {
		return "", "", false
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(data, &payload); err != nil {
		return "", "", false
	}
	sub, _ := payload["sub"].(string)
	const prefix = "system:serviceaccount:"
	if !strings.HasPrefix(sub, prefix) {
		return "", "", false
	}
	rest := strings.TrimPrefix(sub, prefix)
	parts2 := strings.SplitN(rest, ":", 2)
	if len(parts2) != 2 {
		return "", "", false
	}
	return parts2[0], parts2[1], true
}

// Middleware for project context validation
func validateProjectContext() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Allow token via query parameter for websocket/agent callers
		if c.GetHeader("Authorization") == "" && c.GetHeader("X-Forwarded-Access-Token") == "" {
			if qp := strings.TrimSpace(c.Query("token")); qp != "" {
				c.Request.Header.Set("Authorization", "Bearer "+qp)
			}
		}
		// Require user/API key token; do not fall back to service account
		if c.GetHeader("Authorization") == "" && c.GetHeader("X-Forwarded-Access-Token") == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "User token required"})
			c.Abort()
			return
		}
		reqK8s, _ := getK8sClientsForRequest(c)
		if reqK8s == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or missing token"})
			c.Abort()
			return
		}
		// Prefer project from route param; fallback to header for backward compatibility
		projectHeader := c.Param("projectName")
		if projectHeader == "" {
			projectHeader = c.GetHeader("X-OpenShift-Project")
		}
		if projectHeader == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Project is required in path /api/projects/:projectName or X-OpenShift-Project header"})
			c.Abort()
			return
		}

		// Ensure the caller has at least list permission on agenticsessions in the namespace
		ssar := &authv1.SelfSubjectAccessReview{
			Spec: authv1.SelfSubjectAccessReviewSpec{
				ResourceAttributes: &authv1.ResourceAttributes{
					Group:     "vteam.ambient-code",
					Resource:  "agenticsessions",
					Verb:      "list",
					Namespace: projectHeader,
				},
			},
		}
		res, err := reqK8s.AuthorizationV1().SelfSubjectAccessReviews().Create(c.Request.Context(), ssar, v1.CreateOptions{})
		if err != nil {
			log.Printf("validateProjectContext: SSAR failed for %s: %v", projectHeader, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to perform access review"})
			c.Abort()
			return
		}
		if !res.Status.Allowed {
			c.JSON(http.StatusForbidden, gin.H{"error": "Unauthorized to access project"})
			c.Abort()
			return
		}

		// Store project in context for handlers
		c.Set("project", projectHeader)
		c.Next()
	}
}

// accessCheck verifies if the caller has write access to ProjectSettings in the project namespace
// It performs a Kubernetes SelfSubjectAccessReview using the caller token (user or API key).
func accessCheck(c *gin.Context) {
	projectName := c.Param("projectName")
	reqK8s, _ := getK8sClientsForRequest(c)

	// Build the SSAR spec for RoleBinding management in the project namespace
	ssar := &authv1.SelfSubjectAccessReview{
		Spec: authv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authv1.ResourceAttributes{
				Group:     "rbac.authorization.k8s.io",
				Resource:  "rolebindings",
				Verb:      "create",
				Namespace: projectName,
			},
		},
	}

	// Perform the review
	res, err := reqK8s.AuthorizationV1().SelfSubjectAccessReviews().Create(c.Request.Context(), ssar, v1.CreateOptions{})
	if err != nil {
		log.Printf("SSAR failed for project %s: %v", projectName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to perform access review"})
		return
	}

	role := "view"
	if res.Status.Allowed {
		// If update on ProjectSettings is allowed, treat as admin for this page
		role = "admin"
	} else {
		// Optional: try a lesser check for create sessions to infer "edit"
		editSSAR := &authv1.SelfSubjectAccessReview{
			Spec: authv1.SelfSubjectAccessReviewSpec{
				ResourceAttributes: &authv1.ResourceAttributes{
					Group:     "vteam.ambient-code",
					Resource:  "agenticsessions",
					Verb:      "create",
					Namespace: projectName,
				},
			},
		}
		res2, err2 := reqK8s.AuthorizationV1().SelfSubjectAccessReviews().Create(c.Request.Context(), editSSAR, v1.CreateOptions{})
		if err2 == nil && res2.Status.Allowed {
			role = "edit"
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"project":  projectName,
		"allowed":  res.Status.Allowed,
		"reason":   res.Status.Reason,
		"userRole": role,
	})
}

// parseSpec parses AgenticSessionSpec with v1alpha1 fields
func parseSpec(spec map[string]interface{}) AgenticSessionSpec {
	result := AgenticSessionSpec{}

	if prompt, ok := spec["prompt"].(string); ok {
		result.Prompt = prompt
	}

	if interactive, ok := spec["interactive"].(bool); ok {
		result.Interactive = interactive
	}

	if displayName, ok := spec["displayName"].(string); ok {
		result.DisplayName = displayName
	}

	if project, ok := spec["project"].(string); ok {
		result.Project = project
	}

	if timeout, ok := spec["timeout"].(float64); ok {
		result.Timeout = int(timeout)
	}

	if llmSettings, ok := spec["llmSettings"].(map[string]interface{}); ok {
		if model, ok := llmSettings["model"].(string); ok {
			result.LLMSettings.Model = model
		}
		if temperature, ok := llmSettings["temperature"].(float64); ok {
			result.LLMSettings.Temperature = temperature
		}
		if maxTokens, ok := llmSettings["maxTokens"].(float64); ok {
			result.LLMSettings.MaxTokens = int(maxTokens)
		}
	}

	// environmentVariables passthrough
	if env, ok := spec["environmentVariables"].(map[string]interface{}); ok {
		resultEnv := make(map[string]string, len(env))
		for k, v := range env {
			if s, ok := v.(string); ok {
				resultEnv[k] = s
			}
		}
		if len(resultEnv) > 0 {
			result.EnvironmentVariables = resultEnv
		}
	}

	if userContext, ok := spec["userContext"].(map[string]interface{}); ok {
		uc := &UserContext{}
		if userID, ok := userContext["userId"].(string); ok {
			uc.UserID = userID
		}
		if displayName, ok := userContext["displayName"].(string); ok {
			uc.DisplayName = displayName
		}
		if groups, ok := userContext["groups"].([]interface{}); ok {
			for _, group := range groups {
				if groupStr, ok := group.(string); ok {
					uc.Groups = append(uc.Groups, groupStr)
				}
			}
		}
		result.UserContext = uc
	}

	if botAccount, ok := spec["botAccount"].(map[string]interface{}); ok {
		ba := &BotAccountRef{}
		if name, ok := botAccount["name"].(string); ok {
			ba.Name = name
		}
		result.BotAccount = ba
	}

	if resourceOverrides, ok := spec["resourceOverrides"].(map[string]interface{}); ok {
		ro := &ResourceOverrides{}
		if cpu, ok := resourceOverrides["cpu"].(string); ok {
			ro.CPU = cpu
		}
		if memory, ok := resourceOverrides["memory"].(string); ok {
			ro.Memory = memory
		}
		if storageClass, ok := resourceOverrides["storageClass"].(string); ok {
			ro.StorageClass = storageClass
		}
		if priorityClass, ok := resourceOverrides["priorityClass"].(string); ok {
			ro.PriorityClass = priorityClass
		}
		result.ResourceOverrides = ro
	}

	// Multi-repo parsing (unified repos)
	if arr, ok := spec["repos"].([]interface{}); ok {
		repos := make([]SessionRepoMapping, 0, len(arr))
		for _, it := range arr {
			m, ok := it.(map[string]interface{})
			if !ok {
				continue
			}
			r := SessionRepoMapping{}
			if in, ok := m["input"].(map[string]interface{}); ok {
				ng := NamedGitRepo{}
				if s, ok := in["url"].(string); ok {
					ng.URL = s
				}
				if s, ok := in["branch"].(string); ok && strings.TrimSpace(s) != "" {
					ng.Branch = stringPtr(s)
				}
				r.Input = ng
			}
			if out, ok := m["output"].(map[string]interface{}); ok {
				og := &OutputNamedGitRepo{}
				if s, ok := out["url"].(string); ok {
					og.URL = s
				}
				if s, ok := out["branch"].(string); ok && strings.TrimSpace(s) != "" {
					og.Branch = stringPtr(s)
				}
				r.Output = og
			}
			// Include per-repo status if present
			if st, ok := m["status"].(string); ok {
				r.Status = stringPtr(st)
			}
			if strings.TrimSpace(r.Input.URL) != "" {
				repos = append(repos, r)
			}
		}
		result.Repos = repos
	}
	if idx, ok := spec["mainRepoIndex"].(float64); ok {
		idxInt := int(idx)
		result.MainRepoIndex = &idxInt
	}

	return result
}

// V2 API Handlers - Multi-tenant session management

func listSessions(c *gin.Context) {
	project := c.GetString("project")
	reqK8s, reqDyn := getK8sClientsForRequest(c)
	_ = reqK8s
	gvr := getAgenticSessionV1Alpha1Resource()

	list, err := reqDyn.Resource(gvr).Namespace(project).List(context.TODO(), v1.ListOptions{})
	if err != nil {
		log.Printf("Failed to list agentic sessions in project %s: %v", project, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list agentic sessions"})
		return
	}

	var sessions []AgenticSession
	for _, item := range list.Items {
		session := AgenticSession{
			APIVersion: item.GetAPIVersion(),
			Kind:       item.GetKind(),
			Metadata:   item.Object["metadata"].(map[string]interface{}),
		}

		if spec, ok := item.Object["spec"].(map[string]interface{}); ok {
			session.Spec = parseSpec(spec)
		}

		if status, ok := item.Object["status"].(map[string]interface{}); ok {
			session.Status = parseStatus(status)
		}

		sessions = append(sessions, session)
	}

	c.JSON(http.StatusOK, gin.H{"items": sessions})
}

func createSession(c *gin.Context) {
	project := c.GetString("project")
	// Use backend service account clients for CR writes
	if dynamicClient == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "backend not initialized"})
		return
	}
	var req CreateAgenticSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validation for multi-repo can be added here if needed

	// Set defaults for LLM settings if not provided
	llmSettings := LLMSettings{
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
	if len(req.EnvironmentVariables) > 0 {
		spec := session["spec"].(map[string]interface{})
		spec["environmentVariables"] = req.EnvironmentVariables
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

	gvr := getAgenticSessionV1Alpha1Resource()
	obj := &unstructured.Unstructured{Object: session}

	created, err := dynamicClient.Resource(gvr).Namespace(project).Create(context.TODO(), obj, v1.CreateOptions{})
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
	if err := provisionRunnerTokenForSession(c, k8sClient, dynamicClient, project, name); err != nil {
		// Non-fatal: log and continue. Operator may retry later if implemented.
		log.Printf("Warning: failed to provision runner token for session %s/%s: %v", project, name, err)
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Agentic session created successfully",
		"name":    name,
		"uid":     created.GetUID(),
	})
}

// provisionRunnerTokenForSession creates a per-session ServiceAccount, grants minimal RBAC,
// mints a short-lived token, stores it in a Secret, and annotates the AgenticSession with the Secret name.
func provisionRunnerTokenForSession(c *gin.Context, reqK8s *kubernetes.Clientset, reqDyn dynamic.Interface, project string, sessionName string) error {
	// Load owning AgenticSession to parent all resources
	gvr := getAgenticSessionV1Alpha1Resource()
	obj, err := reqDyn.Resource(gvr).Namespace(project).Get(c.Request.Context(), sessionName, v1.GetOptions{})
	if err != nil {
		return fmt.Errorf("get AgenticSession: %w", err)
	}
	ownerRef := v1.OwnerReference{
		APIVersion: obj.GetAPIVersion(),
		Kind:       obj.GetKind(),
		Name:       obj.GetName(),
		UID:        obj.GetUID(),
		Controller: boolPtr(true),
	}

	// Create ServiceAccount
	saName := fmt.Sprintf("ambient-session-%s", sessionName)
	sa := &corev1.ServiceAccount{
		ObjectMeta: v1.ObjectMeta{
			Name:            saName,
			Namespace:       project,
			Labels:          map[string]string{"app": "ambient-runner"},
			OwnerReferences: []v1.OwnerReference{ownerRef},
		},
	}
	if _, err := reqK8s.CoreV1().ServiceAccounts(project).Create(c.Request.Context(), sa, v1.CreateOptions{}); err != nil {
		if !errors.IsAlreadyExists(err) {
			return fmt.Errorf("create SA: %w", err)
		}
	}

	// Create Role with least-privilege for updating AgenticSession status
	roleName := fmt.Sprintf("ambient-session-%s-role", sessionName)
	role := &rbacv1.Role{
		ObjectMeta: v1.ObjectMeta{
			Name:            roleName,
			Namespace:       project,
			OwnerReferences: []v1.OwnerReference{ownerRef},
		},
		Rules: []rbacv1.PolicyRule{
			{
				APIGroups: []string{"vteam.ambient-code"},
				Resources: []string{"agenticsessions/status"},
				Verbs:     []string{"get", "update", "patch"},
			},
			{
				APIGroups: []string{"vteam.ambient-code"},
				Resources: []string{"agenticsessions"},
				Verbs:     []string{"get", "list", "watch"},
			},
		},
	}
	if _, err := reqK8s.RbacV1().Roles(project).Create(c.Request.Context(), role, v1.CreateOptions{}); err != nil {
		if !errors.IsAlreadyExists(err) {
			return fmt.Errorf("create Role: %w", err)
		}
	}

	// Bind Role to the ServiceAccount
	rbName := fmt.Sprintf("ambient-session-%s-rb", sessionName)
	rb := &rbacv1.RoleBinding{
		ObjectMeta: v1.ObjectMeta{
			Name:            rbName,
			Namespace:       project,
			OwnerReferences: []v1.OwnerReference{ownerRef},
		},
		RoleRef:  rbacv1.RoleRef{APIGroup: "rbac.authorization.k8s.io", Kind: "Role", Name: roleName},
		Subjects: []rbacv1.Subject{{Kind: "ServiceAccount", Name: saName, Namespace: project}},
	}
	if _, err := reqK8s.RbacV1().RoleBindings(project).Create(context.TODO(), rb, v1.CreateOptions{}); err != nil {
		if !errors.IsAlreadyExists(err) {
			return fmt.Errorf("create RoleBinding: %w", err)
		}
	}

	// Mint short-lived K8s ServiceAccount token for CR status updates
	tr := &authnv1.TokenRequest{Spec: authnv1.TokenRequestSpec{}}
	tok, err := reqK8s.CoreV1().ServiceAccounts(project).CreateToken(c.Request.Context(), saName, tr, v1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("mint token: %w", err)
	}
	k8sToken := tok.Status.Token
	if strings.TrimSpace(k8sToken) == "" {
		return fmt.Errorf("received empty token for SA %s", saName)
	}

	// Only store the K8s token; GitHub tokens are minted on-demand by the runner
	secretData := map[string]string{
		"k8s-token": k8sToken,
	}

	// Store both tokens in a Secret
	secretName := fmt.Sprintf("ambient-runner-token-%s", sessionName)
	sec := &corev1.Secret{
		ObjectMeta: v1.ObjectMeta{
			Name:            secretName,
			Namespace:       project,
			Labels:          map[string]string{"app": "ambient-runner-token"},
			OwnerReferences: []v1.OwnerReference{ownerRef},
		},
		Type:       corev1.SecretTypeOpaque,
		StringData: secretData,
	}
	if _, err := reqK8s.CoreV1().Secrets(project).Create(c.Request.Context(), sec, v1.CreateOptions{}); err != nil {
		if !errors.IsAlreadyExists(err) {
			return fmt.Errorf("create Secret: %w", err)
		}
	}

	// Annotate the AgenticSession with the Secret and SA names (conflict-safe patch)
	patch := map[string]interface{}{
		"metadata": map[string]interface{}{
			"annotations": map[string]string{
				"ambient-code.io/runner-token-secret": secretName,
				"ambient-code.io/runner-sa":           saName,
			},
		},
	}
	b, _ := json.Marshal(patch)
	if _, err := reqDyn.Resource(gvr).Namespace(project).Patch(c.Request.Context(), obj.GetName(), types.MergePatchType, b, v1.PatchOptions{}); err != nil {
		return fmt.Errorf("annotate AgenticSession: %w", err)
	}

	return nil
}

func getSession(c *gin.Context) {
	project := c.GetString("project")
	sessionName := c.Param("sessionName")
	reqK8s, reqDyn := getK8sClientsForRequest(c)
	_ = reqK8s
	gvr := getAgenticSessionV1Alpha1Resource()

	item, err := reqDyn.Resource(gvr).Namespace(project).Get(context.TODO(), sessionName, v1.GetOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
			return
		}
		log.Printf("Failed to get agentic session %s in project %s: %v", sessionName, project, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get agentic session"})
		return
	}

	session := AgenticSession{
		APIVersion: item.GetAPIVersion(),
		Kind:       item.GetKind(),
		Metadata:   item.Object["metadata"].(map[string]interface{}),
	}

	if spec, ok := item.Object["spec"].(map[string]interface{}); ok {
		session.Spec = parseSpec(spec)
	}

	if status, ok := item.Object["status"].(map[string]interface{}); ok {
		session.Status = parseStatus(status)
	}

	c.JSON(http.StatusOK, session)
}

// POST /api/projects/:projectName/agentic-sessions/:sessionName/github/token
// Auth: Authorization: Bearer <BOT_TOKEN> (K8s SA token with audience "ambient-backend")
// Validates the token via TokenReview, ensures SA matches CR annotation, and returns a short-lived GitHub token.
func mintSessionGitHubToken(c *gin.Context) {
	project := c.Param("projectName")
	sessionName := c.Param("sessionName")

	rawAuth := strings.TrimSpace(c.GetHeader("Authorization"))
	if rawAuth == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing Authorization header"})
		return
	}
	parts := strings.SplitN(rawAuth, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid Authorization header"})
		return
	}
	token := strings.TrimSpace(parts[1])
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "empty token"})
		return
	}

	// TokenReview using default audience (works with standard SA tokens)
	tr := &authnv1.TokenReview{Spec: authnv1.TokenReviewSpec{Token: token}}
	rv, err := k8sClient.AuthenticationV1().TokenReviews().Create(c.Request.Context(), tr, v1.CreateOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "token review failed"})
		return
	}
	if rv.Status.Error != "" || !rv.Status.Authenticated {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthenticated"})
		return
	}
	subj := strings.TrimSpace(rv.Status.User.Username)
	const pfx = "system:serviceaccount:"
	if !strings.HasPrefix(subj, pfx) {
		c.JSON(http.StatusForbidden, gin.H{"error": "subject is not a service account"})
		return
	}
	rest := strings.TrimPrefix(subj, pfx)
	segs := strings.SplitN(rest, ":", 2)
	if len(segs) != 2 {
		c.JSON(http.StatusForbidden, gin.H{"error": "invalid service account subject"})
		return
	}
	nsFromToken, saFromToken := segs[0], segs[1]
	if nsFromToken != project {
		c.JSON(http.StatusForbidden, gin.H{"error": "namespace mismatch"})
		return
	}

	// Load session and verify SA matches annotation
	gvr := getAgenticSessionV1Alpha1Resource()
	obj, err := dynamicClient.Resource(gvr).Namespace(project).Get(c.Request.Context(), sessionName, v1.GetOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read session"})
		return
	}
	meta, _ := obj.Object["metadata"].(map[string]interface{})
	anns, _ := meta["annotations"].(map[string]interface{})
	expectedSA := ""
	if anns != nil {
		if v, ok := anns["ambient-code.io/runner-sa"].(string); ok {
			expectedSA = strings.TrimSpace(v)
		}
	}
	if expectedSA == "" || expectedSA != saFromToken {
		c.JSON(http.StatusForbidden, gin.H{"error": "service account not authorized for session"})
		return
	}

	// Read authoritative userId from spec.userContext.userId
	spec, _ := obj.Object["spec"].(map[string]interface{})
	userId := ""
	if spec != nil {
		if uc, ok := spec["userContext"].(map[string]interface{}); ok {
			if v, ok := uc["userId"].(string); ok {
				userId = strings.TrimSpace(v)
			}
		}
	}
	if userId == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "session missing user context"})
		return
	}

	// Get GitHub token (GitHub App or PAT fallback via project runner secret)
	tokenStr, err := getGitHubToken(c.Request.Context(), k8sClient, dynamicClient, project, userId)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	// Note: PATs don't have expiration, so we omit expiresAt for simplicity
	// Runners should treat all tokens as short-lived and request new ones as needed
	c.JSON(http.StatusOK, gin.H{"token": tokenStr})
}

// --- Git helpers (project-scoped) ---

func stringPtr(s string) *string { return &s }

func updateSession(c *gin.Context) {
	project := c.GetString("project")
	sessionName := c.Param("sessionName")
	reqK8s, reqDyn := getK8sClientsForRequest(c)
	_ = reqK8s

	var req CreateAgenticSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	gvr := getAgenticSessionV1Alpha1Resource()

	// Get current resource with brief retry to avoid race on creation
	var item *unstructured.Unstructured
	var err error
	for attempt := 0; attempt < 5; attempt++ {
		item, err = reqDyn.Resource(gvr).Namespace(project).Get(context.TODO(), sessionName, v1.GetOptions{})
		if err == nil {
			break
		}
		if errors.IsNotFound(err) {
			time.Sleep(300 * time.Millisecond)
			continue
		}
		log.Printf("Failed to get agentic session %s in project %s: %v", sessionName, project, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get agentic session"})
		return
	}
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	// Update spec
	spec := item.Object["spec"].(map[string]interface{})
	spec["prompt"] = req.Prompt
	spec["displayName"] = req.DisplayName

	if req.LLMSettings != nil {
		llmSettings := make(map[string]interface{})
		if req.LLMSettings.Model != "" {
			llmSettings["model"] = req.LLMSettings.Model
		}
		if req.LLMSettings.Temperature != 0 {
			llmSettings["temperature"] = req.LLMSettings.Temperature
		}
		if req.LLMSettings.MaxTokens != 0 {
			llmSettings["maxTokens"] = req.LLMSettings.MaxTokens
		}
		spec["llmSettings"] = llmSettings
	}

	if req.Timeout != nil {
		spec["timeout"] = *req.Timeout
	}

	// Update the resource
	updated, err := reqDyn.Resource(gvr).Namespace(project).Update(context.TODO(), item, v1.UpdateOptions{})
	if err != nil {
		log.Printf("Failed to update agentic session %s in project %s: %v", sessionName, project, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update agentic session"})
		return
	}

	// Parse and return updated session
	session := AgenticSession{
		APIVersion: updated.GetAPIVersion(),
		Kind:       updated.GetKind(),
		Metadata:   updated.Object["metadata"].(map[string]interface{}),
	}

	if spec, ok := updated.Object["spec"].(map[string]interface{}); ok {
		session.Spec = parseSpec(spec)
	}

	if status, ok := updated.Object["status"].(map[string]interface{}); ok {
		session.Status = parseStatus(status)
	}

	c.JSON(http.StatusOK, session)
}

// PUT /api/projects/:projectName/agentic-sessions/:sessionName/displayname
// updateSessionDisplayName updates only the spec.displayName field on the AgenticSession
func updateSessionDisplayName(c *gin.Context) {
	project := c.GetString("project")
	sessionName := c.Param("sessionName")
	_, reqDyn := getK8sClientsForRequest(c)

	var req struct {
		DisplayName string `json:"displayName" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	gvr := getAgenticSessionV1Alpha1Resource()

	// Retrieve current resource
	item, err := reqDyn.Resource(gvr).Namespace(project).Get(context.TODO(), sessionName, v1.GetOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
			return
		}
		log.Printf("Failed to get agentic session %s in project %s: %v", sessionName, project, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get agentic session"})
		return
	}

	// Update only displayName in spec
	spec, ok := item.Object["spec"].(map[string]interface{})
	if !ok {
		spec = make(map[string]interface{})
		item.Object["spec"] = spec
	}
	spec["displayName"] = req.DisplayName

	// Persist the change
	updated, err := reqDyn.Resource(gvr).Namespace(project).Update(context.TODO(), item, v1.UpdateOptions{})
	if err != nil {
		log.Printf("Failed to update display name for agentic session %s in project %s: %v", sessionName, project, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update display name"})
		return
	}

	// Respond with updated session summary
	session := AgenticSession{
		APIVersion: updated.GetAPIVersion(),
		Kind:       updated.GetKind(),
		Metadata:   updated.Object["metadata"].(map[string]interface{}),
	}
	if s, ok := updated.Object["spec"].(map[string]interface{}); ok {
		session.Spec = parseSpec(s)
	}
	if st, ok := updated.Object["status"].(map[string]interface{}); ok {
		session.Status = parseStatus(st)
	}

	c.JSON(http.StatusOK, session)
}

func deleteSession(c *gin.Context) {
	project := c.GetString("project")
	sessionName := c.Param("sessionName")
	reqK8s, reqDyn := getK8sClientsForRequest(c)
	_ = reqK8s
	gvr := getAgenticSessionV1Alpha1Resource()

	err := reqDyn.Resource(gvr).Namespace(project).Delete(context.TODO(), sessionName, v1.DeleteOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
			return
		}
		log.Printf("Failed to delete agentic session %s in project %s: %v", sessionName, project, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete agentic session"})
		return
	}

	c.Status(http.StatusNoContent)
}

func cloneSession(c *gin.Context) {
	project := c.GetString("project")
	sessionName := c.Param("sessionName")
	_, reqDyn := getK8sClientsForRequest(c)

	var req CloneSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	gvr := getAgenticSessionV1Alpha1Resource()

	// Get source session
	sourceItem, err := reqDyn.Resource(gvr).Namespace(project).Get(context.TODO(), sessionName, v1.GetOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Source session not found"})
			return
		}
		log.Printf("Failed to get source agentic session %s in project %s: %v", sessionName, project, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get source agentic session"})
		return
	}

	// Validate target project exists and is managed by Ambient via OpenShift Project
	projGvr := getOpenShiftProjectResource()
	projObj, err := reqDyn.Resource(projGvr).Get(context.TODO(), req.TargetProject, v1.GetOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Target project not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to validate target project"})
		return
	}

	isAmbient := false
	if meta, ok := projObj.Object["metadata"].(map[string]interface{}); ok {
		if raw, ok := meta["labels"].(map[string]interface{}); ok {
			if v, ok := raw["ambient-code.io/managed"].(string); ok && v == "true" {
				isAmbient = true
			}
		}
	}
	if !isAmbient {
		c.JSON(http.StatusForbidden, gin.H{"error": "Target project is not managed by Ambient"})
		return
	}

	// Ensure unique target session name in target namespace; if exists, append "-duplicate" (and numeric suffix)
	newName := strings.TrimSpace(req.NewSessionName)
	if newName == "" {
		newName = sessionName
	}
	finalName := newName
	conflicted := false
	for i := 0; i < 50; i++ {
		_, getErr := reqDyn.Resource(gvr).Namespace(req.TargetProject).Get(context.TODO(), finalName, v1.GetOptions{})
		if errors.IsNotFound(getErr) {
			break
		}
		if getErr != nil && !errors.IsNotFound(getErr) {
			// On unexpected error, still attempt to proceed with a duplicate suffix to reduce collision chance
			log.Printf("cloneSession: name check encountered error for %s/%s: %v", req.TargetProject, finalName, getErr)
		}
		conflicted = true
		if i == 0 {
			finalName = fmt.Sprintf("%s-duplicate", newName)
		} else {
			finalName = fmt.Sprintf("%s-duplicate-%d", newName, i+1)
		}
	}

	// Create cloned session
	clonedSession := map[string]interface{}{
		"apiVersion": "vteam.ambient-code/v1alpha1",
		"kind":       "AgenticSession",
		"metadata": map[string]interface{}{
			"name":      finalName,
			"namespace": req.TargetProject,
		},
		"spec": sourceItem.Object["spec"],
		"status": map[string]interface{}{
			"phase": "Pending",
		},
	}

	// Update project in spec
	clonedSpec := clonedSession["spec"].(map[string]interface{})
	clonedSpec["project"] = req.TargetProject
	if conflicted {
		if dn, ok := clonedSpec["displayName"].(string); ok && strings.TrimSpace(dn) != "" {
			clonedSpec["displayName"] = fmt.Sprintf("%s (Duplicate)", dn)
		} else {
			clonedSpec["displayName"] = fmt.Sprintf("%s (Duplicate)", finalName)
		}
	}

	obj := &unstructured.Unstructured{Object: clonedSession}

	created, err := reqDyn.Resource(gvr).Namespace(req.TargetProject).Create(context.TODO(), obj, v1.CreateOptions{})
	if err != nil {
		log.Printf("Failed to create cloned agentic session in project %s: %v", req.TargetProject, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create cloned agentic session"})
		return
	}

	// Parse and return created session
	session := AgenticSession{
		APIVersion: created.GetAPIVersion(),
		Kind:       created.GetKind(),
		Metadata:   created.Object["metadata"].(map[string]interface{}),
	}

	if spec, ok := created.Object["spec"].(map[string]interface{}); ok {
		session.Spec = parseSpec(spec)
	}

	if status, ok := created.Object["status"].(map[string]interface{}); ok {
		session.Status = parseStatus(status)
	}

	c.JSON(http.StatusCreated, session)
}

func startSession(c *gin.Context) {
	project := c.GetString("project")
	sessionName := c.Param("sessionName")
	reqK8s, reqDyn := getK8sClientsForRequest(c)
	_ = reqK8s
	gvr := getAgenticSessionV1Alpha1Resource()

	// Get current resource
	item, err := reqDyn.Resource(gvr).Namespace(project).Get(context.TODO(), sessionName, v1.GetOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
			return
		}
		log.Printf("Failed to get agentic session %s in project %s: %v", sessionName, project, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get agentic session"})
		return
	}

	// Update status to trigger start
	if item.Object["status"] == nil {
		item.Object["status"] = make(map[string]interface{})
	}

	status := item.Object["status"].(map[string]interface{})
	status["phase"] = "Creating"
	status["message"] = "Session start requested"
	status["startTime"] = time.Now().Format(time.RFC3339)

	// Update the resource
	updated, err := reqDyn.Resource(gvr).Namespace(project).Update(context.TODO(), item, v1.UpdateOptions{})
	if err != nil {
		log.Printf("Failed to start agentic session %s in project %s: %v", sessionName, project, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start agentic session"})
		return
	}

	// Parse and return updated session
	session := AgenticSession{
		APIVersion: updated.GetAPIVersion(),
		Kind:       updated.GetKind(),
		Metadata:   updated.Object["metadata"].(map[string]interface{}),
	}

	if spec, ok := updated.Object["spec"].(map[string]interface{}); ok {
		session.Spec = parseSpec(spec)
	}

	if status, ok := updated.Object["status"].(map[string]interface{}); ok {
		session.Status = parseStatus(status)
	}

	c.JSON(http.StatusAccepted, session)
}

func stopSession(c *gin.Context) {
	project := c.GetString("project")
	sessionName := c.Param("sessionName")
	reqK8s, reqDyn := getK8sClientsForRequest(c)
	gvr := getAgenticSessionV1Alpha1Resource()

	// Get current resource
	item, err := reqDyn.Resource(gvr).Namespace(project).Get(context.TODO(), sessionName, v1.GetOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
			return
		}
		log.Printf("Failed to get agentic session %s in project %s: %v", sessionName, project, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get agentic session"})
		return
	}

	// Check current status
	status, ok := item.Object["status"].(map[string]interface{})
	if !ok {
		status = make(map[string]interface{})
		item.Object["status"] = status
	}

	currentPhase, _ := status["phase"].(string)
	if currentPhase == "Completed" || currentPhase == "Failed" || currentPhase == "Stopped" {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Cannot stop session in %s state", currentPhase)})
		return
	}

	log.Printf("Attempting to stop agentic session %s in project %s (current phase: %s)", sessionName, project, currentPhase)

	// Get job name from status
	jobName, jobExists := status["jobName"].(string)
	if jobExists && jobName != "" {
		// Delete the job
		err := reqK8s.BatchV1().Jobs(project).Delete(context.TODO(), jobName, v1.DeleteOptions{})
		if err != nil && !errors.IsNotFound(err) {
			log.Printf("Failed to delete job %s: %v", jobName, err)
			// Don't fail the request if job deletion fails - continue with status update
			log.Printf("Continuing with status update despite job deletion failure")
		} else {
			log.Printf("Deleted job %s for agentic session %s", jobName, sessionName)
		}
	} else {
		// Handle case where job was never created or jobName is missing
		log.Printf("No job found to delete for agentic session %s", sessionName)
	}

	// Update status to Stopped
	status["phase"] = "Stopped"
	status["message"] = "Session stopped by user"
	status["completionTime"] = time.Now().Format(time.RFC3339)

	// Update the resource
	updated, err := reqDyn.Resource(gvr).Namespace(project).Update(context.TODO(), item, v1.UpdateOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			// Session was deleted while we were trying to update it
			log.Printf("Agentic session %s was deleted during stop operation", sessionName)
			c.JSON(http.StatusOK, gin.H{"message": "Session no longer exists (already deleted)"})
			return
		}
		log.Printf("Failed to update agentic session status %s: %v", sessionName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update agentic session status"})
		return
	}

	// Parse and return updated session
	session := AgenticSession{
		APIVersion: updated.GetAPIVersion(),
		Kind:       updated.GetKind(),
		Metadata:   updated.Object["metadata"].(map[string]interface{}),
	}

	if spec, ok := updated.Object["spec"].(map[string]interface{}); ok {
		session.Spec = parseSpec(spec)
	}

	if status, ok := updated.Object["status"].(map[string]interface{}); ok {
		session.Status = parseStatus(status)
	}

	log.Printf("Successfully stopped agentic session %s", sessionName)
	c.JSON(http.StatusAccepted, session)
}

// PUT /api/projects/:projectName/agentic-sessions/:sessionName/status
// updateSessionStatus writes selected fields to PVC-backed files and updates CR status
func updateSessionStatus(c *gin.Context) {
	project := c.GetString("project")
	sessionName := c.Param("sessionName")
	_, reqDyn := getK8sClientsForRequest(c)

	var statusUpdate map[string]interface{}
	if err := c.ShouldBindJSON(&statusUpdate); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	gvr := getAgenticSessionV1Alpha1Resource()

	// Get current resource
	item, err := reqDyn.Resource(gvr).Namespace(project).Get(context.TODO(), sessionName, v1.GetOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
			return
		}
		log.Printf("Failed to get agentic session %s in project %s: %v", sessionName, project, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get agentic session"})
		return
	}

	// Ensure status map
	if item.Object["status"] == nil {
		item.Object["status"] = make(map[string]interface{})
	}
	status := item.Object["status"].(map[string]interface{})

	// Accept standard fields and result summary fields from runner
	allowed := map[string]struct{}{
		"phase": {}, "completionTime": {}, "cost": {}, "message": {},
		"subtype": {}, "duration_ms": {}, "duration_api_ms": {}, "is_error": {},
		"num_turns": {}, "session_id": {}, "total_cost_usd": {}, "usage": {}, "result": {},
	}
	for k := range statusUpdate {
		if _, ok := allowed[k]; !ok {
			delete(statusUpdate, k)
		}
	}

	// Merge remaining fields into status
	for k, v := range statusUpdate {
		status[k] = v
	}

	// Update only the status subresource (requires agenticsessions/status perms)
	if _, err := reqDyn.Resource(gvr).Namespace(project).UpdateStatus(context.TODO(), item, v1.UpdateOptions{}); err != nil {
		log.Printf("Failed to update agentic session status %s in project %s: %v", sessionName, project, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update agentic session status"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "agentic session status updated"})
}

// setRepoStatus updates spec.repos[idx].status to a new value
func setRepoStatus(dyn dynamic.Interface, project, sessionName string, repoIndex int, newStatus string) error {
	gvr := getAgenticSessionV1Alpha1Resource()
	item, err := dyn.Resource(gvr).Namespace(project).Get(context.TODO(), sessionName, v1.GetOptions{})
	if err != nil {
		return err
	}
	spec, _ := item.Object["spec"].(map[string]interface{})
	if spec == nil {
		spec = map[string]interface{}{}
	}
	repos, _ := spec["repos"].([]interface{})
	if repoIndex < 0 || repoIndex >= len(repos) {
		return fmt.Errorf("repo index out of range")
	}
	rm, _ := repos[repoIndex].(map[string]interface{})
	if rm == nil {
		rm = map[string]interface{}{}
	}
	rm["status"] = newStatus
	repos[repoIndex] = rm
	spec["repos"] = repos
	item.Object["spec"] = spec
	updated, err := dyn.Resource(gvr).Namespace(project).Update(context.TODO(), item, v1.UpdateOptions{})
	if err != nil {
		log.Printf("setRepoStatus: update failed project=%s session=%s repoIndex=%d status=%s err=%v", project, sessionName, repoIndex, newStatus, err)
		return err
	}
	if updated != nil {
		log.Printf("setRepoStatus: update ok project=%s session=%s repoIndex=%d status=%s", project, sessionName, repoIndex, newStatus)
	}
	return nil
}

type contentListItem struct {
	Name       string `json:"name"`
	Path       string `json:"path"`
	IsDir      bool   `json:"isDir"`
	Size       int64  `json:"size"`
	ModifiedAt string `json:"modifiedAt"`
}

// listSessionWorkspace proxies to per-job content service for directory listing
func listSessionWorkspace(c *gin.Context) {
	project := c.Param("projectName")
	session := c.Param("sessionName")
	rel := strings.TrimSpace(c.Query("path"))
	// Build absolute workspace path using plain session (no url.PathEscape to match FS paths)
	absPath := "/sessions/" + session + "/workspace"
	if rel != "" {
		absPath += "/" + rel
	}

	// Call per-job service directly to avoid any default base that targets per-namespace service
	token := c.GetHeader("Authorization")
	if strings.TrimSpace(token) == "" {
		token = c.GetHeader("X-Forwarded-Access-Token")
	}
	base := os.Getenv("SESSION_CONTENT_SERVICE_BASE")
	if base == "" {
		// Per-job Service name created by operator: ambient-content-<session> in project namespace
		base = "http://ambient-content-%s.%s.svc:8080"
	}
	endpoint := fmt.Sprintf(base, session, project)
	u := fmt.Sprintf("%s/content/list?path=%s", endpoint, url.QueryEscape(absPath))
	req, _ := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, u, nil)
	if strings.TrimSpace(token) != "" {
		req.Header.Set("Authorization", token)
	}
	client := &http.Client{Timeout: 4 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		// Soften error to 200 with empty list so UI doesn't spam
		c.JSON(http.StatusOK, gin.H{"items": []any{}})
		return
	}
	defer resp.Body.Close()
	b, _ := ioutil.ReadAll(resp.Body)
	c.Data(resp.StatusCode, resp.Header.Get("Content-Type"), b)
}

// getSessionWorkspaceFile reads a file via content service
func getSessionWorkspaceFile(c *gin.Context) {
	project := c.Param("projectName")
	session := c.Param("sessionName")
	sub := strings.TrimPrefix(c.Param("path"), "/")
	absPath := "/sessions/" + session + "/workspace/" + sub
	token := c.GetHeader("Authorization")
	if strings.TrimSpace(token) == "" {
		token = c.GetHeader("X-Forwarded-Access-Token")
	}
	base := os.Getenv("SESSION_CONTENT_SERVICE_BASE")
	if base == "" {
		base = "http://ambient-content-%s.%s.svc:8080"
	}
	endpoint := fmt.Sprintf(base, session, project)
	u := fmt.Sprintf("%s/content/file?path=%s", endpoint, url.QueryEscape(absPath))
	req, _ := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, u, nil)
	if strings.TrimSpace(token) != "" {
		req.Header.Set("Authorization", token)
	}
	client := &http.Client{Timeout: 4 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	b, _ := ioutil.ReadAll(resp.Body)
	c.Data(resp.StatusCode, resp.Header.Get("Content-Type"), b)
}

// putSessionWorkspaceFile writes a file via content service
func putSessionWorkspaceFile(c *gin.Context) {
	project := c.Param("projectName")
	session := c.Param("sessionName")
	sub := strings.TrimPrefix(c.Param("path"), "/")
	absPath := "/sessions/" + session + "/workspace/" + sub
	token := c.GetHeader("Authorization")
	if strings.TrimSpace(token) == "" {
		token = c.GetHeader("X-Forwarded-Access-Token")
	}
	base := os.Getenv("SESSION_CONTENT_SERVICE_BASE")
	if base == "" {
		base = "http://ambient-content-%s.%s.svc:8080"
	}
	endpoint := fmt.Sprintf(base, session, project)
	payload, _ := ioutil.ReadAll(c.Request.Body)
	wreq := struct {
		Path     string `json:"path"`
		Content  string `json:"content"`
		Encoding string `json:"encoding"`
	}{Path: absPath, Content: string(payload), Encoding: "utf8"}
	b, _ := json.Marshal(wreq)
	req, _ := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, endpoint+"/content/write", strings.NewReader(string(b)))
	if strings.TrimSpace(token) != "" {
		req.Header.Set("Authorization", token)
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 4 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	rb, _ := ioutil.ReadAll(resp.Body)
	c.Data(resp.StatusCode, resp.Header.Get("Content-Type"), rb)
}

// pushSessionRepo proxies a push request for a given session repo to the per-job content service.
// POST /api/projects/:projectName/agentic-sessions/:sessionName/github/push
// Body: { repoIndex: number, commitMessage?: string, branch?: string }
func pushSessionRepo(c *gin.Context) {
	project := c.Param("projectName")
	session := c.Param("sessionName")

	var body struct {
		RepoIndex     int    `json:"repoIndex"`
		CommitMessage string `json:"commitMessage"`
	}
	if err := c.BindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON body"})
		return
	}
	log.Printf("pushSessionRepo: request project=%s session=%s repoIndex=%d commitLen=%d", project, session, body.RepoIndex, len(strings.TrimSpace(body.CommitMessage)))

	base := os.Getenv("SESSION_CONTENT_SERVICE_BASE")
	if base == "" {
		// Default: per-job service name ambient-content-<session> in the project namespace
		base = "http://ambient-content-%s.%s.svc:8080"
	}
	endpoint := fmt.Sprintf(base, session, project)

	// Simplified: 1) get session; 2) compute repoPath from INPUT repo folder; 3) get output url/branch; 4) proxy
	resolvedRepoPath := ""
	// default branch when not defined on output
	resolvedBranch := fmt.Sprintf("sessions/%s", session)
	resolvedOutputURL := ""
	if _, reqDyn := getK8sClientsForRequest(c); reqDyn != nil {
		gvr := getAgenticSessionV1Alpha1Resource()
		obj, err := reqDyn.Resource(gvr).Namespace(project).Get(c.Request.Context(), session, v1.GetOptions{})
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read session"})
			return
		}
		spec, _ := obj.Object["spec"].(map[string]interface{})
		repos, _ := spec["repos"].([]interface{})
		if body.RepoIndex < 0 || body.RepoIndex >= len(repos) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid repo index"})
			return
		}
		rm, _ := repos[body.RepoIndex].(map[string]interface{})
		// Derive repoPath from input URL folder name
		if in, ok := rm["input"].(map[string]interface{}); ok {
			if urlv, ok2 := in["url"].(string); ok2 && strings.TrimSpace(urlv) != "" {
				folder := deriveRepoFolderFromURL(strings.TrimSpace(urlv))
				if folder != "" {
					resolvedRepoPath = fmt.Sprintf("/sessions/%s/workspace/%s", session, folder)
				}
			}
		}
		if out, ok := rm["output"].(map[string]interface{}); ok {
			if urlv, ok2 := out["url"].(string); ok2 && strings.TrimSpace(urlv) != "" {
				resolvedOutputURL = strings.TrimSpace(urlv)
			}
			if bs, ok2 := out["branch"].(string); ok2 && strings.TrimSpace(bs) != "" {
				resolvedBranch = strings.TrimSpace(bs)
			} else if bv, ok2 := out["branch"].(*string); ok2 && bv != nil && strings.TrimSpace(*bv) != "" {
				resolvedBranch = strings.TrimSpace(*bv)
			}
		}
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no dynamic client"})
		return
	}
	// If input URL missing or unparsable, fall back to numeric index path (last resort)
	if strings.TrimSpace(resolvedRepoPath) == "" {
		if body.RepoIndex >= 0 {
			resolvedRepoPath = fmt.Sprintf("/sessions/%s/workspace/%d", session, body.RepoIndex)
		} else {
			resolvedRepoPath = fmt.Sprintf("/sessions/%s/workspace", session)
		}
	}
	if strings.TrimSpace(resolvedOutputURL) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing output repo url"})
		return
	}
	log.Printf("pushSessionRepo: resolved repoPath=%q outputUrl=%q branch=%q", resolvedRepoPath, resolvedOutputURL, resolvedBranch)

	payload := map[string]interface{}{
		"repoPath":      resolvedRepoPath,
		"commitMessage": body.CommitMessage,
		"branch":        resolvedBranch,
		"outputRepoUrl": resolvedOutputURL,
	}
	b, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, endpoint+"/content/github/push", strings.NewReader(string(b)))
	if v := c.GetHeader("Authorization"); v != "" {
		req.Header.Set("Authorization", v)
	}
	if v := c.GetHeader("X-Forwarded-Access-Token"); v != "" {
		req.Header.Set("X-Forwarded-Access-Token", v)
	}
	req.Header.Set("Content-Type", "application/json")

	// Attach short-lived GitHub token for one-shot authenticated push
	if reqK8s, reqDyn := getK8sClientsForRequest(c); reqK8s != nil {
		// Load session to get authoritative userId
		gvr := getAgenticSessionV1Alpha1Resource()
		obj, err := reqDyn.Resource(gvr).Namespace(project).Get(c.Request.Context(), session, v1.GetOptions{})
		if err == nil {
			spec, _ := obj.Object["spec"].(map[string]interface{})
			userId := ""
			if spec != nil {
				if uc, ok := spec["userContext"].(map[string]interface{}); ok {
					if v, ok := uc["userId"].(string); ok {
						userId = strings.TrimSpace(v)
					}
				}
			}
			if userId != "" {
				if tokenStr, err := getGitHubToken(c.Request.Context(), reqK8s, reqDyn, project, userId); err == nil && strings.TrimSpace(tokenStr) != "" {
					req.Header.Set("X-GitHub-Token", tokenStr)
					log.Printf("pushSessionRepo: attached short-lived GitHub token for project=%s session=%s", project, session)
				} else if err != nil {
					log.Printf("pushSessionRepo: failed to resolve GitHub token: %v", err)
				}
			} else {
				log.Printf("pushSessionRepo: session %s/%s missing userContext.userId; proceeding without token", project, session)
			}
		} else {
			log.Printf("pushSessionRepo: failed to read session for token attach: %v", err)
		}
	}

	log.Printf("pushSessionRepo: proxy push project=%s session=%s repoIndex=%d repoPath=%s endpoint=%s", project, session, body.RepoIndex, resolvedRepoPath, endpoint+"/content/github/push")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	bodyBytes, _ := ioutil.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Printf("pushSessionRepo: content returned status=%d body.snip=%q", resp.StatusCode, func() string {
			s := string(bodyBytes)
			if len(s) > 1500 {
				return s[:1500] + "..."
			}
			return s
		}())
		c.Data(resp.StatusCode, "application/json", bodyBytes)
		return
	}
	if _, reqDyn := getK8sClientsForRequest(c); reqDyn != nil {
		log.Printf("pushSessionRepo: setting repo status to 'pushed' for repoIndex=%d", body.RepoIndex)
		if err := setRepoStatus(reqDyn, project, session, body.RepoIndex, "pushed"); err != nil {
			log.Printf("pushSessionRepo: setRepoStatus failed project=%s session=%s repoIndex=%d err=%v", project, session, body.RepoIndex, err)
		}
	} else {
		log.Printf("pushSessionRepo: no dynamic client; cannot set repo status project=%s session=%s", project, session)
	}
	log.Printf("pushSessionRepo: content push succeeded status=%d body.len=%d", resp.StatusCode, len(bodyBytes))
	c.Data(http.StatusOK, "application/json", bodyBytes)
}

// abandonSessionRepo instructs sidecar to discard local changes for a repo
func abandonSessionRepo(c *gin.Context) {
	project := c.Param("projectName")
	session := c.Param("sessionName")
	var body struct {
		RepoIndex int    `json:"repoIndex"`
		RepoPath  string `json:"repoPath"`
	}
	if err := c.BindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON body"})
		return
	}
	base := os.Getenv("SESSION_CONTENT_SERVICE_BASE")
	if base == "" {
		base = "http://ambient-content-%s.%s.svc:8080"
	}
	endpoint := fmt.Sprintf(base, session, project)
	repoPath := strings.TrimSpace(body.RepoPath)
	if repoPath == "" {
		if body.RepoIndex >= 0 {
			repoPath = fmt.Sprintf("/sessions/%s/workspace/%d", session, body.RepoIndex)
		} else {
			repoPath = fmt.Sprintf("/sessions/%s/workspace", session)
		}
	}
	payload := map[string]interface{}{
		"repoPath": repoPath,
	}
	b, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, endpoint+"/content/github/abandon", strings.NewReader(string(b)))
	if v := c.GetHeader("Authorization"); v != "" {
		req.Header.Set("Authorization", v)
	}
	if v := c.GetHeader("X-Forwarded-Access-Token"); v != "" {
		req.Header.Set("X-Forwarded-Access-Token", v)
	}
	req.Header.Set("Content-Type", "application/json")
	log.Printf("abandonSessionRepo: proxy abandon project=%s session=%s repoIndex=%d repoPath=%s", project, session, body.RepoIndex, repoPath)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	bodyBytes, _ := ioutil.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Printf("abandonSessionRepo: content returned status=%d body=%s", resp.StatusCode, string(bodyBytes))
		c.Data(resp.StatusCode, "application/json", bodyBytes)
		return
	}
	if _, reqDyn := getK8sClientsForRequest(c); reqDyn != nil {
		if err := setRepoStatus(reqDyn, project, session, body.RepoIndex, "abandoned"); err != nil {
			log.Printf("abandonSessionRepo: setRepoStatus failed project=%s session=%s repoIndex=%d err=%v", project, session, body.RepoIndex, err)
		}
	} else {
		log.Printf("abandonSessionRepo: no dynamic client; cannot set repo status project=%s session=%s", project, session)
	}
	c.Data(http.StatusOK, "application/json", bodyBytes)
}

// diffSessionRepo proxies diff counts for a given session repo to the content sidecar
// GET /api/projects/:projectName/agentic-sessions/:sessionName/github/diff?repoIndex=0&repoPath=...
func diffSessionRepo(c *gin.Context) {
	project := c.Param("projectName")
	session := c.Param("sessionName")
	repoIndexStr := strings.TrimSpace(c.Query("repoIndex"))
	repoPath := strings.TrimSpace(c.Query("repoPath"))
	if repoPath == "" && repoIndexStr != "" {
		repoPath = fmt.Sprintf("/sessions/%s/workspace/%s", session, repoIndexStr)
	}
	if repoPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing repoPath/repoIndex"})
		return
	}
	base := os.Getenv("SESSION_CONTENT_SERVICE_BASE")
	if base == "" {
		base = "http://ambient-content-%s.%s.svc:8080"
	}
	endpoint := fmt.Sprintf(base, session, project)
	url := fmt.Sprintf("%s/content/github/diff?repoPath=%s", endpoint, url.QueryEscape(repoPath))
	req, _ := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, url, nil)
	if v := c.GetHeader("Authorization"); v != "" {
		req.Header.Set("Authorization", v)
	}
	if v := c.GetHeader("X-Forwarded-Access-Token"); v != "" {
		req.Header.Set("X-Forwarded-Access-Token", v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"added": 0, "modified": 0, "deleted": 0, "renamed": 0, "untracked": 0})
		return
	}
	defer resp.Body.Close()
	b, _ := ioutil.ReadAll(resp.Body)
	c.Data(resp.StatusCode, "application/json", b)
}

// Project management handlers
func listProjects(c *gin.Context) {
	_, reqDyn := getK8sClientsForRequest(c)

	// List OpenShift Projects the user can see; filter to Ambient-managed
	projGvr := getOpenShiftProjectResource()
	list, err := reqDyn.Resource(projGvr).List(context.TODO(), v1.ListOptions{})
	if err != nil {
		log.Printf("Failed to list OpenShift Projects: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list projects"})
		return
	}

	toStringMap := func(in map[string]interface{}) map[string]string {
		if in == nil {
			return map[string]string{}
		}
		out := make(map[string]string, len(in))
		for k, v := range in {
			if s, ok := v.(string); ok {
				out[k] = s
			}
		}
		return out
	}

	var projects []AmbientProject
	for _, item := range list.Items {
		meta, _ := item.Object["metadata"].(map[string]interface{})
		name := item.GetName()
		if name == "" && meta != nil {
			if n, ok := meta["name"].(string); ok {
				name = n
			}
		}
		labels := map[string]string{}
		annotations := map[string]string{}
		if meta != nil {
			if raw, ok := meta["labels"].(map[string]interface{}); ok {
				labels = toStringMap(raw)
			}
			if raw, ok := meta["annotations"].(map[string]interface{}); ok {
				annotations = toStringMap(raw)
			}
		}

		// Filter to Ambient-managed projects when label is present
		if v, ok := labels["ambient-code.io/managed"]; !ok || v != "true" {
			continue
		}

		displayName := annotations["openshift.io/display-name"]
		description := annotations["openshift.io/description"]
		created := item.GetCreationTimestamp().Time

		status := ""
		if st, ok := item.Object["status"].(map[string]interface{}); ok {
			if phase, ok := st["phase"].(string); ok {
				status = phase
			}
		}

		project := AmbientProject{
			Name:              name,
			DisplayName:       displayName,
			Description:       description,
			Labels:            labels,
			Annotations:       annotations,
			CreationTimestamp: created.Format(time.RFC3339),
			Status:            status,
		}
		projects = append(projects, project)
	}

	c.JSON(http.StatusOK, gin.H{"items": projects})
}

func createProject(c *gin.Context) {
	reqK8s, _ := getK8sClientsForRequest(c)
	var req CreateProjectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Extract user info from context
	userID, hasUser := c.Get("userID")
	userName, hasName := c.Get("userName")

	// Create namespace with Ambient labels (T049: Project labeling logic)
	ns := &corev1.Namespace{
		ObjectMeta: v1.ObjectMeta{
			Name: req.Name,
			Labels: map[string]string{
				"ambient-code.io/managed": "true", // Critical label for Ambient project identification
			},
			Annotations: map[string]string{
				"openshift.io/display-name": req.DisplayName,
			},
		},
	}

	// Add optional annotations
	if req.Description != "" {
		ns.Annotations["openshift.io/description"] = req.Description
	}
	// Prefer requester as user name; fallback to user ID when available
	if hasName && userName != nil {
		ns.Annotations["openshift.io/requester"] = fmt.Sprintf("%v", userName)
	} else if hasUser && userID != nil {
		ns.Annotations["openshift.io/requester"] = fmt.Sprintf("%v", userID)
	}

	created, err := reqK8s.CoreV1().Namespaces().Create(context.TODO(), ns, v1.CreateOptions{})
	if err != nil {
		log.Printf("Failed to create project %s: %v", req.Name, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create project"})
		return
	}

	// Do not create ProjectSettings here. The operator will reconcile when it
	// sees the managed label and create the ProjectSettings in the project namespace.

	project := AmbientProject{
		Name:              created.Name,
		DisplayName:       created.Annotations["openshift.io/display-name"],
		Description:       created.Annotations["openshift.io/description"],
		Labels:            created.Labels,
		Annotations:       created.Annotations,
		CreationTimestamp: created.CreationTimestamp.Format(time.RFC3339),
		Status:            string(created.Status.Phase),
	}

	c.JSON(http.StatusCreated, project)
}

func getProject(c *gin.Context) {
	projectName := c.Param("projectName")
	_, reqDyn := getK8sClientsForRequest(c)

	// Read OpenShift Project (user context) and validate Ambient label
	projGvr := getOpenShiftProjectResource()
	projObj, err := reqDyn.Resource(projGvr).Get(context.TODO(), projectName, v1.GetOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Project not found"})
			return
		}
		if errors.IsUnauthorized(err) || errors.IsForbidden(err) {
			c.JSON(http.StatusForbidden, gin.H{"error": "Unauthorized to access project"})
			return
		}
		log.Printf("Failed to get OpenShift Project %s: %v", projectName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get project"})
		return
	}

	// Extract labels/annotations and validate Ambient label
	labels := map[string]string{}
	annotations := map[string]string{}
	if meta, ok := projObj.Object["metadata"].(map[string]interface{}); ok {
		if raw, ok := meta["labels"].(map[string]interface{}); ok {
			for k, v := range raw {
				if s, ok := v.(string); ok {
					labels[k] = s
				}
			}
		}
		if raw, ok := meta["annotations"].(map[string]interface{}); ok {
			for k, v := range raw {
				if s, ok := v.(string); ok {
					annotations[k] = s
				}
			}
		}
	}
	if labels["ambient-code.io/managed"] != "true" {
		c.JSON(http.StatusNotFound, gin.H{"error": "Project not found or not an Ambient project"})
		return
	}

	displayName := annotations["openshift.io/display-name"]
	description := annotations["openshift.io/description"]
	created := projObj.GetCreationTimestamp().Time
	status := ""
	if st, ok := projObj.Object["status"].(map[string]interface{}); ok {
		if phase, ok := st["phase"].(string); ok {
			status = phase
		}
	}

	project := AmbientProject{
		Name:              projectName,
		DisplayName:       displayName,
		Description:       description,
		Labels:            labels,
		Annotations:       annotations,
		CreationTimestamp: created.Format(time.RFC3339),
		Status:            status,
	}

	c.JSON(http.StatusOK, project)
}

func deleteProject(c *gin.Context) {
	projectName := c.Param("projectName")
	reqK8s, _ := getK8sClientsForRequest(c)
	err := reqK8s.CoreV1().Namespaces().Delete(context.TODO(), projectName, v1.DeleteOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Project not found"})
			return
		}
		log.Printf("Failed to delete project %s: %v", projectName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete project"})
		return
	}

	c.Status(http.StatusNoContent)
}

// Update basic project metadata (annotations)
func updateProject(c *gin.Context) {
	projectName := c.Param("projectName")
	_, reqDyn := getK8sClientsForRequest(c)

	var req struct {
		Name        string            `json:"name"`
		DisplayName string            `json:"displayName"`
		Description string            `json:"description"`
		Annotations map[string]string `json:"annotations"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Name != "" && req.Name != projectName {
		c.JSON(http.StatusBadRequest, gin.H{"error": "project name in URL does not match request body"})
		return
	}

	// Validate project exists and is Ambient via OpenShift Project
	projGvr := getOpenShiftProjectResource()
	projObj, err := reqDyn.Resource(projGvr).Get(context.TODO(), projectName, v1.GetOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Project not found"})
			return
		}
		log.Printf("Failed to get OpenShift Project %s: %v", projectName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get OpenShift Project"})
		return
	}
	isAmbient := false
	if meta, ok := projObj.Object["metadata"].(map[string]interface{}); ok {
		if raw, ok := meta["labels"].(map[string]interface{}); ok {
			if v, ok := raw["ambient-code.io/managed"].(string); ok && v == "true" {
				isAmbient = true
			}
		}
	}
	if !isAmbient {
		c.JSON(http.StatusNotFound, gin.H{"error": "Project not found or not an Ambient project"})
		return
	}

	// Update OpenShift Project annotations for display name and description

	// Ensure metadata.annotations exists
	meta, _ := projObj.Object["metadata"].(map[string]interface{})
	if meta == nil {
		meta = map[string]interface{}{}
		projObj.Object["metadata"] = meta
	}
	anns, _ := meta["annotations"].(map[string]interface{})
	if anns == nil {
		anns = map[string]interface{}{}
		meta["annotations"] = anns
	}

	if req.DisplayName != "" {
		anns["openshift.io/display-name"] = req.DisplayName
	}
	if req.Description != "" {
		anns["openshift.io/description"] = req.Description
	}

	// Persist Project changes
	_, updateErr := reqDyn.Resource(projGvr).Update(context.TODO(), projObj, v1.UpdateOptions{})
	if updateErr != nil {
		log.Printf("Failed to update OpenShift Project %s: %v", projectName, updateErr)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update project"})
		return
	}

	// Read back display/description from Project after update
	projObj, _ = reqDyn.Resource(projGvr).Get(context.TODO(), projectName, v1.GetOptions{})
	displayName := ""
	description := ""
	if projObj != nil {
		if meta, ok := projObj.Object["metadata"].(map[string]interface{}); ok {
			if anns, ok := meta["annotations"].(map[string]interface{}); ok {
				if v, ok := anns["openshift.io/display-name"].(string); ok {
					displayName = v
				}
				if v, ok := anns["openshift.io/description"].(string); ok {
					description = v
				}
			}
		}
	}

	// Extract labels/annotations and status from Project for response
	labels := map[string]string{}
	annotations := map[string]string{}
	if projObj != nil {
		if meta, ok := projObj.Object["metadata"].(map[string]interface{}); ok {
			if raw, ok := meta["labels"].(map[string]interface{}); ok {
				for k, v := range raw {
					if s, ok := v.(string); ok {
						labels[k] = s
					}
				}
			}
			if raw, ok := meta["annotations"].(map[string]interface{}); ok {
				for k, v := range raw {
					if s, ok := v.(string); ok {
						annotations[k] = s
					}
				}
			}
		}
	}
	created := projObj.GetCreationTimestamp().Time
	status := ""
	if st, ok := projObj.Object["status"].(map[string]interface{}); ok {
		if phase, ok := st["phase"].(string); ok {
			status = phase
		}
	}

	project := AmbientProject{
		Name:              projectName,
		DisplayName:       displayName,
		Description:       description,
		Labels:            labels,
		Annotations:       annotations,
		CreationTimestamp: created.Format(time.RFC3339),
		Status:            status,
	}

	c.JSON(http.StatusOK, project)
}

// Project settings endpoints removed in favor of native RBAC RoleBindings approach

// Group management via RoleBindings
const (
	ambientRoleAdmin = "ambient-project-admin"
	ambientRoleEdit  = "ambient-project-edit"
	ambientRoleView  = "ambient-project-view"
)

func sanitizeName(input string) string {
	s := strings.ToLower(input)
	var b strings.Builder
	prevDash := false
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			prevDash = false
		} else {
			if !prevDash {
				b.WriteByte('-')
				prevDash = true
			}
		}
		if b.Len() >= 63 {
			break
		}
	}
	out := b.String()
	out = strings.Trim(out, "-")
	if out == "" {
		out = "group"
	}
	return out
}

// Unified permissions (users and groups)
type PermissionAssignment struct {
	SubjectType string `json:"subjectType"`
	SubjectName string `json:"subjectName"`
	Role        string `json:"role"`
}

// GET /api/projects/:projectName/permissions
func listProjectPermissions(c *gin.Context) {
	projectName := c.Param("projectName")
	reqK8s, _ := getK8sClientsForRequest(c)

	// Prefer new label, but also include legacy group-access for backward-compat listing
	rbsAll, err := reqK8s.RbacV1().RoleBindings(projectName).List(context.TODO(), v1.ListOptions{})
	if err != nil {
		log.Printf("Failed to list RoleBindings in %s: %v", projectName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list permissions"})
		return
	}

	validRoles := map[string]string{
		ambientRoleAdmin: "admin",
		ambientRoleEdit:  "edit",
		ambientRoleView:  "view",
	}

	type key struct{ kind, name, role string }
	seen := map[key]struct{}{}
	assignments := []PermissionAssignment{}

	for _, rb := range rbsAll.Items {
		// Filter to Ambient-managed permission rolebindings
		if rb.Labels["app"] != "ambient-permission" && rb.Labels["app"] != "ambient-group-access" {
			continue
		}

		// Determine role from RoleRef or annotation
		role := ""
		if r, ok := validRoles[rb.RoleRef.Name]; ok && rb.RoleRef.Kind == "ClusterRole" {
			role = r
		}
		if annRole := rb.Annotations["ambient-code.io/role"]; annRole != "" {
			role = strings.ToLower(annRole)
		}
		if role == "" {
			continue
		}

		for _, sub := range rb.Subjects {
			if !strings.EqualFold(sub.Kind, "Group") && !strings.EqualFold(sub.Kind, "User") {
				continue
			}
			subjectType := "group"
			if strings.EqualFold(sub.Kind, "User") {
				subjectType = "user"
			}
			subjectName := sub.Name
			if v := rb.Annotations["ambient-code.io/subject-name"]; v != "" {
				subjectName = v
			}
			if v := rb.Annotations["ambient-code.io/groupName"]; v != "" && subjectType == "group" {
				subjectName = v
			}

			k := key{kind: subjectType, name: subjectName, role: role}
			if _, exists := seen[k]; exists {
				continue
			}
			seen[k] = struct{}{}
			assignments = append(assignments, PermissionAssignment{SubjectType: subjectType, SubjectName: subjectName, Role: role})
		}
	}

	c.JSON(http.StatusOK, gin.H{"items": assignments})
}

// POST /api/projects/:projectName/permissions
func addProjectPermission(c *gin.Context) {
	projectName := c.Param("projectName")
	reqK8s, _ := getK8sClientsForRequest(c)

	var req struct {
		SubjectType string `json:"subjectType" binding:"required"`
		SubjectName string `json:"subjectName" binding:"required"`
		Role        string `json:"role" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	st := strings.ToLower(strings.TrimSpace(req.SubjectType))
	if st != "group" && st != "user" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "subjectType must be one of: group, user"})
		return
	}
	subjectKind := "Group"
	if st == "user" {
		subjectKind = "User"
	}

	roleRefName := ""
	switch strings.ToLower(req.Role) {
	case "admin":
		roleRefName = ambientRoleAdmin
	case "edit":
		roleRefName = ambientRoleEdit
	case "view":
		roleRefName = ambientRoleView
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "role must be one of: admin, edit, view"})
		return
	}

	rbName := "ambient-permission-" + strings.ToLower(req.Role) + "-" + sanitizeName(req.SubjectName) + "-" + st
	rb := &rbacv1.RoleBinding{
		ObjectMeta: v1.ObjectMeta{
			Name:      rbName,
			Namespace: projectName,
			Labels: map[string]string{
				"app": "ambient-permission",
			},
			Annotations: map[string]string{
				"ambient-code.io/subject-kind": subjectKind,
				"ambient-code.io/subject-name": req.SubjectName,
				"ambient-code.io/role":         strings.ToLower(req.Role),
			},
		},
		RoleRef:  rbacv1.RoleRef{APIGroup: "rbac.authorization.k8s.io", Kind: "ClusterRole", Name: roleRefName},
		Subjects: []rbacv1.Subject{{Kind: subjectKind, APIGroup: "rbac.authorization.k8s.io", Name: req.SubjectName}},
	}

	if _, err := reqK8s.RbacV1().RoleBindings(projectName).Create(context.TODO(), rb, v1.CreateOptions{}); err != nil {
		if errors.IsAlreadyExists(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "permission already exists for this subject and role"})
			return
		}
		log.Printf("Failed to create RoleBinding in %s for %s %s: %v", projectName, st, req.SubjectName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to grant permission"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "permission added"})
}

// DELETE /api/projects/:projectName/permissions/:subjectType/:subjectName
func removeProjectPermission(c *gin.Context) {
	projectName := c.Param("projectName")
	subjectType := strings.ToLower(c.Param("subjectType"))
	subjectName := c.Param("subjectName")
	reqK8s, _ := getK8sClientsForRequest(c)

	if subjectType != "group" && subjectType != "user" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "subjectType must be one of: group, user"})
		return
	}
	if strings.TrimSpace(subjectName) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "subjectName is required"})
		return
	}

	rbs, err := reqK8s.RbacV1().RoleBindings(projectName).List(context.TODO(), v1.ListOptions{LabelSelector: "app=ambient-permission"})
	if err != nil {
		log.Printf("Failed to list RoleBindings in %s: %v", projectName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to remove permission"})
		return
	}

	for _, rb := range rbs.Items {
		for _, sub := range rb.Subjects {
			if strings.EqualFold(sub.Kind, "Group") && subjectType == "group" && sub.Name == subjectName {
				_ = reqK8s.RbacV1().RoleBindings(projectName).Delete(context.TODO(), rb.Name, v1.DeleteOptions{})
				break
			}
			if strings.EqualFold(sub.Kind, "User") && subjectType == "user" && sub.Name == subjectName {
				_ = reqK8s.RbacV1().RoleBindings(projectName).Delete(context.TODO(), rb.Name, v1.DeleteOptions{})
				break
			}
		}
	}

	c.Status(http.StatusNoContent)
}

// Webhook handlers - placeholder implementations
// Access key management: list/create/delete keys stored as Secrets with hashed value
func listProjectKeys(c *gin.Context) {
	projectName := c.Param("projectName")
	reqK8s, _ := getK8sClientsForRequest(c)

	// List ServiceAccounts with label app=ambient-access-key
	sas, err := reqK8s.CoreV1().ServiceAccounts(projectName).List(context.TODO(), v1.ListOptions{LabelSelector: "app=ambient-access-key"})
	if err != nil {
		log.Printf("Failed to list access keys in %s: %v", projectName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list access keys"})
		return
	}

	// Map ServiceAccount -> role by scanning RoleBindings with the same label
	roleBySA := map[string]string{}
	if rbs, err := reqK8s.RbacV1().RoleBindings(projectName).List(context.TODO(), v1.ListOptions{LabelSelector: "app=ambient-access-key"}); err == nil {
		for _, rb := range rbs.Items {
			role := strings.ToLower(rb.Annotations["ambient-code.io/role"])
			if role == "" {
				switch rb.RoleRef.Name {
				case ambientRoleAdmin:
					role = "admin"
				case ambientRoleEdit:
					role = "edit"
				case ambientRoleView:
					role = "view"
				}
			}
			for _, sub := range rb.Subjects {
				if strings.EqualFold(sub.Kind, "ServiceAccount") {
					roleBySA[sub.Name] = role
				}
			}
		}
	}

	type KeyInfo struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		CreatedAt   string `json:"createdAt"`
		LastUsedAt  string `json:"lastUsedAt"`
		Description string `json:"description,omitempty"`
		Role        string `json:"role,omitempty"`
	}

	items := []KeyInfo{}
	for _, sa := range sas.Items {
		ki := KeyInfo{ID: sa.Name, Name: sa.Annotations["ambient-code.io/key-name"], Description: sa.Annotations["ambient-code.io/description"], Role: roleBySA[sa.Name]}
		if t := sa.CreationTimestamp; !t.IsZero() {
			ki.CreatedAt = t.Time.Format(time.RFC3339)
		}
		if lu := sa.Annotations["ambient-code.io/last-used-at"]; lu != "" {
			ki.LastUsedAt = lu
		}
		items = append(items, ki)
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func createProjectKey(c *gin.Context) {
	projectName := c.Param("projectName")
	reqK8s, _ := getK8sClientsForRequest(c)

	var req struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		Role        string `json:"role"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Determine role to bind; default edit
	role := strings.ToLower(strings.TrimSpace(req.Role))
	if role == "" {
		role = "edit"
	}
	var roleRefName string
	switch role {
	case "admin":
		roleRefName = ambientRoleAdmin
	case "edit":
		roleRefName = ambientRoleEdit
	case "view":
		roleRefName = ambientRoleView
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "role must be one of: admin, edit, view"})
		return
	}

	// Create a dedicated ServiceAccount per key
	ts := time.Now().Unix()
	saName := fmt.Sprintf("ambient-key-%s-%d", sanitizeName(req.Name), ts)
	sa := &corev1.ServiceAccount{
		ObjectMeta: v1.ObjectMeta{
			Name:      saName,
			Namespace: projectName,
			Labels:    map[string]string{"app": "ambient-access-key"},
			Annotations: map[string]string{
				"ambient-code.io/key-name":    req.Name,
				"ambient-code.io/description": req.Description,
				"ambient-code.io/created-at":  time.Now().Format(time.RFC3339),
				"ambient-code.io/role":        role,
			},
		},
	}
	if _, err := reqK8s.CoreV1().ServiceAccounts(projectName).Create(context.TODO(), sa, v1.CreateOptions{}); err != nil && !errors.IsAlreadyExists(err) {
		log.Printf("Failed to create ServiceAccount %s in %s: %v", saName, projectName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create service account"})
		return
	}

	// Bind the SA to the selected role via RoleBinding
	rbName := fmt.Sprintf("ambient-key-%s-%s-%d", role, sanitizeName(req.Name), ts)
	rb := &rbacv1.RoleBinding{
		ObjectMeta: v1.ObjectMeta{
			Name:      rbName,
			Namespace: projectName,
			Labels:    map[string]string{"app": "ambient-access-key"},
			Annotations: map[string]string{
				"ambient-code.io/key-name": req.Name,
				"ambient-code.io/sa-name":  saName,
				"ambient-code.io/role":     role,
			},
		},
		RoleRef:  rbacv1.RoleRef{APIGroup: "rbac.authorization.k8s.io", Kind: "ClusterRole", Name: roleRefName},
		Subjects: []rbacv1.Subject{{Kind: "ServiceAccount", Name: saName, Namespace: projectName}},
	}
	if _, err := reqK8s.RbacV1().RoleBindings(projectName).Create(context.TODO(), rb, v1.CreateOptions{}); err != nil && !errors.IsAlreadyExists(err) {
		log.Printf("Failed to create RoleBinding %s in %s: %v", rbName, projectName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to bind service account"})
		return
	}

	// Issue a one-time JWT token for this ServiceAccount (no audience; used as API key)
	tr := &authnv1.TokenRequest{Spec: authnv1.TokenRequestSpec{}}
	tok, err := reqK8s.CoreV1().ServiceAccounts(projectName).CreateToken(context.TODO(), saName, tr, v1.CreateOptions{})
	if err != nil {
		log.Printf("Failed to create token for SA %s/%s: %v", projectName, saName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate access token"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":          saName,
		"name":        req.Name,
		"key":         tok.Status.Token,
		"description": req.Description,
		"role":        role,
		"lastUsedAt":  "",
	})
}

func deleteProjectKey(c *gin.Context) {
	projectName := c.Param("projectName")
	keyID := c.Param("keyId")
	reqK8s, _ := getK8sClientsForRequest(c)

	// Delete associated RoleBindings
	rbs, _ := reqK8s.RbacV1().RoleBindings(projectName).List(context.TODO(), v1.ListOptions{LabelSelector: "app=ambient-access-key"})
	for _, rb := range rbs.Items {
		if rb.Annotations["ambient-code.io/sa-name"] == keyID {
			_ = reqK8s.RbacV1().RoleBindings(projectName).Delete(context.TODO(), rb.Name, v1.DeleteOptions{})
		}
	}

	// Delete the ServiceAccount itself
	if err := reqK8s.CoreV1().ServiceAccounts(projectName).Delete(context.TODO(), keyID, v1.DeleteOptions{}); err != nil {
		if !errors.IsNotFound(err) {
			log.Printf("Failed to delete service account %s in %s: %v", keyID, projectName, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete access key"})
			return
		}
	}

	c.Status(http.StatusNoContent)
}

// handleJiraWebhook removed; use standard session creation endpoint instead

// (removed) Metrics handler placeholder; real implementation lives in observability.go

// ========================= Project-scoped RFE Handlers =========================

// rfeFromUnstructured converts an unstructured RFEWorkflow CR into our RFEWorkflow struct
func rfeFromUnstructured(item *unstructured.Unstructured) *RFEWorkflow {
	if item == nil {
		return nil
	}
	obj := item.Object
	spec, _ := obj["spec"].(map[string]interface{})

	created := ""
	if item.GetCreationTimestamp().Time != (time.Time{}) {
		created = item.GetCreationTimestamp().Time.UTC().Format(time.RFC3339)
	}
	wf := &RFEWorkflow{
		ID:            item.GetName(),
		Title:         fmt.Sprintf("%v", spec["title"]),
		Description:   fmt.Sprintf("%v", spec["description"]),
		Project:       item.GetNamespace(),
		WorkspacePath: fmt.Sprintf("%v", spec["workspacePath"]),
		CreatedAt:     created,
		UpdatedAt:     time.Now().UTC().Format(time.RFC3339),
	}

	// Parse umbrellaRepo/supportingRepos when present; fallback to repositories
	if um, ok := spec["umbrellaRepo"].(map[string]interface{}); ok {
		repo := GitRepository{}
		if u, ok := um["url"].(string); ok {
			repo.URL = u
		}
		if b, ok := um["branch"].(string); ok && strings.TrimSpace(b) != "" {
			repo.Branch = stringPtr(b)
		}
		wf.UmbrellaRepo = &repo
	}
	if srs, ok := spec["supportingRepos"].([]interface{}); ok {
		wf.SupportingRepos = make([]GitRepository, 0, len(srs))
		for _, r := range srs {
			if rm, ok := r.(map[string]interface{}); ok {
				repo := GitRepository{}
				if u, ok := rm["url"].(string); ok {
					repo.URL = u
				}
				if b, ok := rm["branch"].(string); ok && strings.TrimSpace(b) != "" {
					repo.Branch = stringPtr(b)
				}
				wf.SupportingRepos = append(wf.SupportingRepos, repo)
			}
		}
	} else if repos, ok := spec["repositories"].([]interface{}); ok {
		// Backward compatibility: map legacy repositories -> umbrellaRepo (first) + supportingRepos (rest)
		for i, r := range repos {
			if rm, ok := r.(map[string]interface{}); ok {
				repo := GitRepository{}
				if u, ok := rm["url"].(string); ok {
					repo.URL = u
				}
				if b, ok := rm["branch"].(string); ok && strings.TrimSpace(b) != "" {
					repo.Branch = stringPtr(b)
				}
				if i == 0 {
					rcopy := repo
					wf.UmbrellaRepo = &rcopy
				} else {
					wf.SupportingRepos = append(wf.SupportingRepos, repo)
				}
			}
		}
	}

	// Parse jiraLinks
	if links, ok := spec["jiraLinks"].([]interface{}); ok {
		for _, it := range links {
			if m, ok := it.(map[string]interface{}); ok {
				path := fmt.Sprintf("%v", m["path"])
				jiraKey := fmt.Sprintf("%v", m["jiraKey"])
				if strings.TrimSpace(path) != "" && strings.TrimSpace(jiraKey) != "" {
					wf.JiraLinks = append(wf.JiraLinks, WorkflowJiraLink{Path: path, JiraKey: jiraKey})
				}
			}
		}
	}

	// Parse parentOutcome
	if po, ok := spec["parentOutcome"].(string); ok && strings.TrimSpace(po) != "" {
		wf.ParentOutcome = stringPtr(strings.TrimSpace(po))
	}

	return wf
}

func listProjectRFEWorkflows(c *gin.Context) {
	project := c.Param("projectName")
	var workflows []RFEWorkflow
	// Prefer CRD list with request-scoped client; fallback to file scan if unavailable or fails
	gvr := getRFEWorkflowResource()
	_, reqDyn := getK8sClientsForRequest(c)
	if reqDyn != nil {
		if list, err := reqDyn.Resource(gvr).Namespace(project).List(context.TODO(), v1.ListOptions{LabelSelector: fmt.Sprintf("project=%s", project)}); err == nil {
			for _, item := range list.Items {
				wf := rfeFromUnstructured(&item)
				if wf == nil {
					continue
				}
				workflows = append(workflows, *wf)
			}
		}
	}
	if workflows == nil {
		workflows = []RFEWorkflow{}
	}
	// Return slim summaries: omit artifacts/agentSessions/phaseResults/status/currentPhase
	summaries := make([]map[string]interface{}, 0, len(workflows))
	for _, w := range workflows {
		item := map[string]interface{}{
			"id":            w.ID,
			"title":         w.Title,
			"description":   w.Description,
			"project":       w.Project,
			"workspacePath": w.WorkspacePath,
			"createdAt":     w.CreatedAt,
			"updatedAt":     w.UpdatedAt,
		}
		if w.UmbrellaRepo != nil {
			u := map[string]interface{}{"url": w.UmbrellaRepo.URL}
			if w.UmbrellaRepo.Branch != nil {
				u["branch"] = *w.UmbrellaRepo.Branch
			}
			item["umbrellaRepo"] = u
		}
		if len(w.SupportingRepos) > 0 {
			repos := make([]map[string]interface{}, 0, len(w.SupportingRepos))
			for _, r := range w.SupportingRepos {
				rm := map[string]interface{}{"url": r.URL}
				if r.Branch != nil {
					rm["branch"] = *r.Branch
				}
				repos = append(repos, rm)
			}
			item["supportingRepos"] = repos
		}
		summaries = append(summaries, item)
	}
	c.JSON(http.StatusOK, gin.H{"workflows": summaries})
}

func createProjectRFEWorkflow(c *gin.Context) {
	project := c.Param("projectName")
	var req CreateRFEWorkflowRequest
	bodyBytes, _ := c.GetRawData()
	c.Request.Body = ioutil.NopCloser(strings.NewReader(string(bodyBytes)))
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Validation failed: " + err.Error()})
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	workflowID := fmt.Sprintf("rfe-%d", time.Now().Unix())
	workflow := &RFEWorkflow{
		ID:              workflowID,
		Title:           req.Title,
		Description:     req.Description,
		UmbrellaRepo:    &req.UmbrellaRepo,
		SupportingRepos: req.SupportingRepos,
		WorkspacePath:   req.WorkspacePath,
		Project:         project,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	_, reqDyn := getK8sClientsForRequest(c)
	if err := upsertProjectRFEWorkflowCR(reqDyn, workflow); err != nil {
		log.Printf("⚠️ Failed to upsert RFEWorkflow CR: %v", err)
	}

	// Seeding (spec-kit + agents) is now handled by POST /seed endpoint after creation

	c.JSON(http.StatusCreated, workflow)
}

// seedProjectRFEWorkflow seeds the umbrella repo with spec-kit and agents via direct git operations
func seedProjectRFEWorkflow(c *gin.Context) {
	project := c.Param("projectName")
	id := c.Param("id")

	// Get the workflow
	gvr := getRFEWorkflowResource()
	reqK8s, reqDyn := getK8sClientsForRequest(c)
	if reqDyn == nil || reqK8s == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
		return
	}

	item, err := reqDyn.Resource(gvr).Namespace(project).Get(context.TODO(), id, v1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Workflow not found"})
		return
	}
	wf := rfeFromUnstructured(item)
	if wf == nil || wf.UmbrellaRepo == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No umbrella repo configured"})
		return
	}

	// Get user ID from forwarded identity middleware
	userID, _ := c.Get("userID")
	userIDStr, ok := userID.(string)
	if !ok || userIDStr == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User identity required"})
		return
	}

	githubToken, err := getGitHubToken(c.Request.Context(), reqK8s, reqDyn, project, userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Read request body for optional agent source
	type SeedRequest struct {
		AgentSourceURL    string `json:"agentSourceUrl,omitempty"`
		AgentSourceBranch string `json:"agentSourceBranch,omitempty"`
		AgentSourcePath   string `json:"agentSourcePath,omitempty"`
		SpecKitVersion    string `json:"specKitVersion,omitempty"`
		SpecKitTemplate   string `json:"specKitTemplate,omitempty"`
	}
	var req SeedRequest
	_ = c.ShouldBindJSON(&req)

	// Defaults
	agentURL := req.AgentSourceURL
	if agentURL == "" {
		agentURL = "https://github.com/ambient-code/vTeam.git"
	}
	agentBranch := req.AgentSourceBranch
	if agentBranch == "" {
		agentBranch = "main"
	}
	agentPath := req.AgentSourcePath
	if agentPath == "" {
		agentPath = "agents"
	}
	specKitVersion := req.SpecKitVersion
	if specKitVersion == "" {
		specKitVersion = "v0.0.55"
	}
	specKitTemplate := req.SpecKitTemplate
	if specKitTemplate == "" {
		specKitTemplate = "spec-kit-template-claude-sh"
	}

	// Perform seeding operations
	seedErr := performRepoSeeding(c.Request.Context(), wf, githubToken, agentURL, agentBranch, agentPath, specKitVersion, specKitTemplate)

	if seedErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": seedErr.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "completed",
		"message": "Repository seeded successfully",
	})
}

// checkProjectRFEWorkflowSeeding checks if the umbrella repo is seeded by querying GitHub API
func checkProjectRFEWorkflowSeeding(c *gin.Context) {
	project := c.Param("projectName")
	id := c.Param("id")

	// Get the workflow
	gvr := getRFEWorkflowResource()
	reqK8s, reqDyn := getK8sClientsForRequest(c)
	if reqDyn == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
		return
	}

	item, err := reqDyn.Resource(gvr).Namespace(project).Get(context.TODO(), id, v1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Workflow not found"})
		return
	}
	wf := rfeFromUnstructured(item)
	if wf == nil || wf.UmbrellaRepo == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No umbrella repo configured"})
		return
	}

	// Get user ID from forwarded identity middleware
	userID, _ := c.Get("userID")
	userIDStr, ok := userID.(string)
	if !ok || userIDStr == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User identity required"})
		return
	}

	githubToken, err := getGitHubToken(c.Request.Context(), reqK8s, reqDyn, project, userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check if repo is seeded
	isSeeded, details, err := checkRepoSeeding(c.Request.Context(), wf.UmbrellaRepo.URL, wf.UmbrellaRepo.Branch, githubToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"isSeeded": isSeeded,
		"details":  details,
	})
}

func getProjectRFEWorkflow(c *gin.Context) {
	project := c.Param("projectName")
	id := c.Param("id")
	// Try CRD with request-scoped client first
	gvr := getRFEWorkflowResource()
	_, reqDyn := getK8sClientsForRequest(c)
	var wf *RFEWorkflow
	var err error
	if reqDyn != nil {
		if item, gerr := reqDyn.Resource(gvr).Namespace(project).Get(context.TODO(), id, v1.GetOptions{}); gerr == nil {
			wf = rfeFromUnstructured(item)
			err = nil
		} else {
			err = gerr
		}
	}
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Workflow not found"})
		return
	}
	// Return slim object without artifacts/agentSessions/phaseResults/status/currentPhase
	resp := map[string]interface{}{
		"id":            wf.ID,
		"title":         wf.Title,
		"description":   wf.Description,
		"project":       wf.Project,
		"workspacePath": wf.WorkspacePath,
		"createdAt":     wf.CreatedAt,
		"updatedAt":     wf.UpdatedAt,
	}
	if wf.ParentOutcome != nil {
		resp["parentOutcome"] = *wf.ParentOutcome
	}
	if len(wf.JiraLinks) > 0 {
		links := make([]map[string]interface{}, 0, len(wf.JiraLinks))
		for _, l := range wf.JiraLinks {
			links = append(links, map[string]interface{}{"path": l.Path, "jiraKey": l.JiraKey})
		}
		resp["jiraLinks"] = links
	}
	if wf.UmbrellaRepo != nil {
		u := map[string]interface{}{"url": wf.UmbrellaRepo.URL}
		if wf.UmbrellaRepo.Branch != nil {
			u["branch"] = *wf.UmbrellaRepo.Branch
		}
		resp["umbrellaRepo"] = u
	}
	if len(wf.SupportingRepos) > 0 {
		repos := make([]map[string]interface{}, 0, len(wf.SupportingRepos))
		for _, r := range wf.SupportingRepos {
			rm := map[string]interface{}{"url": r.URL}
			if r.Branch != nil {
				rm["branch"] = *r.Branch
			}
			repos = append(repos, rm)
		}
		resp["supportingRepos"] = repos
	}
	c.JSON(http.StatusOK, resp)
}

// GET /api/projects/:projectName/rfe-workflows/:id/summary
// Computes derived phase/status and progress based on workspace files and linked sessions
func getProjectRFEWorkflowSummary(c *gin.Context) {
	project := c.Param("projectName")
	id := c.Param("id")

	// Determine workspace and expected files
	// workspace content removed
	specsItems := []contentListItem{}

	hasSpec := false
	hasPlan := false
	hasTasks := false

	// helper to scan a list for target filenames
	scanFor := func(items []contentListItem) (bool, bool, bool) {
		s, p, t := false, false, false
		for _, it := range items {
			if it.IsDir {
				continue
			}
			switch strings.ToLower(it.Name) {
			case "spec.md":
				s = true
			case "plan.md":
				p = true
			case "tasks.md":
				t = true
			}
		}
		return s, p, t
	}

	// First check directly under specs/
	if len(specsItems) > 0 {
		s, p, t := scanFor(specsItems)
		hasSpec, hasPlan, hasTasks = s, p, t
		// If not found, check first subfolder under specs/
		if !(hasSpec || hasPlan || hasTasks) {
			for _, it := range specsItems {
				if it.IsDir {
					subItems := []contentListItem{}
					s2, p2, t2 := scanFor(subItems)
					hasSpec, hasPlan, hasTasks = s2, p2, t2
					break
				}
			}
		}
	}

	// Sessions: find linked sessions and compute running/failed flags
	gvr := getAgenticSessionV1Alpha1Resource()
	_, reqDyn := getK8sClientsForRequest(c)
	anyRunning := false
	anyFailed := false
	if reqDyn != nil {
		selector := fmt.Sprintf("rfe-workflow=%s,project=%s", id, project)
		if list, err := reqDyn.Resource(gvr).Namespace(project).List(context.TODO(), v1.ListOptions{LabelSelector: selector}); err == nil {
			for _, item := range list.Items {
				status, _ := item.Object["status"].(map[string]interface{})
				phaseStr := strings.ToLower(fmt.Sprintf("%v", status["phase"]))
				if phaseStr == "running" || phaseStr == "creating" || phaseStr == "pending" {
					anyRunning = true
				}
				if phaseStr == "failed" || phaseStr == "error" {
					anyFailed = true
				}
			}
		}
	}

	// Derive phase and status
	var phase string
	switch {
	case !hasSpec && !hasPlan && !hasTasks:
		phase = "pre"
	case !hasSpec:
		phase = "specify"
	case !hasPlan:
		phase = "plan"
	case !hasTasks:
		phase = "tasks"
	default:
		phase = "completed"
	}

	status := "not started"
	if anyRunning {
		status = "running"
	} else if hasSpec || hasPlan || hasTasks {
		status = "in progress"
	}
	if hasSpec && hasPlan && hasTasks && !anyRunning {
		status = "completed"
	}
	if anyFailed && status != "running" {
		status = "attention"
	}

	progress := float64(0)
	done := 0
	if hasSpec {
		done++
	}
	if hasPlan {
		done++
	}
	if hasTasks {
		done++
	}
	progress = float64(done) / 3.0 * 100.0

	c.JSON(http.StatusOK, gin.H{
		"phase":    phase,
		"status":   status,
		"progress": progress,
		"files": gin.H{
			"spec":  hasSpec,
			"plan":  hasPlan,
			"tasks": hasTasks,
		},
	})
}

func deleteProjectRFEWorkflow(c *gin.Context) {
	id := c.Param("id")
	// Delete CR
	gvr := getRFEWorkflowResource()
	_, reqDyn := getK8sClientsForRequest(c)
	if reqDyn != nil {
		_ = reqDyn.Resource(gvr).Namespace(c.Param("projectName")).Delete(context.TODO(), id, v1.DeleteOptions{})
	}
	c.JSON(http.StatusOK, gin.H{"message": "Workflow deleted successfully"})
}

// extractTitleFromContent attempts to extract a title from markdown content
// by looking for the first # heading
func extractTitleFromContent(content string) string {
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "# ") {
			return strings.TrimSpace(strings.TrimPrefix(line, "# "))
		}
	}
	return ""
}

// publishWorkflowFileToJira is now in jira.go

// List sessions linked to a project-scoped RFE workflow by label selector
func listProjectRFEWorkflowSessions(c *gin.Context) {
	project := c.Param("projectName")
	id := c.Param("id")
	gvr := getAgenticSessionV1Alpha1Resource()
	selector := fmt.Sprintf("rfe-workflow=%s,project=%s", id, project)
	_, reqDyn := getK8sClientsForRequest(c)
	if reqDyn == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing or invalid user token"})
		return
	}
	list, err := reqDyn.Resource(gvr).Namespace(project).List(context.TODO(), v1.ListOptions{LabelSelector: selector})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list sessions", "details": err.Error()})
		return
	}

	// Return full session objects for UI
	sessions := make([]map[string]interface{}, 0, len(list.Items))
	for _, item := range list.Items {
		sessions = append(sessions, item.Object)
	}
	c.JSON(http.StatusOK, gin.H{"sessions": sessions})
}

type rfeLinkSessionRequest struct {
	ExistingName string `json:"existingName"`
	Phase        string `json:"phase"`
}

// Add/link an existing session to an RFE by applying labels
func addProjectRFEWorkflowSession(c *gin.Context) {
	project := c.Param("projectName")
	id := c.Param("id")
	var req rfeLinkSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}
	if req.ExistingName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "existingName is required for linking in this version"})
		return
	}
	gvr := getAgenticSessionV1Alpha1Resource()
	_, reqDyn := getK8sClientsForRequest(c)
	if reqDyn == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing or invalid user token"})
		return
	}
	obj, err := reqDyn.Resource(gvr).Namespace(project).Get(context.TODO(), req.ExistingName, v1.GetOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch session", "details": err.Error()})
		return
	}
	meta, _ := obj.Object["metadata"].(map[string]interface{})
	labels, _ := meta["labels"].(map[string]interface{})
	if labels == nil {
		labels = map[string]interface{}{}
		meta["labels"] = labels
	}
	labels["project"] = project
	labels["rfe-workflow"] = id
	if req.Phase != "" {
		labels["rfe-phase"] = req.Phase
	}
	// Update the resource
	updated, err := reqDyn.Resource(gvr).Namespace(project).Update(context.TODO(), obj, v1.UpdateOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update session labels", "details": err.Error()})
		return
	}
	_ = updated
	c.JSON(http.StatusOK, gin.H{"message": "Session linked to RFE", "session": req.ExistingName})
}

// Remove/unlink a session from an RFE by clearing linkage labels (non-destructive)
func removeProjectRFEWorkflowSession(c *gin.Context) {
	project := c.Param("projectName")
	_ = project // currently unused but kept for parity/logging if needed
	id := c.Param("id")
	sessionName := c.Param("sessionName")
	gvr := getAgenticSessionV1Alpha1Resource()
	_, reqDyn := getK8sClientsForRequest(c)
	if reqDyn == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing or invalid user token"})
		return
	}
	obj, err := reqDyn.Resource(gvr).Namespace(project).Get(context.TODO(), sessionName, v1.GetOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch session", "details": err.Error()})
		return
	}
	meta, _ := obj.Object["metadata"].(map[string]interface{})
	labels, _ := meta["labels"].(map[string]interface{})
	if labels != nil {
		delete(labels, "rfe-workflow")
		delete(labels, "rfe-phase")
	}
	if _, err := reqDyn.Resource(gvr).Namespace(project).Update(context.TODO(), obj, v1.UpdateOptions{}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update session labels", "details": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Session unlinked from RFE", "session": sessionName, "rfe": id})
}

// GET /api/projects/:projectName/rfe-workflows/:id/jira?path=...
// Proxies Jira issue fetch for a linked path
func getWorkflowJira(c *gin.Context) {
	project := c.Param("projectName")
	id := c.Param("id")
	reqPath := strings.TrimSpace(c.Query("path"))
	if reqPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "path is required"})
		return
	}
	_, reqDyn := getK8sClientsForRequest(c)
	reqK8s, _ := getK8sClientsForRequest(c)
	if reqDyn == nil || reqK8s == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing or invalid user token"})
		return
	}
	// Load workflow to find key
	gvrWf := getRFEWorkflowResource()
	item, err := reqDyn.Resource(gvrWf).Namespace(project).Get(c.Request.Context(), id, v1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Workflow not found"})
		return
	}
	wf := rfeFromUnstructured(item)
	var key string
	for _, jl := range wf.JiraLinks {
		if strings.TrimSpace(jl.Path) == reqPath {
			key = jl.JiraKey
			break
		}
	}
	if key == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "No Jira linked for path"})
		return
	}
	// Load Jira creds
	// Determine secret name
	secretName := "ambient-runner-secrets"
	if obj, err := reqDyn.Resource(getProjectSettingsResource()).Namespace(project).Get(c.Request.Context(), "projectsettings", v1.GetOptions{}); err == nil {
		if spec, ok := obj.Object["spec"].(map[string]interface{}); ok {
			if v, ok := spec["runnerSecretsName"].(string); ok && strings.TrimSpace(v) != "" {
				secretName = strings.TrimSpace(v)
			}
		}
	}
	sec, err := reqK8s.CoreV1().Secrets(project).Get(c.Request.Context(), secretName, v1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to read runner secret", "details": err.Error()})
		return
	}
	get := func(k string) string {
		if b, ok := sec.Data[k]; ok {
			return string(b)
		}
		return ""
	}
	jiraURL := strings.TrimSpace(get("JIRA_URL"))
	jiraToken := strings.TrimSpace(get("JIRA_API_TOKEN"))
	if jiraURL == "" || jiraToken == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing Jira configuration in runner secret (JIRA_URL, JIRA_API_TOKEN required)"})
		return
	}
	jiraBase := strings.TrimRight(jiraURL, "/")
	endpoint := fmt.Sprintf("%s/rest/api/2/issue/%s", jiraBase, url.PathEscape(key))
	httpReq, _ := http.NewRequest("GET", endpoint, nil)
	httpReq.Header.Set("Authorization", "Bearer "+jiraToken)
	httpClient := &http.Client{Timeout: 30 * time.Second}
	httpResp, httpErr := httpClient.Do(httpReq)
	if httpErr != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Jira request failed", "details": httpErr.Error()})
		return
	}
	defer httpResp.Body.Close()
	respBody, _ := io.ReadAll(httpResp.Body)
	c.Data(httpResp.StatusCode, "application/json", respBody)
}

// Runner secrets management
// Config is stored in ProjectSettings.spec.runnerSecretsName
// The Secret lives in the project namespace and stores key/value pairs for runners

// GET /api/projects/:projectName/secrets -> { items: [{name, createdAt}] }
func listNamespaceSecrets(c *gin.Context) {
	projectName := c.Param("projectName")
	reqK8s, _ := getK8sClientsForRequest(c)

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
			it.CreatedAt = s.CreationTimestamp.Time.Format(time.RFC3339)
		}
		items = append(items, it)
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

// GET /api/projects/:projectName/runner-secrets/config
func getRunnerSecretsConfig(c *gin.Context) {
	projectName := c.Param("projectName")
	_, reqDyn := getK8sClientsForRequest(c)

	gvr := getProjectSettingsResource()
	// ProjectSettings is a singleton per namespace named 'projectsettings'
	obj, err := reqDyn.Resource(gvr).Namespace(projectName).Get(c.Request.Context(), "projectsettings", v1.GetOptions{})
	if err != nil && !errors.IsNotFound(err) {
		log.Printf("Failed to read ProjectSettings for %s: %v", projectName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read runner secrets config"})
		return
	}

	secretName := ""
	if obj != nil {
		if spec, ok := obj.Object["spec"].(map[string]interface{}); ok {
			if v, ok := spec["runnerSecretsName"].(string); ok {
				secretName = v
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{"secretName": secretName})
}

// PUT /api/projects/:projectName/runner-secrets/config { secretName }
func updateRunnerSecretsConfig(c *gin.Context) {
	projectName := c.Param("projectName")
	_, reqDyn := getK8sClientsForRequest(c)

	var req struct {
		SecretName string `json:"secretName" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(req.SecretName) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "secretName is required"})
		return
	}

	// Operator owns ProjectSettings. If it exists, update; otherwise, return not found.
	gvr := getProjectSettingsResource()
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

	// Update spec.runnerSecretsName
	spec, _ := obj.Object["spec"].(map[string]interface{})
	if spec == nil {
		spec = map[string]interface{}{}
		obj.Object["spec"] = spec
	}
	spec["runnerSecretsName"] = req.SecretName

	if _, err := reqDyn.Resource(gvr).Namespace(projectName).Update(c.Request.Context(), obj, v1.UpdateOptions{}); err != nil {
		log.Printf("Failed to update ProjectSettings for %s: %v", projectName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update runner secrets config"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"secretName": req.SecretName})
}

// GET /api/projects/:projectName/runner-secrets -> { data: { key: value } }
func listRunnerSecrets(c *gin.Context) {
	projectName := c.Param("projectName")
	reqK8s, reqDyn := getK8sClientsForRequest(c)

	// Read config
	gvr := getProjectSettingsResource()
	obj, err := reqDyn.Resource(gvr).Namespace(projectName).Get(c.Request.Context(), "projectsettings", v1.GetOptions{})
	if err != nil && !errors.IsNotFound(err) {
		log.Printf("Failed to read ProjectSettings for %s: %v", projectName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read runner secrets config"})
		return
	}
	secretName := ""
	if obj != nil {
		if spec, ok := obj.Object["spec"].(map[string]interface{}); ok {
			if v, ok := spec["runnerSecretsName"].(string); ok {
				secretName = v
			}
		}
	}
	if secretName == "" {
		c.JSON(http.StatusOK, gin.H{"data": map[string]string{}})
		return
	}

	sec, err := reqK8s.CoreV1().Secrets(projectName).Get(c.Request.Context(), secretName, v1.GetOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusOK, gin.H{"data": map[string]string{}})
			return
		}
		log.Printf("Failed to get Secret %s/%s: %v", projectName, secretName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read runner secrets"})
		return
	}

	out := map[string]string{}
	for k, v := range sec.Data {
		out[k] = string(v)
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

// PUT /api/projects/:projectName/runner-secrets { data: { key: value } }
func updateRunnerSecrets(c *gin.Context) {
	projectName := c.Param("projectName")
	reqK8s, reqDyn := getK8sClientsForRequest(c)

	var req struct {
		Data map[string]string `json:"data" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Read config for secret name
	gvr := getProjectSettingsResource()
	obj, err := reqDyn.Resource(gvr).Namespace(projectName).Get(c.Request.Context(), "projectsettings", v1.GetOptions{})
	if err != nil && !errors.IsNotFound(err) {
		log.Printf("Failed to read ProjectSettings for %s: %v", projectName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read runner secrets config"})
		return
	}
	secretName := ""
	if obj != nil {
		if spec, ok := obj.Object["spec"].(map[string]interface{}); ok {
			if v, ok := spec["runnerSecretsName"].(string); ok {
				secretName = strings.TrimSpace(v)
			}
		}
	}
	if secretName == "" {
		secretName = "ambient-runner-secrets"
	}

	// Do not create/update ProjectSettings here. The operator owns it.

	// Try to get existing Secret
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
			StringData: req.Data,
		}
		if _, err := reqK8s.CoreV1().Secrets(projectName).Create(c.Request.Context(), newSec, v1.CreateOptions{}); err != nil {
			log.Printf("Failed to create Secret %s/%s: %v", projectName, secretName, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create runner secrets"})
			return
		}
	} else if err != nil {
		log.Printf("Failed to get Secret %s/%s: %v", projectName, secretName, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read runner secrets"})
		return
	} else {
		// Update existing - replace Data
		sec.Type = corev1.SecretTypeOpaque
		sec.Data = map[string][]byte{}
		for k, v := range req.Data {
			sec.Data[k] = []byte(v)
		}
		if _, err := reqK8s.CoreV1().Secrets(projectName).Update(c.Request.Context(), sec, v1.UpdateOptions{}); err != nil {
			log.Printf("Failed to update Secret %s/%s: %v", projectName, secretName, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update runner secrets"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "runner secrets updated"})
}
