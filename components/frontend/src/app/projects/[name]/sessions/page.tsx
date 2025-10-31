'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Plus, RefreshCw, MoreVertical, Square, Trash2, ArrowRight, Brain } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ProjectSubpageHeader } from '@/components/project-subpage-header';
import { EmptyState } from '@/components/empty-state';
import { ErrorMessage } from '@/components/error-message';
import { SessionPhaseBadge } from '@/components/status-badge';
import { Breadcrumbs } from '@/components/breadcrumbs';

import { useSessions, useStopSession, useDeleteSession, useContinueSession } from '@/services/queries';
import { successToast, errorToast } from '@/hooks/use-toast';

export default function ProjectSessionsListPage() {
  const params = useParams();
  const projectName = params?.name as string;

  // React Query hooks replace all manual state management
  const { data: sessions = [], isLoading, error, refetch } = useSessions(projectName);
  const stopSessionMutation = useStopSession();
  const deleteSessionMutation = useDeleteSession();
  const continueSessionMutation = useContinueSession();

  const handleStop = async (sessionName: string) => {
    stopSessionMutation.mutate(
      { projectName, sessionName },
      {
        onSuccess: () => {
          successToast(`Session "${sessionName}" stopped successfully`);
        },
        onError: (error) => {
          errorToast(error instanceof Error ? error.message : 'Failed to stop session');
        },
      }
    );
  };


  const handleDelete = async (sessionName: string) => {
    if (!confirm(`Delete agentic session "${sessionName}"? This action cannot be undone.`)) return;
    deleteSessionMutation.mutate(
      { projectName, sessionName },
      {
        onSuccess: () => {
          successToast(`Session "${sessionName}" deleted successfully`);
        },
        onError: (error) => {
          errorToast(error instanceof Error ? error.message : 'Failed to delete session');
        },
      }
    );
  };

  const handleContinue = async (sessionName: string) => {
    continueSessionMutation.mutate(
      { projectName, parentSessionName: sessionName },
      {
        onSuccess: () => {
          successToast(`Session "${sessionName}" restarted successfully`);
        },
        onError: (error) => {
          errorToast(error instanceof Error ? error.message : 'Failed to restart session');
        },
      }
    );
  };

  // Loading state
  if (!projectName || (isLoading && sessions.length === 0)) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="animate-spin h-8 w-8" />
          <span className="ml-2">Loading sessions...</span>
        </div>
      </div>
    );
  }

  // Sort sessions by creation time (newest first)
  const sortedSessions = [...sessions].sort((a, b) => {
    const aTime = a?.metadata?.creationTimestamp ? new Date(a.metadata.creationTimestamp).getTime() : 0;
    const bTime = b?.metadata?.creationTimestamp ? new Date(b.metadata.creationTimestamp).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: 'Projects', href: '/projects' },
          { label: projectName, href: `/projects/${projectName}` },
          { label: 'Sessions' },
        ]}
        className="mb-4"
      />
      <ProjectSubpageHeader
        title={<>Agentic Sessions</>}
        description={<>Sessions scoped to this project</>}
        actions={
          <>
            <Link href={`/projects/${encodeURIComponent(projectName)}/sessions/new`}>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Session
              </Button>
            </Link>
            <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </>
        }
      />

      {/* Error state */}
      {error && <ErrorMessage error={error} onRetry={() => refetch()} />}

      <Card>
        <CardHeader>
          <CardTitle>Agentic Sessions ({sessions?.length || 0})</CardTitle>
          <CardDescription>Sessions scoped to this project</CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <EmptyState
              icon={Brain}
              title="No sessions found"
              description="Create your first agentic session"
              action={{
                label: 'Create Session',
                onClick: () => (window.location.href = `/projects/${encodeURIComponent(projectName)}/sessions/new`),
              }}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead className="hidden md:table-cell">Model</TableHead>
                    <TableHead className="hidden lg:table-cell">Created</TableHead>
                    <TableHead className="hidden xl:table-cell">Cost</TableHead>
                    <TableHead className="w-[50px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSessions.map((session) => {
                    const sessionName = session.metadata.name;
                    const phase = session.status?.phase || 'Pending';
                    const isActionPending =
                      (stopSessionMutation.isPending && stopSessionMutation.variables?.sessionName === sessionName) ||
                      (deleteSessionMutation.isPending && deleteSessionMutation.variables?.sessionName === sessionName);

                    return (
                      <TableRow key={session.metadata?.uid || session.metadata?.name}>
                        <TableCell className="font-medium min-w-[180px]">
                          <Link
                            href={`/projects/${projectName}/sessions/${session.metadata.name}`}
                            className="text-blue-600 hover:underline hover:text-blue-800 transition-colors block"
                          >
                            <div>
                              <div className="font-medium">{session.spec.displayName || session.metadata.name}</div>
                              {session.spec.displayName && (
                                <div className="text-xs text-gray-500 font-normal">{session.metadata.name}</div>
                              )}
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <SessionPhaseBadge phase={phase} />
                        </TableCell>
                        <TableCell>
                          <span className="text-xs px-2 py-1 rounded border bg-gray-50">
                            {session.spec?.interactive ? 'Interactive' : 'Headless'}
                          </span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-sm text-gray-600 truncate max-w-[120px] block">
                            {session.spec.llmSettings.model}
                          </span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {session.metadata?.creationTimestamp &&
                            formatDistanceToNow(new Date(session.metadata.creationTimestamp), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          {session.status?.total_cost_usd ? (
                            <span className="text-sm font-mono">${session.status.total_cost_usd.toFixed(4)}</span>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isActionPending ? (
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled>
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            </Button>
                          ) : (
                            <SessionActions
                              sessionName={sessionName}
                              phase={phase}
                              interactive={session.spec?.interactive || false}
                              onStop={handleStop}
                              onContinue={handleContinue}
                              onDelete={handleDelete}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Session actions component extracted for clarity
type SessionActionsProps = {
  sessionName: string;
  phase: string;
  interactive: boolean;
  onStop: (sessionName: string) => void;
  onContinue: (sessionName: string) => void;
  onDelete: (sessionName: string) => void;
};

function SessionActions({ sessionName, phase, interactive, onStop, onContinue, onDelete }: SessionActionsProps) {
  type RowAction = {
    key: string;
    label: string;
    onClick: () => void;
    icon: React.ReactNode;
    className?: string;
  };

  const actions: RowAction[] = [];

  if (phase === 'Pending' || phase === 'Creating' || phase === 'Running') {
    actions.push({
      key: 'stop',
      label: 'Stop',
      onClick: () => onStop(sessionName),
      icon: <Square className="h-4 w-4" />,
      className: 'text-orange-600',
    });
  }

  // Only allow continue for interactive sessions
  if ((phase === 'Completed' || phase === 'Failed' || phase === 'Stopped' || phase === 'Error') && interactive) {
    actions.push({
      key: 'continue',
      label: 'Continue',
      onClick: () => onContinue(sessionName),
      icon: <ArrowRight className="h-4 w-4" />,
      className: 'text-green-600',
    });
  }

  // Delete is always available except when Creating
  if (phase !== 'Creating') {
    actions.push({
      key: 'delete',
      label: 'Delete',
      onClick: () => onDelete(sessionName),
      icon: <Trash2 className="h-4 w-4" />,
      className: 'text-red-600',
    });
  }

  // Single action: show as button
  if (actions.length === 1) {
    const action = actions[0];
    return (
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={action.onClick}>
        {action.icon}
      </Button>
    );
  }

  // No actions: show disabled button
  if (actions.length === 0) {
    return (
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled>
        <MoreVertical className="h-4 w-4" />
      </Button>
    );
  }

  // Multiple actions: show dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <DropdownMenuItem key={action.key} onClick={action.onClick} className={action.className}>
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
