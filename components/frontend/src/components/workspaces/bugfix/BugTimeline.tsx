import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  CheckCircle2,
  GitBranch,
  GitPullRequest,
  MessageSquare,
  FileText,
  Code2,
  AlertCircle,
  Clock,
  ExternalLink,
  Loader2
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AgenticSession } from '@/types/bugfix';

interface TimelineEvent {
  id: string;
  type: 'workspace_created' | 'jira_synced' | 'session_started' | 'session_completed' | 'session_failed' | 'branch_created' | 'bugfix_md_created' | 'github_comment' | 'implementation_completed';
  title: string;
  description?: string;
  timestamp: string;
  sessionType?: string;
  sessionId?: string;
  status?: 'success' | 'error' | 'running';
  link?: {
    url: string;
    label: string;
  };
}

interface BugTimelineProps {
  workflowId: string;
  events: TimelineEvent[];
  sessions?: AgenticSession[];
  className?: string;
}

export default function BugTimeline({ workflowId, events, sessions = [], className }: BugTimelineProps) {
  // Sort events by timestamp (newest first)
  const sortedEvents = [...events].sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const getEventIcon = (event: TimelineEvent) => {
    switch (event.type) {
      case 'workspace_created':
        return <GitBranch className="h-4 w-4" />;
      case 'jira_synced':
        return <ExternalLink className="h-4 w-4" />;
      case 'session_started':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'session_completed':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'session_failed':
        return <AlertCircle className="h-4 w-4" />;
      case 'branch_created':
        return <GitBranch className="h-4 w-4" />;
      case 'bugfix_md_created':
        return <FileText className="h-4 w-4" />;
      case 'github_comment':
        return <MessageSquare className="h-4 w-4" />;
      case 'implementation_completed':
        return <Code2 className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getEventColor = (event: TimelineEvent) => {
    if (event.status === 'error' || event.type === 'session_failed') {
      return 'text-red-600 bg-red-50';
    }
    if (event.status === 'running' || event.type === 'session_started') {
      return 'text-blue-600 bg-blue-50';
    }
    if (event.status === 'success' || event.type === 'session_completed') {
      return 'text-green-600 bg-green-50';
    }
    return 'text-gray-600 bg-gray-50';
  };

  const getSessionTypeBadge = (sessionType?: string) => {
    if (!sessionType) return null;

    const variants: Record<string, string> = {
      'bug-review': 'secondary',
      'bug-resolution-plan': 'default',
      'bug-implement-fix': 'outline',
      'generic': 'secondary'
    };

    const labels: Record<string, string> = {
      'bug-review': 'Review',
      'bug-resolution-plan': 'Resolution Plan',
      'bug-implement-fix': 'Implementation',
      'generic': 'Generic'
    };

    return (
      <Badge variant={variants[sessionType] as any} className="ml-2">
        {labels[sessionType] || sessionType}
      </Badge>
    );
  };

  if (sortedEvents.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg">Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No activity recorded yet
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">Activity Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {sortedEvents.map((event, index) => (
            <div key={event.id} className="relative">
              {/* Timeline line (except for last item) */}
              {index < sortedEvents.length - 1 && (
                <div className="absolute left-5 top-10 bottom-0 w-0.5 bg-gray-200" />
              )}

              <div className="flex gap-4">
                {/* Icon */}
                <div className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0",
                  getEventColor(event)
                )}>
                  {getEventIcon(event)}
                </div>

                {/* Content */}
                <div className="flex-1 pb-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-medium flex items-center">
                        {event.title}
                        {event.sessionType && getSessionTypeBadge(event.sessionType)}
                      </h4>
                      {event.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {event.description}
                        </p>
                      )}
                    </div>
                    <time className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                    </time>
                  </div>

                  {event.link && (
                    <a
                      href={event.link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                    >
                      {event.link.label}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}

                  {event.sessionId && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Session ID: <code className="font-mono">{event.sessionId}</code>
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}