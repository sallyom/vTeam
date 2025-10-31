'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, Bug, FileText, GitBranch, Clock } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

interface BugReviewSessionProps {
  sessionId: string;
  workflowId: string;
  githubIssueNumber: number;
  phase: string;
  progress?: number;
  findings?: string;
}

export default function BugReviewSessionPage({
  sessionId,
  workflowId,
  githubIssueNumber,
  phase,
  progress = 0,
  findings,
}: BugReviewSessionProps) {
  const searchParams = useSearchParams();

  const getPhaseDetails = () => {
    switch (phase) {
      case 'Pending':
        return {
          title: 'Preparing Bug Review',
          description: 'Session is being initialized...',
          icon: <Clock className="h-5 w-5 text-yellow-500" />,
          color: 'text-yellow-500',
        };
      case 'Running':
        return {
          title: 'Analyzing Bug',
          description: 'Researching codebase and identifying root causes...',
          icon: <Search className="h-5 w-5 text-blue-500 animate-pulse" />,
          color: 'text-blue-500',
        };
      case 'Completed':
        return {
          title: 'Analysis Complete',
          description: 'Bug review has been completed and findings posted to GitHub',
          icon: <FileText className="h-5 w-5 text-green-500" />,
          color: 'text-green-500',
        };
      case 'Failed':
        return {
          title: 'Review Failed',
          description: 'An error occurred during bug analysis',
          icon: <Bug className="h-5 w-5 text-red-500" />,
          color: 'text-red-500',
        };
      default:
        return {
          title: 'Bug Review Session',
          description: 'Analyzing bug and codebase',
          icon: <Search className="h-5 w-5" />,
          color: 'text-gray-500',
        };
    }
  };

  const phaseDetails = getPhaseDetails();

  return (
    <div className="space-y-6">
      {/* Session Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {phaseDetails.icon}
              <div>
                <CardTitle>{phaseDetails.title}</CardTitle>
                <CardDescription>{phaseDetails.description}</CardDescription>
              </div>
            </div>
            <Badge variant="outline" className={phaseDetails.color}>
              {phase}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Progress */}
            {phase === 'Running' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Analysis Progress</span>
                  <span className="font-medium">{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            {/* Session Details */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground mb-1">Session ID</div>
                <div className="font-mono text-xs">{sessionId}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">GitHub Issue</div>
                <div className="flex items-center gap-1">
                  <GitBranch className="h-3 w-3" />
                  <span>#{githubIssueNumber}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Analysis Steps */}
      <Card>
        <CardHeader>
          <CardTitle>Analysis Steps</CardTitle>
          <CardDescription>
            The Bug-review session performs the following analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <AnalysisStep
              title="GitHub Issue Analysis"
              description="Reading and understanding the bug report from GitHub Issue"
              status={phase === 'Completed' ? 'complete' : phase === 'Running' ? 'active' : 'pending'}
            />
            <AnalysisStep
              title="Codebase Research"
              description="Searching for relevant code, dependencies, and affected components"
              status={phase === 'Completed' ? 'complete' : phase === 'Running' && progress > 30 ? 'active' : 'pending'}
            />
            <AnalysisStep
              title="Root Cause Identification"
              description="Analyzing code paths to identify the root cause of the bug"
              status={phase === 'Completed' ? 'complete' : phase === 'Running' && progress > 60 ? 'active' : 'pending'}
            />
            <AnalysisStep
              title="Findings Documentation"
              description="Documenting technical analysis and posting to GitHub Issue"
              status={phase === 'Completed' ? 'complete' : phase === 'Running' && progress > 90 ? 'active' : 'pending'}
            />
          </div>
        </CardContent>
      </Card>

      {/* Findings Preview */}
      {findings && phase === 'Completed' && (
        <Card>
          <CardHeader>
            <CardTitle>Analysis Findings</CardTitle>
            <CardDescription>
              These findings have been posted as a comment on GitHub Issue #{githubIssueNumber}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <pre className="whitespace-pre-wrap bg-muted p-4 rounded-md text-sm overflow-x-auto">
                {findings}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Alert */}
      {phase === 'Failed' && (
        <Alert variant="destructive">
          <AlertTitle>Session Failed</AlertTitle>
          <AlertDescription>
            The bug review session encountered an error. Please check the session logs for details.
          </AlertDescription>
        </Alert>
      )}

      {/* Next Steps */}
      {phase === 'Completed' && (
        <Alert>
          <AlertTitle>Next Steps</AlertTitle>
          <AlertDescription>
            The bug has been analyzed and findings posted to GitHub. You can now:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Review the findings in the GitHub Issue comments</li>
              <li>Create a "Resolution Plan" session to plan the fix</li>
              <li>Sync the workspace to Jira for project tracking</li>
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// Analysis Step Component
function AnalysisStep({
  title,
  description,
  status
}: {
  title: string;
  description: string;
  status: 'pending' | 'active' | 'complete';
}) {
  const getStatusIcon = () => {
    switch (status) {
      case 'complete':
        return <div className="h-2 w-2 rounded-full bg-green-500" />;
      case 'active':
        return <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />;
      case 'pending':
        return <div className="h-2 w-2 rounded-full bg-gray-300" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'complete':
        return 'text-green-600 dark:text-green-400';
      case 'active':
        return 'text-blue-600 dark:text-blue-400';
      case 'pending':
        return 'text-gray-400';
    }
  };

  return (
    <div className={`flex items-start gap-3 ${getStatusColor()}`}>
      <div className="mt-1.5">{getStatusIcon()}</div>
      <div className="flex-1">
        <div className="font-medium">{title}</div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}