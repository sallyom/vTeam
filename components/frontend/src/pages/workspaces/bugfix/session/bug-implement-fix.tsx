'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, GitBranch, Code2, FileCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
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

interface ProgressUpdate {
  stage: 'analyzing' | 'implementing' | 'testing' | 'documenting' | 'finalizing';
  message: string;
  percentage: number;
}

export default function BugImplementFixSessionPage() {
  const { projectName, workflowId, sessionId } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [implementationSummary, setImplementationSummary] = useState('');
  const [progress, setProgress] = useState<ProgressUpdate>({
    stage: 'analyzing',
    message: 'Analyzing the bug and resolution plan...',
    percentage: 0,
  });

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

        // Update progress based on message content
        if (event.message) {
          const msg = event.message.toLowerCase();
          if (msg.includes('analyzing') || msg.includes('understanding')) {
            setProgress({ stage: 'analyzing', message: event.message, percentage: 20 });
          } else if (msg.includes('implementing') || msg.includes('writing code')) {
            setProgress({ stage: 'implementing', message: event.message, percentage: 40 });
          } else if (msg.includes('test') || msg.includes('testing')) {
            setProgress({ stage: 'testing', message: event.message, percentage: 60 });
          } else if (msg.includes('document') || msg.includes('updating docs')) {
            setProgress({ stage: 'documenting', message: event.message, percentage: 80 });
          } else if (msg.includes('finaliz') || msg.includes('complet')) {
            setProgress({ stage: 'finalizing', message: event.message, percentage: 90 });
          }
        }

        refetchSession();
      }
    };

    const handleSessionCompleted = (event: any) => {
      if (event.sessionID === sessionId && event.sessionType === 'bug-implement-fix') {
        setProgress({ stage: 'finalizing', message: 'Implementation complete!', percentage: 100 });
        toast({
          title: 'Implementation Complete',
          description: 'The bug fix has been implemented, tested, and documented.',
        });
        setImplementationSummary(event.output || '');
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
        setImplementationSummary(session.status.output);
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
          <h1 className="text-3xl font-bold">Bug Implementation Session</h1>
          <p className="text-muted-foreground mt-2">
            Implementing the fix for Bug #{workflow.githubIssueNumber}
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
            <CardTitle>Implementation Context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Target Branch</p>
              <div className="flex items-center gap-1 mt-1">
                <GitBranch className="h-3 w-3" />
                <code className="text-sm">{workflow.branchName}</code>
              </div>
            </div>

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

            {workflow.bugfixMarkdownCreated && (
              <div>
                <p className="text-sm text-muted-foreground">Documentation</p>
                <div className="flex items-center gap-1 mt-1">
                  <FileCheck className="h-3 w-3" />
                  <span className="text-sm">bugfix.md exists</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {isRunning && (
        <Card>
          <CardHeader>
            <CardTitle>Implementation Progress</CardTitle>
            <CardDescription>
              Tracking the progress of the bug fix implementation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={progress.percentage} className="w-full" />

            <div className="grid grid-cols-5 gap-2 text-center">
              <div className={progress.stage === 'analyzing' ? 'font-bold' : 'text-muted-foreground'}>
                <Code2 className="h-4 w-4 mx-auto mb-1" />
                <p className="text-xs">Analyzing</p>
              </div>
              <div className={progress.stage === 'implementing' ? 'font-bold' : 'text-muted-foreground'}>
                <Code2 className="h-4 w-4 mx-auto mb-1" />
                <p className="text-xs">Implementing</p>
              </div>
              <div className={progress.stage === 'testing' ? 'font-bold' : 'text-muted-foreground'}>
                <FileCheck className="h-4 w-4 mx-auto mb-1" />
                <p className="text-xs">Testing</p>
              </div>
              <div className={progress.stage === 'documenting' ? 'font-bold' : 'text-muted-foreground'}>
                <FileCheck className="h-4 w-4 mx-auto mb-1" />
                <p className="text-xs">Documenting</p>
              </div>
              <div className={progress.stage === 'finalizing' ? 'font-bold' : 'text-muted-foreground'}>
                <CheckCircle2 className="h-4 w-4 mx-auto mb-1" />
                <p className="text-xs">Finalizing</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground text-center">{progress.message}</p>
          </CardContent>
        </Card>
      )}

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
          <CardTitle>Implementation Summary</CardTitle>
          <CardDescription>
            Summary of the implementation, tests, and documentation updates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="summary">
            <TabsList>
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="raw">Raw Output</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="space-y-4">
              {implementationSummary ? (
                <div className="prose prose-sm max-w-none">
                  <div className="bg-muted p-4 rounded-lg">
                    <pre className="whitespace-pre-wrap">{implementationSummary}</pre>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  {isRunning ? (
                    <div className="space-y-4">
                      <Code2 className="h-8 w-8 animate-pulse mx-auto" />
                      <p>Implementing the bug fix...</p>
                      <p className="text-sm">
                        The AI is implementing the fix, writing tests, and updating documentation.
                      </p>
                    </div>
                  ) : (
                    <p>No implementation summary available yet.</p>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="raw">
              <Textarea
                value={implementationSummary || ''}
                readOnly
                className="font-mono text-sm min-h-[400px]"
                placeholder="Raw output will appear here..."
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {isCompleted && implementationSummary && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Implementation Complete</AlertTitle>
          <AlertDescription>
            The bug fix has been successfully implemented:
            <ul className="list-disc list-inside mt-2 ml-2">
              <li>Code changes committed to branch: <code>{workflow.branchName}</code></li>
              <li>Tests written and passing</li>
              <li>Documentation updated as needed</li>
              <li>bugfix.md updated with implementation details</li>
              <li>Summary posted to GitHub Issue #{workflow.githubIssueNumber}</li>
            </ul>
            <div className="mt-4">
              <p className="font-medium">Next steps:</p>
              <ul className="list-disc list-inside mt-1 ml-2">
                <li>Review the changes in the feature branch</li>
                <li>Create a pull request when ready</li>
                <li>Run additional testing if needed</li>
              </ul>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}