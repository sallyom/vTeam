package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"k8s.io/apimachinery/pkg/api/errors"
)

// T012: List session artifacts handler
func listSessionArtifacts(c *gin.Context) {
	projectName := c.Param("projectName")
	sessionName := c.Param("sessionName")

	// Get user-scoped K8s clients
	reqK8s, reqDyn := getK8sClientsForRequest(c)
	if reqK8s == nil || reqDyn == nil {
		c.JSON(http.StatusUnauthorized, ErrorResponse{
			Error:     "Missing or invalid user token",
			Code:      ErrUnauthorized,
			Retryable: false,
		})
		return
	}

	// Get AgenticSession CR
	session, err := getAgenticSessionCR(c.Request.Context(), reqDyn, projectName, sessionName)
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, ErrorResponse{
				Error:     "AgenticSession not found",
				Code:      ErrSessionNotFound,
				Details:   fmt.Sprintf("Session '%s' not found in project '%s'", sessionName, projectName),
				Retryable: false,
			})
			return
		}
		log.Printf("Failed to get session %s/%s: %v", projectName, sessionName, err)
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:     "Failed to get session",
			Code:      ErrInternalError,
			Retryable: true,
		})
		return
	}

	// Get stateDir from session status
	stateDir, err := getSessionStateDir(session)
	if err != nil {
		log.Printf("Failed to get stateDir for session %s/%s: %v", projectName, sessionName, err)
		c.JSON(http.StatusOK, ArtifactListResponse{
			Artifacts: []SessionArtifact{}, // Empty array if no stateDir
		})
		return
	}

	// List files in stateDir
	artifacts := []SessionArtifact{}
	err = filepath.Walk(stateDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip files with errors
		}

		if info.IsDir() {
			return nil // Skip directories
		}

		// Get relative path
		relPath, err := filepath.Rel(stateDir, path)
		if err != nil {
			return nil
		}

		// Validate path (no path traversal)
		if filepath.IsAbs(relPath) || len(relPath) > MaxPathLength {
			return nil
		}

		// Determine MIME type
		mimeType := getMimeType(path)

		artifact := SessionArtifact{
			Path:         relPath,
			Size:         info.Size(),
			MimeType:     mimeType,
			LastModified: info.ModTime(),
		}

		artifacts = append(artifacts, artifact)
		return nil
	})

	if err != nil {
		log.Printf("Failed to list artifacts in %s: %v", stateDir, err)
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:     "Failed to list artifacts",
			Code:      ErrInternalError,
			Retryable: true,
		})
		return
	}

	c.JSON(http.StatusOK, ArtifactListResponse{
		Artifacts: artifacts,
	})
}

// T013: Validate Jira issue handler
func validateSessionJiraIssue(c *gin.Context) {
	projectName := c.Param("projectName")

	// Get user-scoped K8s clients
	reqK8s, reqDyn := getK8sClientsForRequest(c)
	if reqK8s == nil || reqDyn == nil {
		c.JSON(http.StatusUnauthorized, ErrorResponse{
			Error:     "Missing or invalid user token",
			Code:      ErrUnauthorized,
			Retryable: false,
		})
		return
	}

	// Parse request
	var req ValidateIssueRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:     "Invalid request body",
			Code:      ErrJiraInvalidIssueKey,
			Details:   err.Error(),
			Retryable: false,
		})
		return
	}

	// Validate issue key format
	if err := validateIssueKey(req.IssueKey); err != nil {
		c.JSON(http.StatusOK, ValidateIssueResponse{
			Valid: false,
			Error: err.Error(),
		})
		return
	}

	// Load Jira config
	config, err := loadJiraConfig(c.Request.Context(), reqK8s, projectName)
	if err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:     "Missing Jira configuration in runner secret (JIRA_URL, JIRA_PROJECT, JIRA_API_TOKEN required)",
			Code:      ErrJiraConfigMissing,
			Details:   err.Error(),
			Retryable: false,
		})
		return
	}

	// Validate issue with Jira API
	issue, err := validateIssue(config, req.IssueKey)
	if err != nil {
		c.JSON(http.StatusOK, ValidateIssueResponse{
			Valid: false,
			Error: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, ValidateIssueResponse{
		Valid: true,
		Issue: issue,
	})
}

// T014: Push session to Jira handler
func pushSessionToJira(c *gin.Context) {
	projectName := c.Param("projectName")
	sessionName := c.Param("sessionName")

	// Get user-scoped K8s clients
	reqK8s, reqDyn := getK8sClientsForRequest(c)
	if reqK8s == nil || reqDyn == nil {
		c.JSON(http.StatusUnauthorized, ErrorResponse{
			Error:     "Missing or invalid user token",
			Code:      ErrUnauthorized,
			Retryable: false,
		})
		return
	}

	// Parse request
	var req PushRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:     "Invalid request body",
			Code:      ErrJiraInvalidIssueKey,
			Details:   err.Error(),
			Retryable: false,
		})
		return
	}

	// Validate issue key
	if err := validateIssueKey(req.IssueKey); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:     err.Error(),
			Code:      ErrJiraInvalidIssueKey,
			Retryable: false,
		})
		return
	}

	// Load AgenticSession CR
	session, err := getAgenticSessionCR(c.Request.Context(), reqDyn, projectName, sessionName)
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, ErrorResponse{
				Error:     "AgenticSession not found",
				Code:      ErrSessionNotFound,
				Details:   fmt.Sprintf("Session '%s' not found in project '%s'", sessionName, projectName),
				Retryable: false,
			})
			return
		}
		log.Printf("Failed to get session %s/%s: %v", projectName, sessionName, err)
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:     "Failed to get session",
			Code:      ErrInternalError,
			Retryable: true,
		})
		return
	}

	// Load Jira config
	config, err := loadJiraConfig(c.Request.Context(), reqK8s, projectName)
	if err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:     "Missing Jira configuration in runner secret",
			Code:      ErrJiraConfigMissing,
			Details:   err.Error(),
			Retryable: false,
		})
		return
	}

	// Get stateDir
	stateDir, err := getSessionStateDir(session)
	if err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:     "Session stateDir not available",
			Code:      ErrArtifactNotFound,
			Details:   err.Error(),
			Retryable: false,
		})
		return
	}

	// Upload artifacts in parallel (max 5 concurrent)
	var wg sync.WaitGroup
	sem := make(chan struct{}, 5) // Semaphore for max 5 parallel uploads
	var mu sync.Mutex
	successfulArtifacts := []string{}
	failedArtifacts := []ArtifactError{}
	jiraLinks := []JiraLink{}

	for _, artifactPath := range req.Artifacts {
		wg.Add(1)
		go func(path string) {
			defer wg.Done()
			sem <- struct{}{}        // Acquire semaphore
			defer func() { <-sem }() // Release semaphore

			// Full path to artifact
			fullPath := filepath.Join(stateDir, path)

			// Validate artifact size
			info, err := os.Stat(fullPath)
			if err != nil {
				mu.Lock()
				failedArtifacts = append(failedArtifacts, ArtifactError{
					Path:  path,
					Error: "Artifact not found",
				})
				jiraLinks = append(jiraLinks, JiraLink{
					Path:      path,
					JiraKey:   req.IssueKey,
					Timestamp: getCurrentTime(),
					Status:    "failed",
					Error:     "Artifact not found",
				})
				mu.Unlock()
				return
			}

			if err := validateArtifactSize(info.Size()); err != nil {
				mu.Lock()
				failedArtifacts = append(failedArtifacts, ArtifactError{
					Path:  path,
					Error: err.Error(),
				})
				jiraLinks = append(jiraLinks, JiraLink{
					Path:      path,
					JiraKey:   req.IssueKey,
					Timestamp: getCurrentTime(),
					Status:    "failed",
					Error:     err.Error(),
				})
				mu.Unlock()
				return
			}

			// Open file
			file, err := os.Open(fullPath)
			if err != nil {
				mu.Lock()
				failedArtifacts = append(failedArtifacts, ArtifactError{
					Path:  path,
					Error: "Failed to open artifact",
				})
				jiraLinks = append(jiraLinks, JiraLink{
					Path:      path,
					JiraKey:   req.IssueKey,
					Timestamp: getCurrentTime(),
					Status:    "failed",
					Error:     "Failed to open artifact",
				})
				mu.Unlock()
				return
			}
			defer file.Close()

			// Upload to Jira
			if err := uploadAttachment(config, req.IssueKey, path, file); err != nil {
				mu.Lock()
				failedArtifacts = append(failedArtifacts, ArtifactError{
					Path:  path,
					Error: err.Error(),
				})
				jiraLinks = append(jiraLinks, JiraLink{
					Path:      path,
					JiraKey:   req.IssueKey,
					Timestamp: getCurrentTime(),
					Status:    "failed",
					Error:     err.Error(),
				})
				mu.Unlock()
				return
			}

			// Success
			mu.Lock()
			successfulArtifacts = append(successfulArtifacts, path)
			jiraLinks = append(jiraLinks, JiraLink{
				Path:      path,
				JiraKey:   req.IssueKey,
				Timestamp: getCurrentTime(),
				Status:    "success",
			})
			mu.Unlock()
		}(artifactPath)
	}

	// Wait for all uploads to complete
	wg.Wait()

	// Create Jira comment with session metadata
	var commentID string
	if len(successfulArtifacts) > 0 {
		vteamURL := os.Getenv("VTEAM_URL") // e.g., https://vteam.example.com
		comment, _ := buildSessionComment(session, successfulArtifacts, vteamURL)
		commentID, _ = createComment(config, req.IssueKey, comment)
	}

	// Update AgenticSession annotations with JiraLinks
	if err := addMultipleJiraLinks(session, jiraLinks); err != nil {
		log.Printf("Failed to update session annotations: %v", err)
	} else {
		if err := updateSessionAnnotations(c.Request.Context(), reqDyn, session); err != nil {
			log.Printf("Failed to save session annotations: %v", err)
		}
	}

	// Return response
	success := len(failedArtifacts) == 0
	response := PushResponse{
		Success:     success,
		JiraKey:     req.IssueKey,
		Attachments: successfulArtifacts,
		CommentID:   commentID,
	}

	if len(failedArtifacts) > 0 {
		response.Errors = failedArtifacts
	}

	c.JSON(http.StatusOK, response)
}

// T015: Get session Jira links handler
func getSessionJiraLinks(c *gin.Context) {
	projectName := c.Param("projectName")
	sessionName := c.Param("sessionName")

	// Get user-scoped K8s clients
	_, reqDyn := getK8sClientsForRequest(c)
	if reqDyn == nil {
		c.JSON(http.StatusUnauthorized, ErrorResponse{
			Error:     "Missing or invalid user token",
			Code:      ErrUnauthorized,
			Retryable: false,
		})
		return
	}

	// Get AgenticSession CR
	session, err := getAgenticSessionCR(c.Request.Context(), reqDyn, projectName, sessionName)
	if err != nil {
		if errors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, ErrorResponse{
				Error:     "AgenticSession not found",
				Code:      ErrSessionNotFound,
				Details:   fmt.Sprintf("Session '%s' not found in project '%s'", sessionName, projectName),
				Retryable: false,
			})
			return
		}
		log.Printf("Failed to get session %s/%s: %v", projectName, sessionName, err)
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:     "Failed to get session",
			Code:      ErrInternalError,
			Retryable: true,
		})
		return
	}

	// Get Jira links from annotations
	links, err := getJiraLinks(session)
	if err != nil {
		log.Printf("Failed to parse Jira links for session %s/%s: %v", projectName, sessionName, err)
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:     "Failed to parse Jira links",
			Code:      ErrInternalError,
			Retryable: true,
		})
		return
	}

	// Sort links by timestamp (most recent first)
	sort.Slice(links, func(i, j int) bool {
		return links[i].Timestamp.After(links[j].Timestamp)
	})

	c.JSON(http.StatusOK, JiraLinksResponse{
		Links: links,
	})
}

// Helper: Get MIME type from file extension
func getMimeType(path string) string {
	ext := filepath.Ext(path)
	switch ext {
	case ".txt":
		return "text/plain"
	case ".json":
		return "application/json"
	case ".log":
		return "text/plain"
	case ".md":
		return "text/markdown"
	case ".html":
		return "text/html"
	case ".xml":
		return "application/xml"
	case ".yaml", ".yml":
		return "application/yaml"
	case ".csv":
		return "text/csv"
	case ".zip":
		return "application/zip"
	case ".tar":
		return "application/x-tar"
	case ".gz":
		return "application/gzip"
	default:
		return "application/octet-stream"
	}
}

// Helper: Get current time
func getCurrentTime() time.Time {
	return time.Now()
}
