'use client';

import React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import BugTimeline from '@/components/workspaces/bugfix/BugTimeline';
import { BugFixHeader } from './bugfix-header';
import { BugFixSessionsTable } from './bugfix-sessions-table';
import { JiraIntegrationCard } from './jira-integration-card';

import { bugfixApi } from '@/services/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { successToast, errorToast } from '@/hooks/use-toast';
import { useBugFixWebSocket } from '@/hooks';

type TimelineEvent = {
  id: string;
  type: 'workspace_created' | 'jira_synced' | 'session_started' | 'session_completed' | 'session_failed' | 'branch_created' | 'bugfix_md_created' | 'github_comment' | 'implementation_completed';
  title: string;
  description?: string;
  timestamp: string;
  sessionType?: string;
  sessionId?: string;
  status?: 'success' | 'error' | 'running';
  link?: {
    url: string;
    label: string;
  };
};

type BugFixSession = {
  id: string;
  title: string;
  sessionType: string;
  phase: string;
  createdAt: string;
  completedAt?: string;
  description?: string;
  error?: string;
};

export default function BugFixWorkspaceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const projectName = params?.name as string;
  const workflowId = params?.id as string;
  const [timelineEvents, setTimelineEvents] = React.useState<TimelineEvent[]>([]);

  // Get active tab from URL, default to 'overview'
  const activeTab = searchParams.get('tab') || 'overview';

  const { data: workflow, isLoading: workflowLoading } = useQuery({
    queryKey: ['bugfix-workflow', projectName, workflowId],
    queryFn: () => bugfixApi.getBugFixWorkflow(projectName, workflowId),
    enabled: !!projectName && !!workflowId,
  });

  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['bugfix-sessions', projectName, workflowId],
    queryFn: () => bugfixApi.listBugFixSessions(projectName, workflowId),
    enabled: !!projectName && !!workflowId,
  });

  // WebSocket for real-time updates
  useBugFixWebSocket({
    projectName,
    workflowId,
    onSessionCompleted: () => {
      successToast('Session completed successfully');
      queryClient.invalidateQueries({ queryKey: ['bugfix-sessions', projectName, workflowId] });
    },
    onJiraSyncCompleted: (event) => {
      successToast(`Synced to Jira: ${event.payload.jiraTaskKey}`);
      queryClient.invalidateQueries({ queryKey: ['bugfix-workflow', projectName, workflowId] });
    },
    enabled: !!projectName && !!workflowId,
  });

  // Build timeline events from workflow and sessions
  React.useEffect(() => {
    const events: TimelineEvent[] = [];

    if (workflow) {
      // Workspace created event
      if (workflow.createdAt) {
        events.push({
          id: `workspace-created-${workflow.id}`,
          type: 'workspace_created',
          title: 'Workspace Created',
          description: `BugFix workspace created from GitHub Issue #${workflow.githubIssueNumber}`,
          timestamp: workflow.createdAt,
        });
      }

      // Branch created event
      if (workflow.branchName && workflow.createdAt) {
        events.push({
          id: `branch-created-${workflow.id}`,
          type: 'branch_created',
          title: 'Feature Branch Created',
          description: `Branch ${workflow.branchName} created`,
          timestamp: workflow.createdAt,
        });
      }

      // Jira synced event
      if (workflow.jiraTaskKey && workflow.lastSyncedAt) {
        events.push({
          id: `jira-synced-${workflow.jiraTaskKey}`,
          type: 'jira_synced',
          title: 'Synced to Jira',
          description: `Jira task ${workflow.jiraTaskKey} created/updated`,
          timestamp: workflow.lastSyncedAt,
          link: workflow.jiraTaskURL ? {
            url: workflow.jiraTaskURL,
            label: 'View in Jira',
          } : undefined,
        });
      }

      // Implementation completed
      if (workflow.implementationCompleted) {
        events.push({
          id: `implementation-completed-${workflow.id}`,
          type: 'implementation_completed',
          title: 'Implementation Completed',
          description: 'Bug fix implementation completed',
          timestamp: workflow.createdAt, // TODO: Add actual timestamp when available
        });
      }
    }

    // Add session events
    if (sessions && sessions.length > 0) {
      sessions.forEach((session: BugFixSession) => {
        // Session started event
        events.push({
          id: `session-started-${session.id}`,
          type: 'session_started',
          title: `${getSessionTypeLabel(session.sessionType)} Session Started`,
          sessionType: session.sessionType,
          sessionId: session.id,
          timestamp: session.createdAt,
          status: session.phase === 'Running' ? 'running' : undefined,
        });

        // Session completed/failed event
        if (session.phase === 'Completed') {
          events.push({
            id: `session-completed-${session.id}`,
            type: 'session_completed',
            title: `${getSessionTypeLabel(session.sessionType)} Session Completed`,
            description: session.description || 'Session completed successfully',
            sessionType: session.sessionType,
            sessionId: session.id,
            timestamp: session.completedAt || session.createdAt,
            status: 'success',
          });

          // GitHub comment event for certain session types
          if (workflow && ['bug-review', 'bug-resolution-plan', 'bug-implement-fix'].includes(session.sessionType)) {
            events.push({
              id: `github-comment-${session.id}`,
              type: 'github_comment',
              title: 'Posted to GitHub',
              description: `${getSessionTypeLabel(session.sessionType)} findings posted to GitHub Issue`,
              timestamp: session.completedAt || session.createdAt,
              link: {
                url: workflow.githubIssueURL,
                label: 'View on GitHub',
              },
            });
          }
        } else if (session.phase === 'Failed') {
          events.push({
            id: `session-failed-${session.id}`,
            type: 'session_failed',
            title: `${getSessionTypeLabel(session.sessionType)} Session Failed`,
            description: session.error || 'Session failed',
            sessionType: session.sessionType,
            sessionId: session.id,
            timestamp: session.completedAt || session.createdAt,
            status: 'error',
          });
        }
      });
    }

    setTimelineEvents(events);
  }, [workflow, sessions]);

  const [deleting, setDeleting] = React.useState(false);

  const getSessionTypeLabel = (sessionType: string) => {
    const labels: Record<string, string> = {
      'bug-review': 'Bug Review',
      'bug-resolution-plan': 'Resolution Plan',
      'bug-implement-fix': 'Fix Implementation',
      'generic': 'Generic',
    };
    return labels[sessionType] || sessionType;
  };

  const handleTabChange = (value: string) => {
    // Update URL with new tab
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set('tab', value);
    router.push(`?${newParams.toString()}`, { scroll: false });
  };

  const handleDeleteWorkspace = async () => {
    if (!confirm('Are you sure you want to delete this BugFix workspace? This action cannot be undone.')) {
      return;
    }
    setDeleting(true);
    try {
      await bugfixApi.deleteBugFixWorkflow(projectName, workflowId);
      successToast('Workspace deleted successfully');
      router.push(`/projects/${projectName}/bugfix`);
    } catch (error) {
      errorToast(error instanceof Error ? error.message : 'Failed to delete workspace');
    } finally {
      setDeleting(false);
    }
  };

  if (workflowLoading) {
    return (
      <div className="container mx-auto py-8">
        <Skeleton className="h-8 w-3/4 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="container mx-auto py-8">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-600">Workspace not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <Breadcrumbs
          items={[
            { label: 'Projects', href: '/projects' },
            { label: projectName, href: `/projects/${projectName}` },
            { label: 'BugFix Workspaces', href: `/projects/${projectName}/bugfix` },
            { label: `#${workflow.githubIssueNumber}` },
          ]}
          className="mb-4"
        />

        <BugFixHeader
          workflow={workflow}
          projectName={projectName}
          deleting={deleting}
          onDelete={handleDeleteWorkspace}
        />

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="sessions">Sessions ({sessions?.length || 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Workspace Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Implementation Status</div>
                      <div className="flex items-center gap-2 mt-1">
                        {workflow.implementationCompleted ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <span className="text-sm">Completed</span>
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">In Progress</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-2">Jira Task</div>
                      {workflow.jiraTaskKey ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{workflow.jiraTaskKey}</Badge>
                            <Button
                              variant="link"
                              size="sm"
                              className="px-0 h-auto"
                              onClick={() => window.open(workflow.jiraTaskURL, '_blank')}
                            >
                              Open in Jira
                            </Button>
                          </div>
                          {workflow.lastSyncedAt && (
                            <span className="text-xs text-muted-foreground">
                              Synced {formatDistanceToNow(new Date(workflow.lastSyncedAt), { addSuffix: true })}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">Not synced yet</span>
                      )}
                    </div>
                  </div>
                  {workflow.description && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-2">Description</div>
                      <div className="text-sm whitespace-pre-wrap bg-muted p-4 rounded-md max-h-96 overflow-y-auto">
                        {workflow.description}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Repository</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {workflow.implementationRepo && (
                      <div>
                        <div className="text-sm font-medium mb-1">Implementation Repository</div>
                        <a
                          href={workflow.implementationRepo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline flex items-center gap-1"
                        >
                          {workflow.implementationRepo.url}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        {workflow.implementationRepo.branch && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Branch: <code className="bg-muted px-1 py-0.5 rounded">{workflow.implementationRepo.branch}</code>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <BugTimeline
                workflowId={workflowId}
                events={timelineEvents}
                sessions={sessions}
                className="mt-4"
              />
            </div>
          </TabsContent>

          <TabsContent value="sessions">
            <div className="space-y-4">
              <BugFixSessionsTable
                sessions={sessions || []}
                projectName={projectName}
                workflowId={workflowId}
                workflow={workflow}
                sessionsLoading={sessionsLoading}
              />
              <JiraIntegrationCard
                projectName={projectName}
                workflowId={workflowId}
                githubIssueNumber={workflow.githubIssueNumber}
                jiraTaskKey={workflow.jiraTaskKey}
                jiraTaskURL={workflow.jiraTaskURL}
                lastSyncedAt={workflow.lastSyncedAt}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
