/**
 * BugFix Workspace WebSocket hook
 * Listens to real-time events for BugFix workflows
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export type BugFixEventType =
  | 'bugfix-workspace-created'
  | 'bugfix-session-started'
  | 'bugfix-session-progress'
  | 'bugfix-session-completed'
  | 'bugfix-session-failed'
  | 'bugfix-jira-sync-started'
  | 'bugfix-jira-sync-completed'
  | 'bugfix-jira-sync-failed';

export interface BugFixEvent {
  type: BugFixEventType;
  timestamp: string;
  payload: {
    workflowId: string;
    sessionId?: string;
    sessionType?: string;
    githubIssueNumber?: number;
    githubIssueURL?: string;
    jiraTaskKey?: string;
    jiraTaskURL?: string;
    phase?: string;
    message?: string;
    progress?: number;
    error?: string;
    created?: boolean;
  };
}

export interface UseBugFixWebSocketOptions {
  projectName: string;
  workflowId: string;
  onWorkspaceCreated?: (event: BugFixEvent) => void;
  onSessionStarted?: (event: BugFixEvent) => void;
  onSessionProgress?: (event: BugFixEvent) => void;
  onSessionCompleted?: (event: BugFixEvent) => void;
  onSessionFailed?: (event: BugFixEvent) => void;
  onJiraSyncStarted?: (event: BugFixEvent) => void;
  onJiraSyncCompleted?: (event: BugFixEvent) => void;
  onJiraSyncFailed?: (event: BugFixEvent) => void;
  enabled?: boolean;
}

/**
 * Hook to listen to BugFix Workspace WebSocket events
 *
 * @example
 * ```tsx
 * const { isConnected } = useBugFixWebSocket({
 *   projectName: 'my-project',
 *   workflowId: 'bugfix-123',
 *   onSessionProgress: (event) => {
 *     console.log('Progress:', event.payload.message);
 *   },
 *   onJiraSyncCompleted: (event) => {
 *     toast.success(`Synced to ${event.payload.jiraTaskKey}`);
 *   }
 * });
 * ```
 */
export function useBugFixWebSocket(options: UseBugFixWebSocketOptions) {
  const {
    projectName,
    workflowId,
    onWorkspaceCreated,
    onSessionStarted,
    onSessionProgress,
    onSessionCompleted,
    onSessionFailed,
    onJiraSyncStarted,
    onJiraSyncCompleted,
    onJiraSyncFailed,
    enabled = true,
  } = options;

  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  const handleEvent = useCallback(
    (event: BugFixEvent) => {
      // Call appropriate callback based on event type
      switch (event.type) {
        case 'bugfix-workspace-created':
          onWorkspaceCreated?.(event);
          // Invalidate workflow list query
          queryClient.invalidateQueries({
            queryKey: ['bugfix-workflows', projectName],
          });
          break;

        case 'bugfix-session-started':
          onSessionStarted?.(event);
          // Invalidate sessions list
          queryClient.invalidateQueries({
            queryKey: ['bugfix-sessions', projectName, workflowId],
          });
          break;

        case 'bugfix-session-progress':
          onSessionProgress?.(event);
          break;

        case 'bugfix-session-completed':
          onSessionCompleted?.(event);
          queryClient.invalidateQueries({
            queryKey: ['bugfix-sessions', projectName, workflowId],
          });
          break;

        case 'bugfix-session-failed':
          onSessionFailed?.(event);
          queryClient.invalidateQueries({
            queryKey: ['bugfix-sessions', projectName, workflowId],
          });
          break;

        case 'bugfix-jira-sync-started':
          onJiraSyncStarted?.(event);
          break;

        case 'bugfix-jira-sync-completed':
          onJiraSyncCompleted?.(event);
          // Invalidate workflow status
          queryClient.invalidateQueries({
            queryKey: ['bugfix-workflow-status', projectName, workflowId],
          });
          queryClient.invalidateQueries({
            queryKey: ['bugfix-workflow', projectName, workflowId],
          });
          break;

        case 'bugfix-jira-sync-failed':
          onJiraSyncFailed?.(event);
          break;
      }
    },
    [
      projectName,
      workflowId,
      onWorkspaceCreated,
      onSessionStarted,
      onSessionProgress,
      onSessionCompleted,
      onSessionFailed,
      onJiraSyncStarted,
      onJiraSyncCompleted,
      onJiraSyncFailed,
      queryClient,
    ]
  );

  const connect = useCallback(() => {
    if (!enabled || !projectName || !workflowId) return;

    try {
      // Build WebSocket URL (using workflow ID as session ID for routing)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/api/projects/${projectName}/sessions/${workflowId}/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (messageEvent) => {
        try {
          const data = JSON.parse(messageEvent.data);
          // Filter for BugFix events only
          if (data.type && data.type.startsWith('bugfix-')) {
            handleEvent(data as BugFixEvent);
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError(new Error('WebSocket connection error'));
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;

        // Attempt reconnection with exponential backoff
        if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current += 1;

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to connect'));
    }
  }, [enabled, projectName, workflowId, handleEvent]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (enabled && projectName && workflowId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, projectName, workflowId, connect, disconnect]);

  return {
    isConnected,
    error,
    reconnect: connect,
    disconnect,
  };
}

/**
 * Simplified hook for listening to specific BugFix event types
 *
 * @example
 * ```tsx
 * useBugFixEvent('my-project', 'bugfix-123', 'bugfix-session-completed', (event) => {
 *   toast.success('Session completed!');
 * });
 * ```
 */
export function useBugFixEvent(
  projectName: string,
  workflowId: string,
  eventType: BugFixEventType,
  handler: (event: BugFixEvent) => void,
  enabled = true
) {
  const handlers = {
    'bugfix-workspace-created': eventType === 'bugfix-workspace-created' ? handler : undefined,
    'bugfix-session-started': eventType === 'bugfix-session-started' ? handler : undefined,
    'bugfix-session-progress': eventType === 'bugfix-session-progress' ? handler : undefined,
    'bugfix-session-completed': eventType === 'bugfix-session-completed' ? handler : undefined,
    'bugfix-session-failed': eventType === 'bugfix-session-failed' ? handler : undefined,
    'bugfix-jira-sync-started': eventType === 'bugfix-jira-sync-started' ? handler : undefined,
    'bugfix-jira-sync-completed': eventType === 'bugfix-jira-sync-completed' ? handler : undefined,
    'bugfix-jira-sync-failed': eventType === 'bugfix-jira-sync-failed' ? handler : undefined,
  };

  return useBugFixWebSocket({
    projectName,
    workflowId,
    enabled,
    onWorkspaceCreated: handlers['bugfix-workspace-created'],
    onSessionStarted: handlers['bugfix-session-started'],
    onSessionProgress: handlers['bugfix-session-progress'],
    onSessionCompleted: handlers['bugfix-session-completed'],
    onSessionFailed: handlers['bugfix-session-failed'],
    onJiraSyncStarted: handlers['bugfix-jira-sync-started'],
    onJiraSyncCompleted: handlers['bugfix-jira-sync-completed'],
    onJiraSyncFailed: handlers['bugfix-jira-sync-failed'],
  });
}
