'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Bug, ExternalLink, GitBranch, Clock, Play, Trash2, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import SessionSelector from '@/components/workspaces/bugfix/SessionSelector';
import JiraSyncButton from '@/components/workspaces/bugfix/JiraSyncButton';
import BugTimeline from '@/components/workspaces/bugfix/BugTimeline';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

import { bugfixApi } from '@/services/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { successToast, errorToast } from '@/hooks/use-toast';
import { useBugFixWebSocket } from '@/hooks';

export default function BugFixWorkspaceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectName = params?.name as string;
  const workflowId = params?.id as string;
  const [timelineEvents, setTimelineEvents] = React.useState<any[]>([]);

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
      queryClient.invalidateQueries(['bugfix-sessions', projectName, workflowId]);
    },
    onJiraSyncCompleted: (event) => {
      successToast(`Synced to Jira: ${event.payload.jiraTaskKey}`);
      queryClient.invalidateQueries(['bugfix-workflow', projectName, workflowId]);
    },
    enabled: !!projectName && !!workflowId,
  });

  // Build timeline events from workflow and sessions
  React.useEffect(() => {
    const events: any[] = [];

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
      if (workflow.jiraTaskKey && workflow.lastJiraSyncedAt) {
        events.push({
          id: `jira-synced-${workflow.jiraTaskKey}`,
          type: 'jira_synced',
          title: 'Synced to Jira',
          description: `Jira task ${workflow.jiraTaskKey} created/updated`,
          timestamp: workflow.lastJiraSyncedAt,
          link: workflow.jiraTaskURL ? {
            url: workflow.jiraTaskURL,
            label: 'View in Jira',
          } : undefined,
        });
      }

      // Bugfix markdown created
      if (workflow.bugfixMarkdownCreated) {
        events.push({
          id: `bugfix-md-created-${workflow.id}`,
          type: 'bugfix_md_created',
          title: 'Resolution Plan Created',
          description: 'bugfix.md file created with implementation plan',
          timestamp: workflow.createdAt, // TODO: Add actual timestamp when available
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
      sessions.forEach((session: any) => {
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
          if (['bug-review', 'bug-resolution-plan', 'bug-implement-fix'].includes(session.sessionType)) {
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

  const getSessionTypeLabel = (sessionType: string) => {
    const labels: Record<string, string> = {
      'bug-review': 'Bug Review',
      'bug-resolution-plan': 'Resolution Plan',
      'bug-implement-fix': 'Fix Implementation',
      'generic': 'Generic',
    };
    return labels[sessionType] || sessionType;
  };

  const handleDeleteWorkspace = async () => {
    try {
      await bugfixApi.deleteBugFixWorkflow(projectName, workflowId);
      successToast('Workspace deleted successfully');
      router.push(`/projects/${projectName}/bugfix`);
    } catch (error) {
      errorToast(error instanceof Error ? error.message : 'Failed to delete workspace');
    }
  };

  const getPhaseColor = (phase: string) => {
    switch (phase) {
      case 'Ready':
      case 'Completed':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'Running':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'Initializing':
      case 'Pending':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'Failed':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
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
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Workspace not found</h2>
          <Link href={`/projects/${projectName}/bugfix`}>
            <Button>Back to Workspaces</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <Breadcrumbs
        items={[
          { label: 'Projects', href: '/projects' },
          { label: projectName, href: `/projects/${projectName}` },
          { label: 'BugFix Workspaces', href: `/projects/${projectName}/bugfix` },
          { label: `#${workflow.githubIssueNumber}`, href: `/projects/${projectName}/bugfix/${workflowId}` },
        ]}
      />

      <div className="flex items-center gap-4 mb-6 mt-4">
        <Link href={`/projects/${projectName}/bugfix`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Bug className="h-6 w-6" />
            <h1 className="text-2xl font-bold">{workflow.title}</h1>
          </div>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <a
              href={workflow.githubIssueURL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-primary"
            >
              GitHub Issue #{workflow.githubIssueNumber}
              <ExternalLink className="h-3 w-3" />
            </a>
            <div className="flex items-center gap-1">
              <GitBranch className="h-3 w-3" />
              <span className="font-mono text-xs">{workflow.branchName}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {workflow.createdAt && formatDistanceToNow(new Date(workflow.createdAt), { addSuffix: true })}
            </div>
          </div>
        </div>
        <Badge variant="outline" className={getPhaseColor(workflow.phase)}>
          {workflow.phase}
        </Badge>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sessions">Sessions ({sessions?.length || 0})</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
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
                    <div className="text-sm font-medium text-muted-foreground">Bug Folder</div>
                    <div className="flex items-center gap-2 mt-1">
                      {workflow.bugFolderCreated ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          <span className="text-sm">Created</span>
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">Not created</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Jira Task</div>
                    <div className="mt-1">
                      {workflow.jiraTaskKey ? (
                        <div className="flex items-center gap-2">
                          <a
                            href={workflow.jiraTaskURL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-mono text-primary hover:underline flex items-center gap-1"
                          >
                            {workflow.jiraTaskKey}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          {workflow.lastJiraSyncedAt && (
                            <span className="text-xs text-muted-foreground">
                              (synced {formatDistanceToNow(new Date(workflow.lastJiraSyncedAt), { addSuffix: true })})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">Not synced</span>
                      )}
                    </div>
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
                <CardTitle>Repositories</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {workflow.umbrellaRepo && (
                    <div>
                      <div className="text-sm font-medium mb-1">Spec Repository</div>
                      <a
                        href={workflow.umbrellaRepo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-1"
                      >
                        {workflow.umbrellaRepo.url}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                  {workflow.supportingRepos && workflow.supportingRepos.length > 0 && (
                    <div>
                      <div className="text-sm font-medium mb-1">Implementation Repositories</div>
                      <div className="space-y-1">
                        {workflow.supportingRepos.map((repo, idx) => (
                          <a
                            key={idx}
                            href={repo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline flex items-center gap-1"
                          >
                            {repo.url}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ))}
                      </div>
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
          <Card>
            <CardHeader>
              <CardTitle>Sessions</CardTitle>
              <CardDescription>
                Agentic sessions for this bug fix workspace
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sessionsLoading && <Skeleton className="h-32 w-full" />}
              {!sessionsLoading && sessions && sessions.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No sessions created yet
                </div>
              )}
              {!sessionsLoading && sessions && sessions.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((session) => (
                      <TableRow
                        key={session.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => router.push(`/projects/${projectName}/sessions/${session.id}`)}
                      >
                        <TableCell className="font-medium">{session.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{session.sessionType}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getPhaseColor(session.phase)}>
                            {session.phase}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions">
          <Card>
            <CardHeader>
              <CardTitle>Workspace Actions</CardTitle>
              <CardDescription>
                Manage this bug fix workspace
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">Create Session</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Start a new agentic session for this bug fix
                </p>
                <SessionSelector
                  projectName={projectName}
                  workflowId={workflowId}
                  githubIssueNumber={workflow.githubIssueNumber}
                  disabled={workflow.phase !== 'Ready'}
                />
                {workflow.phase !== 'Ready' && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Workspace must be in "Ready" state to create sessions
                  </p>
                )}
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-medium mb-2">Jira Synchronization</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Sync this bug to Jira for project management visibility
                </p>
                <JiraSyncButton
                  projectName={projectName}
                  workflowId={workflowId}
                  jiraTaskKey={workflow.jiraTaskKey}
                  jiraTaskURL={workflow.jiraTaskURL}
                  lastSyncedAt={workflow.lastJiraSyncedAt}
                  githubIssueNumber={workflow.githubIssueNumber}
                />
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-medium mb-2 text-destructive">Danger Zone</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Delete this workspace (does not delete GitHub Issue or branch)
                </p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Workspace
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Workspace?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will delete the BugFix workspace. The GitHub Issue and git branch will not be deleted.
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteWorkspace}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
