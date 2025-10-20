package handlers

import (
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"github.com/ambient-computing/vteam/components/backend/k8s"
	"github.com/ambient-computing/vteam/components/backend/types"
)

// UploadRAGDocuments handles POST /api/projects/:projectName/rag-databases/:dbName/documents
func UploadRAGDocuments(c *gin.Context) {
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

	// First, verify the RAG database exists
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, err := dynamicClient.Resource(k8s.RAGDatabaseGVR).
		Namespace(projectName).
		Get(ctx, dbName, metav1.GetOptions{})
	if err != nil {
		if k8s.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("RAG database '%s' not found", dbName)})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to verify RAG database: %v", err)})
		return
	}

	// Parse multipart form (max 100MB in memory)
	err = c.Request.ParseMultipartForm(100 << 20)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to parse multipart form"})
		return
	}

	// Get uploaded files
	form := c.Request.MultipartForm
	files := form.File["files"]

	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No files uploaded"})
		return
	}

	if len(files) > 50 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Maximum 50 files allowed per upload"})
		return
	}

	// Get user email from context
	userEmail, _ := c.Get("userEmail")
	if userEmail == nil {
		userEmail = "unknown"
	}

	// Process each file
	accepted := make([]types.DocumentUploadResult, 0)
	rejected := make([]types.DocumentUploadResult, 0)

	// Allowed file formats
	allowedFormats := map[string]bool{
		".pdf":  true,
		".docx": true,
		".pptx": true,
		".xlsx": true,
		".md":   true,
		".csv":  true,
		".txt":  true,
		".html": true,
	}

	for _, fileHeader := range files {
		result := types.DocumentUploadResult{
			FileName: fileHeader.Filename,
			FileSize: fileHeader.Size,
		}

		// Validate file size (max 100MB)
		if fileHeader.Size > 100*1024*1024 {
			result.Reason = "File exceeds maximum size of 100MB"
			rejected = append(rejected, result)
			continue
		}

		// Validate file format
		ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
		if !allowedFormats[ext] {
			result.Reason = fmt.Sprintf("File format %s not supported. Allowed formats: pdf, docx, pptx, xlsx, md, csv, txt, html", ext)
			rejected = append(rejected, result)
			continue
		}

		// Open the file
		file, err := fileHeader.Open()
		if err != nil {
			result.Reason = "Failed to read file"
			rejected = append(rejected, result)
			continue
		}
		defer file.Close()

		// Calculate SHA-256 checksum
		hasher := sha256.New()
		if _, err := io.Copy(hasher, file); err != nil {
			result.Reason = "Failed to calculate checksum"
			rejected = append(rejected, result)
			continue
		}
		checksum := fmt.Sprintf("%x", hasher.Sum(nil))

		// Reset file position
		file.Seek(0, 0)

		// TODO: In a real implementation, we would store the file to PVC
		// For now, we'll just create the RAGDocument CR

		// Generate CR name from filename
		crName := generateDocumentCRName(fileHeader.Filename)

		// Create RAGDocument CR
		ragDocument := &unstructured.Unstructured{
			Object: map[string]interface{}{
				"apiVersion": "vteam.ambient-code/v1alpha1",
				"kind":       "RAGDocument",
				"metadata": map[string]interface{}{
					"name":      crName,
					"namespace": projectName,
					"labels": map[string]string{
						"app.kubernetes.io/managed-by":     "vteam",
						"vteam.ambient-code/project":       projectName,
						"vteam.ambient-code/rag-database": dbName,
					},
					"annotations": map[string]string{
						"vteam.ambient-code/uploaded-by": fmt.Sprintf("%v", userEmail),
					},
					"ownerReferences": []interface{}{
						map[string]interface{}{
							"apiVersion":         "vteam.ambient-code/v1alpha1",
							"kind":               "RAGDatabase",
							"name":               dbName,
							"uid":                "", // Would be filled from RAGDatabase in real implementation
							"controller":         true,
							"blockOwnerDeletion": true,
						},
					},
				},
				"spec": map[string]interface{}{
					"databaseRef": dbName,
					"fileName":    fileHeader.Filename,
					"fileFormat":  strings.TrimPrefix(ext, "."),
					"fileSize":    fileHeader.Size,
					"uploadedBy":  fmt.Sprintf("%v", userEmail),
					"checksum":    checksum,
					"storagePath": fmt.Sprintf("/workspace/ragdbs/%s/documents/%s", dbName, fileHeader.Filename),
				},
				"status": map[string]interface{}{
					"phase": "Uploaded",
				},
			},
		}

		// Create the RAGDocument CR
		created, err := dynamicClient.Resource(k8s.RAGDocumentGVR).
			Namespace(projectName).
			Create(ctx, ragDocument, metav1.CreateOptions{})
		if err != nil {
			if strings.Contains(err.Error(), "already exists") {
				result.Reason = "A document with this name already exists"
			} else {
				result.Reason = fmt.Sprintf("Failed to create document record: %v", err)
			}
			rejected = append(rejected, result)
			continue
		}

		// Success
		result.CRName = created.GetName()
		accepted = append(accepted, result)
	}

	// Return response
	response := types.DocumentUploadResponse{
		Accepted: accepted,
		Rejected: rejected,
	}

	c.JSON(http.StatusAccepted, response)
}

// ListRAGDocuments handles GET /api/projects/:projectName/rag-databases/:dbName/documents
func ListRAGDocuments(c *gin.Context) {
	// Get parameters from URL
	projectName := c.Param("projectName")
	dbName := c.Param("dbName")
	statusFilter := c.Query("status")

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

	// List RAGDocument CRs with label selector for the database
	listOptions := metav1.ListOptions{
		LabelSelector: fmt.Sprintf("vteam.ambient-code/rag-database=%s", dbName),
	}

	list, err := dynamicClient.Resource(k8s.RAGDocumentGVR).
		Namespace(projectName).
		List(ctx, listOptions)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to list RAG documents: %v", err)})
		return
	}

	// Convert to response format and filter by status if requested
	documents := make([]types.RAGDocument, 0)
	for _, item := range list.Items {
		// Convert unstructured to RAGDocument
		doc := convertToRAGDocument(&item)

		// Filter by status if specified
		if statusFilter != "" && doc.Status.Phase != statusFilter {
			continue
		}

		documents = append(documents, doc)
	}

	response := types.ListRAGDocumentsResponse{
		Documents:  documents,
		TotalCount: len(documents),
	}

	c.JSON(http.StatusOK, response)
}

// GetRAGDocument handles GET /api/projects/:projectName/rag-databases/:dbName/documents/:docName
func GetRAGDocument(c *gin.Context) {
	// Get parameters from URL
	projectName := c.Param("projectName")
	dbName := c.Param("dbName")
	docName := c.Param("docName")

	if projectName == "" || dbName == "" || docName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Project name, database name, and document name are required"})
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

	// Get the RAGDocument CR
	obj, err := dynamicClient.Resource(k8s.RAGDocumentGVR).
		Namespace(projectName).
		Get(ctx, docName, metav1.GetOptions{})
	if err != nil {
		if k8s.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("RAG document '%s' not found", docName)})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to get RAG document: %v", err)})
		return
	}

	// Verify the document belongs to the specified database
	spec, ok := obj.Object["spec"].(map[string]interface{})
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid document structure"})
		return
	}

	databaseRef, _ := spec["databaseRef"].(string)
	if databaseRef != dbName {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Document '%s' not found in database '%s'", docName, dbName)})
		return
	}

	// Convert to response format
	response := convertToRAGDocument(obj)
	c.JSON(http.StatusOK, response)
}

// DeleteRAGDocument handles DELETE /api/projects/:projectName/rag-databases/:dbName/documents/:docName
func DeleteRAGDocument(c *gin.Context) {
	// Get parameters from URL
	projectName := c.Param("projectName")
	dbName := c.Param("dbName")
	docName := c.Param("docName")

	if projectName == "" || dbName == "" || docName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Project name, database name, and document name are required"})
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

	// First, verify the document exists and belongs to the specified database
	obj, err := dynamicClient.Resource(k8s.RAGDocumentGVR).
		Namespace(projectName).
		Get(ctx, docName, metav1.GetOptions{})
	if err != nil {
		if k8s.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("RAG document '%s' not found", docName)})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to verify RAG document: %v", err)})
		return
	}

	// Verify the document belongs to the specified database
	spec, ok := obj.Object["spec"].(map[string]interface{})
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid document structure"})
		return
	}

	databaseRef, _ := spec["databaseRef"].(string)
	if databaseRef != dbName {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("Document '%s' not found in database '%s'", docName, dbName)})
		return
	}

	// TODO: In a real implementation, we would:
	// 1. Delete the document file from PVC (using storagePath from spec)
	// 2. Delete chunks from pgvector database using SQL:
	//    DELETE FROM chunks WHERE document_id IN (
	//      SELECT id FROM documents WHERE document_cr_name = $1
	//    )
	// 3. Delete from documents table:
	//    DELETE FROM documents WHERE document_cr_name = $1

	// Delete the RAGDocument CR
	// Use foreground deletion to ensure dependent resources are cleaned up
	deletePolicy := metav1.DeletePropagationForeground
	deleteOptions := metav1.DeleteOptions{
		PropagationPolicy: &deletePolicy,
	}

	err = dynamicClient.Resource(k8s.RAGDocumentGVR).
		Namespace(projectName).
		Delete(ctx, docName, deleteOptions)
	if err != nil {
		if k8s.IsNotFound(err) {
			// Already deleted - return success
			c.Status(http.StatusNoContent)
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to delete RAG document: %v", err)})
		return
	}

	// Return 204 No Content on success
	c.Status(http.StatusNoContent)
}

// Helper functions

// convertToRAGDocument converts an unstructured object to RAGDocument type
func convertToRAGDocument(obj *unstructured.Unstructured) types.RAGDocument {
	metadata := obj.Object["metadata"].(map[string]interface{})
	spec := obj.Object["spec"].(map[string]interface{})
	status := obj.Object["status"].(map[string]interface{})

	// Convert metadata
	ragMetadata := types.RAGDocumentMetadata{
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
	ragSpec := types.RAGDocumentSpec{}
	if dbRef, ok := spec["databaseRef"].(string); ok {
		ragSpec.DatabaseRef = dbRef
	}
	if fileName, ok := spec["fileName"].(string); ok {
		ragSpec.FileName = fileName
	}
	if fileFormat, ok := spec["fileFormat"].(string); ok {
		ragSpec.FileFormat = fileFormat
	}
	if fileSize, ok := spec["fileSize"].(float64); ok {
		ragSpec.FileSize = int64(fileSize)
	}
	if uploadedBy, ok := spec["uploadedBy"].(string); ok {
		ragSpec.UploadedBy = uploadedBy
	}
	if checksum, ok := spec["checksum"].(string); ok {
		ragSpec.Checksum = checksum
	}
	if storagePath, ok := spec["storagePath"].(string); ok {
		ragSpec.StoragePath = storagePath
	}

	// Convert status
	ragStatus := types.RAGDocumentStatus{}
	if phase, ok := status["phase"].(string); ok {
		ragStatus.Phase = phase
	}
	if chunkCount, ok := status["chunkCount"].(float64); ok {
		ragStatus.ChunkCount = int(chunkCount)
	}
	if processingTime, ok := status["processingTime"].(float64); ok {
		ragStatus.ProcessingTime = int64(processingTime)
	}
	if errorMsg, ok := status["errorMessage"].(string); ok {
		ragStatus.ErrorMessage = errorMsg
	}
	if processedAt, ok := status["processedAt"].(string); ok {
		if parsed, err := time.Parse(time.RFC3339, processedAt); err == nil {
			ragStatus.ProcessedAt = &parsed
		}
	}

	return types.RAGDocument{
		Metadata: ragMetadata,
		Spec:     ragSpec,
		Status:   ragStatus,
	}
}

// generateDocumentCRName generates a valid Kubernetes resource name from filename
func generateDocumentCRName(filename string) string {
	// Remove file extension
	name := strings.TrimSuffix(filename, filepath.Ext(filename))

	// Convert to lowercase
	name = strings.ToLower(name)

	// Replace spaces and underscores with hyphens
	name = strings.ReplaceAll(name, " ", "-")
	name = strings.ReplaceAll(name, "_", "-")

	// Remove any characters that are not alphanumeric or hyphens
	// This is more restrictive than K8s names but ensures compatibility
	var result strings.Builder
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			result.WriteRune(r)
		}
	}
	name = result.String()

	// Remove consecutive hyphens
	for strings.Contains(name, "--") {
		name = strings.ReplaceAll(name, "--", "-")
	}

	// Trim hyphens from start and end
	name = strings.Trim(name, "-")

	// Ensure it starts with a letter
	if name == "" || (name[0] >= '0' && name[0] <= '9') {
		name = "doc-" + name
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