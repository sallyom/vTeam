'use client';

import React, { useState } from 'react';
import { RefreshCw, ExternalLink, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { bugfixApi } from '@/services/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { successToast, errorToast } from '@/hooks/use-toast';

interface JiraSyncButtonProps {
  projectName: string;
  workflowId: string;
  jiraTaskKey?: string;
  jiraTaskURL?: string;
  lastSyncedAt?: string;
  githubIssueNumber: number;
  disabled?: boolean;
  className?: string;
}

export default function JiraSyncButton({
  projectName,
  workflowId,
  jiraTaskKey,
  jiraTaskURL,
  lastSyncedAt,
  githubIssueNumber,
  disabled,
  className,
}: JiraSyncButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const queryClient = useQueryClient();

  const syncMutation = useMutation({
    mutationFn: () => bugfixApi.syncBugFixWorkflowToJira(projectName, workflowId),
    onSuccess: (result) => {
      const message = result.created
        ? `Created Jira task ${result.jiraTaskKey}`
        : `Updated Jira task ${result.jiraTaskKey}`;
      successToast(message);

      // Invalidate workflow query to refresh UI
      queryClient.invalidateQueries({ queryKey: ['bugfix-workflow', projectName, workflowId] });
      setConfirmOpen(false);
    },
    onError: (error: Error) => {
      errorToast(error.message || 'Failed to sync with Jira');
    },
  });

  const handleSync = () => {
    if (jiraTaskKey) {
      // Already synced - show confirmation dialog
      setConfirmOpen(true);
    } else {
      // First sync - proceed immediately
      syncMutation.mutate();
    }
  };

  const confirmSync = () => {
    syncMutation.mutate();
  };

  return (
    <>
      <div className={className}>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleSync}
            disabled={disabled || syncMutation.isPending}
            variant={jiraTaskKey ? 'outline' : 'default'}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            {syncMutation.isPending
              ? 'Syncing...'
              : jiraTaskKey
              ? 'Update Jira'
              : 'Sync to Jira'}
          </Button>

          {jiraTaskKey && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {jiraTaskKey}
              </Badge>
              {jiraTaskURL && (
                <a
                  href={jiraTaskURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          )}
        </div>

        {lastSyncedAt && (
          <p className="text-xs text-muted-foreground mt-2">
            Last synced {formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}
          </p>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Jira Task?</DialogTitle>
            <DialogDescription>
              This bug is already synced to Jira task <strong>{jiraTaskKey}</strong>.
            </DialogDescription>
          </DialogHeader>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>What will be updated:</AlertTitle>
            <AlertDescription>
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>Jira task description will be updated with latest bug details</li>
                <li>GitHub Issue link will remain connected</li>
                <li>Any bugfix.md content will be added as a comment</li>
              </ul>
            </AlertDescription>
          </Alert>

          <div className="bg-muted p-4 rounded-md">
            <p className="text-sm font-medium mb-1">Note about Jira Issue Type</p>
            <p className="text-xs text-muted-foreground">
              Currently syncing as "Feature Request" type in Jira. After the upcoming Jira Cloud
              migration, bugs will sync as proper Bug/Task types.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={syncMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmSync}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? 'Updating...' : 'Update Jira Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}