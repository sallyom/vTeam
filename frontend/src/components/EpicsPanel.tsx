import React, { useEffect, useState, useCallback } from 'react';
import {
  Alert,
  Badge,
  Button,
  Flex,
  FlexItem,
  Label,
  Modal,
  ModalVariant,
  PageSection,
  Progress,
  Spinner,
  Title,
  Tooltip,
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { ExclamationTriangleIcon, ClockIcon, ListIcon } from '@patternfly/react-icons';
import { Epic, Session, Story } from '../types/api';
import { apiService } from '../services/api';
import StoriesModal from './StoriesModal';

type EpicsPanelProps = {
  session: Session;
};

const EpicsPanel: React.FunctionComponent<EpicsPanelProps> = ({ session }) => {
  const [epics, setEpics] = useState<Epic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEpic, setSelectedEpic] = useState<Epic | null>(null);
  const [isStoriesModalOpen, setIsStoriesModalOpen] = useState(false);

  const loadEpics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getSessionEpics(session.id);
      setEpics(response.epics);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load epics');
    } finally {
      setLoading(false);
    }
  }, [session.id]);

  useEffect(() => {
    loadEpics();
  }, [loadEpics]);

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'done':
        return 'success';
      case 'in-progress':
        return 'warning';
      case 'cancelled':
        return 'danger';
      default:
        return 'info';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'todo':
        return 'To Do';
      case 'in-progress':
        return 'In Progress';
      case 'done':
        return 'Done';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'red';
      case 'high':
        return 'orange';
      case 'medium':
        return 'blue';
      case 'low':
        return 'grey';
      default:
        return 'blue';
    }
  };

  const calculateProgress = (epic: Epic) => {
    if (epic.stories.length === 0) return 0;
    const completedStories = epic.stories.filter((story) => story.status === 'done').length;
    return Math.round((completedStories / epic.stories.length) * 100);
  };

  const hasWarnings = (epic: Epic) => {
    // Check for overdue epics or other warning conditions
    if (epic.due_date) {
      const dueDate = new Date(epic.due_date);
      const now = new Date();
      if (dueDate < now && epic.status !== 'done') {
        return true;
      }
    }

    // Check if estimated hours are exceeded
    if (epic.estimated_hours && epic.actual_hours > epic.estimated_hours) {
      return true;
    }

    return false;
  };

  const handleViewStories = (epic: Epic) => {
    setSelectedEpic(epic);
    setIsStoriesModalOpen(true);
  };

  const formatHours = (hours: number | null) => {
    if (hours === null || hours === undefined) return '--';
    return `${Math.round(hours)}h`;
  };

  if (loading) {
    return (
      <PageSection>
        <Flex justifyContent={{ default: 'justifyContentCenter' }}>
          <Spinner size="lg" />
        </Flex>
      </PageSection>
    );
  }

  if (error) {
    return (
      <PageSection>
        <Alert variant="danger" title="Error loading epics">
          {error}
        </Alert>
      </PageSection>
    );
  }

  if (epics.length === 0) {
    return (
      <PageSection>
        <Flex
          direction={{ default: 'column' }}
          alignItems={{ default: 'alignItemsCenter' }}
          spaceItems={{ default: 'spaceItemsLg' }}
        >
          <FlexItem>
            <ListIcon size={48} color="var(--pf-global--Color--200)" />
          </FlexItem>
          <FlexItem>
            <div>
              <Title headingLevel="h3" size="md">
                No epics found
              </Title>
              <p>Epics will appear here after the JIRA drafting stage completes.</p>
            </div>
          </FlexItem>
        </Flex>
      </PageSection>
    );
  }

  return (
    <PageSection>
      <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsMd' }}>
        <FlexItem>
          <Title headingLevel="h2" size="lg">
            Epics & Stories
          </Title>
          <p>
            {epics.length} epic{epics.length !== 1 ? 's' : ''} •{' '}
            {epics.reduce((sum, epic) => sum + epic.stories.length, 0)} total stories
          </p>
        </FlexItem>

        <FlexItem>
          <Table>
            <Thead>
              <Tr>
                <Th>Epic</Th>
                <Th>Component Team</Th>
                <Th>Status</Th>
                <Th>Priority</Th>
                <Th>Progress</Th>
                <Th>Hours</Th>
                <Th>Stories</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {epics.map((epic) => {
                const progress = calculateProgress(epic);
                const warnings = hasWarnings(epic);

                return (
                  <Tr key={epic.id}>
                    <Td>
                      <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsXs' }}>
                        <FlexItem>
                          <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
                            <FlexItem>
                              <strong>{epic.title}</strong>
                            </FlexItem>
                            {warnings && (
                              <FlexItem>
                                <Tooltip content="Has warnings">
                                  <ExclamationTriangleIcon color="var(--pf-global--warning-color--100)" />
                                </Tooltip>
                              </FlexItem>
                            )}
                          </Flex>
                        </FlexItem>
                        {epic.description && (
                          <FlexItem>
                            <span style={{ color: 'var(--pf-global--Color--200)', fontSize: '0.875rem' }}>
                              {epic.description.length > 80
                                ? epic.description.substring(0, 80) + '...'
                                : epic.description}
                            </span>
                          </FlexItem>
                        )}
                      </Flex>
                    </Td>
                    <Td>
                      {epic.component_team ? (
                        <Badge>{epic.component_team}</Badge>
                      ) : (
                        <span style={{ color: 'var(--pf-global--Color--200)' }}>--</span>
                      )}
                    </Td>
                    <Td>
                      <Badge>{getStatusLabel(epic.status)}</Badge>
                    </Td>
                    <Td>
                      <Label color={getPriorityColor(epic.priority)}>{epic.priority}</Label>
                    </Td>
                    <Td>
                      <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsXs' }}>
                        <FlexItem>
                          <Progress value={progress} variant={progress === 100 ? 'success' : undefined} size="sm" />
                        </FlexItem>
                        <FlexItem>
                          <span style={{ fontSize: '0.75rem', color: 'var(--pf-global--Color--200)' }}>
                            {Math.round(progress)}% complete
                          </span>
                        </FlexItem>
                      </Flex>
                    </Td>
                    <Td>
                      <Flex spaceItems={{ default: 'spaceItemsXs' }} alignItems={{ default: 'alignItemsCenter' }}>
                        <ClockIcon size={16} />
                        <span style={{ fontSize: '0.875rem' }}>
                          {formatHours(epic.actual_hours)} / {formatHours(epic.estimated_hours)}
                        </span>
                      </Flex>
                    </Td>
                    <Td>
                      <span style={{ fontSize: '0.875rem' }}>{epic.stories.length} stories</span>
                    </Td>
                    <Td>
                      <Button variant="secondary" size="sm" onClick={() => handleViewStories(epic)}>
                        View stories
                      </Button>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </FlexItem>
      </Flex>

      {/* Stories Modal */}
      {selectedEpic && (
        <StoriesModal
          epic={selectedEpic}
          isOpen={isStoriesModalOpen}
          onClose={() => {
            setIsStoriesModalOpen(false);
            setSelectedEpic(null);
          }}
          onStoryUpdate={loadEpics} // Refresh epics when stories are updated
        />
      )}
    </PageSection>
  );
};

export default EpicsPanel;
