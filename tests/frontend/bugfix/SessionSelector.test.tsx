import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import SessionSelector from '@/components/workspaces/bugfix/SessionSelector';
import * as bugfixApi from '@/services/api/bugfix';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';

// Mock dependencies
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('@/services/api', () => ({
  bugfixApi: {
    createBugFixSession: vi.fn(),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  successToast: vi.fn(),
  errorToast: vi.fn(),
}));

describe('SessionSelector', () => {
  let queryClient: QueryClient;
  let mockRouter: any;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    mockRouter = {
      push: vi.fn(),
    };
    (useRouter as any).mockReturnValue(mockRouter);

    vi.clearAllMocks();
  });

  const renderComponent = (props = {}) => {
    const defaultProps = {
      projectName: 'test-project',
      workflowId: 'workflow-123',
      githubIssueNumber: 456,
      disabled: false,
      ...props,
    };

    return render(
      <QueryClientProvider client={queryClient}>
        <SessionSelector {...defaultProps} />
      </QueryClientProvider>
    );
  };

  it('renders the Create Session button', () => {
    renderComponent();
    expect(screen.getByText('Create Session')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create session/i })).not.toBeDisabled();
  });

  it('disables button when disabled prop is true', () => {
    renderComponent({ disabled: true });
    expect(screen.getByRole('button', { name: /create session/i })).toBeDisabled();
  });

  it('opens dialog when button is clicked', () => {
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /create session/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Create New Session')).toBeInTheDocument();
    expect(screen.getByText('Select a session type to work on Bug #456')).toBeInTheDocument();
  });

  it('displays all session types', () => {
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /create session/i }));

    expect(screen.getByText('Bug Review')).toBeInTheDocument();
    expect(screen.getByText('Resolution Plan')).toBeInTheDocument();
    expect(screen.getByText('Implement Fix')).toBeInTheDocument();
    expect(screen.getByText('Generic Session')).toBeInTheDocument();
  });

  it('shows recommended badge for Bug Review', () => {
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /create session/i }));

    const bugReviewCard = screen.getByText('Bug Review').closest('[role="radio"]')?.parentElement?.parentElement;
    expect(bugReviewCard).toHaveTextContent('Recommended first');
  });

  it('shows custom fields when session type is selected', () => {
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /create session/i }));

    // Select Bug Review
    const bugReviewRadio = screen.getByRole('radio', { name: /bug review/i });
    fireEvent.click(bugReviewRadio);

    expect(screen.getByLabelText('Custom Title (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Description (optional)')).toBeInTheDocument();
  });

  it('creates session with default values', async () => {
    const mockSession = { id: 'session-789', sessionType: 'bug-review' };
    (bugfixApi.createBugFixSession as any).mockResolvedValue(mockSession);

    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /create session/i }));

    // Select Bug Review
    const bugReviewRadio = screen.getByRole('radio', { name: /bug review/i });
    fireEvent.click(bugReviewRadio);

    // Click Create Session
    const createButton = screen.getByRole('button', { name: /^create session$/i });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(bugfixApi.createBugFixSession).toHaveBeenCalledWith(
        'test-project',
        'workflow-123',
        { sessionType: 'bug-review' }
      );
    });

    expect(mockRouter.push).toHaveBeenCalledWith('/projects/test-project/sessions/session-789');
  });

  it('creates session with custom values', async () => {
    const mockSession = { id: 'session-789', sessionType: 'bug-resolution-plan' };
    (bugfixApi.createBugFixSession as any).mockResolvedValue(mockSession);

    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /create session/i }));

    // Select Resolution Plan
    const resolutionPlanRadio = screen.getByRole('radio', { name: /resolution plan/i });
    fireEvent.click(resolutionPlanRadio);

    // Fill custom fields
    const titleInput = screen.getByLabelText('Custom Title (optional)');
    fireEvent.change(titleInput, { target: { value: 'Custom Resolution Strategy' } });

    const descriptionInput = screen.getByLabelText('Description (optional)');
    fireEvent.change(descriptionInput, { target: { value: 'Focus on performance issues' } });

    // Click Create Session
    const createButton = screen.getByRole('button', { name: /^create session$/i });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(bugfixApi.createBugFixSession).toHaveBeenCalledWith(
        'test-project',
        'workflow-123',
        {
          sessionType: 'bug-resolution-plan',
          title: 'Custom Resolution Strategy',
          description: 'Focus on performance issues',
        }
      );
    });
  });

  it('shows error toast on failure', async () => {
    (bugfixApi.createBugFixSession as any).mockRejectedValue(new Error('API Error'));

    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /create session/i }));

    // Select Bug Review
    const bugReviewRadio = screen.getByRole('radio', { name: /bug review/i });
    fireEvent.click(bugReviewRadio);

    // Click Create Session
    const createButton = screen.getByRole('button', { name: /^create session$/i });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(errorToast).toHaveBeenCalledWith('API Error');
    });
  });

  it('disables create button when no session type selected', () => {
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /create session/i }));

    const createButton = screen.getByRole('button', { name: /^create session$/i });
    expect(createButton).toBeDisabled();
  });

  it('closes dialog on cancel', () => {
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /create session/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows loading state when creating session', async () => {
    let resolvePromise: (value: any) => void;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    (bugfixApi.createBugFixSession as any).mockReturnValue(promise);

    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /create session/i }));

    // Select Bug Review
    const bugReviewRadio = screen.getByRole('radio', { name: /bug review/i });
    fireEvent.click(bugReviewRadio);

    // Click Create Session
    const createButton = screen.getByRole('button', { name: /^create session$/i });
    fireEvent.click(createButton);

    expect(screen.getByText('Creating...')).toBeInTheDocument();
    expect(createButton).toBeDisabled();

    // Resolve the promise
    resolvePromise!({ id: 'session-789', sessionType: 'bug-review' });

    await waitFor(() => {
      expect(screen.queryByText('Creating...')).not.toBeInTheDocument();
    });
  });
});