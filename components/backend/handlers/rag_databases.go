package handlers

import (
	"context"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"

	"github.com/ambient-computing/vteam/components/backend/k8s"
	"github.com/ambient-computing/vteam/components/backend/types"
)

// CreateRAGDatabase handles POST /api/projects/:projectName/rag-databases
func CreateRAGDatabase(c *gin.Context) {
	// Get project from context (set by middleware)
	projectName := c.Param("projectName")
	if projectName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Project name is required"})
		return
	}

	// Parse request body
	var req types.CreateRAGDatabaseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Additional validation for storage size
	if err := validateStorageSize(req.StorageSize); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get K8s clients using user's token
	typedClient, dynamicClient := GetK8sClientsForRequest(c)
	if typedClient == nil || dynamicClient == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User is not authorized to perform this operation"})
		return
	}

	// Generate unique CR name from display name
	crName := generateCRName(req.DisplayName)

	// Create RAG client
	ragClient := k8s.NewRAGClient(dynamicClient)

	// Get user email from context
	userEmail, _ := c.Get("userEmail")
	if userEmail == nil {
		userEmail = "unknown"
	}

	// Create the RAGDatabase CR spec
	spec := map[string]interface{}{
		"displayName": req.DisplayName,
		"projectName": projectName,
		"storage": map[string]interface{}{
			"size": req.StorageSize,
		},
	}

	if req.Description != "" {
		spec["description"] = req.Description
	}

	// Create unstructured object
	ragDatabase := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "vteam.ambient-code/v1alpha1",
			"kind":       "RAGDatabase",
			"metadata": map[string]interface{}{
				"name":      crName,
				"namespace": projectName,
				"labels": map[string]string{
					"app.kubernetes.io/managed-by": "vteam",
					"vteam.ambient-code/project":   projectName,
				},
				"annotations": map[string]string{
					"vteam.ambient-code/created-by": fmt.Sprintf("%v", userEmail),
				},
			},
			"spec": spec,
			"status": map[string]interface{}{
				"phase": "Creating",
			},
		},
	}

	// Create the RAGDatabase CR
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	created, err := dynamicClient.Resource(k8s.RAGDatabaseGVR).
		Namespace(projectName).
		Create(ctx, ragDatabase, metav1.CreateOptions{})
	if err != nil {
		if strings.Contains(err.Error(), "already exists") {
			c.JSON(http.StatusConflict, gin.H{"error": "A RAG database with this name already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to create RAG database: %v", err)})
		return
	}

	// Convert to response format
	response := convertToRAGDatabase(created)
	c.JSON(http.StatusCreated, response)
}

// ListRAGDatabases handles GET /api/projects/:projectName/rag-databases
func ListRAGDatabases(c *gin.Context) {
	// Get project from URL parameter
	projectName := c.Param("projectName")
	if projectName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Project name is required"})
		return
	}

	// Get K8s clients using user's token
	typedClient, dynamicClient := GetK8sClientsForRequest(c)
	if typedClient == nil || dynamicClient == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User is not authorized to perform this operation"})
		return
	}

	// Create context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// List RAGDatabase CRs in the namespace
	list, err := dynamicClient.Resource(k8s.RAGDatabaseGVR).
		Namespace(projectName).
		List(ctx, metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to list RAG databases: %v", err)})
		return
	}

	// Convert to response format
	databases := make([]types.RAGDatabase, 0, len(list.Items))
	for _, item := range list.Items {
		databases = append(databases, convertToRAGDatabase(&item))
	}

	response := types.ListRAGDatabasesResponse{
		Databases:  databases,
		TotalCount: len(databases),
	}

	c.JSON(http.StatusOK, response)
}

// GetRAGDatabase handles GET /api/projects/:projectName/rag-databases/:dbName
func GetRAGDatabase(c *gin.Context) {
	// Get parameters from URL
	projectName := c.Param("projectName")
	dbName := c.Param("dbName")

	if projectName == "" || dbName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Project name and database name are required"})
		return
	}

	// Get K8s clients using user's token
	typedClient, dynamicClient := GetK8sClientsForRequest(c)
	if typedClient == nil || dynamicClient == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User is not authorized to perform this operation"})
		return
	}

	// Create context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Get the RAGDatabase CR
	obj, err := dynamicClient.Resource(k8s.RAGDatabaseGVR).
		Namespace(projectName).
		Get(ctx, dbName, metav1.GetOptions{})
	if err != nil {
		if k8s.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("RAG database '%s' not found in project '%s'", dbName, projectName)})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to get RAG database: %v", err)})
		return
	}

	// Convert to response format
	response := convertToRAGDatabase(obj)
	c.JSON(http.StatusOK, response)
}

// DeleteRAGDatabase handles DELETE /api/projects/:projectName/rag-databases/:dbName
func DeleteRAGDatabase(c *gin.Context) {
	// Get parameters from URL
	projectName := c.Param("projectName")
	dbName := c.Param("dbName")

	if projectName == "" || dbName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Project name and database name are required"})
		return
	}

	// Get K8s clients using user's token
	typedClient, dynamicClient := GetK8sClientsForRequest(c)
	if typedClient == nil || dynamicClient == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User is not authorized to perform this operation"})
		return
	}

	// Create context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// First, check if the database exists
	_, err := dynamicClient.Resource(k8s.RAGDatabaseGVR).
		Namespace(projectName).
		Get(ctx, dbName, metav1.GetOptions{})
	if err != nil {
		if k8s.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("RAG database '%s' not found in project '%s'", dbName, projectName)})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to check RAG database: %v", err)})
		return
	}

	// Check if database is linked to active sessions
	// List AgenticSessions and check if any reference this database
	sessionGVR := schema.GroupVersionResource{
		Group:    "vteam.ambient-code",
		Version:  "v1alpha1",
		Resource: "agenticsessions",
	}

	sessions, err := dynamicClient.Resource(sessionGVR).
		Namespace(projectName).
		List(ctx, metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to check active sessions: %v", err)})
		return
	}

	// Check each session for database reference
	for _, session := range sessions.Items {
		spec, ok := session.Object["spec"].(map[string]interface{})
		if !ok {
			continue
		}

		// Check if session has RAG database reference
		if ragDatabases, ok := spec["ragDatabases"].([]interface{}); ok {
			for _, db := range ragDatabases {
				if dbStr, ok := db.(string); ok && dbStr == dbName {
					// Check session status
					status, _ := session.Object["status"].(map[string]interface{})
					phase, _ := status["phase"].(string)

					// If session is active (not completed/failed), block deletion
					if phase != "Completed" && phase != "Failed" && phase != "Terminated" {
						sessionName, _ := session.Object["metadata"].(map[string]interface{})["name"].(string)
						c.JSON(http.StatusConflict, gin.H{
							"error": fmt.Sprintf("Database is in use by active sessions. Session '%s' is currently %s",
								sessionName, phase),
						})
						return
					}
				}
			}
		}
	}

	// Delete the RAGDatabase CR
	// Use foreground deletion to ensure dependent resources are cleaned up
	deletePolicy := metav1.DeletePropagationForeground
	deleteOptions := metav1.DeleteOptions{
		PropagationPolicy: &deletePolicy,
	}

	err = dynamicClient.Resource(k8s.RAGDatabaseGVR).
		Namespace(projectName).
		Delete(ctx, dbName, deleteOptions)
	if err != nil {
		if k8s.IsNotFound(err) {
			// Already deleted - return success
			c.Status(http.StatusNoContent)
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to delete RAG database: %v", err)})
		return
	}

	// Return 204 No Content on success
	c.Status(http.StatusNoContent)
}

// GetRAGDatabaseStatus handles GET /api/projects/:projectName/rag-databases/:dbName/status
func GetRAGDatabaseStatus(c *gin.Context) {
	// Get parameters from URL
	projectName := c.Param("projectName")
	dbName := c.Param("dbName")

	if projectName == "" || dbName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Project name and database name are required"})
		return
	}

	// Get K8s clients using user's token
	typedClient, dynamicClient := GetK8sClientsForRequest(c)
	if typedClient == nil || dynamicClient == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User is not authorized to perform this operation"})
		return
	}

	// Create context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Get the RAGDatabase CR
	obj, err := dynamicClient.Resource(k8s.RAGDatabaseGVR).
		Namespace(projectName).
		Get(ctx, dbName, metav1.GetOptions{})
	if err != nil {
		if k8s.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("RAG database '%s' not found in project '%s'", dbName, projectName)})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to get RAG database: %v", err)})
		return
	}

	// Extract and return just the status
	status, ok := obj.Object["status"].(map[string]interface{})
	if !ok {
		// Return empty status if not present
		status = map[string]interface{}{
			"phase": "Unknown",
		}
	}

	c.JSON(http.StatusOK, status)
}

// ImportRAGDatabaseDump handles POST /api/projects/:projectName/rag-databases/import-dump
func ImportRAGDatabaseDump(c *gin.Context) {
	// Get project from URL parameter
	projectName := c.Param("projectName")
	if projectName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Project name is required"})
		return
	}

	// Get K8s clients using user's token
	typedClient, dynamicClient := GetK8sClientsForRequest(c)
	if typedClient == nil || dynamicClient == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User is not authorized to perform this operation"})
		return
	}

	// Parse multipart form
	err := c.Request.ParseMultipartForm(32 << 20) // 32 MB max memory
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to parse multipart form"})
		return
	}

	// Get form values
	databaseName := c.PostForm("databaseName")
	displayName := c.PostForm("displayName")

	if databaseName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "databaseName is required"})
		return
	}

	// If displayName not provided, use databaseName
	if displayName == "" {
		displayName = databaseName
	}

	// Get the dump file
	file, header, err := c.Request.FormFile("dumpFile")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "dumpFile is required"})
		return
	}
	defer file.Close()

	// Validate file size (max 5GB)
	maxSize := int64(5 * 1024 * 1024 * 1024) // 5GB
	if header.Size > maxSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File exceeds maximum size of 5GB"})
		return
	}

	// Validate file extension
	if !strings.HasSuffix(strings.ToLower(header.Filename), ".sql") &&
		!strings.HasSuffix(strings.ToLower(header.Filename), ".dump") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File must be a SQL dump file (.sql or .dump)"})
		return
	}

	// TODO: In a real implementation, we would:
	// 1. Store the file to a PVC
	// 2. Create a ConfigMap or Secret with the file location
	// 3. Reference it in the RAGDatabase CR

	// For now, we'll create the RAGDatabase CR with import configuration
	// Get user email from context
	userEmail, _ := c.Get("userEmail")
	if userEmail == nil {
		userEmail = "unknown"
	}

	// Generate CR name from database name (not display name)
	crName := generateCRName(databaseName)

	// Create the RAGDatabase CR spec
	spec := map[string]interface{}{
		"displayName": displayName,
		"projectName": projectName,
		"storage": map[string]interface{}{
			"size": "5Gi", // Default size for imported databases
		},
		"importFrom": map[string]interface{}{
			"dumpFileUrl": fmt.Sprintf("pvc://rag-imports/%s/%s", projectName, header.Filename),
		},
	}

	// Create unstructured object
	ragDatabase := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "vteam.ambient-code/v1alpha1",
			"kind":       "RAGDatabase",
			"metadata": map[string]interface{}{
				"name":      crName,
				"namespace": projectName,
				"labels": map[string]string{
					"app.kubernetes.io/managed-by":   "vteam",
					"vteam.ambient-code/project":     projectName,
					"vteam.ambient-code/import-type": "dump",
				},
				"annotations": map[string]string{
					"vteam.ambient-code/created-by":       fmt.Sprintf("%v", userEmail),
					"vteam.ambient-code/original-filename": header.Filename,
				},
			},
			"spec": spec,
			"status": map[string]interface{}{
				"phase": "Processing",
				"processingProgress": map[string]interface{}{
					"currentPhase": "ImportScheduled",
					"totalFiles":   1,
					"processedFiles": 0,
				},
			},
		},
	}

	// Create the RAGDatabase CR
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	created, err := dynamicClient.Resource(k8s.RAGDatabaseGVR).
		Namespace(projectName).
		Create(ctx, ragDatabase, metav1.CreateOptions{})
	if err != nil {
		if strings.Contains(err.Error(), "already exists") {
			c.JSON(http.StatusConflict, gin.H{"error": "A RAG database with this name already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to create RAG database: %v", err)})
		return
	}

	// Convert to response format
	response := convertToRAGDatabase(created)
	c.JSON(http.StatusAccepted, response)
}

// Helper functions

// validateStorageSize validates that the storage size is valid and within limits
func validateStorageSize(size string) error {
	// Parse the size using Kubernetes resource parser
	quantity, err := resource.ParseQuantity(size)
	if err != nil {
		return fmt.Errorf("invalid storage size format: %v", err)
	}

	// Convert to Gi for comparison
	maxSize, _ := resource.ParseQuantity("5Gi")
	if quantity.Cmp(maxSize) > 0 {
		return fmt.Errorf("storage size exceeds maximum allowed (5Gi)")
	}

	// Minimum size check (100Mi)
	minSize, _ := resource.ParseQuantity("100Mi")
	if quantity.Cmp(minSize) < 0 {
		return fmt.Errorf("storage size must be at least 100Mi")
	}

	return nil
}

// generateCRName generates a valid Kubernetes resource name from display name
func generateCRName(displayName string) string {
	// Convert to lowercase
	name := strings.ToLower(displayName)

	// Replace spaces with hyphens
	name = strings.ReplaceAll(name, " ", "-")

	// Remove any characters that are not alphanumeric or hyphens
	reg := regexp.MustCompile("[^a-z0-9-]")
	name = reg.ReplaceAllString(name, "")

	// Remove consecutive hyphens
	reg = regexp.MustCompile("-+")
	name = reg.ReplaceAllString(name, "-")

	// Trim hyphens from start and end
	name = strings.Trim(name, "-")

	// Ensure it starts with a letter
	if name == "" || !isLetter(rune(name[0])) {
		name = "rag-" + name
	}

	// Truncate to max 63 characters (K8s name limit)
	if len(name) > 63 {
		name = name[:63]
		// Remove trailing hyphen if any
		name = strings.TrimRight(name, "-")
	}

	// Append timestamp to ensure uniqueness
	timestamp := time.Now().Unix()
	suffix := fmt.Sprintf("-%d", timestamp)
	if len(name)+len(suffix) > 63 {
		name = name[:63-len(suffix)]
	}
	name = name + suffix

	return name
}

// isLetter checks if a rune is a lowercase letter
func isLetter(r rune) bool {
	return r >= 'a' && r <= 'z'
}

// convertToRAGDatabase converts an unstructured object to RAGDatabase type
func convertToRAGDatabase(obj *unstructured.Unstructured) types.RAGDatabase {
	metadata := obj.Object["metadata"].(map[string]interface{})
	spec := obj.Object["spec"].(map[string]interface{})
	status := obj.Object["status"].(map[string]interface{})

	// Convert metadata
	ragMetadata := types.RAGDatabaseMetadata{
		Name:      metadata["name"].(string),
		Namespace: metadata["namespace"].(string),
	}
	if uid, ok := metadata["uid"].(string); ok {
		ragMetadata.UID = uid
	}
	if ct, ok := metadata["creationTimestamp"].(string); ok {
		if parsed, err := time.Parse(time.RFC3339, ct); err == nil {
			ragMetadata.CreationTimestamp = parsed
		}
	}
	if labels, ok := metadata["labels"].(map[string]interface{}); ok {
		ragMetadata.Labels = make(map[string]string)
		for k, v := range labels {
			ragMetadata.Labels[k] = fmt.Sprintf("%v", v)
		}
	}

	// Convert spec
	ragSpec := types.RAGDatabaseSpec{
		DisplayName: spec["displayName"].(string),
		ProjectName: spec["projectName"].(string),
	}
	if desc, ok := spec["description"].(string); ok {
		ragSpec.Description = desc
	}
	if storage, ok := spec["storage"].(map[string]interface{}); ok {
		ragSpec.Storage = types.RAGDatabaseStorage{
			Size: storage["size"].(string),
		}
		if sc, ok := storage["storageClass"].(string); ok {
			ragSpec.Storage.StorageClass = sc
		}
	}

	// Convert status
	ragStatus := types.RAGDatabaseStatus{}
	if phase, ok := status["phase"].(string); ok {
		ragStatus.Phase = phase
	}
	if msg, ok := status["message"].(string); ok {
		ragStatus.Message = msg
	}
	if endpoint, ok := status["endpoint"].(string); ok {
		ragStatus.Endpoint = endpoint
	}
	if dbName, ok := status["databaseName"].(string); ok {
		ragStatus.DatabaseName = dbName
	}
	if docCount, ok := status["documentCount"].(float64); ok {
		ragStatus.DocumentCount = int(docCount)
	}
	if chunkCount, ok := status["chunkCount"].(float64); ok {
		ragStatus.ChunkCount = int(chunkCount)
	}
	if storageUsed, ok := status["storageUsed"].(string); ok {
		ragStatus.StorageUsed = storageUsed
	}
	if health, ok := status["health"].(string); ok {
		ragStatus.Health = health
	}

	return types.RAGDatabase{
		Metadata: ragMetadata,
		Spec:     ragSpec,
		Status:   ragStatus,
	}
}