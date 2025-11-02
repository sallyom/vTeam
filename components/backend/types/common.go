package types

// Common types used across the application

type GitRepository struct {
	URL    string  `json:"url"`
	Branch *string `json:"branch,omitempty"`
}

// GetURL implements git.GitRepo interface
func (r GitRepository) GetURL() string {
	return r.URL
}

// GetBranch implements git.GitRepo interface
func (r GitRepository) GetBranch() *string {
	return r.Branch
}

type UserContext struct {
	UserID      string   `json:"userId" binding:"required"`
	DisplayName string   `json:"displayName" binding:"required"`
	Groups      []string `json:"groups" binding:"required"`
}

type BotAccountRef struct {
	Name string `json:"name" binding:"required"`
}

type ResourceOverrides struct {
	CPU           string   `json:"cpu,omitempty"`
	Memory        string   `json:"memory,omitempty"`
	StorageClass  string   `json:"storageClass,omitempty"`
	PriorityClass string   `json:"priorityClass,omitempty"`
	Model         *string  `json:"model,omitempty"`
	Temperature   *float64 `json:"temperature,omitempty"`
	MaxTokens     *int     `json:"maxTokens,omitempty"`
}

type LLMSettings struct {
	Model       string  `json:"model"`
	Temperature float64 `json:"temperature"`
	MaxTokens   int     `json:"maxTokens"`
}

type GitConfig struct {
	Repositories []GitRepository `json:"repositories,omitempty"`
}

type Paths struct {
	Workspace string `json:"workspace,omitempty"`
	Messages  string `json:"messages,omitempty"`
	Inbox     string `json:"inbox,omitempty"`
}

// Helper functions for pointer types
func BoolPtr(b bool) *bool {
	return &b
}

func StringPtr(s string) *string {
	return &s
}

func IntPtr(i int) *int {
	return &i
}
