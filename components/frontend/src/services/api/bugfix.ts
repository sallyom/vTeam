/**
 * BugFix Workspace API service
 * Handles all BugFix workflow-related API calls
 */

import { apiClient } from './client';

/**
 * BugFix Workspace types
 */
export interface BugFixWorkflow {
  id: string;
  githubIssueNumber: number;
  githubIssueURL: string;
  title: string;
  description?: string;
  branchName: string;
  phase: 'Initializing' | 'Ready';
  message?: string;
  implementationCompleted?: boolean;
  project: string;
  createdAt: string;
  createdBy: string;
  jiraTaskKey?: string;
  jiraTaskURL?: string;
  lastSyncedAt?: string;
  workspacePath?: string;
  implementationRepo: {
    url: string;
    branch?: string;
  };
}

export interface TextDescriptionInput {
  title: string;
  symptoms: string;
  reproductionSteps?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  additionalContext?: string;
  targetRepository: string;
}

export interface CreateBugFixWorkflowRequest {
  githubIssueURL?: string;
  textDescription?: TextDescriptionInput;
  implementationRepo: {
    url: string;
    branch?: string;
  };
  branchName?: string;
}

export interface CreateBugFixSessionRequest {
  sessionType: 'bug-review' | 'bug-implement-fix';
  title?: string;
  prompt?: string;
  description?: string;
  selectedAgents?: string[];
  interactive?: boolean;
  autoPushOnComplete?: boolean;
  autoCreatePR?: boolean;
  environmentVariables?: Record<string, string>;
  resourceOverrides?: {
    cpu?: string;
    memory?: string;
    storageClass?: string;
    priorityClass?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
  };
}

export interface BugFixWorkflowStatus {
  id: string;
  phase: string;
  message: string;
  implementationCompleted: boolean;
  githubIssueNumber: number;
  githubIssueURL: string;
  jiraSynced: boolean;
  jiraTaskKey?: string;
  lastSyncedAt?: string;
}

export interface BugFixSession {
  id: string;
  title: string;
  sessionType: string;
  phase: string;
  createdAt: string;
  completedAt?: string;
}

export interface SyncJiraRequest {
  force?: boolean;
}

export interface SyncJiraResponse {
  success: boolean;
  jiraTaskKey?: string;
  jiraTaskURL?: string;
  created: boolean;
  message?: string;
  lastSyncedAt?: string;
}

/**
 * List BugFix workflows for a project
 */
export async function listBugFixWorkflows(projectName: string): Promise<BugFixWorkflow[]> {
  const response = await apiClient.get<{ workflows: BugFixWorkflow[] }>(
    `/projects/${projectName}/bugfix-workflows`
  );
  return response.workflows || [];
}

/**
 * Get a single BugFix workflow
 */
export async function getBugFixWorkflow(
  projectName: string,
  workflowId: string
): Promise<BugFixWorkflow> {
  return apiClient.get<BugFixWorkflow>(
    `/projects/${projectName}/bugfix-workflows/${workflowId}`
  );
}

/**
 * Create a new BugFix workflow
 */
export async function createBugFixWorkflow(
  projectName: string,
  data: CreateBugFixWorkflowRequest
): Promise<BugFixWorkflow> {
  return apiClient.post<BugFixWorkflow, CreateBugFixWorkflowRequest>(
    `/projects/${projectName}/bugfix-workflows`,
    data
  );
}

/**
 * Delete a BugFix workflow
 */
export async function deleteBugFixWorkflow(
  projectName: string,
  workflowId: string
): Promise<void> {
  await apiClient.delete(`/projects/${projectName}/bugfix-workflows/${workflowId}`);
}

/**
 * Get BugFix workflow status
 */
export async function getBugFixWorkflowStatus(
  projectName: string,
  workflowId: string
): Promise<BugFixWorkflowStatus> {
  return apiClient.get<BugFixWorkflowStatus>(
    `/projects/${projectName}/bugfix-workflows/${workflowId}/status`
  );
}

/**
 * Create a session for a BugFix workflow
 */
export async function createBugFixSession(
  projectName: string,
  workflowId: string,
  data: CreateBugFixSessionRequest
): Promise<BugFixSession> {
  return apiClient.post<BugFixSession, CreateBugFixSessionRequest>(
    `/projects/${projectName}/bugfix-workflows/${workflowId}/sessions`,
    data
  );
}

/**
 * List sessions for a BugFix workflow
 */
export async function listBugFixSessions(
  projectName: string,
  workflowId: string
): Promise<BugFixSession[]> {
  const response = await apiClient.get<{ sessions: BugFixSession[] }>(
    `/projects/${projectName}/bugfix-workflows/${workflowId}/sessions`
  );
  return response.sessions || [];
}

/**
 * Sync BugFix workflow to Jira
 */
export async function syncBugFixToJira(
  projectName: string,
  workflowId: string,
  data?: SyncJiraRequest
): Promise<SyncJiraResponse> {
  return apiClient.post<SyncJiraResponse, SyncJiraRequest>(
    `/projects/${projectName}/bugfix-workflows/${workflowId}/sync-jira`,
    data || {}
  );
}
