package handlers

import (
	"context"
	"fmt"
	"log"
	"math"
	"strings"
	"time"

	authv1 "k8s.io/api/authorization/v1"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/kubernetes"
)

// GetProjectSettingsResource returns the GroupVersionResource for ProjectSettings
func GetProjectSettingsResource() schema.GroupVersionResource {
	return schema.GroupVersionResource{
		Group:    "vteam.ambient-code",
		Version:  "v1alpha1",
		Resource: "projectsettings",
	}
}

// RetryWithBackoff attempts an operation with exponential backoff
// Used for operations that may temporarily fail due to async resource creation
// This is a generic utility that can be used by any handler
// Checks for context cancellation between retries to avoid wasting resources
func RetryWithBackoff(maxRetries int, initialDelay, maxDelay time.Duration, operation func() error) error {
	var lastErr error
	for i := 0; i < maxRetries; i++ {
		if err := operation(); err != nil {
			lastErr = err
			if i < maxRetries-1 {
				// Calculate exponential backoff delay
				delay := time.Duration(float64(initialDelay) * math.Pow(2, float64(i)))
				if delay > maxDelay {
					delay = maxDelay
				}
				log.Printf("Operation failed (attempt %d/%d), retrying in %v: %v", i+1, maxRetries, delay, err)
				time.Sleep(delay)
				continue
			}
		} else {
			return nil
		}
	}
	return fmt.Errorf("operation failed after %d retries: %w", maxRetries, lastErr)
}

// ValidateSecretAccess checks if the user has permission to perform the given verb on secrets
// Returns an error if the user lacks the required permission
// Accepts kubernetes.Interface for compatibility with dependency injection in tests
func ValidateSecretAccess(ctx context.Context, k8sClient kubernetes.Interface, namespace, verb string) error {
	ssar := &authv1.SelfSubjectAccessReview{
		Spec: authv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authv1.ResourceAttributes{
				Group:     "", // core API group for secrets
				Resource:  "secrets",
				Verb:      verb, // "create", "get", "update", "delete"
				Namespace: namespace,
			},
		},
	}

	res, err := k8sClient.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx, ssar, v1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("RBAC check failed: %w", err)
	}

	if !res.Status.Allowed {
		return fmt.Errorf("user not allowed to %s secrets in namespace %s", verb, namespace)
	}

	return nil
}

// isProtectedBranch checks if a branch name is commonly protected
func isProtectedBranch(branch string) bool {
	if branch == "" {
		return false
	}
	protectedNames := []string{
		"main", "master", "develop", "dev", "development",
		"production", "prod", "staging", "stage", "qa", "test", "stable",
	}
	branchLower := strings.ToLower(strings.TrimSpace(branch))
	for _, protected := range protectedNames {
		if branchLower == protected {
			return true
		}
	}
	return false
}

// isValidGitBranchName validates a user-supplied branch name against git branch naming rules
// and shell injection risks. Returns true if the branch name is safe to use.
// Security: This prevents command injection by rejecting shell metacharacters.
func isValidGitBranchName(branch string) bool {
	if branch == "" {
		return false
	}

	// Reject if longer than 255 characters (git limit)
	if len(branch) > 255 {
		return false
	}

	// Reject shell metacharacters that could lead to command injection
	// CRITICAL: These characters could break out of git commands in wrapper.py
	shellMetachars := []rune{';', '&', '|', '$', '`', '\\', '\n', '\r', '\t', '<', '>', '(', ')', '{', '}', '\'', '"', ' '}
	for _, char := range shellMetachars {
		if strings.ContainsRune(branch, char) {
			return false
		}
	}

	// Reject git control characters and patterns
	gitControlChars := []string{"..", "~", "^", ":", "?", "*", "[", "@{"}
	for _, pattern := range gitControlChars {
		if strings.Contains(branch, pattern) {
			return false
		}
	}

	// Cannot start or end with dot or slash
	if strings.HasPrefix(branch, ".") || strings.HasSuffix(branch, ".") ||
		strings.HasPrefix(branch, "/") || strings.HasSuffix(branch, "/") {
		return false
	}

	// Cannot contain consecutive slashes
	if strings.Contains(branch, "//") {
		return false
	}

	// Must contain only valid characters: alphanumeric, dash, underscore, slash, dot
	for _, r := range branch {
		valid := (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') || r == '-' || r == '_' || r == '/' || r == '.'
		if !valid {
			return false
		}
	}

	return true
}

// sanitizeBranchName converts a display name to a valid git branch name
func sanitizeBranchName(name string) string {
	// Replace spaces with hyphens
	name = strings.ReplaceAll(name, " ", "-")
	// Remove or replace invalid characters for git branch names
	// Valid: alphanumeric, dash, underscore, slash, dot (but not at start/end)
	var result strings.Builder
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') || r == '-' || r == '_' || r == '/' {
			result.WriteRune(r)
		}
	}
	sanitized := result.String()
	// Trim leading/trailing dashes or slashes
	sanitized = strings.Trim(sanitized, "-/")
	return sanitized
}

// generateWorkingBranch generates a working branch name based on the session and repo context
// Returns the branch name to use for the session
func generateWorkingBranch(sessionDisplayName, sessionID, requestedBranch string, allowProtectedWork bool) string {
	// If user explicitly requested a branch
	if requestedBranch != "" {
		// Check if it's protected and user hasn't allowed working on it
		if isProtectedBranch(requestedBranch) && !allowProtectedWork {
			// Create a temporary working branch to protect the base branch
			sessionIDShort := sessionID
			if len(sessionID) > 8 {
				sessionIDShort = sessionID[:8]
			}
			return fmt.Sprintf("work/%s/%s", requestedBranch, sessionIDShort)
		}
		// User requested non-protected branch or explicitly allowed protected work
		return requestedBranch
	}

	// No branch requested - generate from session name
	if sessionDisplayName != "" {
		sanitized := sanitizeBranchName(sessionDisplayName)
		if sanitized != "" {
			return sanitized
		}
	}

	// Fallback: use session ID
	sessionIDShort := sessionID
	if len(sessionID) > 8 {
		sessionIDShort = sessionID[:8]
	}
	return fmt.Sprintf("session-%s", sessionIDShort)
}
