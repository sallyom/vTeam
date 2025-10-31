package types

// BugFix Workflow Data Structures
type BugFixWorkflow struct {
	ID                      string          `json:"id"`
	GithubIssueNumber       int             `json:"githubIssueNumber"`
	GithubIssueURL          string          `json:"githubIssueURL"`
	Title                   string          `json:"title"`
	Description             string          `json:"description"`
	BranchName              string          `json:"branchName"`
	UmbrellaRepo            *GitRepository  `json:"umbrellaRepo,omitempty"`
	SupportingRepos         []GitRepository `json:"supportingRepos,omitempty"`
	JiraTaskKey             *string         `json:"jiraTaskKey,omitempty"`
	LastSyncedAt            *string         `json:"lastSyncedAt,omitempty"` // RFC3339 format
	WorkspacePath           string          `json:"workspacePath,omitempty"`
	CreatedBy               string          `json:"createdBy,omitempty"`
	CreatedAt               string          `json:"createdAt,omitempty"`
	UpdatedAt               string          `json:"updatedAt,omitempty"`
	Project                 string          `json:"project,omitempty"`
	Phase                   string          `json:"phase,omitempty"` // Initializing, Ready
	Message                 string          `json:"message,omitempty"`
	BugFolderCreated        bool            `json:"bugFolderCreated,omitempty"`
	BugfixMarkdownCreated   bool            `json:"bugfixMarkdownCreated,omitempty"`
}

// CreateBugFixWorkflowRequest represents the request to create a BugFix Workspace
type CreateBugFixWorkflowRequest struct {
	// Option 1: From GitHub Issue URL
	GithubIssueURL *string `json:"githubIssueURL,omitempty"`

	// Option 2: From text description (creates GitHub Issue automatically)
	TextDescription *TextDescriptionInput `json:"textDescription,omitempty"`

	// Common fields
	UmbrellaRepo    GitRepository   `json:"umbrellaRepo" binding:"required"`
	SupportingRepos []GitRepository `json:"supportingRepos,omitempty"`
	BranchName      *string         `json:"branchName,omitempty"` // Optional, auto-generated if not provided
}

// TextDescriptionInput represents input for creating workspace from text description
type TextDescriptionInput struct {
	Title               string  `json:"title" binding:"required,min=5,max=200"`
	Symptoms            string  `json:"symptoms" binding:"required,min=20"`
	ReproductionSteps   *string `json:"reproductionSteps,omitempty"`
	ExpectedBehavior    *string `json:"expectedBehavior,omitempty"`
	ActualBehavior      *string `json:"actualBehavior,omitempty"`
	AdditionalContext   *string `json:"additionalContext,omitempty"`
	TargetRepository    string  `json:"targetRepository" binding:"required"` // Where to create the GitHub Issue
}

// UpdateBugFixWorkflowRequest represents updates to workspace
type UpdateBugFixWorkflowRequest struct {
	Title           *string         `json:"title,omitempty"`
	Description     *string         `json:"description,omitempty"`
	SupportingRepos []GitRepository `json:"supportingRepos,omitempty"`
	JiraTaskKey     *string         `json:"jiraTaskKey,omitempty"`
	LastSyncedAt    *string         `json:"lastSyncedAt,omitempty"`
}

// CreateBugFixSessionRequest represents the request to create a session
type CreateBugFixSessionRequest struct {
	SessionType          string              `json:"sessionType" binding:"required"` // bug-review, bug-resolution-plan, bug-implement-fix, generic
	Title                *string             `json:"title,omitempty"`
	Description          *string             `json:"description,omitempty"`
	SelectedAgents       []string            `json:"selectedAgents,omitempty"` // Agent personas
	EnvironmentVariables map[string]string   `json:"environmentVariables,omitempty"`
	ResourceOverrides    *ResourceOverrides  `json:"resourceOverrides,omitempty"`
}

// SyncJiraRequest represents the request to sync workspace to Jira
type SyncJiraRequest struct {
	Force bool `json:"force,omitempty"` // Force sync even if recently synced
}

// SyncJiraResponse represents the response from Jira sync
type SyncJiraResponse struct {
	Success       bool    `json:"success"`
	JiraTaskKey   string  `json:"jiraTaskKey,omitempty"`
	JiraTaskURL   string  `json:"jiraTaskURL,omitempty"`
	Created       bool    `json:"created"` // true if newly created, false if updated
	Message       string  `json:"message,omitempty"`
	LastSyncedAt  string  `json:"lastSyncedAt,omitempty"`
}

// BugFixSession represents a session linked to a BugFix Workspace
type BugFixSession struct {
	ID              string            `json:"id"`
	WorkflowID      string            `json:"workflowId"`
	SessionType     string            `json:"sessionType"` // bug-review, bug-resolution-plan, bug-implement-fix, generic
	Title           string            `json:"title"`
	Description     string            `json:"description,omitempty"`
	Phase           string            `json:"phase"` // Pending, Creating, Running, Completed, Failed, Stopped
	CreatedAt       string            `json:"createdAt"`
	CompletedAt     *string           `json:"completedAt,omitempty"`
	AgentPersonas   []string          `json:"agentPersonas,omitempty"`
}
