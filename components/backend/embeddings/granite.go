package embeddings

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

// GraniteClient provides text embedding using the granite-30m-english model
type GraniteClient struct {
	serviceURL string
	httpClient *http.Client
	mu         sync.RWMutex
}

// EmbeddingRequest represents the request to the embedding service
type EmbeddingRequest struct {
	Text  string `json:"text"`
	Model string `json:"model"`
}

// EmbeddingResponse represents the response from the embedding service
type EmbeddingResponse struct {
	Embedding []float32 `json:"embedding"`
	Model     string    `json:"model"`
	Dimension int       `json:"dimension"`
}

// NewGraniteClient creates a new embedding client
func NewGraniteClient(serviceURL string) *GraniteClient {
	if serviceURL == "" {
		// Default to the shared embedding service endpoint
		serviceURL = "http://embedding-service.vteam-system.svc.cluster.local:8080"
	}

	return &GraniteClient{
		serviceURL: serviceURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        10,
				MaxIdleConnsPerHost: 10,
				IdleConnTimeout:     90 * time.Second,
			},
		},
	}
}

// EmbedText generates embeddings for the given text using granite-30m-english
func (c *GraniteClient) EmbedText(ctx context.Context, text string) ([]float32, error) {
	if text == "" {
		return nil, fmt.Errorf("text cannot be empty")
	}

	// Create request
	req := EmbeddingRequest{
		Text:  text,
		Model: "granite-30m-english",
	}

	reqBody, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	// Create HTTP request
	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.serviceURL+"/v1/embeddings", bytes.NewReader(reqBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	// Send request
	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Check status code
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("embedding service returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse response
	var embedResp EmbeddingResponse
	if err := json.Unmarshal(body, &embedResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	// Validate dimensions
	if len(embedResp.Embedding) != 384 {
		return nil, fmt.Errorf("expected 384 dimensions, got %d", len(embedResp.Embedding))
	}

	return embedResp.Embedding, nil
}

// EmbedBatch generates embeddings for multiple texts in a batch
// This is more efficient for processing multiple documents
func (c *GraniteClient) EmbedBatch(ctx context.Context, texts []string) ([][]float32, error) {
	embeddings := make([][]float32, len(texts))

	// For now, we'll process them sequentially
	// In a production system, this could be optimized with batch API
	for i, text := range texts {
		embedding, err := c.EmbedText(ctx, text)
		if err != nil {
			return nil, fmt.Errorf("failed to embed text at index %d: %w", i, err)
		}
		embeddings[i] = embedding
	}

	return embeddings, nil
}

// HealthCheck verifies the embedding service is reachable
func (c *GraniteClient) HealthCheck(ctx context.Context) error {
	httpReq, err := http.NewRequestWithContext(ctx, "GET", c.serviceURL+"/health", nil)
	if err != nil {
		return fmt.Errorf("failed to create health check request: %w", err)
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("health check failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("health check returned status %d", resp.StatusCode)
	}

	return nil
}

// Close closes any resources held by the client
func (c *GraniteClient) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Close idle connections
	c.httpClient.CloseIdleConnections()
	return nil
}