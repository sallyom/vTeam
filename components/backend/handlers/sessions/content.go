package sessions

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"ambient-code-backend/handlers"
	"ambient-code-backend/types"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	intstr "k8s.io/apimachinery/pkg/util/intstr"
)

// SpawnContentPod creates a temporary pod for workspace access on completed sessions
// POST /api/projects/:projectName/agentic-sessions/:sessionName/spawn-content-pod
func SpawnContentPod(c *gin.Context) {
	// Get project from context (set by middleware) or param
	project := c.GetString("project")
	if project == "" {
		project = c.Param("projectName")
	}
	sessionName := c.Param("sessionName")

	reqK8s, _ := handlers.GetK8sClientsForRequest(c)
	if reqK8s == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	podName := fmt.Sprintf("temp-content-%s", sessionName)

	// Check if already exists
	if existing, err := reqK8s.CoreV1().Pods(project).Get(c.Request.Context(), podName, v1.GetOptions{}); err == nil {
		ready := false
		for _, cond := range existing.Status.Conditions {
			if cond.Type == corev1.PodReady && cond.Status == corev1.ConditionTrue {
				ready = true
				break
			}
		}
		c.JSON(http.StatusOK, gin.H{"status": "exists", "podName": podName, "ready": ready})
		return
	}

	// Verify PVC exists
	pvcName := fmt.Sprintf("ambient-workspace-%s", sessionName)
	if _, err := reqK8s.CoreV1().PersistentVolumeClaims(project).Get(c.Request.Context(), pvcName, v1.GetOptions{}); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "workspace PVC not found"})
		return
	}

	// Get content service image from env
	contentImage := os.Getenv("CONTENT_SERVICE_IMAGE")
	if contentImage == "" {
		contentImage = "quay.io/ambient_code/vteam_backend:latest"
	}
	imagePullPolicy := corev1.PullIfNotPresent
	if os.Getenv("IMAGE_PULL_POLICY") == "Always" {
		imagePullPolicy = corev1.PullAlways
	}

	// Create temporary pod
	pod := &corev1.Pod{
		ObjectMeta: v1.ObjectMeta{
			Name:      podName,
			Namespace: project,
			Labels: map[string]string{
				"app":                      "temp-content-service",
				"temp-content-for-session": sessionName,
			},
			Annotations: map[string]string{
				"vteam.ambient-code/ttl":        "900",
				"vteam.ambient-code/created-at": time.Now().Format(time.RFC3339),
			},
		},
		Spec: corev1.PodSpec{
			RestartPolicy: corev1.RestartPolicyNever,
			Containers: []corev1.Container{
				{
					Name:            "content",
					Image:           contentImage,
					ImagePullPolicy: imagePullPolicy,
					Env: []corev1.EnvVar{
						{Name: "CONTENT_SERVICE_MODE", Value: "true"},
						{Name: "STATE_BASE_DIR", Value: "/workspace"},
					},
					Ports: []corev1.ContainerPort{{ContainerPort: 8080, Name: "http"}},
					ReadinessProbe: &corev1.Probe{
						ProbeHandler: corev1.ProbeHandler{
							HTTPGet: &corev1.HTTPGetAction{
								Path: "/health",
								Port: intstr.FromString("http"),
							},
						},
						InitialDelaySeconds: 2,
						PeriodSeconds:       2,
					},
					VolumeMounts: []corev1.VolumeMount{
						{
							Name:      "workspace",
							MountPath: "/workspace",
							ReadOnly:  false,
						},
					},
					Resources: corev1.ResourceRequirements{
						Requests: corev1.ResourceList{
							corev1.ResourceCPU:    resource.MustParse("100m"),
							corev1.ResourceMemory: resource.MustParse("128Mi"),
						},
						Limits: corev1.ResourceList{
							corev1.ResourceCPU:    resource.MustParse("500m"),
							corev1.ResourceMemory: resource.MustParse("512Mi"),
						},
					},
				},
			},
			Volumes: []corev1.Volume{
				{
					Name: "workspace",
					VolumeSource: corev1.VolumeSource{
						PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{
							ClaimName: pvcName,
						},
					},
				},
			},
		},
	}

	created, err := reqK8s.CoreV1().Pods(project).Create(c.Request.Context(), pod, v1.CreateOptions{})
	if err != nil {
		log.Printf("Failed to create temp content pod: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to create pod: %v", err)})
		return
	}

	// Create service
	svc := &corev1.Service{
		ObjectMeta: v1.ObjectMeta{
			Name:      fmt.Sprintf("temp-content-%s", sessionName),
			Namespace: project,
			Labels: map[string]string{
				"app":                      "temp-content-service",
				"temp-content-for-session": sessionName,
			},
			OwnerReferences: []v1.OwnerReference{
				{
					APIVersion: "v1",
					Kind:       "Pod",
					Name:       podName,
					UID:        created.UID,
					Controller: types.BoolPtr(true),
				},
			},
		},
		Spec: corev1.ServiceSpec{
			Selector: map[string]string{
				"temp-content-for-session": sessionName,
			},
			Ports: []corev1.ServicePort{
				{Port: 8080, TargetPort: intstr.FromString("http")},
			},
		},
	}

	if _, err := reqK8s.CoreV1().Services(project).Create(c.Request.Context(), svc, v1.CreateOptions{}); err != nil && !errors.IsAlreadyExists(err) {
		log.Printf("Failed to create temp service: %v", err)
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "creating",
		"podName": podName,
	})
}

// GetContentPodStatus checks if temporary content pod is ready
// GET /api/projects/:projectName/agentic-sessions/:sessionName/content-pod-status
func GetContentPodStatus(c *gin.Context) {
	// Get project from context (set by middleware) or param
	project := c.GetString("project")
	if project == "" {
		project = c.Param("projectName")
	}
	sessionName := c.Param("sessionName")

	reqK8s, _ := handlers.GetK8sClientsForRequest(c)
	if reqK8s == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	podName := fmt.Sprintf("temp-content-%s", sessionName)
	pod, err := reqK8s.CoreV1().Pods(project).Get(c.Request.Context(), podName, v1.GetOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"status": "not_found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get pod"})
		return
	}

	ready := false
	for _, cond := range pod.Status.Conditions {
		if cond.Type == corev1.PodReady && cond.Status == corev1.ConditionTrue {
			ready = true
			break
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"status":    string(pod.Status.Phase),
		"ready":     ready,
		"podName":   podName,
		"createdAt": pod.CreationTimestamp.Format(time.RFC3339),
	})
}

// DeleteContentPod removes temporary content pod
// DELETE /api/projects/:projectName/agentic-sessions/:sessionName/content-pod
func DeleteContentPod(c *gin.Context) {
	// Get project from context (set by middleware) or param
	project := c.GetString("project")
	if project == "" {
		project = c.Param("projectName")
	}
	sessionName := c.Param("sessionName")

	reqK8s, _ := handlers.GetK8sClientsForRequest(c)
	if reqK8s == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	podName := fmt.Sprintf("temp-content-%s", sessionName)
	err := reqK8s.CoreV1().Pods(project).Delete(c.Request.Context(), podName, v1.DeleteOptions{})
	if err != nil && !errors.IsNotFound(err) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete pod"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "content pod deleted"})
}
