// Jira-Session Artifact Integration Types

/**
 * Represents a link between a session artifact and a Jira issue
 */
export interface JiraLink {
  path: string          // Artifact file path (e.g., "transcript.txt")
  jiraKey: string       // Jira issue key (e.g., "PROJ-123")
  timestamp: string     // ISO 8601 timestamp (e.g., "2025-10-09T10:00:00Z")
  status: 'success' | 'failed'  // Push status
  error?: string        // Error message if status is "failed"
}

/**
 * Represents a file generated during an agentic session
 */
export interface SessionArtifact {
  path: string          // Relative path within stateDir
  size: number          // File size in bytes
  mimeType: string      // MIME type (e.g., "text/plain", "application/json")
  lastModified: string  // ISO 8601 timestamp
}

/**
 * Request to push artifacts to Jira
 */
export interface PushRequest {
  issueKey: string      // Target Jira issue key
  artifacts: string[]   // Array of artifact paths to push
}

/**
 * Response from a push operation
 */
export interface PushResponse {
  success: boolean      // Overall operation success
  jiraKey: string       // Jira issue key
  attachments: string[] // Successfully uploaded artifacts
  commentId?: string    // Jira comment ID if created
  errors?: ArtifactError[] // Per-artifact errors for partial failures
}

/**
 * Error for a specific artifact
 */
export interface ArtifactError {
  path: string          // Artifact path
  error: string         // Error message
}

/**
 * Request to validate a Jira issue
 */
export interface ValidateIssueRequest {
  issueKey: string      // Jira issue key to validate
}

/**
 * Response from issue validation
 */
export interface ValidateIssueResponse {
  valid: boolean        // Whether the issue is accessible
  issue?: JiraIssueMetadata // Issue metadata if valid
  error?: string        // Error message if not valid
}

/**
 * Basic metadata about a Jira issue
 */
export interface JiraIssueMetadata {
  key: string           // Issue key (e.g., "PROJ-123")
  summary: string       // Issue title
  status: string        // Issue status
  project: string       // Project key
}

/**
 * Response containing all Jira links for a session
 */
export interface JiraLinksResponse {
  links: JiraLink[]     // Array of Jira links
}

/**
 * Response containing all artifacts for a session
 */
export interface ArtifactListResponse {
  artifacts: SessionArtifact[] // Array of session artifacts
}

/**
 * Structured error response
 */
export interface ErrorResponse {
  error: string         // Human-readable error message
  code: ErrorCode       // Error code
  details?: string      // Additional error context
  retryable: boolean    // Whether the operation can be retried
}

/**
 * Error codes
 */
export type ErrorCode =
  | 'JIRA_CONFIG_MISSING'
  | 'JIRA_INVALID_ISSUE_KEY'
  | 'JIRA_ISSUE_NOT_FOUND'
  | 'JIRA_AUTH_FAILED'
  | 'JIRA_PERMISSION_DENIED'
  | 'JIRA_NETWORK_ERROR'
  | 'JIRA_RATE_LIMIT'
  | 'ARTIFACT_TOO_LARGE'
  | 'ARTIFACT_NOT_FOUND'
  | 'SESSION_NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'INTERNAL_ERROR';

/**
 * Validation constants
 */
export const MAX_ARTIFACT_SIZE = 10 * 1024 * 1024; // 10MB Jira limit
export const ISSUE_KEY_REGEX = /^[A-Z][A-Z0-9]+-[0-9]+$/;

/**
 * Validates the format of a Jira issue key
 */
export function validateIssueKey(key: string): string | null {
  if (!key.trim()) {
    return "Issue key is required";
  }
  if (!ISSUE_KEY_REGEX.test(key)) {
    return "Invalid format (expected: PROJ-123)";
  }
  return null;
}

/**
 * Validates artifact selection
 */
export function validateArtifactSelection(artifacts: string[]): string | null {
  if (artifacts.length === 0) {
    return "Select at least one artifact";
  }
  return null;
}

/**
 * Formats file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Checks if artifact size exceeds Jira limit
 */
export function isArtifactTooLarge(size: number): boolean {
  return size > MAX_ARTIFACT_SIZE;
}
