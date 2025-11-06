package sessions

import (
	"fmt"
	"log"
	"net/http"

	"ambient-code-backend/handlers"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// GetSessionK8sResources returns job, pod, and PVC information for a session
// GET /api/projects/:projectName/agentic-sessions/:sessionName/k8s-resources
func GetSessionK8sResources(c *gin.Context) {
	// Get project from context (set by middleware) or param
	project := c.GetString("project")
	if project == "" {
		project = c.Param("projectName")
	}
	sessionName := c.Param("sessionName")

	reqK8s, reqDyn := handlers.GetK8sClientsForRequest(c)
	if reqK8s == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	// Get session to find job name
	gvr := handlers.GetAgenticSessionV1Alpha1Resource()
	session, err := reqDyn.Resource(gvr).Namespace(project).Get(c.Request.Context(), sessionName, v1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	status, _ := session.Object["status"].(map[string]interface{})
	jobName, _ := status["jobName"].(string)
	if jobName == "" {
		jobName = fmt.Sprintf("%s-job", sessionName)
	}

	result := map[string]interface{}{}

	// Get Job status
	job, err := reqK8s.BatchV1().Jobs(project).Get(c.Request.Context(), jobName, v1.GetOptions{})
	jobExists := err == nil

	if jobExists {
		result["jobName"] = jobName
		jobStatus := "Unknown"
		if job.Status.Active > 0 {
			jobStatus = "Active"
		} else if job.Status.Succeeded > 0 {
			jobStatus = "Succeeded"
		} else if job.Status.Failed > 0 {
			jobStatus = "Failed"
		}
		result["jobStatus"] = jobStatus
		result["jobConditions"] = job.Status.Conditions
	} else if errors.IsNotFound(err) {
		// Job not found - don't return job info at all
		log.Printf("GetSessionK8sResources: Job %s not found, omitting from response", jobName)
		// Don't include jobName or jobStatus in result
	} else {
		// Other error - still show job name but with error status
		result["jobName"] = jobName
		result["jobStatus"] = "Error"
		log.Printf("GetSessionK8sResources: Error getting job %s: %v", jobName, err)
	}

	// Get Pods for this job (only if job exists)
	podInfos := []map[string]interface{}{}
	if jobExists {
		pods, err := reqK8s.CoreV1().Pods(project).List(c.Request.Context(), v1.ListOptions{
			LabelSelector: fmt.Sprintf("job-name=%s", jobName),
		})
		if err == nil {
			for _, pod := range pods.Items {
				// Check if pod is terminating (has DeletionTimestamp)
				podPhase := string(pod.Status.Phase)
				if pod.DeletionTimestamp != nil {
					podPhase = "Terminating"
				}

				containerInfos := []map[string]interface{}{}
				for _, cs := range pod.Status.ContainerStatuses {
					state := "Unknown"
					var exitCode *int32
					var reason string
					if cs.State.Running != nil {
						state = "Running"
						// If pod is terminating but container still shows running, mark it as terminating
						if pod.DeletionTimestamp != nil {
							state = "Terminating"
						}
					} else if cs.State.Terminated != nil {
						state = "Terminated"
						exitCode = &cs.State.Terminated.ExitCode
						reason = cs.State.Terminated.Reason
					} else if cs.State.Waiting != nil {
						state = "Waiting"
						reason = cs.State.Waiting.Reason
					}
					containerInfos = append(containerInfos, map[string]interface{}{
						"name":     cs.Name,
						"state":    state,
						"exitCode": exitCode,
						"reason":   reason,
					})
				}
				podInfos = append(podInfos, map[string]interface{}{
					"name":       pod.Name,
					"phase":      podPhase,
					"containers": containerInfos,
				})
			}
		}
	}

	// Check for temp-content pod
	tempPodName := fmt.Sprintf("temp-content-%s", sessionName)
	tempPod, err := reqK8s.CoreV1().Pods(project).Get(c.Request.Context(), tempPodName, v1.GetOptions{})
	if err == nil {
		tempPodPhase := string(tempPod.Status.Phase)
		if tempPod.DeletionTimestamp != nil {
			tempPodPhase = "Terminating"
		}

		containerInfos := []map[string]interface{}{}
		for _, cs := range tempPod.Status.ContainerStatuses {
			state := "Unknown"
			var exitCode *int32
			var reason string
			if cs.State.Running != nil {
				state = "Running"
				// If pod is terminating but container still shows running, mark as terminating
				if tempPod.DeletionTimestamp != nil {
					state = "Terminating"
				}
			} else if cs.State.Terminated != nil {
				state = "Terminated"
				exitCode = &cs.State.Terminated.ExitCode
				reason = cs.State.Terminated.Reason
			} else if cs.State.Waiting != nil {
				state = "Waiting"
				reason = cs.State.Waiting.Reason
			}
			containerInfos = append(containerInfos, map[string]interface{}{
				"name":     cs.Name,
				"state":    state,
				"exitCode": exitCode,
				"reason":   reason,
			})
		}
		podInfos = append(podInfos, map[string]interface{}{
			"name":       tempPod.Name,
			"phase":      tempPodPhase,
			"containers": containerInfos,
			"isTempPod":  true,
		})
	}

	result["pods"] = podInfos

	// Get PVC info - always use session's own PVC name
	// Note: If session was created with parent_session_id (via API), the operator handles PVC reuse
	pvcName := fmt.Sprintf("ambient-workspace-%s", sessionName)
	pvc, err := reqK8s.CoreV1().PersistentVolumeClaims(project).Get(c.Request.Context(), pvcName, v1.GetOptions{})
	result["pvcName"] = pvcName
	if err == nil {
		result["pvcExists"] = true
		if storage, ok := pvc.Status.Capacity[corev1.ResourceStorage]; ok {
			result["pvcSize"] = storage.String()
		}
	} else {
		result["pvcExists"] = false
	}

	c.JSON(http.StatusOK, result)
}
