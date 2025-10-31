package bugfix

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"ambient-code-backend/git"
)

// CreateBugFolder creates a bug-{issue-number}/ folder in the spec repository
// Returns error if folder creation or commit fails
func CreateBugFolder(ctx context.Context, specRepoURL string, issueNumber int, branchName, token, userEmail, userName string) error {
	// Pre-validate push access
	if err := git.ValidatePushAccess(ctx, specRepoURL, token); err != nil {
		return fmt.Errorf("cannot write to spec repo: %w. Check repository permissions", err)
	}

	// Create temporary directory for clone
	repoDir, err := os.MkdirTemp("", fmt.Sprintf("bugfix-%d-*", issueNumber))
	if err != nil {
		return fmt.Errorf("failed to create temp directory: %v", err)
	}
	defer os.RemoveAll(repoDir)

	// Inject token into URL for authentication
	authenticatedURL, err := git.InjectGitHubToken(specRepoURL, token)
	if err != nil {
		return fmt.Errorf("failed to inject token: %v", err)
	}

	// Clone repository (shallow clone for speed)
	cloneArgs := []string{"clone", "--depth", "1", "--branch", branchName, authenticatedURL, repoDir}
	cloneCmd := exec.CommandContext(ctx, "git", cloneArgs...)
	if out, err := cloneCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git clone failed: %w (output: %s)", err, string(out))
	}

	// Create bug folder
	bugFolderPath := filepath.Join(repoDir, fmt.Sprintf("bug-%d", issueNumber))
	if err := os.MkdirAll(bugFolderPath, 0755); err != nil {
		return fmt.Errorf("failed to create bug folder: %v", err)
	}

	// Create README.md in bug folder
	readmePath := filepath.Join(bugFolderPath, "README.md")
	readmeContent := fmt.Sprintf("# Bug #%d\n\nThis folder contains all documentation and artifacts related to GitHub Issue #%d.\n", issueNumber, issueNumber)
	if err := os.WriteFile(readmePath, []byte(readmeContent), 0644); err != nil {
		return fmt.Errorf("failed to create README.md: %v", err)
	}

	// Configure git user
	if userEmail == "" {
		userEmail = "vteam@ambient-code.com"
	}
	if userName == "" {
		userName = "vTeam"
	}

	configEmailCmd := exec.CommandContext(ctx, "git", "-C", repoDir, "config", "user.email", userEmail)
	if err := configEmailCmd.Run(); err != nil {
		return fmt.Errorf("failed to configure git user.email: %v", err)
	}

	configNameCmd := exec.CommandContext(ctx, "git", "-C", repoDir, "config", "user.name", userName)
	if err := configNameCmd.Run(); err != nil {
		return fmt.Errorf("failed to configure git user.name: %v", err)
	}

	// Stage bug folder
	addCmd := exec.CommandContext(ctx, "git", "-C", repoDir, "add", fmt.Sprintf("bug-%d", issueNumber))
	if out, err := addCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git add failed: %w (output: %s)", err, string(out))
	}

	// Commit changes
	commitMsg := fmt.Sprintf("Create bug folder for issue #%d", issueNumber)
	commitCmd := exec.CommandContext(ctx, "git", "-C", repoDir, "commit", "-m", commitMsg)
	if out, err := commitCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git commit failed: %w (output: %s)", err, string(out))
	}

	// Push changes using git config to inject token
	cfg := fmt.Sprintf("url.https://x-access-token:%s@github.com/.insteadOf=https://github.com/", token)
	pushCmd := exec.CommandContext(ctx, "git", "-C", repoDir, "-c", cfg, "push", "-u", "origin", branchName)
	if out, err := pushCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git push failed: %w (output: %s)", err, string(out))
	}

	return nil
}

// CreateOrUpdateBugfixMarkdown creates or updates the bugfix-gh-{issue-number}.md file
// If the file exists, it appends the new content to the appropriate section
func CreateOrUpdateBugfixMarkdown(ctx context.Context, specRepoURL string, issueNumber int, branchName, token, userEmail, userName, githubIssueURL, jiraTaskURL, sectionName, content string) error {
	// Pre-validate push access
	if err := git.ValidatePushAccess(ctx, specRepoURL, token); err != nil {
		return fmt.Errorf("cannot write to spec repo: %w", err)
	}

	// Create temporary directory for clone
	repoDir, err := os.MkdirTemp("", fmt.Sprintf("bugfix-%d-*", issueNumber))
	if err != nil {
		return fmt.Errorf("failed to create temp directory: %v", err)
	}
	defer os.RemoveAll(repoDir)

	// Inject token into URL for authentication
	authenticatedURL, err := git.InjectGitHubToken(specRepoURL, token)
	if err != nil {
		return fmt.Errorf("failed to inject token: %v", err)
	}

	// Clone repository
	cloneArgs := []string{"clone", "--depth", "1", "--branch", branchName, authenticatedURL, repoDir}
	cloneCmd := exec.CommandContext(ctx, "git", cloneArgs...)
	if out, err := cloneCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git clone failed: %w (output: %s)", err, string(out))
	}

	bugFolderPath := filepath.Join(repoDir, fmt.Sprintf("bug-%d", issueNumber))
	bugfixFilePath := filepath.Join(bugFolderPath, fmt.Sprintf("bugfix-gh-%d.md", issueNumber))

	// Check if file exists
	var fileContent string
	if _, err := os.Stat(bugfixFilePath); os.IsNotExist(err) {
		// Create new file with template
		fileContent = generateBugfixTemplate(issueNumber, githubIssueURL, jiraTaskURL)
	} else {
		// Read existing file
		existingBytes, err := os.ReadFile(bugfixFilePath)
		if err != nil {
			return fmt.Errorf("failed to read existing bugfix.md: %v", err)
		}
		fileContent = string(existingBytes)
	}

	// Append content to the appropriate section
	fileContent = appendToSection(fileContent, sectionName, content)

	// Write updated content
	if err := os.WriteFile(bugfixFilePath, []byte(fileContent), 0644); err != nil {
		return fmt.Errorf("failed to write bugfix.md: %v", err)
	}

	// Configure git user
	if userEmail == "" {
		userEmail = "vteam@ambient-code.com"
	}
	if userName == "" {
		userName = "vTeam"
	}

	configEmailCmd := exec.CommandContext(ctx, "git", "-C", repoDir, "config", "user.email", userEmail)
	if err := configEmailCmd.Run(); err != nil {
		return fmt.Errorf("failed to configure git user.email: %v", err)
	}

	configNameCmd := exec.CommandContext(ctx, "git", "-C", repoDir, "config", "user.name", userName)
	if err := configNameCmd.Run(); err != nil {
		return fmt.Errorf("failed to configure git user.name: %v", err)
	}

	// Stage changes
	addCmd := exec.CommandContext(ctx, "git", "-C", repoDir, "add", fmt.Sprintf("bug-%d", issueNumber))
	if out, err := addCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git add failed: %w (output: %s)", err, string(out))
	}

	// Commit changes
	commitMsg := fmt.Sprintf("Update bugfix documentation for issue #%d: %s", issueNumber, sectionName)
	commitCmd := exec.CommandContext(ctx, "git", "-C", repoDir, "commit", "-m", commitMsg)
	if out, err := commitCmd.CombinedOutput(); err != nil {
		// Check if no changes to commit (not an error)
		if strings.Contains(string(out), "nothing to commit") {
			return nil
		}
		return fmt.Errorf("git commit failed: %w (output: %s)", err, string(out))
	}

	// Push changes
	cfg := fmt.Sprintf("url.https://x-access-token:%s@github.com/.insteadOf=https://github.com/", token)
	pushCmd := exec.CommandContext(ctx, "git", "-C", repoDir, "-c", cfg, "push", "-u", "origin", branchName)
	if out, err := pushCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git push failed: %w (output: %s)", err, string(out))
	}

	return nil
}

// GetBugfixContent retrieves the content of bugfix-gh-{issue-number}.md file via GitHub API
// This is faster than cloning since it doesn't require git operations
func GetBugfixContent(ctx context.Context, owner, repo, branch string, issueNumber int, token string) (string, error) {
	filePath := fmt.Sprintf("bug-%d/bugfix-gh-%d.md", issueNumber, issueNumber)
	content, err := git.ReadGitHubFile(ctx, owner, repo, branch, filePath, token)
	if err != nil {
		return "", fmt.Errorf("failed to read bugfix.md: %w", err)
	}
	return string(content), nil
}

// CheckBugFolderExists checks if bug-{issue-number}/ folder exists in the repository
// Uses GitHub API to check path existence (faster than cloning)
func CheckBugFolderExists(ctx context.Context, owner, repo, branch string, issueNumber int, token string) (bool, error) {
	folderPath := fmt.Sprintf("bug-%d", issueNumber)

	// Use GitHub Contents API to check if path exists
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s?ref=%s", owner, repo, folderPath, branch)

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return false, fmt.Errorf("failed to create request: %v", err)
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return false, fmt.Errorf("GitHub API request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		return true, nil
	} else if resp.StatusCode == 404 {
		return false, nil
	}

	return false, fmt.Errorf("unexpected status code %d from GitHub API", resp.StatusCode)
}

// generateBugfixTemplate generates the initial template for bugfix-gh-{issue-number}.md
func generateBugfixTemplate(issueNumber int, githubIssueURL, jiraTaskURL string) string {
	var template strings.Builder

	template.WriteString(fmt.Sprintf("# Bug Fix: GitHub Issue #%d\n\n", issueNumber))
	template.WriteString(fmt.Sprintf("**GitHub Issue**: %s\n", githubIssueURL))

	if jiraTaskURL != "" {
		template.WriteString(fmt.Sprintf("**Jira Task**: %s\n", jiraTaskURL))
	}

	template.WriteString("**Status**: Open\n\n")
	template.WriteString("---\n\n")
	template.WriteString("## Root Cause Analysis\n\n")
	template.WriteString("*(Updated by Bug-review session)*\n\n")
	template.WriteString("---\n\n")
	template.WriteString("## Resolution Plan\n\n")
	template.WriteString("*(Updated by Bug-resolution-plan session)*\n\n")
	template.WriteString("---\n\n")
	template.WriteString("## Implementation Steps\n\n")
	template.WriteString("*(Updated by Bug-implement-fix session)*\n\n")
	template.WriteString("---\n\n")
	template.WriteString("## Testing\n\n")
	template.WriteString("*(Updated by Bug-implement-fix session)*\n\n")
	template.WriteString("---\n\n")
	template.WriteString("## Additional Notes\n\n")

	return template.String()
}

// appendToSection appends content to a specific section in the markdown file
// If the section doesn't exist, it's created before the next section marker
func appendToSection(fileContent, sectionName, content string) string {
	// Find the section header
	sectionHeader := fmt.Sprintf("## %s", sectionName)
	sectionIndex := strings.Index(fileContent, sectionHeader)

	if sectionIndex == -1 {
		// Section doesn't exist, append at the end
		return fileContent + "\n" + sectionHeader + "\n\n" + content + "\n"
	}

	// Find the next section marker (## ) after this section
	nextSectionIndex := strings.Index(fileContent[sectionIndex+len(sectionHeader):], "\n##")

	if nextSectionIndex == -1 {
		// No next section, append at the end
		return fileContent + "\n" + content + "\n"
	}

	// Insert content before the next section
	insertPosition := sectionIndex + len(sectionHeader) + nextSectionIndex
	before := fileContent[:insertPosition]
	after := fileContent[insertPosition:]

	return before + "\n" + content + "\n" + after
}
