import React from 'react';
import { render, screen } from '@testing-library/react';
import BugTimeline from './BugTimeline';

describe('BugTimeline', () => {
  const mockEvents = [
    {
      id: '1',
      type: 'workspace_created' as const,
      title: 'Workspace Created',
      description: 'BugFix workspace created from GitHub Issue #123',
      timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    },
    {
      id: '2',
      type: 'session_started' as const,
      title: 'Bug Review Session Started',
      sessionType: 'bug-review',
      sessionId: 'session-123',
      timestamp: new Date(Date.now() - 1800000).toISOString(), // 30 minutes ago
      status: 'running' as const,
    },
    {
      id: '3',
      type: 'session_completed' as const,
      title: 'Bug Review Session Completed',
      description: 'Analysis complete and posted to GitHub',
      sessionType: 'bug-review',
      sessionId: 'session-123',
      timestamp: new Date(Date.now() - 900000).toISOString(), // 15 minutes ago
      status: 'success' as const,
      link: {
        url: 'https://github.com/test/repo/issues/123#comment-1',
        label: 'View on GitHub',
      },
    },
  ];

  it('renders timeline with events', () => {
    render(<BugTimeline workflowId="workflow-123" events={mockEvents} />);

    expect(screen.getByText('Activity Timeline')).toBeInTheDocument();
    expect(screen.getByText('Workspace Created')).toBeInTheDocument();
    expect(screen.getByText('Bug Review Session Started')).toBeInTheDocument();
    expect(screen.getByText('Bug Review Session Completed')).toBeInTheDocument();
  });

  it('displays event descriptions', () => {
    render(<BugTimeline workflowId="workflow-123" events={mockEvents} />);

    expect(screen.getByText('BugFix workspace created from GitHub Issue #123')).toBeInTheDocument();
    expect(screen.getByText('Analysis complete and posted to GitHub')).toBeInTheDocument();
  });

  it('shows session type badges', () => {
    render(<BugTimeline workflowId="workflow-123" events={mockEvents} />);

    const badges = screen.getAllByText('Review');
    expect(badges).toHaveLength(2);
  });

  it('displays session IDs', () => {
    render(<BugTimeline workflowId="workflow-123" events={mockEvents} />);

    const sessionIds = screen.getAllByText(/Session ID:/);
    expect(sessionIds).toHaveLength(2);
    expect(screen.getByText('session-123')).toBeInTheDocument();
  });

  it('shows external links', () => {
    render(<BugTimeline workflowId="workflow-123" events={mockEvents} />);

    const link = screen.getByRole('link', { name: /View on GitHub/i });
    expect(link).toHaveAttribute('href', 'https://github.com/test/repo/issues/123#comment-1');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('sorts events by newest first', () => {
    render(<BugTimeline workflowId="workflow-123" events={mockEvents} />);

    const titles = screen.getAllByRole('heading', { level: 4 });
    expect(titles[0]).toHaveTextContent('Bug Review Session Completed');
    expect(titles[1]).toHaveTextContent('Bug Review Session Started');
    expect(titles[2]).toHaveTextContent('Workspace Created');
  });

  it('shows empty state when no events', () => {
    render(<BugTimeline workflowId="workflow-123" events={[]} />);

    expect(screen.getByText('Activity Timeline')).toBeInTheDocument();
    expect(screen.getByText('No activity recorded yet')).toBeInTheDocument();
  });

  it('displays different event types with appropriate icons', () => {
    const diverseEvents = [
      {
        id: '4',
        type: 'jira_synced' as const,
        title: 'Synced to Jira',
        timestamp: new Date().toISOString(),
      },
      {
        id: '5',
        type: 'session_failed' as const,
        title: 'Session Failed',
        timestamp: new Date().toISOString(),
        status: 'error' as const,
      },
      {
        id: '6',
        type: 'bugfix_md_created' as const,
        title: 'Resolution Plan Created',
        timestamp: new Date().toISOString(),
      },
      {
        id: '7',
        type: 'github_comment' as const,
        title: 'Comment Posted to GitHub',
        timestamp: new Date().toISOString(),
      },
      {
        id: '8',
        type: 'implementation_completed' as const,
        title: 'Implementation Completed',
        timestamp: new Date().toISOString(),
      },
    ];

    render(<BugTimeline workflowId="workflow-123" events={diverseEvents} />);

    expect(screen.getByText('Synced to Jira')).toBeInTheDocument();
    expect(screen.getByText('Session Failed')).toBeInTheDocument();
    expect(screen.getByText('Resolution Plan Created')).toBeInTheDocument();
    expect(screen.getByText('Comment Posted to GitHub')).toBeInTheDocument();
    expect(screen.getByText('Implementation Completed')).toBeInTheDocument();
  });

  it('displays relative timestamps', () => {
    render(<BugTimeline workflowId="workflow-123" events={mockEvents} />);

    // Check that relative timestamps are displayed
    const timeElements = screen.getAllByText(/ago/);
    expect(timeElements.length).toBeGreaterThan(0);
  });

  it('handles different session types', () => {
    const sessionEvents = [
      {
        id: '10',
        type: 'session_completed' as const,
        title: 'Resolution Plan Generated',
        sessionType: 'bug-resolution-plan',
        timestamp: new Date().toISOString(),
      },
      {
        id: '11',
        type: 'session_completed' as const,
        title: 'Fix Implemented',
        sessionType: 'bug-implement-fix',
        timestamp: new Date().toISOString(),
      },
      {
        id: '12',
        type: 'session_completed' as const,
        title: 'Generic Session Completed',
        sessionType: 'generic',
        timestamp: new Date().toISOString(),
      },
    ];

    render(<BugTimeline workflowId="workflow-123" events={sessionEvents} />);

    expect(screen.getByText('Resolution Plan')).toBeInTheDocument();
    expect(screen.getByText('Implementation')).toBeInTheDocument();
    expect(screen.getByText('Generic')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <BugTimeline workflowId="workflow-123" events={mockEvents} className="custom-class" />
    );

    expect(container.querySelector('.custom-class')).toBeInTheDocument();
  });
});