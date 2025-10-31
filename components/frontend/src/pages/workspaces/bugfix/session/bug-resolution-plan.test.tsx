import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import BugResolutionPlanSessionPage from './bug-resolution-plan';
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

// T066: Test Bug-resolution-plan session page
describe('BugResolutionPlanSessionPage', () => {
  const mockRouter = { push: jest.fn() };
  const mockParams = {
    projectName: 'test-project',
    workflowId: 'workflow-123',
    sessionId: 'session-456',
  };

  const mockWorkflow = {
    id: 'workflow-123',
    title: 'Test Bug',
    githubIssueNumber: 123,
    githubIssueURL: 'https://github.com/test/repo/issues/123',
    branchName: 'bugfix-123',
    bugFolderCreated: true,
    jiraTaskKey: 'PROJ-456',
  };

  const mockSession = {
    metadata: {
      name: 'session-456',
      creationTimestamp: '2024-01-15T10:00:00Z',
      labels: {
        'bugfix-session-type': 'bug-resolution-plan',
      },
    },
    status: {
      phase: 'Running',
      message: 'Analyzing bug and generating resolution plan',
    },
  };

  const mockCompletedSession = {
    ...mockSession,
    status: {
      phase: 'Completed',
      completionTime: '2024-01-15T10:05:00Z',
      output: '## Resolution Plan\n\n1. Update the validation logic\n2. Add error handling\n3. Write unit tests',
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
        <BugResolutionPlanSessionPage />
      </QueryClientProvider>
    );
  };

  it('displays session information correctly', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Bug Resolution Plan Session')).toBeInTheDocument();
      expect(screen.getByText(/Generating a resolution plan for Bug #123/)).toBeInTheDocument();
    });

    expect(screen.getByText('Session Status')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('session-456')).toBeInTheDocument();
    expect(screen.getByText('Analyzing bug and generating resolution plan')).toBeInTheDocument();
  });

  it('displays bug context information', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Bug Context')).toBeInTheDocument();
    });

    expect(screen.getByText('#123 - Test Bug')).toBeInTheDocument();
    expect(screen.getByText('bugfix-123')).toBeInTheDocument();
    expect(screen.getByText('bug-123/')).toBeInTheDocument();
  });

  it('shows loading state while generating plan', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Generating resolution plan...')).toBeInTheDocument();
      expect(screen.getByText(/The AI is analyzing the bug/)).toBeInTheDocument();
    });
  });

  it('displays completed resolution plan', async () => {
    (bugfixApi.getAgenticSession as jest.Mock).mockResolvedValue(mockCompletedSession);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText(/Resolution Plan/)).toBeInTheDocument();
      expect(screen.getByText(/Update the validation logic/)).toBeInTheDocument();
      expect(screen.getByText(/Add error handling/)).toBeInTheDocument();
      expect(screen.getByText(/Write unit tests/)).toBeInTheDocument();
    });
  });

  it('shows completion alert with actions taken', async () => {
    (bugfixApi.getAgenticSession as jest.Mock).mockResolvedValue(mockCompletedSession);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Resolution Plan Complete')).toBeInTheDocument();
      expect(screen.getByText(/Posted as a comment on GitHub Issue #123/)).toBeInTheDocument();
      expect(screen.getByText(/Saved to the bugfix.md file/)).toBeInTheDocument();
      expect(screen.getByText(/Will be synchronized with Jira task PROJ-456/)).toBeInTheDocument();
    });
  });

  it('handles session errors', async () => {
    const errorSession = {
      ...mockSession,
      status: {
        phase: 'Failed',
        error: 'Failed to generate resolution plan: API error',
      },
    };
    (bugfixApi.getAgenticSession as jest.Mock).mockResolvedValue(errorSession);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
      expect(screen.getByText('Session Error')).toBeInTheDocument();
      expect(screen.getByText(/Failed to generate resolution plan: API error/)).toBeInTheDocument();
    });
  });

  it('handles WebSocket updates', async () => {
    renderComponent();

    // Verify WebSocket connection
    await waitFor(() => {
      expect(mockWs.connect).toHaveBeenCalledWith('test-project');
      expect(mockWs.on).toHaveBeenCalledWith('bugfix-session-status', expect.any(Function));
      expect(mockWs.on).toHaveBeenCalledWith('bugfix-session-completed', expect.any(Function));
    });

    // Simulate session completion via WebSocket
    const statusHandler = mockWs.on.mock.calls.find(call => call[0] === 'bugfix-session-completed')[1];
    statusHandler({
      sessionID: 'session-456',
      sessionType: 'bug-resolution-plan',
      output: '## Updated Plan\n\nNew resolution steps...',
    });

    await waitFor(() => {
      expect(bugfixApi.getAgenticSession).toHaveBeenCalledTimes(2); // Initial + refetch
    });
  });

  it('navigates back to workspace', async () => {
    renderComponent();

    const backButton = await screen.findByText('Back to Workspace');
    backButton.click();

    expect(mockRouter.push).toHaveBeenCalledWith('/projects/test-project/workspaces/bugfix/workflow-123');
  });

  it('switches between output tabs', async () => {
    (bugfixApi.getAgenticSession as jest.Mock).mockResolvedValue(mockCompletedSession);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Generated Plan')).toBeInTheDocument();
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