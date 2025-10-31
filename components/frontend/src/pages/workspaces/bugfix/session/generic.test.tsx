import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import GenericSessionPage from './generic';
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

// T078: Test Generic session page
describe('GenericSessionPage', () => {
  const mockRouter = { push: jest.fn() };
  const mockParams = {
    projectName: 'test-project',
    workflowId: 'workflow-999',
    sessionId: 'session-generic-123',
  };

  const mockWorkflow = {
    id: 'workflow-999',
    title: 'Complex Investigation Bug',
    githubIssueNumber: 999,
    githubIssueURL: 'https://github.com/test/repo/issues/999',
    branchName: 'bugfix/gh-999',
  };

  const mockSession = {
    metadata: {
      name: 'session-generic-123',
      creationTimestamp: '2024-01-15T14:00:00Z',
      labels: {
        'bugfix-session-type': 'generic',
      },
    },
    spec: {
      description: 'Investigate memory leak in authentication module',
    },
    status: {
      phase: 'Running',
      message: 'Exploring codebase...',
    },
  };

  const mockCompletedSession = {
    ...mockSession,
    status: {
      phase: 'Completed',
      completionTime: '2024-01-15T14:45:00Z',
      output: 'Investigation complete.\n\nFindings:\n- Memory leak in auth cache\n- Token not being cleared on logout\n- Suggested fix: Add cleanup in logout handler',
    },
  };

  const mockStoppedSession = {
    ...mockSession,
    status: {
      phase: 'Stopped',
      completionTime: '2024-01-15T14:20:00Z',
      output: 'Session stopped by user.\n\nPartial findings:\n- Found potential issue in auth module',
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
    (bugfixApi.stopAgenticSession as jest.Mock).mockResolvedValue({ success: true });

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
        <GenericSessionPage />
      </QueryClientProvider>
    );
  };

  it('displays session information correctly', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Generic Session')).toBeInTheDocument();
      expect(screen.getByText(/Open-ended workspace for Bug #999/)).toBeInTheDocument();
    });

    expect(screen.getByText('Session Status')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('session-generic-123')).toBeInTheDocument();
    expect(screen.getByText('Exploring codebase...')).toBeInTheDocument();
  });

  it('displays session context and description', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Session Context')).toBeInTheDocument();
    });

    expect(screen.getByText('#999 - Complex Investigation Bug')).toBeInTheDocument();
    expect(screen.getByText('Generic (Open-ended)')).toBeInTheDocument();
    expect(screen.getByText('Investigate memory leak in authentication module')).toBeInTheDocument();
  });

  it('shows stop button for running sessions', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Stop Session')).toBeInTheDocument();
    });

    const stopButton = screen.getByText('Stop Session');
    expect(stopButton).toBeEnabled();
  });

  it('handles stop session action', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Stop Session')).toBeInTheDocument();
    });

    const stopButton = screen.getByText('Stop Session');
    fireEvent.click(stopButton);

    await waitFor(() => {
      expect(bugfixApi.stopAgenticSession).toHaveBeenCalledWith('test-project', 'session-generic-123');
    });
  });

  it('displays completed session output', async () => {
    (bugfixApi.getAgenticSession as jest.Mock).mockResolvedValue(mockCompletedSession);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText(/Investigation complete/)).toBeInTheDocument();
      expect(screen.getByText(/Memory leak in auth cache/)).toBeInTheDocument();
    });

    // Should not show stop button for completed sessions
    expect(screen.queryByText('Stop Session')).not.toBeInTheDocument();
  });

  it('displays stopped session state', async () => {
    (bugfixApi.getAgenticSession as jest.Mock).mockResolvedValue(mockStoppedSession);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Stopped')).toBeInTheDocument();
      expect(screen.getByText(/Session stopped by user/)).toBeInTheDocument();
      expect(screen.getByText(/Found potential issue in auth module/)).toBeInTheDocument();
    });

    // Session ended alert
    expect(screen.getByText('Session Ended')).toBeInTheDocument();
    expect(screen.getByText(/The generic session has been stopped/)).toBeInTheDocument();
  });

  it('handles session errors', async () => {
    const errorSession = {
      ...mockSession,
      status: {
        phase: 'Failed',
        error: 'Session failed: Resource limit exceeded',
      },
    };
    (bugfixApi.getAgenticSession as jest.Mock).mockResolvedValue(errorSession);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
      expect(screen.getByText('Session Error')).toBeInTheDocument();
      expect(screen.getByText(/Session failed: Resource limit exceeded/)).toBeInTheDocument();
    });
  });

  it('handles WebSocket real-time updates', async () => {
    renderComponent();

    // Verify WebSocket connection
    await waitFor(() => {
      expect(mockWs.connect).toHaveBeenCalledWith('test-project');
      expect(mockWs.on).toHaveBeenCalledWith('bugfix-session-status', expect.any(Function));
      expect(mockWs.on).toHaveBeenCalledWith('bugfix-session-output', expect.any(Function));
      expect(mockWs.on).toHaveBeenCalledWith('bugfix-session-completed', expect.any(Function));
    });

    // Simulate output update via WebSocket
    const outputHandler = mockWs.on.mock.calls.find(call => call[0] === 'bugfix-session-output')[1];
    outputHandler({
      sessionID: 'session-generic-123',
      output: 'Found interesting pattern in auth.go:42\n',
    });

    await waitFor(() => {
      expect(screen.getByText(/Found interesting pattern in auth.go:42/)).toBeInTheDocument();
    });
  });

  it('switches between output tabs', async () => {
    (bugfixApi.getAgenticSession as jest.Mock).mockResolvedValue(mockCompletedSession);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Output')).toBeInTheDocument();
      expect(screen.getByText('Activity Log')).toBeInTheDocument();
      expect(screen.getByText('Raw Output')).toBeInTheDocument();
    });

    // Click on Activity Log tab
    const logTab = screen.getByText('Activity Log');
    fireEvent.click(logTab);

    await waitFor(() => {
      // Activity log content would appear here
      expect(screen.getByText(/No activity logs yet/)).toBeInTheDocument();
    });

    // Click on Raw Output tab
    const rawTab = screen.getByText('Raw Output');
    fireEvent.click(rawTab);

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue(mockCompletedSession.status.output);
    });
  });

  it('shows active session alert for running sessions', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Session Active')).toBeInTheDocument();
      expect(screen.getByText(/This generic session is currently running/)).toBeInTheDocument();
    });
  });

  it('navigates back to workspace', async () => {
    renderComponent();

    const backButton = await screen.findByText('Back to Workspace');
    fireEvent.click(backButton);

    expect(mockRouter.push).toHaveBeenCalledWith('/projects/test-project/workspaces/bugfix/workflow-999');
  });
});