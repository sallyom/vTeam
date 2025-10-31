package websocket

import (
	"time"
)

// BugFix Workspace WebSocket Event Types
const (
	EventBugFixWorkspaceCreated    = "bugfix-workspace-created"
	EventBugFixSessionStarted      = "bugfix-session-started"
	EventBugFixSessionProgress     = "bugfix-session-progress"
	EventBugFixSessionCompleted    = "bugfix-session-completed"
	EventBugFixSessionFailed       = "bugfix-session-failed"
	EventBugFixJiraSyncStarted     = "bugfix-jira-sync-started"
	EventBugFixJiraSyncCompleted   = "bugfix-jira-sync-completed"
	EventBugFixJiraSyncFailed      = "bugfix-jira-sync-failed"
)

// BroadcastBugFixWorkspaceCreated broadcasts when a BugFix Workspace is created
func BroadcastBugFixWorkspaceCreated(workflowID, githubIssueURL string, issueNumber int) {
	message := &SessionMessage{
		SessionID: workflowID, // Use workflowID as session identifier
		Type:      EventBugFixWorkspaceCreated,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Payload: map[string]interface{}{
			"workflowId":       workflowID,
			"githubIssueURL":   githubIssueURL,
			"githubIssueNumber": issueNumber,
		},
	}
	Hub.broadcast <- message
}

// BroadcastBugFixSessionStarted broadcasts when a session starts
func BroadcastBugFixSessionStarted(workflowID, sessionID, sessionType string, issueNumber int) {
	message := &SessionMessage{
		SessionID: workflowID,
		Type:      EventBugFixSessionStarted,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Payload: map[string]interface{}{
			"workflowId":        workflowID,
			"sessionId":         sessionID,
			"sessionType":       sessionType,
			"githubIssueNumber": issueNumber,
		},
	}
	Hub.broadcast <- message
}

// BroadcastBugFixSessionProgress broadcasts session progress updates
func BroadcastBugFixSessionProgress(workflowID, sessionID, sessionType, phase, progressMessage string, progress float64) {
	message := &SessionMessage{
		SessionID: workflowID,
		Type:      EventBugFixSessionProgress,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Payload: map[string]interface{}{
			"workflowId":  workflowID,
			"sessionId":   sessionID,
			"sessionType": sessionType,
			"phase":       phase,
			"message":     progressMessage,
			"progress":    progress,
		},
	}
	Hub.broadcast <- message
}

// BroadcastBugFixSessionCompleted broadcasts when a session completes successfully
func BroadcastBugFixSessionCompleted(workflowID, sessionID, sessionType string) {
	message := &SessionMessage{
		SessionID: workflowID,
		Type:      EventBugFixSessionCompleted,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Payload: map[string]interface{}{
			"workflowId":  workflowID,
			"sessionId":   sessionID,
			"sessionType": sessionType,
		},
	}
	Hub.broadcast <- message
}

// BroadcastBugFixSessionFailed broadcasts when a session fails
func BroadcastBugFixSessionFailed(workflowID, sessionID, sessionType, errorMsg string) {
	message := &SessionMessage{
		SessionID: workflowID,
		Type:      EventBugFixSessionFailed,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Payload: map[string]interface{}{
			"workflowId":  workflowID,
			"sessionId":   sessionID,
			"sessionType": sessionType,
			"error":       errorMsg,
		},
	}
	Hub.broadcast <- message
}

// BroadcastBugFixJiraSyncStarted broadcasts when Jira sync starts
func BroadcastBugFixJiraSyncStarted(workflowID string, issueNumber int) {
	message := &SessionMessage{
		SessionID: workflowID,
		Type:      EventBugFixJiraSyncStarted,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Payload: map[string]interface{}{
			"workflowId":        workflowID,
			"githubIssueNumber": issueNumber,
		},
	}
	Hub.broadcast <- message
}

// BroadcastBugFixJiraSyncCompleted broadcasts when Jira sync completes
func BroadcastBugFixJiraSyncCompleted(workflowID, jiraTaskKey, jiraTaskURL string, issueNumber int, created bool) {
	message := &SessionMessage{
		SessionID: workflowID,
		Type:      EventBugFixJiraSyncCompleted,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Payload: map[string]interface{}{
			"workflowId":        workflowID,
			"jiraTaskKey":       jiraTaskKey,
			"jiraTaskURL":       jiraTaskURL,
			"githubIssueNumber": issueNumber,
			"created":           created,
		},
	}
	Hub.broadcast <- message
}

// BroadcastBugFixJiraSyncFailed broadcasts when Jira sync fails
func BroadcastBugFixJiraSyncFailed(workflowID string, issueNumber int, errorMsg string) {
	message := &SessionMessage{
		SessionID: workflowID,
		Type:      EventBugFixJiraSyncFailed,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Payload: map[string]interface{}{
			"workflowId":        workflowID,
			"githubIssueNumber": issueNumber,
			"error":             errorMsg,
		},
	}
	Hub.broadcast <- message
}
