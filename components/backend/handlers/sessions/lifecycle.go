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
)

func StartSession(c *gin.Context) {
	project := c.GetString("project")
	sessionName := c.Param("sessionName")
	reqK8s, reqDyn := handlers.GetK8sClientsForRequest(c)
	gvr := GetAgenticSessionV1Alpha1Resource()

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

	// Ensure runner role has required permissions (update if needed for existing sessions)
	if err := ensureRunnerRolePermissions(c, reqK8s, project, sessionName); err != nil {
		log.Printf("Warning: failed to ensure runner role permissions for %s: %v", sessionName, err)
		// Non-fatal - continue with restart
	}

	// Clean up temp-content pod if it exists to free the PVC
	// This prevents Multi-Attach errors when the session job tries to mount the workspace
	if reqK8s != nil {
		tempPodName := fmt.Sprintf("temp-content-%s", sessionName)
		if err := reqK8s.CoreV1().Pods(project).Delete(c.Request.Context(), tempPodName, v1.DeleteOptions{}); err != nil {
			if !errors.IsNotFound(err) {
				log.Printf("StartSession: failed to delete temp-content pod %s (non-fatal): %v", tempPodName, err)
			}
		} else {
			log.Printf("StartSession: deleted temp-content pod %s to free PVC", tempPodName)
		}
	}

	// Check if this is a continuation (session is in a terminal phase)
	// Terminal phases from CRD: Completed, Failed, Stopped, Error
	isActualContinuation := false
	currentPhase := ""
	if currentStatus, ok := item.Object["status"].(map[string]interface{}); ok {
		if phase, ok := currentStatus["phase"].(string); ok {
			currentPhase = phase
			terminalPhases := []string{"Completed", "Failed", "Stopped", "Error"}
			for _, terminalPhase := range terminalPhases {
				if phase == terminalPhase {
					isActualContinuation = true
					log.Printf("StartSession: Detected continuation - session is in terminal phase: %s", phase)
					break
				}
			}
		}
	}

	if !isActualContinuation {
		log.Printf("StartSession: Not a continuation - current phase is: %s (not in terminal phases)", currentPhase)
	}

	// Only set parent session annotation if this is an actual continuation
	// Don't set it on first start, even though StartSession can be called for initial creation
	if isActualContinuation {
		annotations := item.GetAnnotations()
		if annotations == nil {
			annotations = make(map[string]string)
		}
		annotations["vteam.ambient-code/parent-session-id"] = sessionName
		item.SetAnnotations(annotations)
		log.Printf("StartSession: Set parent-session-id annotation to %s for continuation (has completion time)", sessionName)

		// For headless sessions being continued, force interactive mode
		if spec, ok := item.Object["spec"].(map[string]interface{}); ok {
			if interactive, ok := spec["interactive"].(bool); !ok || !interactive {
				// Session was headless, convert to interactive
				spec["interactive"] = true
				log.Printf("StartSession: Converting headless session to interactive for continuation")
			}
		}

		// Update the metadata and spec to persist the annotation and interactive flag
		item, err = reqDyn.Resource(gvr).Namespace(project).Update(context.TODO(), item, v1.UpdateOptions{})
		if err != nil {
			log.Printf("Failed to update agentic session metadata %s in project %s: %v", sessionName, project, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update session metadata"})
			return
		}

		// Regenerate runner token for continuation (old token may have expired)
		log.Printf("StartSession: Regenerating runner token for session continuation")
		if err := ProvisionRunnerTokenForSession(c, reqK8s, reqDyn, project, sessionName); err != nil {
			log.Printf("Warning: failed to regenerate runner token for session %s/%s: %v", project, sessionName, err)
			// Non-fatal: continue anyway, operator may retry
		} else {
			log.Printf("StartSession: Successfully regenerated runner token for continuation")

			// Delete the old job so operator creates a new one
			// This ensures fresh token and clean state
			jobName := fmt.Sprintf("ambient-runner-%s", sessionName)
			log.Printf("StartSession: Deleting old job %s to allow operator to create fresh one", jobName)
			if err := reqK8s.BatchV1().Jobs(project).Delete(c.Request.Context(), jobName, v1.DeleteOptions{
				PropagationPolicy: func() *v1.DeletionPropagation { p := v1.DeletePropagationBackground; return &p }(),
			}); err != nil {
				if !errors.IsNotFound(err) {
					log.Printf("Warning: failed to delete old job %s: %v", jobName, err)
				} else {
					log.Printf("StartSession: Job %s already gone", jobName)
				}
			} else {
				log.Printf("StartSession: Successfully deleted old job %s", jobName)
			}
		}
	} else {
		log.Printf("StartSession: Not setting parent-session-id (first run, no completion time)")
	}

	// Now update status to trigger start (using the fresh object from Update)
	if item.Object["status"] == nil {
		item.Object["status"] = make(map[string]interface{})
	}

	status := item.Object["status"].(map[string]interface{})
	// Set to Pending so operator will process it (operator only acts on Pending phase)
	status["phase"] = "Pending"
	status["message"] = "Session restart requested"
	// Clear completion time from previous run
	delete(status, "completionTime")
	// Update start time for this run
	status["startTime"] = time.Now().Format(time.RFC3339)

	// Update the status subresource (must use UpdateStatus, not Update)
	updated, err := reqDyn.Resource(gvr).Namespace(project).UpdateStatus(context.TODO(), item, v1.UpdateOptions{})
	if err != nil {
		log.Printf("Failed to start agentic session %s in project %s: %v", sessionName, project, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start agentic session"})
		return
	}

	// Parse and return updated session
	session := types.AgenticSession{
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

func StopSession(c *gin.Context) {
	project := c.GetString("project")
	sessionName := c.Param("sessionName")
	reqK8s, reqDyn := handlers.GetK8sClientsForRequest(c)
	gvr := GetAgenticSessionV1Alpha1Resource()

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
	if !jobExists || jobName == "" {
		// Try to derive job name if not in status
		jobName = fmt.Sprintf("%s-job", sessionName)
		log.Printf("Job name not in status, trying derived name: %s", jobName)
	}

	// Delete the job and its pods
	log.Printf("Attempting to delete job %s for session %s", jobName, sessionName)

	// First, delete the job itself with foreground propagation
	deletePolicy := v1.DeletePropagationForeground
	err = reqK8s.BatchV1().Jobs(project).Delete(context.TODO(), jobName, v1.DeleteOptions{
		PropagationPolicy: &deletePolicy,
	})
	if err != nil {
		if errors.IsNotFound(err) {
			log.Printf("Job %s not found (may have already completed or been deleted)", jobName)
		} else {
			log.Printf("Failed to delete job %s: %v", jobName, err)
			// Don't fail the request if job deletion fails - continue with status update
			log.Printf("Continuing with status update despite job deletion failure")
		}
	} else {
		log.Printf("Successfully deleted job %s for agentic session %s", jobName, sessionName)
	}

	// Then, explicitly delete all pods for this job (by job-name label)
	podSelector := fmt.Sprintf("job-name=%s", jobName)
	log.Printf("Deleting pods with job-name selector: %s", podSelector)
	err = reqK8s.CoreV1().Pods(project).DeleteCollection(context.TODO(), v1.DeleteOptions{}, v1.ListOptions{
		LabelSelector: podSelector,
	})
	if err != nil && !errors.IsNotFound(err) {
		log.Printf("Failed to delete pods for job %s: %v (continuing anyway)", jobName, err)
	} else {
		log.Printf("Successfully deleted pods for job %s", jobName)
	}

	// Also delete any pods labeled with this session (in case owner refs are lost)
	sessionPodSelector := fmt.Sprintf("agentic-session=%s", sessionName)
	log.Printf("Deleting pods with agentic-session selector: %s", sessionPodSelector)
	err = reqK8s.CoreV1().Pods(project).DeleteCollection(context.TODO(), v1.DeleteOptions{}, v1.ListOptions{
		LabelSelector: sessionPodSelector,
	})
	if err != nil && !errors.IsNotFound(err) {
		log.Printf("Failed to delete session pods: %v (continuing anyway)", err)
	} else {
		log.Printf("Successfully deleted session-labeled pods")
	}

	// Update status to Stopped
	status["phase"] = "Stopped"
	status["message"] = "Session stopped by user"
	status["completionTime"] = time.Now().Format(time.RFC3339)

	// Also set interactive: true in spec so session can be restarted
	if spec, ok := item.Object["spec"].(map[string]interface{}); ok {
		if interactive, ok := spec["interactive"].(bool); !ok || !interactive {
			log.Printf("Setting interactive: true for stopped session %s to allow restart", sessionName)
			spec["interactive"] = true
			// Update spec first (must use Update, not UpdateStatus)
			item, err = reqDyn.Resource(gvr).Namespace(project).Update(context.TODO(), item, v1.UpdateOptions{})
			if err != nil {
				log.Printf("Failed to update session spec for %s: %v (continuing with status update)", sessionName, err)
				// Continue anyway - status update is more important
			}
		}
	}

	// Update the resource using UpdateStatus for status subresource
	updated, err := reqDyn.Resource(gvr).Namespace(project).UpdateStatus(context.TODO(), item, v1.UpdateOptions{})
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
	session := types.AgenticSession{
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

func CloneSession(c *gin.Context) {
	project := c.GetString("project")
	sessionName := c.Param("sessionName")
	_, reqDyn := handlers.GetK8sClientsForRequest(c)

	var req types.CloneSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	gvr := GetAgenticSessionV1Alpha1Resource()

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
	projGvr := handlers.GetOpenShiftProjectResource()
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
	session := types.AgenticSession{
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
