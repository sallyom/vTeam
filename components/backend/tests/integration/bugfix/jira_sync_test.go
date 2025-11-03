package bugfix_integration_test

import (
	"testing"
)

// T048: Integration test - First Jira sync creates task
func TestFirstJiraSyncCreatesTask(t *testing.T) {
	t.Skip("Integration test - requires backend API server, K8s cluster, GitHub access, and Jira integration")

	// This test validates the first Jira sync flow:
	// 1. Create a BugFix Workspace from GitHub Issue
	// 2. Ensure workflow is in Ready state
	// 3. Call POST /api/projects/:projectName/bugfix-workflows/:id/sync-jira
	// 4. Verify Jira Feature Request is created (NOTE: Using Feature Request for now, will be proper Jira Task type after Jira Cloud migration)
	// 5. Verify Jira task contains:
	//    - Title from GitHub Issue
	//    - Description with GitHub Issue body and link
	//    - Remote link back to GitHub Issue
	// 6. Verify GitHub Issue receives comment with Jira link
	// 7. Verify BugFixWorkflow CR is updated with:
	//    - jiraTaskKey field
	//    - lastJiraSyncedAt timestamp
	// 8. Verify WebSocket event is broadcast

	// TODO: Implement full integration test
	// Example structure:
	/*
		// Setup: Create BugFix Workspace
		testProject := "test-project"
		testIssueURL := "https://github.com/test-org/test-repo/issues/456"

		workflow := createBugFixWorkflow(t, testProject, testIssueURL)
		waitForWorkflowReady(t, testProject, workflow.ID)

		// Connect WebSocket to monitor events
		ws := connectWebSocket(t, testProject)
		defer ws.Close()

		syncStarted := false
		syncCompleted := false
		var jiraTaskKey string

		go func() {
			for {
				var event WebSocketEvent
				ws.ReadJSON(&event)

				switch event.Type {
				case "bugfix-jira-sync-started":
					syncStarted = true
				case "bugfix-jira-sync-completed":
					syncCompleted = true
					jiraTaskKey = event.Payload["jiraTaskKey"].(string)
				}
			}
		}()

		// Perform first sync
		syncResp := apiClient.Post("/api/projects/" + testProject + "/bugfix-workflows/" + workflow.ID + "/sync-jira", nil)
		assert.Equal(t, http.StatusOK, syncResp.StatusCode)

		var syncResult JiraSyncResult
		json.Unmarshal(syncResp.Body, &syncResult)

		// Verify sync created new task
		assert.True(t, syncResult.Created)
		assert.NotEmpty(t, syncResult.JiraTaskKey)
		assert.Contains(t, syncResult.JiraTaskKey, "PROJ-") // Assuming PROJ is the Jira project key
		assert.NotEmpty(t, syncResult.JiraTaskURL)
		assert.Equal(t, workflow.ID, syncResult.WorkflowID)

		// Verify WebSocket events
		assert.Eventually(t, func() bool {
			return syncStarted && syncCompleted
		}, 10*time.Second, 100*time.Millisecond)

		// Verify Jira task created correctly
		// NOTE: Currently creating as Feature Request, will be proper Task type after Jira Cloud migration
		jiraTask := getJiraTask(t, syncResult.JiraTaskKey)
		assert.Contains(t, jiraTask.Summary, "Bug #456") // GitHub issue number
		assert.Contains(t, jiraTask.Description, testIssueURL)
		assert.Contains(t, jiraTask.Description, "GitHub Issue")

		// Verify remote link in Jira
		remoteLinks := getJiraRemoteLinks(t, syncResult.JiraTaskKey)
		foundGitHubLink := false
		for _, link := range remoteLinks {
			if strings.Contains(link.URL, "github.com") && strings.Contains(link.URL, "/issues/456") {
				foundGitHubLink = true
				break
			}
		}
		assert.True(t, foundGitHubLink, "Jira should have remote link to GitHub Issue")

		// Verify GitHub Issue comment
		comments := getGitHubIssueComments(t, testIssueURL)
		foundJiraLink := false
		for _, comment := range comments {
			if strings.Contains(comment.Body, "Jira") && strings.Contains(comment.Body, syncResult.JiraTaskKey) {
				foundJiraLink = true
				break
			}
		}
		assert.True(t, foundJiraLink, "GitHub Issue should have comment with Jira link")

		// Verify workflow updated
		updatedWorkflow := getWorkflow(t, testProject, workflow.ID)
		assert.Equal(t, syncResult.JiraTaskKey, updatedWorkflow.JiraTaskKey)
		assert.NotEmpty(t, updatedWorkflow.LastJiraSyncedAt)
	*/
}

// T049: Integration test - Subsequent Jira syncs update existing task
func TestSubsequentJiraSyncsUpdateExistingTask(t *testing.T) {
	t.Skip("Integration test - requires full environment")

	// This test validates subsequent Jira sync behavior:
	// 1. Create workflow and perform first sync (reuse setup from T048)
	// 2. Modify the workflow (e.g., update description)
	// 3. Call POST /api/projects/:projectName/bugfix-workflows/:id/sync-jira again
	// 4. Verify the SAME Jira task is updated (no duplicate created)
	// 5. Verify Jira task description is updated with new information
	// 6. Verify created=false in response
	// 7. Verify jiraTaskKey remains the same
	// 8. Verify lastJiraSyncedAt is updated to new timestamp

	// TODO: Implement full integration test
	/*
		// Setup: Create workflow and do first sync
		testProject := "test-project"
		workflow, firstSyncResult := createWorkflowAndSync(t, testProject)
		firstJiraKey := firstSyncResult.JiraTaskKey
		firstSyncTime := workflow.LastJiraSyncedAt

		// Wait a moment to ensure timestamps differ
		time.Sleep(2 * time.Second)

		// Update workflow description
		updateReq := UpdateBugFixWorkflowRequest{
			Description: ptr("Updated bug description with more details"),
		}
		updateResp := apiClient.Patch("/api/projects/" + testProject + "/bugfix-workflows/" + workflow.ID, updateReq)
		assert.Equal(t, http.StatusOK, updateResp.StatusCode)

		// Perform second sync
		syncResp2 := apiClient.Post("/api/projects/" + testProject + "/bugfix-workflows/" + workflow.ID + "/sync-jira", nil)
		assert.Equal(t, http.StatusOK, syncResp2.StatusCode)

		var syncResult2 JiraSyncResult
		json.Unmarshal(syncResp2.Body, &syncResult2)

		// Verify update, not create
		assert.False(t, syncResult2.Created, "Should update existing task, not create new")
		assert.Equal(t, firstJiraKey, syncResult2.JiraTaskKey, "Jira key should remain the same")
		assert.Equal(t, firstSyncResult.JiraTaskURL, syncResult2.JiraTaskURL, "URL should remain the same")

		// Verify Jira task was updated
		jiraTask := getJiraTask(t, syncResult2.JiraTaskKey)
		assert.Contains(t, jiraTask.Description, "Updated bug description")

		// Verify workflow timestamps
		updatedWorkflow := getWorkflow(t, testProject, workflow.ID)
		assert.Equal(t, firstJiraKey, updatedWorkflow.JiraTaskKey, "Jira key should not change")
		assert.NotEqual(t, firstSyncTime, updatedWorkflow.LastJiraSyncedAt, "Sync timestamp should be updated")
		assert.True(t, updatedWorkflow.LastJiraSyncedAt.After(firstSyncTime), "New sync time should be later")

		// Test idempotency - sync again without changes
		syncResp3 := apiClient.Post("/api/projects/" + testProject + "/bugfix-workflows/" + workflow.ID + "/sync-jira", nil)
		assert.Equal(t, http.StatusOK, syncResp3.StatusCode)

		var syncResult3 JiraSyncResult
		json.Unmarshal(syncResp3.Body, &syncResult3)
		assert.False(t, syncResult3.Created)
		assert.Equal(t, firstJiraKey, syncResult3.JiraTaskKey)
	*/
}

// TestJiraSyncWithBugfixContent tests syncing bugfix.md content to Jira
func TestJiraSyncWithBugfixContent(t *testing.T) {
	t.Skip("Integration test - requires full environment")

	// This test validates syncing bugfix.md content:
	// 1. Create workflow from GitHub Issue
	// 2. Create and complete a Bug-resolution-plan session (creates bugfix.md)
	// 3. Sync to Jira
	// 4. Verify Jira task includes bugfix.md content
	// 5. Complete Bug-implement-fix session (updates bugfix.md)
	// 6. Sync to Jira again
	// 7. Verify Jira receives updated bugfix.md as comment

	// NOTE: Using Jira Feature Request type for now. After Jira Cloud migration,
	// this will use proper Jira Bug/Task types with appropriate fields
}
