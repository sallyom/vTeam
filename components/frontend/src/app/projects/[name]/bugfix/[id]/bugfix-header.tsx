'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, Trash2, Bug, ExternalLink, GitBranch, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type BugFixWorkflow = {
  id: string;
  title: string;
  description?: string;
  githubIssueNumber: number;
  githubIssueURL: string;
  branchName: string;
  phase: string;
  createdAt?: string;
};

type BugFixHeaderProps = {
  workflow: BugFixWorkflow;
  projectName: string;
  deleting: boolean;
  onDelete: () => Promise<void>;
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

export function BugFixHeader({ workflow, projectName, deleting, onDelete }: BugFixHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/projects/${encodeURIComponent(projectName)}/bugfix`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to BugFix Workspaces
            </Button>
          </Link>
        </div>
        <Button variant="destructive" size="sm" onClick={onDelete} disabled={deleting}>
          {deleting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Deleting…
            </>
          ) : (
            <>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Workspace
            </>
          )}
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Bug className="h-6 w-6" />
            <h1 className="text-3xl font-bold">{workflow.title}</h1>
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
            {workflow.createdAt && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(workflow.createdAt), { addSuffix: true })}
              </div>
            )}
          </div>
        </div>
        <Badge variant="outline" className={getPhaseColor(workflow.phase)}>
          {workflow.phase}
        </Badge>
      </div>
    </div>
  );
}
