package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"

	"github.com/ambient-computing/vteam/components/backend/embeddings"
	"github.com/ambient-computing/vteam/components/backend/k8s"
	"github.com/ambient-computing/vteam/components/backend/types"
)

// Package-level embedding client (initialized once)
var embeddingClient *embeddings.GraniteClient

func init() {
	// Initialize the embedding client
	// In production, this URL would come from configuration
	embeddingClient = embeddings.NewGraniteClient("")
}

// ExecuteRAGQuery handles POST /api/projects/:projectName/rag-databases/:dbName/query
func ExecuteRAGQuery(c *gin.Context) {
	// Get parameters from URL
	projectName := c.Param("projectName")
	dbName := c.Param("dbName")

	if projectName == "" || dbName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Project name and database name are required"})
		return
	}

	// Parse request body
	var req types.QueryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate request
	if len(req.Query) < 1 || len(req.Query) > 2000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Query must be between 1 and 2000 characters"})
		return
	}

	// Set defaults
	if req.MaxChunks == 0 {
		req.MaxChunks = 10
	}
	if req.MaxChunks < 1 || req.MaxChunks > 20 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "maxChunks must be between 1 and 20"})
		return
	}

	if req.SimilarityThreshold == 0 {
		req.SimilarityThreshold = 0.7
	}
	if req.SimilarityThreshold < 0.0 || req.SimilarityThreshold > 1.0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "similarityThreshold must be between 0.0 and 1.0"})
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

	// Get the RAGDatabase CR to verify health and get endpoint
	ragDB, err := dynamicClient.Resource(k8s.RAGDatabaseGVR).
		Namespace(projectName).
		Get(ctx, dbName, metav1.GetOptions{})
	if err != nil {
		if k8s.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("RAG database '%s' not found", dbName)})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to get RAG database: %v", err)})
		return
	}

	// Check database status
	status, ok := ragDB.Object["status"].(map[string]interface{})
	if !ok {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "RAG database status unavailable"})
		return
	}

	phase, _ := status["phase"].(string)
	if phase != "Ready" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": fmt.Sprintf("RAG database is not ready (current phase: %s)", phase)})
		return
	}

	health, _ := status["health"].(string)
	if health == "Unavailable" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "RAG database is unhealthy"})
		return
	}

	endpoint, _ := status["endpoint"].(string)
	if endpoint == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "RAG database endpoint not available"})
		return
	}

	// Get database credentials from secret
	dbPassword, err := getDatabasePassword(ctx, typedClient, projectName, dbName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to get database credentials: %v", err)})
		return
	}

	// Start timing for metrics
	startTime := time.Now()

	// Generate embedding for the query
	embeddingStartTime := time.Now()
	queryEmbedding, err := embeddingClient.EmbedText(ctx, req.Query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to generate query embedding: %v", err)})
		return
	}
	embeddingTimeMs := time.Since(embeddingStartTime).Milliseconds()

	// Search for similar chunks
	chunks, err := searchSimilarChunks(ctx, endpoint, dbPassword, queryEmbedding, req.MaxChunks, req.SimilarityThreshold)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to search for similar chunks: %v", err)})
		return
	}

	// Assemble answer with source citations
	answer := assembleAnswer(req.Query, chunks)

	// Prepare response
	queryTimeMs := time.Since(startTime).Milliseconds()
	response := types.QueryResponse{
		Query:   req.Query,
		Answer:  answer,
		Sources: chunks,
		Metadata: types.QueryMetadata{
			QueryTimeMs:      queryTimeMs,
			ChunksSearched:   len(chunks),
			EmbeddingTimeMs:  embeddingTimeMs,
			DatabaseEndpoint: endpoint,
			Timestamp:        time.Now(),
		},
	}

	c.JSON(http.StatusOK, response)
}

// ExecuteRAGQueryStream handles POST /api/projects/:projectName/rag-databases/:dbName/query-stream
func ExecuteRAGQueryStream(c *gin.Context) {
	// Get parameters from URL
	projectName := c.Param("projectName")
	dbName := c.Param("dbName")

	if projectName == "" || dbName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Project name and database name are required"})
		return
	}

	// Parse request body
	var req types.QueryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate request (same as non-streaming)
	if len(req.Query) < 1 || len(req.Query) > 2000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Query must be between 1 and 2000 characters"})
		return
	}

	// Set defaults
	if req.MaxChunks == 0 {
		req.MaxChunks = 10
	}
	if req.MaxChunks < 1 || req.MaxChunks > 20 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "maxChunks must be between 1 and 20"})
		return
	}

	if req.SimilarityThreshold == 0 {
		req.SimilarityThreshold = 0.7
	}
	if req.SimilarityThreshold < 0.0 || req.SimilarityThreshold > 1.0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "similarityThreshold must be between 0.0 and 1.0"})
		return
	}

	// Get K8s clients and database info (same as non-streaming)
	typedClient, dynamicClient := GetK8sClientsForRequest(c)
	if typedClient == nil || dynamicClient == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User is not authorized to perform this operation"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Get database endpoint and verify health (same code as above)
	ragDB, err := dynamicClient.Resource(k8s.RAGDatabaseGVR).
		Namespace(projectName).
		Get(ctx, dbName, metav1.GetOptions{})
	if err != nil {
		if k8s.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("RAG database '%s' not found", dbName)})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to get RAG database: %v", err)})
		return
	}

	status, _ := ragDB.Object["status"].(map[string]interface{})
	phase, _ := status["phase"].(string)
	if phase != "Ready" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": fmt.Sprintf("RAG database is not ready (current phase: %s)", phase)})
		return
	}

	endpoint, _ := status["endpoint"].(string)
	if endpoint == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "RAG database endpoint not available"})
		return
	}

	// Get database password
	dbPassword, err := getDatabasePassword(ctx, typedClient, projectName, dbName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to get database credentials: %v", err)})
		return
	}

	// Set SSE headers
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	// Start timing
	startTime := time.Now()

	// Generate embedding
	embeddingStartTime := time.Now()
	queryEmbedding, err := embeddingClient.EmbedText(ctx, req.Query)
	if err != nil {
		sendSSEError(c, fmt.Sprintf("Failed to generate query embedding: %v", err))
		return
	}
	embeddingTimeMs := time.Since(embeddingStartTime).Milliseconds()

	// Search for similar chunks
	chunks, err := searchSimilarChunks(ctx, endpoint, dbPassword, queryEmbedding, req.MaxChunks, req.SimilarityThreshold)
	if err != nil {
		sendSSEError(c, fmt.Sprintf("Failed to search for similar chunks: %v", err))
		return
	}

	// Send sources first
	sourcesEvent := map[string]interface{}{
		"type":    "sources",
		"sources": chunks,
	}
	if err := sendSSEEvent(c, sourcesEvent); err != nil {
		return
	}

	// Stream the answer in chunks
	answer := assembleAnswer(req.Query, chunks)
	answerChunks := splitIntoChunks(answer, 100) // Split into 100-char chunks

	for _, chunk := range answerChunks {
		answerEvent := map[string]interface{}{
			"type":  "answer",
			"chunk": chunk,
		}
		if err := sendSSEEvent(c, answerEvent); err != nil {
			return
		}
		time.Sleep(50 * time.Millisecond) // Small delay for streaming effect
	}

	// Send completion event with metadata
	queryTimeMs := time.Since(startTime).Milliseconds()
	metadata := types.QueryMetadata{
		QueryTimeMs:      queryTimeMs,
		ChunksSearched:   len(chunks),
		EmbeddingTimeMs:  embeddingTimeMs,
		DatabaseEndpoint: endpoint,
		Timestamp:        time.Now(),
	}

	doneEvent := map[string]interface{}{
		"type":     "done",
		"metadata": metadata,
	}
	sendSSEEvent(c, doneEvent)
}

// searchSimilarChunks performs vector similarity search in pgvector database
func searchSimilarChunks(ctx context.Context, endpoint, password string, queryEmbedding []float32, maxChunks int, threshold float64) ([]types.DocumentChunk, error) {
	// Build connection string
	connStr := fmt.Sprintf("postgres://postgres:%s@%s/ragdb?sslmode=disable", password, endpoint)

	// Connect to database
	conn, err := pgx.Connect(ctx, connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}
	defer conn.Close()

	// Convert embedding to pgvector format
	embeddingStr := fmt.Sprintf("[%s]", floatSliceToString(queryEmbedding))

	// Execute similarity search query
	query := `
		SELECT
			c.id,
			c.document_id,
			c.chunk_index,
			c.chunk_text,
			c.page_number,
			d.file_name,
			d.document_cr_name,
			1 - (c.embedding <=> $1::vector) AS similarity
		FROM chunks c
		JOIN documents d ON c.document_id = d.id
		WHERE 1 - (c.embedding <=> $1::vector) >= $2
		ORDER BY similarity DESC
		LIMIT $3
	`

	rows, err := conn.Query(ctx, query, embeddingStr, threshold, maxChunks)
	if err != nil {
		return nil, fmt.Errorf("failed to execute similarity search: %w", err)
	}
	defer rows.Close()

	// Parse results
	var chunks []types.DocumentChunk
	for rows.Next() {
		var chunk types.DocumentChunk
		var chunkID, documentID int
		var pageNumber sql.NullInt32
		var similarity float64

		err := rows.Scan(
			&chunkID,
			&documentID,
			&chunk.ChunkIndex,
			&chunk.ChunkText,
			&pageNumber,
			&chunk.DocumentName,
			&chunk.DocumentID,
			&similarity,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan row: %w", err)
		}

		chunk.RelevanceScore = similarity
		if pageNumber.Valid {
			chunk.PageNumber = int(pageNumber.Int32)
		}

		chunks = append(chunks, chunk)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating rows: %w", err)
	}

	return chunks, nil
}

// assembleAnswer creates an answer from the query and retrieved chunks
func assembleAnswer(query string, chunks []types.DocumentChunk) string {
	if len(chunks) == 0 {
		return "I couldn't find any relevant information in the RAG database to answer your query."
	}

	// Start with a contextual introduction
	answer := fmt.Sprintf("Based on the available documentation, here's what I found regarding your query about '%s':\n\n", query)

	// Add information from each chunk with citations
	for i, chunk := range chunks {
		// Add chunk content
		answer += chunk.ChunkText + "\n"

		// Add citation
		citation := fmt.Sprintf("[Source: %s", chunk.DocumentName)
		if chunk.PageNumber > 0 {
			citation += fmt.Sprintf(", page %d", chunk.PageNumber)
		}
		citation += fmt.Sprintf(", relevance: %.2f%%]\n\n", chunk.RelevanceScore*100)

		answer += citation

		// Limit to top 3 chunks for conciseness
		if i >= 2 {
			if len(chunks) > 3 {
				answer += fmt.Sprintf("(Found %d more relevant sections in the documentation)\n", len(chunks)-3)
			}
			break
		}
	}

	return strings.TrimSpace(answer)
}

// getDatabasePassword retrieves the database password from the secret
func getDatabasePassword(ctx context.Context, client kubernetes.Interface, namespace, dbName string) (string, error) {
	secretName := fmt.Sprintf("ragdb-%s-credentials", dbName)
	secret, err := client.CoreV1().Secrets(namespace).Get(ctx, secretName, metav1.GetOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to get secret: %w", err)
	}

	password, ok := secret.Data["password"]
	if !ok {
		return "", fmt.Errorf("password not found in secret")
	}

	return string(password), nil
}

// Helper functions

// floatSliceToString converts a float32 slice to a comma-separated string
func floatSliceToString(floats []float32) string {
	parts := make([]string, len(floats))
	for i, f := range floats {
		parts[i] = fmt.Sprintf("%f", f)
	}
	return strings.Join(parts, ",")
}

// splitIntoChunks splits a string into chunks of specified size
func splitIntoChunks(text string, chunkSize int) []string {
	if chunkSize <= 0 {
		return []string{text}
	}

	var chunks []string
	for i := 0; i < len(text); i += chunkSize {
		end := i + chunkSize
		if end > len(text) {
			end = len(text)
		}
		chunks = append(chunks, text[i:end])
	}
	return chunks
}

// sendSSEEvent sends a Server-Sent Event to the client
func sendSSEEvent(c *gin.Context, data interface{}) error {
	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}

	fmt.Fprintf(c.Writer, "data: %s\n\n", jsonData)
	c.Writer.Flush()
	return nil
}

// sendSSEError sends an error event via SSE
func sendSSEError(c *gin.Context, errorMsg string) {
	errorEvent := map[string]interface{}{
		"type":  "error",
		"error": errorMsg,
	}
	sendSSEEvent(c, errorEvent)
}