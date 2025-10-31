'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Loader2, Terminal, Square, AlertCircle, CheckCircle2, Play } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
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

interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'output' | 'error';
}

export default function GenericSessionPage() {
  const { projectName, workflowId, sessionId } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [sessionOutput, setSessionOutput] = useState('');
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [isSessionActive, setIsSessionActive] = useState(false);

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

  // Stop session mutation
  const stopSessionMutation = useMutation({
    mutationFn: () => bugfixApi.stopAgenticSession(projectName as string, sessionId as string),
    onSuccess: () => {
      toast({
        title: 'Session Stopped',
        description: 'The generic session has been stopped.',
      });
      refetchSession();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to stop session',
        variant: 'destructive',
      });
    },
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

        // Add to log entries
        if (event.message) {
          setLogEntries(prev => [
            ...prev,
            {
              timestamp: event.timestamp,
              message: event.message,
              type: event.error ? 'error' : 'info',
            },
          ]);
        }

        // Update session active state
        setIsSessionActive(event.phase === 'Running');

        refetchSession();
      }
    };

    const handleSessionOutput = (event: any) => {
      if (event.sessionID === sessionId && event.output) {
        setSessionOutput(prev => prev + event.output);
        setLogEntries(prev => [
          ...prev,
          {
            timestamp: new Date().toISOString(),
            message: event.output,
            type: 'output',
          },
        ]);
      }
    };

    const handleSessionCompleted = (event: any) => {
      if (event.sessionID === sessionId && event.sessionType === 'generic') {
        setIsSessionActive(false);
        if (event.output) {
          setSessionOutput(event.output);
        }
        toast({
          title: 'Session Completed',
          description: 'The generic session has completed.',
        });
        refetchSession();
      }
    };

    ws.on('bugfix-session-status', handleSessionUpdate);
    ws.on('bugfix-session-output', handleSessionOutput);
    ws.on('bugfix-session-completed', handleSessionCompleted);

    return () => {
      ws.off('bugfix-session-status', handleSessionUpdate);
      ws.off('bugfix-session-output', handleSessionOutput);
      ws.off('bugfix-session-completed', handleSessionCompleted);
      ws.disconnect();
    };
  }, [projectName, sessionId, toast, refetchSession]);

  // Update session status from query data
  useEffect(() => {
    if (session) {
      const phase = session.status?.phase || 'Unknown';
      setSessionStatus({
        phase,
        message: session.status?.message || '',
        startTime: session.metadata?.creationTimestamp || '',
        completionTime: session.status?.completionTime,
        output: session.status?.output,
        error: session.status?.error,
      });
      setIsSessionActive(phase === 'Running');
      if (session.status?.output) {
        setSessionOutput(session.status.output);
      }
    }
  }, [session]);

  const isLoading = workflowLoading || sessionLoading;
  const isRunning = sessionStatus?.phase === 'Running';
  const isCompleted = sessionStatus?.phase === 'Completed';
  const isStopped = sessionStatus?.phase === 'Stopped';
  const isFailed = sessionStatus?.phase === 'Failed';

  const handleStopSession = () => {
    stopSessionMutation.mutate();
  };

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
          <h1 className="text-3xl font-bold">Generic Session</h1>
          <p className="text-muted-foreground mt-2">
            Open-ended workspace for Bug #{workflow.githubIssueNumber}
          </p>
        </div>
        <div className="space-x-2">
          {isRunning && (
            <Button
              variant="destructive"
              onClick={handleStopSession}
              disabled={stopSessionMutation.isPending}
            >
              <Square className="mr-2 h-4 w-4" />
              {stopSessionMutation.isPending ? 'Stopping...' : 'Stop Session'}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => router.push(`/projects/${projectName}/workspaces/bugfix/${workflowId}`)}
          >
            Back to Workspace
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Session Status
              {isRunning && <Badge variant="secondary">Running</Badge>}
              {isCompleted && <Badge variant="default">Completed</Badge>}
              {isStopped && <Badge variant="outline">Stopped</Badge>}
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
                {isRunning && <Play className="h-4 w-4 animate-pulse" />}
                {isCompleted && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                {isStopped && <Square className="h-4 w-4 text-orange-600" />}
                {isFailed && <AlertCircle className="h-4 w-4 text-red-600" />}
                <span>{sessionStatus?.phase}</span>
              </div>
            </div>

            {sessionStatus?.message && (
              <div>
                <p className="text-sm text-muted-foreground">Current Activity</p>
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
                <p className="text-sm text-muted-foreground">Ended</p>
                <p className="text-sm">
                  {formatDistanceToNow(new Date(sessionStatus.completionTime), { addSuffix: true })}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session Context</CardTitle>
            <CardDescription>
              Generic sessions have full access to the workspace
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">GitHub Issue</p>
              <a
                href={workflow.githubIssueURL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                #{workflow.githubIssueNumber} - {workflow.title}
              </a>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Session Type</p>
              <div className="flex items-center gap-1 mt-1">
                <Terminal className="h-3 w-3" />
                <span className="text-sm">Generic (Open-ended)</span>
              </div>
            </div>

            {session.spec?.description && (
              <div>
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="text-sm">{session.spec.description}</p>
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
          <CardTitle>Session Activity</CardTitle>
          <CardDescription>
            Real-time output and logs from the generic session
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="output">
            <TabsList>
              <TabsTrigger value="output">Output</TabsTrigger>
              <TabsTrigger value="logs">Activity Log</TabsTrigger>
              <TabsTrigger value="raw">Raw Output</TabsTrigger>
            </TabsList>

            <TabsContent value="output">
              <ScrollArea className="h-[400px] w-full rounded-md border p-4">
                {sessionOutput ? (
                  <pre className="font-mono text-sm whitespace-pre-wrap">{sessionOutput}</pre>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    {isRunning ? (
                      <div className="space-y-4">
                        <Terminal className="h-8 w-8 animate-pulse mx-auto" />
                        <p>Session is running...</p>
                        <p className="text-sm">
                          Output will appear here as the session progresses.
                        </p>
                      </div>
                    ) : (
                      <p>No output available yet.</p>
                    )}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="logs">
              <ScrollArea className="h-[400px] w-full rounded-md border p-4">
                {logEntries.length > 0 ? (
                  <div className="space-y-2">
                    {logEntries.map((entry, index) => (
                      <div
                        key={index}
                        className={`text-sm ${
                          entry.type === 'error'
                            ? 'text-red-600'
                            : entry.type === 'output'
                            ? 'text-blue-600'
                            : 'text-muted-foreground'
                        }`}
                      >
                        <span className="font-mono text-xs">
                          [{new Date(entry.timestamp).toLocaleTimeString()}]
                        </span>{' '}
                        {entry.message}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground">No activity logs yet.</p>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="raw">
              <Textarea
                value={sessionOutput || ''}
                readOnly
                className="font-mono text-sm min-h-[400px]"
                placeholder="Raw output will appear here..."
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {(isCompleted || isStopped) && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Session Ended</AlertTitle>
          <AlertDescription>
            The generic session has {isStopped ? 'been stopped' : 'completed'}.
            {sessionOutput && (
              <>
                {' '}
                Review the output above for any findings or results. Generic sessions do not
                automatically update GitHub Issues or bugfix documentation.
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      {isRunning && (
        <Alert>
          <Play className="h-4 w-4" />
          <AlertTitle>Session Active</AlertTitle>
          <AlertDescription>
            This generic session is currently running. It will continue until manually stopped or it
            completes its work. You can stop it at any time using the Stop Session button above.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}