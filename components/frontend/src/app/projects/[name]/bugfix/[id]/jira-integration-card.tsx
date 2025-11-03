'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { bugfixApi } from '@/services/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { successToast, errorToast } from '@/hooks/use-toast';

type JiraIntegrationCardProps = {
  projectName: string;
  workflowId: string;
  githubIssueNumber: number;
  jiraTaskKey?: string;
  jiraTaskURL?: string;
  lastSyncedAt?: string;
};

export function JiraIntegrationCard({
  projectName,
  workflowId,
  githubIssueNumber, // eslint-disable-line @typescript-eslint/no-unused-vars
  jiraTaskKey,
  jiraTaskURL,
  lastSyncedAt,
}: JiraIntegrationCardProps) {
  const queryClient = useQueryClient();

  const syncMutation = useMutation({
    mutationFn: () => bugfixApi.syncBugFixToJira(projectName, workflowId),
    onSuccess: (result) => {
      const message = result.created
        ? `Created Jira task ${result.jiraTaskKey}`
        : `Updated Jira task ${result.jiraTaskKey}`;
      successToast(message);

      // Invalidate workflow query to refresh UI
      queryClient.invalidateQueries({ queryKey: ['bugfix-workflow', projectName, workflowId] });
    },
    onError: (error: Error) => {
      errorToast(error.message || 'Failed to sync with Jira');
    },
  });

  const handleSync = () => {
    syncMutation.mutate();
  };

  const isSynced = Boolean(jiraTaskKey && jiraTaskURL);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Jira Integration</CardTitle>
        <CardDescription>Sync this bug fix workspace to Jira for project management tracking</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Status Section */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Status</div>
            {isSynced ? (
              <>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{jiraTaskKey}</Badge>
                  <Button
                    variant="link"
                    size="sm"
                    className="px-0 h-auto"
                    onClick={() => jiraTaskURL && window.open(jiraTaskURL, '_blank')}
                  >
                    Open in Jira
                  </Button>
                </div>
                {lastSyncedAt && (
                  <div className="text-xs text-muted-foreground">
                    Last synced {formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}
                  </div>
                )}
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Not synced to Jira yet</span>
            )}
          </div>

          {/* Actions Section */}
          <div className="pt-2 border-t">
            <Button
              onClick={handleSync}
              disabled={syncMutation.isPending}
              variant={isSynced ? 'outline' : 'default'}
              size="default"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
              {syncMutation.isPending
                ? 'Syncing...'
                : isSynced
                ? 'Update Jira'
                : 'Sync to Jira'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
