import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import JiraSyncButton from '@/components/workspaces/bugfix/JiraSyncButton';
import * as bugfixApi from '@/services/api/bugfix';
import { toast } from '@/hooks/use-toast';

// Mock dependencies
vi.mock('@/services/api', () => ({
  bugfixApi: {
    syncBugFixWorkflowToJira: vi.fn(),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  successToast: vi.fn(),
  errorToast: vi.fn(),
}));

describe('JiraSyncButton', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  const renderComponent = (props = {}) => {
    const defaultProps = {
      projectName: 'test-project',
      workflowId: 'workflow-123',
      githubIssueNumber: 456,
      ...props,
    };

    return render(
      <QueryClientProvider client={queryClient}>
        <JiraSyncButton {...defaultProps} />
      </QueryClientProvider>
    );
  };

  describe('First Sync (No Jira Task)', () => {
    it('renders Sync to Jira button when no Jira task exists', () => {
      renderComponent();
      expect(screen.getByText('Sync to Jira')).toBeInTheDocument();
      expect(screen.queryByText(/Update Jira/)).not.toBeInTheDocument();
    });

    it('initiates sync immediately when clicked for first time', async () => {
      const mockResponse = {
        workflowId: 'workflow-123',
        jiraTaskKey: 'PROJ-789',
        jiraTaskURL: 'https://jira.example.com/browse/PROJ-789',
        created: true,
        syncedAt: '2025-10-31T12:00:00Z',
        message: 'Created Jira task PROJ-789',
      };
      (bugfixApi.syncBugFixWorkflowToJira as any).mockResolvedValue(mockResponse);

      renderComponent();

      fireEvent.click(screen.getByText('Sync to Jira'));

      // Should show loading state
      expect(screen.getByText('Syncing...')).toBeInTheDocument();

      await waitFor(() => {
        expect(bugfixApi.syncBugFixWorkflowToJira).toHaveBeenCalledWith('test-project', 'workflow-123');
      });

      await waitFor(() => {
        expect(successToast).toHaveBeenCalledWith('Created Jira task PROJ-789');
      });
    });
  });

  describe('Update Sync (Existing Jira Task)', () => {
    const existingProps = {
      jiraTaskKey: 'PROJ-789',
      jiraTaskURL: 'https://jira.example.com/browse/PROJ-789',
      lastSyncedAt: '2025-10-30T10:00:00Z',
    };

    it('renders Update Jira button with task info when Jira task exists', () => {
      renderComponent(existingProps);

      expect(screen.getByText('Update Jira')).toBeInTheDocument();
      expect(screen.getByText('PROJ-789')).toBeInTheDocument();
      expect(screen.getByText(/Last synced/)).toBeInTheDocument();
    });

    it('shows confirmation dialog when updating existing sync', () => {
      renderComponent(existingProps);

      fireEvent.click(screen.getByText('Update Jira'));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Update Jira Task?')).toBeInTheDocument();
      expect(screen.getByText(/This bug is already synced to Jira task/)).toBeInTheDocument();
      expect(screen.getByText(/PROJ-789/)).toBeInTheDocument();
    });

    it('cancels update when Cancel is clicked in dialog', () => {
      renderComponent(existingProps);

      fireEvent.click(screen.getByText('Update Jira'));
      fireEvent.click(screen.getByText('Cancel'));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(bugfixApi.syncBugFixWorkflowToJira).not.toHaveBeenCalled();
    });

    it('proceeds with update when confirmed', async () => {
      const mockResponse = {
        workflowId: 'workflow-123',
        jiraTaskKey: 'PROJ-789',
        jiraTaskURL: 'https://jira.example.com/browse/PROJ-789',
        created: false,
        syncedAt: '2025-10-31T14:00:00Z',
        message: 'Updated Jira task PROJ-789',
      };
      (bugfixApi.syncBugFixWorkflowToJira as any).mockResolvedValue(mockResponse);

      renderComponent(existingProps);

      fireEvent.click(screen.getByText('Update Jira'));
      fireEvent.click(screen.getByText('Update Jira Task'));

      expect(screen.getByText('Updating...')).toBeInTheDocument();

      await waitFor(() => {
        expect(bugfixApi.syncBugFixWorkflowToJira).toHaveBeenCalledWith('test-project', 'workflow-123');
      });

      await waitFor(() => {
        expect(successToast).toHaveBeenCalledWith('Updated Jira task PROJ-789');
      });
    });

    it('includes external link to Jira task', () => {
      renderComponent(existingProps);

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', 'https://jira.example.com/browse/PROJ-789');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('Error Handling', () => {
    it('shows error toast on sync failure', async () => {
      (bugfixApi.syncBugFixWorkflowToJira as any).mockRejectedValue(new Error('Jira API Error'));

      renderComponent();

      fireEvent.click(screen.getByText('Sync to Jira'));

      await waitFor(() => {
        expect(errorToast).toHaveBeenCalledWith('Jira API Error');
      });
    });

    it('shows generic error message when error has no message', async () => {
      (bugfixApi.syncBugFixWorkflowToJira as any).mockRejectedValue({});

      renderComponent();

      fireEvent.click(screen.getByText('Sync to Jira'));

      await waitFor(() => {
        expect(errorToast).toHaveBeenCalledWith('Failed to sync with Jira');
      });
    });
  });

  describe('Disabled State', () => {
    it('disables button when disabled prop is true', () => {
      renderComponent({ disabled: true });

      const button = screen.getByRole('button', { name: /Sync to Jira/i });
      expect(button).toBeDisabled();
    });

    it('disables button during sync operation', async () => {
      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      (bugfixApi.syncBugFixWorkflowToJira as any).mockReturnValue(promise);

      renderComponent();

      const button = screen.getByRole('button', { name: /Sync to Jira/i });
      fireEvent.click(button);

      expect(button).toBeDisabled();
      expect(screen.getByText('Syncing...')).toBeInTheDocument();

      // Resolve the promise
      resolvePromise!({
        workflowId: 'workflow-123',
        jiraTaskKey: 'PROJ-789',
        created: true,
        syncedAt: '2025-10-31T12:00:00Z',
        message: 'Created',
      });

      await waitFor(() => {
        expect(button).not.toBeDisabled();
      });
    });
  });

  describe('UI Details', () => {
    it('shows Note about Jira Issue Type in confirmation dialog', () => {
      renderComponent({
        jiraTaskKey: 'PROJ-789',
        jiraTaskURL: 'https://jira.example.com/browse/PROJ-789',
      });

      fireEvent.click(screen.getByText('Update Jira'));

      expect(screen.getByText(/Currently syncing as "Feature Request" type in Jira/)).toBeInTheDocument();
      expect(screen.getByText(/After the upcoming Jira Cloud migration/)).toBeInTheDocument();
    });

    it('shows update details in confirmation dialog', () => {
      renderComponent({
        jiraTaskKey: 'PROJ-789',
        jiraTaskURL: 'https://jira.example.com/browse/PROJ-789',
      });

      fireEvent.click(screen.getByText('Update Jira'));

      expect(screen.getByText(/Jira task description will be updated/)).toBeInTheDocument();
      expect(screen.getByText(/GitHub Issue link will remain connected/)).toBeInTheDocument();
      expect(screen.getByText(/bugfix\.md content will be added as a comment/)).toBeInTheDocument();
    });
  });
});