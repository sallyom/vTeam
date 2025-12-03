// Package main provides an init container for setting up git repositories before runner execution
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"ambient-code-backend/git"
)

// RepositoryConfig represents a single repository to clone
type RepositoryConfig struct {
	Name  string `json:"name"`
	Input struct {
		URL                string `json:"url"`
		Branch             string `json:"branch,omitempty"` // Legacy field
		BaseBranch         string `json:"baseBranch,omitempty"`
		FeatureBranch      string `json:"featureBranch,omitempty"`
		AllowProtectedWork bool   `json:"allowProtectedWork,omitempty"`
		Sync               *struct {
			URL    string `json:"url"`
			Branch string `json:"branch,omitempty"`
		} `json:"sync,omitempty"`
	} `json:"input"`
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("Git init container starting...")

	ctx := context.Background()

	// Get configuration from environment
	workspacePath := os.Getenv("WORKSPACE_PATH")
	if workspacePath == "" {
		log.Fatal("WORKSPACE_PATH environment variable is required")
	}

	sessionID := os.Getenv("SESSION_ID")
	if sessionID == "" {
		log.Fatal("SESSION_ID environment variable is required")
	}

	// Ensure workspace directory exists
	if err := os.MkdirAll(workspacePath, 0755); err != nil {
		log.Fatalf("Failed to create workspace directory: %v", err)
	}

	// Parse repository configuration from REPOS_JSON
	reposJSON := os.Getenv("REPOS_JSON")
	if reposJSON == "" {
		log.Println("No REPOS_JSON provided, skipping multi-repo setup")

		// Check for legacy single-repo configuration
		inputRepoURL := os.Getenv("INPUT_REPO_URL")
		if inputRepoURL != "" {
			if err := setupLegacySingleRepo(ctx, workspacePath, sessionID); err != nil {
				log.Fatalf("Failed to setup legacy single repository: %v", err)
			}
		}

		log.Println("Git init container completed successfully")
		return
	}

	// Parse multi-repo configuration
	var repos []RepositoryConfig
	if err := json.Unmarshal([]byte(reposJSON), &repos); err != nil {
		log.Fatalf("Failed to parse REPOS_JSON: %v", err)
	}

	log.Printf("Setting up %d repositories...", len(repos))

	// Fetch GitHub token for authentication
	token := os.Getenv("GITHUB_TOKEN")
	if token == "" {
		log.Println("Warning: No GITHUB_TOKEN provided, private repositories may fail")
	}

	// Clone each repository
	for _, repo := range repos {
		if err := setupRepository(ctx, workspacePath, sessionID, repo, token); err != nil {
			// Log error but continue with other repositories
			log.Printf("Failed to setup repository %s: %v", repo.Name, err)
			log.Println("Continuing with remaining repositories...")
		}
	}

	// Create artifacts directory
	artifactsPath := filepath.Join(workspacePath, "artifacts")
	if err := os.MkdirAll(artifactsPath, 0755); err != nil {
		log.Printf("Warning: Failed to create artifacts directory: %v", err)
	}

	log.Println("Git init container completed successfully")
}

func setupRepository(ctx context.Context, workspacePath, sessionID string, repo RepositoryConfig, token string) error {
	name := strings.TrimSpace(repo.Name)
	if name == "" {
		return fmt.Errorf("repository name is required")
	}

	url := strings.TrimSpace(repo.Input.URL)
	if url == "" {
		return fmt.Errorf("repository URL is required for %s", name)
	}

	// Determine base branch (prefer baseBranch, fall back to branch, default to main)
	baseBranch := strings.TrimSpace(repo.Input.BaseBranch)
	if baseBranch == "" {
		baseBranch = strings.TrimSpace(repo.Input.Branch)
	}
	if baseBranch == "" {
		baseBranch = "main"
	}

	// Get feature branch if specified
	featureBranch := strings.TrimSpace(repo.Input.FeatureBranch)

	// Check if protected work is allowed
	allowProtectedWork := repo.Input.AllowProtectedWork

	// Prepare clone options
	opts := git.CloneOptions{
		URL:                url,
		BaseBranch:         baseBranch,
		FeatureBranch:      featureBranch,
		AllowProtectedWork: allowProtectedWork,
		Token:              token,
		DestinationDir:     filepath.Join(workspacePath, name),
		SessionID:          sessionID,
	}

	// Add sync configuration if provided
	if repo.Input.Sync != nil && strings.TrimSpace(repo.Input.Sync.URL) != "" {
		opts.SyncURL = strings.TrimSpace(repo.Input.Sync.URL)
		opts.SyncBranch = strings.TrimSpace(repo.Input.Sync.Branch)
		if opts.SyncBranch == "" {
			opts.SyncBranch = "main"
		}
	}

	log.Printf("Cloning repository: %s", name)
	log.Printf("  URL: %s", url)
	log.Printf("  Base Branch: %s", baseBranch)
	if featureBranch != "" {
		log.Printf("  Feature Branch: %s", featureBranch)
	}
	if allowProtectedWork {
		log.Printf("  Allow Protected Work: true")
	}
	if opts.SyncURL != "" {
		log.Printf("  Sync URL: %s (branch: %s)", opts.SyncURL, opts.SyncBranch)
	}

	// Clone repository with enhanced options
	if err := git.CloneWithOptions(ctx, opts); err != nil {
		return fmt.Errorf("failed to clone repository: %w", err)
	}

	log.Printf("Successfully setup repository: %s", name)
	return nil
}

func setupLegacySingleRepo(ctx context.Context, workspacePath, sessionID string) error {
	url := os.Getenv("INPUT_REPO_URL")
	branch := os.Getenv("INPUT_BRANCH")
	if branch == "" {
		branch = "main"
	}

	token := os.Getenv("GITHUB_TOKEN")

	log.Printf("Setting up legacy single repository")
	log.Printf("  URL: %s", url)
	log.Printf("  Branch: %s", branch)

	opts := git.CloneOptions{
		URL:            url,
		BaseBranch:     branch,
		Token:          token,
		DestinationDir: workspacePath,
		SessionID:      sessionID,
	}

	if err := git.CloneWithOptions(ctx, opts); err != nil {
		return fmt.Errorf("failed to clone repository: %w", err)
	}

	log.Println("Successfully setup legacy single repository")
	return nil
}
