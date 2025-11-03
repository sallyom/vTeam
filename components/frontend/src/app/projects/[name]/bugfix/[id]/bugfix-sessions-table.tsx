'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import SessionSelector from '@/components/workspaces/bugfix/SessionSelector';
import { useRouter } from 'next/navigation';

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

type BugFixSessionsTableProps = {
  sessions: BugFixSession[];
  projectName: string;
  workflowId: string;
  workflow: {
    githubIssueNumber: number;
    phase: string;
  };
  sessionsLoading: boolean;
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

const getSessionTypeLabel = (sessionType: string) => {
  const labels: Record<string, string> = {
    'bug-review': 'Bug Review',
    'bug-resolution-plan': 'Resolution Plan',
    'bug-implement-fix': 'Fix Implementation',
    'generic': 'Generic',
  };
  return labels[sessionType] || sessionType;
};

export function BugFixSessionsTable({
  sessions,
  projectName,
  workflowId,
  workflow,
  sessionsLoading,
}: BugFixSessionsTableProps) {
  const router = useRouter();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <CardTitle>Sessions ({sessions?.length || 0})</CardTitle>
            <CardDescription>Agentic sessions for this bug fix workspace</CardDescription>
          </div>
          <SessionSelector
            projectName={projectName}
            workflowId={workflowId}
            githubIssueNumber={workflow.githubIssueNumber}
            disabled={workflow.phase !== 'Ready'}
          />
        </div>
        {workflow.phase !== 'Ready' && (
          <p className="text-xs text-muted-foreground mt-2">
            Workspace must be in &quot;Ready&quot; state to create sessions
          </p>
        )}
      </CardHeader>
      <CardContent>
        {sessionsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sessions && sessions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No sessions created yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Created</TableHead>
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
                      <Badge variant="outline">{getSessionTypeLabel(session.sessionType)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getPhaseColor(session.phase)}>
                        {session.phase}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
