'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, FileCode2, GitBranch, AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { bugfixApi } from '@/services/api';
import { WebSocketService } from '@/services/websocket';

interface SessionStatus {
  phase: string;
  message: string;
  startTime: string;
  completionTime?: string;
  output?: string;
  error?: string;
}

export default function BugResolutionPlanSessionPage() {
  const { projectName, workflowId, sessionId } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [resolutionPlan, setResolutionPlan] = useState('');

  // Fetch workflow details
  const { data: workflow, isLoading: workflowLoading } = useQuery({
    queryKey: ['bugfix-workflow', projectName, workflowId],
    queryFn: () => bugfixApi.getBugFixWorkflow(projectName as string, workflowId as string),
  });

  // Fetch session details
  const { data: session, isLoading: sessionLoading, refetch: refetchSession } = useQuery({
    queryKey: ['bugfix-session', projectName, sessionId],
    queryFn: () => bugfixApi.getAgenticSession(projectName as string, sessionId as string),
  });

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!projectName || !sessionId) return;

    const ws = new WebSocketService();
    ws.connect(projectName as string);

    const handleSessionUpdate = (event: any) => {
      if (event.sessionID === sessionId) {
        setSessionStatus({
          phase: event.phase,
          message: event.message || '',
          startTime: event.timestamp,
          output: event.output,
          error: event.error,
        });
        refetchSession();
      }
    };

    const handleSessionCompleted = (event: any) => {
      if (event.sessionID === sessionId && event.sessionType === 'bug-resolution-plan') {
        toast({
          title: 'Resolution Plan Generated',
          description: 'The bug resolution plan has been generated and posted to the GitHub Issue.',
        });
        setResolutionPlan(event.output || '');
        refetchSession();
      }
    };

    ws.on('bugfix-session-status', handleSessionUpdate);
    ws.on('bugfix-session-completed', handleSessionCompleted);

    return () => {
      ws.off('bugfix-session-status', handleSessionUpdate);
      ws.off('bugfix-session-completed', handleSessionCompleted);
      ws.disconnect();
    };
  }, [projectName, sessionId, toast, refetchSession]);

  // Update session status from query data
  useEffect(() => {
    if (session) {
      setSessionStatus({
        phase: session.status?.phase || 'Unknown',
        message: session.status?.message || '',
        startTime: session.metadata?.creationTimestamp || '',
        completionTime: session.status?.completionTime,
        output: session.status?.output,
        error: session.status?.error,
      });
      if (session.status?.output) {
        setResolutionPlan(session.status.output);
      }
    }
  }, [session]);

  const isLoading = workflowLoading || sessionLoading;
  const isRunning = sessionStatus?.phase === 'Running';
  const isCompleted = sessionStatus?.phase === 'Completed';
  const isFailed = sessionStatus?.phase === 'Failed';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!workflow || !session) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Not Found</AlertTitle>
        <AlertDescription>
          The requested session or workflow could not be found.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Bug Resolution Plan Session</h1>
          <p className="text-muted-foreground mt-2">
            Generating a resolution plan for Bug #{workflow.githubIssueNumber}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push(`/projects/${projectName}/workspaces/bugfix/${workflowId}`)}
        >
          Back to Workspace
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Session Status
              {isRunning && <Badge variant="secondary">Running</Badge>}
              {isCompleted && <Badge variant="default">Completed</Badge>}
              {isFailed && <Badge variant="destructive">Failed</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Session ID</p>
              <p className="font-mono text-sm">{sessionId}</p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Phase</p>
              <div className="flex items-center gap-2 mt-1">
                {isRunning && <Loader2 className="h-4 w-4 animate-spin" />}
                {isCompleted && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                {isFailed && <AlertCircle className="h-4 w-4 text-red-600" />}
                <span>{sessionStatus?.phase}</span>
              </div>
            </div>

            {sessionStatus?.message && (
              <div>
                <p className="text-sm text-muted-foreground">Status Message</p>
                <p className="text-sm mt-1">{sessionStatus.message}</p>
              </div>
            )}

            {sessionStatus?.startTime && (
              <div>
                <p className="text-sm text-muted-foreground">Started</p>
                <p className="text-sm">
                  {formatDistanceToNow(new Date(sessionStatus.startTime), { addSuffix: true })}
                </p>
              </div>
            )}

            {sessionStatus?.completionTime && (
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-sm">
                  {formatDistanceToNow(new Date(sessionStatus.completionTime), { addSuffix: true })}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bug Context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">GitHub Issue</p>
              <a
                href={workflow.githubIssueURL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                #{workflow.githubIssueNumber} - {workflow.title}
              </a>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Branch</p>
              <div className="flex items-center gap-1 mt-1">
                <GitBranch className="h-3 w-3" />
                <code className="text-sm">{workflow.branchName}</code>
              </div>
            </div>

            {workflow.bugFolderCreated && (
              <div>
                <p className="text-sm text-muted-foreground">Bug Folder</p>
                <div className="flex items-center gap-1 mt-1">
                  <FileCode2 className="h-3 w-3" />
                  <code className="text-sm">bug-{workflow.githubIssueNumber}/</code>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {sessionStatus?.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Session Error</AlertTitle>
          <AlertDescription className="font-mono text-sm">
            {sessionStatus.error}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Resolution Plan Output</CardTitle>
          <CardDescription>
            The AI-generated resolution plan for fixing this bug
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="output">
            <TabsList>
              <TabsTrigger value="output">Generated Plan</TabsTrigger>
              <TabsTrigger value="raw">Raw Output</TabsTrigger>
            </TabsList>

            <TabsContent value="output" className="space-y-4">
              {resolutionPlan ? (
                <div className="prose prose-sm max-w-none">
                  <div className="bg-muted p-4 rounded-lg">
                    <pre className="whitespace-pre-wrap">{resolutionPlan}</pre>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  {isRunning ? (
                    <div className="space-y-4">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                      <p>Generating resolution plan...</p>
                      <p className="text-sm">
                        The AI is analyzing the bug and creating a detailed plan for resolution.
                      </p>
                    </div>
                  ) : (
                    <p>No resolution plan generated yet.</p>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="raw">
              <Textarea
                value={resolutionPlan || ''}
                readOnly
                className="font-mono text-sm min-h-[400px]"
                placeholder="Raw output will appear here..."
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {isCompleted && resolutionPlan && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Resolution Plan Complete</AlertTitle>
          <AlertDescription>
            The resolution plan has been:
            <ul className="list-disc list-inside mt-2 ml-2">
              <li>Posted as a comment on GitHub Issue #{workflow.githubIssueNumber}</li>
              <li>Saved to the bugfix.md file in the spec repository</li>
              {workflow.jiraTaskKey && (
                <li>Will be synchronized with Jira task {workflow.jiraTaskKey} on next sync</li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}