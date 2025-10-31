import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import BugImplementFixSessionPage from './bug-implement-fix';
import { bugfixApi } from '@/services/api';
import { WebSocketService } from '@/services/websocket';

// Mock dependencies
jest.mock('next/navigation');
jest.mock('@/services/api');
jest.mock('@/services/websocket');
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

// T073: Test Bug-implement-fix session page
describe('BugImplementFixSessionPage', () => {
  const mockRouter = { push: jest.fn() };
  const mockParams = {
    projectName: 'test-project',
    workflowId: 'workflow-789',
    sessionId: 'session-123',
  };

  const mockWorkflow = {
    id: 'workflow-789',
    title: 'Performance Bug',
    githubIssueNumber: 789,
    githubIssueURL: 'https://github.com/test/repo/issues/789',
    branchName: 'bugfix/gh-789',
    bugfixMarkdownCreated: true,
    bugFolderCreated: true,
  };

  const mockSession = {
    metadata: {
      name: 'session-123',
      creationTimestamp: '2024-01-15T11:00:00Z',
      labels: {
        'bugfix-session-type': 'bug-implement-fix',
      },
    },
    status: {
      phase: 'Running',
      message: 'Implementing the bug fix in feature branch',
    },
  };

  const mockCompletedSession = {
    ...mockSession,
    status: {
      phase: 'Completed',
      completionTime: '2024-01-15T11:30:00Z',
      output: '## Implementation Summary\n\nFixed the performance issue by:\n1. Optimizing database queries\n2. Adding caching layer\n3. Updating indexes\n\nTests added:\n- Performance benchmark tests\n- Integration tests for cache\n\nDocumentation updated in README.md',
    },
  };

  let queryClient: QueryClient;
  let mockWs: any;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    (useParams as jest.Mock).mockReturnValue(mockParams);
    (useRouter as jest.Mock).mockReturnValue(mockRouter);

    (bugfixApi.getBugFixWorkflow as jest.Mock).mockResolvedValue(mockWorkflow);
    (bugfixApi.getAgenticSession as jest.Mock).mockResolvedValue(mockSession);

    mockWs = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    };
    (WebSocketService as jest.Mock).mockImplementation(() => mockWs);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BugImplementFixSessionPage />
      </QueryClientProvider>
    );
  };

  it('displays session information correctly', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Bug Implementation Session')).toBeInTheDocument();
      expect(screen.getByText(/Implementing the fix for Bug #789/)).toBeInTheDocument();
    });

    expect(screen.getByText('Session Status')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('session-123')).toBeInTheDocument();
    expect(screen.getByText('Implementing the bug fix in feature branch')).toBeInTheDocument();
  });

  it('displays implementation context', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Implementation Context')).toBeInTheDocument();
    });

    expect(screen.getByText('bugfix/gh-789')).toBeInTheDocument();
    expect(screen.getByText('#789 - Performance Bug')).toBeInTheDocument();
    expect(screen.getByText('bugfix.md exists')).toBeInTheDocument();
  });

  it('shows progress tracking while running', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Implementation Progress')).toBeInTheDocument();
    });

    expect(screen.getByText('Analyzing')).toBeInTheDocument();
    expect(screen.getByText('Implementing')).toBeInTheDocument();
    expect(screen.getByText('Testing')).toBeInTheDocument();
    expect(screen.getByText('Documenting')).toBeInTheDocument();
    expect(screen.getByText('Finalizing')).toBeInTheDocument();
    expect(screen.getByText(/Implementing the bug fix.../)).toBeInTheDocument();
  });

  it('displays completed implementation summary', async () => {
    (bugfixApi.getAgenticSession as jest.Mock).mockResolvedValue(mockCompletedSession);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText(/Implementation Summary/)).toBeInTheDocument();
      expect(screen.getByText(/Fixed the performance issue by:/)).toBeInTheDocument();
      expect(screen.getByText(/Optimizing database queries/)).toBeInTheDocument();
      expect(screen.getByText(/Adding caching layer/)).toBeInTheDocument();
    });
  });

  it('shows completion alert with next steps', async () => {
    (bugfixApi.getAgenticSession as jest.Mock).mockResolvedValue(mockCompletedSession);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Implementation Complete')).toBeInTheDocument();
      expect(screen.getByText(/Code changes committed to branch:/)).toBeInTheDocument();
      expect(screen.getByText(/bugfix\/gh-789/)).toBeInTheDocument();
      expect(screen.getByText(/Tests written and passing/)).toBeInTheDocument();
      expect(screen.getByText(/Documentation updated as needed/)).toBeInTheDocument();
      expect(screen.getByText(/bugfix.md updated with implementation details/)).toBeInTheDocument();
    });

    expect(screen.getByText('Next steps:')).toBeInTheDocument();
    expect(screen.getByText(/Review the changes in the feature branch/)).toBeInTheDocument();
    expect(screen.getByText(/Create a pull request when ready/)).toBeInTheDocument();
  });

  it('handles session errors', async () => {
    const errorSession = {
      ...mockSession,
      status: {
        phase: 'Failed',
        error: 'Failed to implement fix: Compilation error in main.go',
      },
    };
    (bugfixApi.getAgenticSession as jest.Mock).mockResolvedValue(errorSession);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
      expect(screen.getByText('Session Error')).toBeInTheDocument();
      expect(screen.getByText(/Failed to implement fix: Compilation error/)).toBeInTheDocument();
    });
  });

  it('handles WebSocket updates for progress', async () => {
    renderComponent();

    // Verify WebSocket connection
    await waitFor(() => {
      expect(mockWs.connect).toHaveBeenCalledWith('test-project');
      expect(mockWs.on).toHaveBeenCalledWith('bugfix-session-status', expect.any(Function));
      expect(mockWs.on).toHaveBeenCalledWith('bugfix-session-completed', expect.any(Function));
    });

    // Simulate progress update via WebSocket
    const statusHandler = mockWs.on.mock.calls.find(call => call[0] === 'bugfix-session-status')[1];

    // Simulate testing phase
    statusHandler({
      sessionID: 'session-123',
      phase: 'Running',
      message: 'Running tests for the implemented fix',
    });

    await waitFor(() => {
      expect(screen.getByText(/Running tests for the implemented fix/)).toBeInTheDocument();
    });
  });

  it('handles WebSocket completion event', async () => {
    renderComponent();

    await waitFor(() => {
      expect(mockWs.on).toHaveBeenCalled();
    });

    // Simulate session completion via WebSocket
    const completionHandler = mockWs.on.mock.calls.find(call => call[0] === 'bugfix-session-completed')[1];
    completionHandler({
      sessionID: 'session-123',
      sessionType: 'bug-implement-fix',
      output: 'Implementation complete with all tests passing',
    });

    await waitFor(() => {
      expect(bugfixApi.getAgenticSession).toHaveBeenCalledTimes(2); // Initial + refetch
    });
  });

  it('navigates back to workspace', async () => {
    renderComponent();

    const backButton = await screen.findByText('Back to Workspace');
    backButton.click();

    expect(mockRouter.push).toHaveBeenCalledWith('/projects/test-project/workspaces/bugfix/workflow-789');
  });

  it('switches between summary and raw output tabs', async () => {
    (bugfixApi.getAgenticSession as jest.Mock).mockResolvedValue(mockCompletedSession);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Summary')).toBeInTheDocument();
      expect(screen.getByText('Raw Output')).toBeInTheDocument();
    });

    // Click on Raw Output tab
    const rawTab = screen.getByText('Raw Output');
    rawTab.click();

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue(mockCompletedSession.status.output);
    });
  });
});