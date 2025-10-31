'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Bug, ExternalLink, GitBranch, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/breadcrumbs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { bugfixApi, type BugFixWorkflow } from '@/services/api';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';

export default function BugFixWorkspacesPage() {
  const params = useParams();
  const router = useRouter();
  const projectName = params?.name as string;

  const { data: workspaces, isLoading, error } = useQuery({
    queryKey: ['bugfix-workflows', projectName],
    queryFn: () => bugfixApi.listBugFixWorkflows(projectName),
    enabled: !!projectName,
  });

  const getPhaseColor = (phase: string) => {
    switch (phase) {
      case 'Ready':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'Initializing':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  return (
    <div className="container mx-auto py-8">
      <Breadcrumbs
        items={[
          { label: 'Projects', href: '/projects' },
          { label: projectName, href: `/projects/${projectName}` },
          { label: 'BugFix Workspaces', href: `/projects/${projectName}/bugfix` },
        ]}
      />

      <div className="flex items-center justify-between mb-6 mt-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bug className="h-8 w-8" />
            BugFix Workspaces
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage bug fix workflows and sessions
          </p>
        </div>
        <Link href={`/projects/${projectName}/bugfix/new`}>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Workspace
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workspaces</CardTitle>
          <CardDescription>
            {workspaces?.length || 0} active bug fix workspace{workspaces?.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          )}

          {error && (
            <div className="text-center py-8 text-destructive">
              Failed to load workspaces: {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          )}

          {!isLoading && !error && workspaces && workspaces.length === 0 && (
            <div className="text-center py-12">
              <Bug className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No workspaces yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first BugFix workspace to get started
              </p>
              <Link href={`/projects/${projectName}/bugfix/new`}>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Workspace
                </Button>
              </Link>
            </div>
          )}

          {!isLoading && !error && workspaces && workspaces.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Issue</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Jira</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workspaces.map((workspace) => (
                  <TableRow
                    key={workspace.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/projects/${projectName}/bugfix/${workspace.id}`)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">#{workspace.githubIssueNumber}</span>
                        <a
                          href={workspace.githubIssueURL}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-md truncate">{workspace.title}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <GitBranch className="h-3 w-3" />
                        <span className="font-mono text-xs">{workspace.branchName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getPhaseColor(workspace.phase)}>
                        {workspace.phase}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {workspace.jiraTaskKey ? (
                        <span className="text-sm font-mono text-primary">{workspace.jiraTaskKey}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>
                          {workspace.createdAt
                            ? formatDistanceToNow(new Date(workspace.createdAt), { addSuffix: true })
                            : '-'}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
