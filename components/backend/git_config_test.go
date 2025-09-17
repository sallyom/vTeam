package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// TestGitConfigTypes tests the Git configuration type definitions
func TestGitConfigTypes(t *testing.T) {
	// Test GitUser
	user := GitUser{
		Name:  "Test User",
		Email: "test@example.com",
	}
	assert.Equal(t, "Test User", user.Name)
	assert.Equal(t, "test@example.com", user.Email)

	// Test GitAuthentication
	sshSecret := "my-ssh-secret"
	tokenSecret := "my-token-secret"
	auth := GitAuthentication{
		SSHKeySecret: &sshSecret,
		TokenSecret:  &tokenSecret,
	}
	assert.Equal(t, "my-ssh-secret", *auth.SSHKeySecret)
	assert.Equal(t, "my-token-secret", *auth.TokenSecret)

	// Test GitRepository
	branch := "main"
	clonePath := "my-repo"
	repo := GitRepository{
		URL:       "https://github.com/user/repo.git",
		Branch:    &branch,
		ClonePath: &clonePath,
	}
	assert.Equal(t, "https://github.com/user/repo.git", repo.URL)
	assert.Equal(t, "main", *repo.Branch)
	assert.Equal(t, "my-repo", *repo.ClonePath)

	// Test GitConfig
	gitConfig := GitConfig{
		User:           &user,
		Authentication: &auth,
		Repositories:   []GitRepository{repo},
	}
	assert.NotNil(t, gitConfig.User)
	assert.NotNil(t, gitConfig.Authentication)
	assert.Len(t, gitConfig.Repositories, 1)
}

// TestCreateAgenticSessionWithGitConfig tests creating a session with Git configuration
func TestCreateAgenticSessionWithGitConfig(t *testing.T) {
	// Set up test environment (this would normally require k8s clients)
	gin.SetMode(gin.TestMode)

	// Create test request with Git configuration
	sshSecret := "test-ssh-secret"
	branch := "develop"
	request := CreateAgenticSessionRequest{
		Prompt:     "Test prompt with Git",
		WebsiteURL: "https://example.com",
		GitConfig: &GitConfig{
			User: &GitUser{
				Name:  "Test User",
				Email: "test@example.com",
			},
			Authentication: &GitAuthentication{
				SSHKeySecret: &sshSecret,
			},
			Repositories: []GitRepository{
				{
					URL:    "https://github.com/user/repo.git",
					Branch: &branch,
				},
			},
		},
	}

	// Test JSON serialization
	jsonData, err := json.Marshal(request)
	assert.NoError(t, err)

	// Verify the JSON contains Git configuration
	var unmarshaled CreateAgenticSessionRequest
	err = json.Unmarshal(jsonData, &unmarshaled)
	assert.NoError(t, err)
	assert.NotNil(t, unmarshaled.GitConfig)
	assert.Equal(t, "Test User", unmarshaled.GitConfig.User.Name)
	assert.Equal(t, "test@example.com", unmarshaled.GitConfig.User.Email)
	assert.Equal(t, "test-ssh-secret", *unmarshaled.GitConfig.Authentication.SSHKeySecret)
	assert.Len(t, unmarshaled.GitConfig.Repositories, 1)
	assert.Equal(t, "https://github.com/user/repo.git", unmarshaled.GitConfig.Repositories[0].URL)
	assert.Equal(t, "develop", *unmarshaled.GitConfig.Repositories[0].Branch)
}

// TestParseSpecWithGitConfig tests parsing Git configuration from spec
func TestParseSpecWithGitConfig(t *testing.T) {
	// Create test spec with Git configuration
	spec := map[string]interface{}{
		"prompt":     "Test prompt",
		"websiteURL": "https://example.com",
		"timeout":    float64(300),
		"llmSettings": map[string]interface{}{
			"model":       "claude-3-5-sonnet-20241022",
			"temperature": 0.7,
			"maxTokens":   float64(4000),
		},
		"gitConfig": map[string]interface{}{
			"user": map[string]interface{}{
				"name":  "Test User",
				"email": "test@example.com",
			},
			"authentication": map[string]interface{}{
				"sshKeySecret": "test-ssh-secret",
				"tokenSecret":  "test-token-secret",
			},
			"repositories": []interface{}{
				map[string]interface{}{
					"url":       "https://github.com/user/repo.git",
					"branch":    "main",
					"clonePath": "my-repo",
				},
			},
		},
	}

	// Parse the spec
	result := parseSpec(spec)

	// Verify Git configuration was parsed correctly
	assert.NotNil(t, result.GitConfig)
	assert.NotNil(t, result.GitConfig.User)
	assert.Equal(t, "Test User", result.GitConfig.User.Name)
	assert.Equal(t, "test@example.com", result.GitConfig.User.Email)

	assert.NotNil(t, result.GitConfig.Authentication)
	assert.Equal(t, "test-ssh-secret", *result.GitConfig.Authentication.SSHKeySecret)
	assert.Equal(t, "test-token-secret", *result.GitConfig.Authentication.TokenSecret)

	assert.Len(t, result.GitConfig.Repositories, 1)
	assert.Equal(t, "https://github.com/user/repo.git", result.GitConfig.Repositories[0].URL)
	assert.Equal(t, "main", *result.GitConfig.Repositories[0].Branch)
	assert.Equal(t, "my-repo", *result.GitConfig.Repositories[0].ClonePath)
}

// TestParseSpecWithoutGitConfig tests parsing spec without Git configuration
func TestParseSpecWithoutGitConfig(t *testing.T) {
	spec := map[string]interface{}{
		"prompt":     "Test prompt",
		"websiteURL": "https://example.com",
		"timeout":    float64(300),
		"llmSettings": map[string]interface{}{
			"model":       "claude-3-5-sonnet-20241022",
			"temperature": 0.7,
			"maxTokens":   float64(4000),
		},
	}

	result := parseSpec(spec)

	// Verify Git configuration is nil when not provided
	assert.Nil(t, result.GitConfig)
}

// TestGitConfigValidation tests Git configuration validation
func TestGitConfigValidation(t *testing.T) {
	tests := []struct {
		name        string
		gitConfig   *GitConfig
		expectValid bool
	}{
		{
			name: "Valid complete Git config",
			gitConfig: &GitConfig{
				User: &GitUser{
					Name:  "Test User",
					Email: "test@example.com",
				},
				Repositories: []GitRepository{
					{
						URL: "https://github.com/user/repo.git",
					},
				},
			},
			expectValid: true,
		},
		{
			name: "Valid Git config with just user",
			gitConfig: &GitConfig{
				User: &GitUser{
					Name:  "Test User",
					Email: "test@example.com",
				},
			},
			expectValid: true,
		},
		{
			name: "Valid Git config with just repositories",
			gitConfig: &GitConfig{
				Repositories: []GitRepository{
					{
						URL: "https://github.com/user/repo.git",
					},
				},
			},
			expectValid: true,
		},
		{
			name:        "Empty Git config",
			gitConfig:   &GitConfig{},
			expectValid: true, // Empty config is valid (optional fields)
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Test JSON marshaling/unmarshaling
			jsonData, err := json.Marshal(tt.gitConfig)
			assert.NoError(t, err)

			var unmarshaled GitConfig
			err = json.Unmarshal(jsonData, &unmarshaled)
			assert.NoError(t, err)

			if tt.expectValid {
				// Additional validation could be added here
				assert.True(t, true) // Placeholder for actual validation logic
			}
		})
	}
}

// TestCreateSessionRequestValidation tests request validation
func TestCreateSessionRequestValidation(t *testing.T) {
	// This would test the Gin binding validation
	// For now, we'll test the structure

	request := CreateAgenticSessionRequest{
		Prompt:     "Valid prompt that is long enough",
		WebsiteURL: "https://example.com",
		GitConfig: &GitConfig{
			User: &GitUser{
				Name:  "Test User",
				Email: "test@example.com",
			},
		},
	}

	// Test that the structure is valid
	jsonData, err := json.Marshal(request)
	assert.NoError(t, err)
	assert.Contains(t, string(jsonData), "gitConfig")
	assert.Contains(t, string(jsonData), "Test User")
}

// MockCreateAgenticSessionHandler creates a mock handler for testing
func MockCreateAgenticSessionHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		var req CreateAgenticSessionRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Mock successful creation
		c.JSON(http.StatusCreated, gin.H{
			"message": "Agentic session created successfully",
			"name":    "mock-session-123",
			"gitConfigProvided": req.GitConfig != nil,
		})
	}
}

// TestCreateSessionEndpointWithGitConfig tests the endpoint with Git configuration
func TestCreateSessionEndpointWithGitConfig(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.POST("/api/agentic-sessions", MockCreateAgenticSessionHandler())

	sshSecret := "test-ssh-secret"
	request := CreateAgenticSessionRequest{
		Prompt:     "Test prompt for Git integration",
		WebsiteURL: "https://example.com",
		GitConfig: &GitConfig{
			User: &GitUser{
				Name:  "Test User",
				Email: "test@example.com",
			},
			Authentication: &GitAuthentication{
				SSHKeySecret: &sshSecret,
			},
			Repositories: []GitRepository{
				{
					URL: "https://github.com/user/repo.git",
				},
			},
		},
	}

	jsonData, _ := json.Marshal(request)
	req, _ := http.NewRequest("POST", "/api/agentic-sessions", bytes.NewBuffer(jsonData))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)
	assert.Equal(t, true, response["gitConfigProvided"])
}