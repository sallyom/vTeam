import React, { useState } from 'react';
import {
  Badge,
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Flex,
  FlexItem,
  Label,
  Modal,
  ModalVariant,
  Title,
  Tooltip,
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import {
  ClockIcon,
  ExclamationTriangleIcon,
  UserIcon,
  CheckCircleIcon,
  InProgressIcon,
  PendingIcon,
} from '@patternfly/react-icons';
import { Epic, Story } from '../types/api';

type StoriesModalProps = {
  epic: Epic;
  isOpen: boolean;
  onClose: () => void;
  onStoryUpdate?: () => void;
};

const StoriesModal: React.FunctionComponent<StoriesModalProps> = ({ epic, isOpen, onClose, onStoryUpdate }) => {
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);

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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'done':
        return <CheckCircleIcon color="var(--pf-global--success-color--100)" />;
      case 'in-progress':
        return <InProgressIcon color="var(--pf-global--warning-color--100)" />;
      default:
        return <PendingIcon color="var(--pf-global--info-color--100)" />;
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

  const formatHours = (hours: number | null) => {
    if (hours === null || hours === undefined) return '--';
    return `${Math.round(hours)}h`;
  };

  const formatStoryPoints = (points: number | null) => {
    if (points === null || points === undefined) return '--';
    return `${points} pts`;
  };

  const hasWarnings = (story: Story) => {
    // Check if story is overdue
    if (story.due_date) {
      const dueDate = new Date(story.due_date);
      const now = new Date();
      if (dueDate < now && story.status !== 'done') {
        return true;
      }
    }

    // Check if estimated hours are exceeded
    if (story.estimated_hours && story.actual_hours > story.estimated_hours) {
      return true;
    }

    return false;
  };

  const completedStories = epic.stories.filter((story) => story.status === 'done').length;
  const totalStoryPoints = epic.stories.reduce((sum, story) => sum + (story.story_points || 0), 0);
  const completedStoryPoints = epic.stories
    .filter((story) => story.status === 'done')
    .reduce((sum, story) => sum + (story.story_points || 0), 0);

  return (
    <Modal variant={ModalVariant.large} title="" isOpen={isOpen} onClose={onClose}>
      <div style={{ padding: '1.5rem' }}>
        <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsLg' }}>
          {/* Epic Header */}
          <FlexItem>
            <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsSm' }}>
              <FlexItem>
                <Title headingLevel="h2" size="xl">
                  {epic.title}
                </Title>
              </FlexItem>
              <FlexItem>
                <Flex spaceItems={{ default: 'spaceItemsSm' }}>
                  <FlexItem>
                    <Badge>{getStatusLabel(epic.status)}</Badge>
                  </FlexItem>
                  <FlexItem>
                    <Label color={getPriorityColor(epic.priority)}>{epic.priority}</Label>
                  </FlexItem>
                </Flex>
              </FlexItem>
              {epic.description && (
                <FlexItem>
                  <p style={{ color: 'var(--pf-global--Color--200)' }}>{epic.description}</p>
                </FlexItem>
              )}
              <FlexItem>
                <Flex spaceItems={{ default: 'spaceItemsLg' }}>
                  <FlexItem>
                    <span style={{ fontSize: '0.875rem' }}>
                      <strong>Progress:</strong> {completedStories} of {epic.stories.length} stories completed
                    </span>
                  </FlexItem>
                  <FlexItem>
                    <span style={{ fontSize: '0.875rem' }}>
                      <strong>Story Points:</strong> {completedStoryPoints} / {totalStoryPoints}
                    </span>
                  </FlexItem>
                  <FlexItem>
                    <span style={{ fontSize: '0.875rem' }}>
                      <strong>Effort:</strong> {formatHours(epic.actual_hours)} / {formatHours(epic.estimated_hours)}
                    </span>
                  </FlexItem>
                </Flex>
              </FlexItem>
            </Flex>
          </FlexItem>

          {/* Stories List */}
          <FlexItem>
            <Title headingLevel="h3" size="lg">
              Stories ({epic.stories.length})
            </Title>
          </FlexItem>

          {epic.stories.length === 0 ? (
            <FlexItem>
              <p style={{ textAlign: 'center', color: 'var(--pf-global--Color--200)' }}>
                No stories found for this epic.
              </p>
            </FlexItem>
          ) : (
            <FlexItem>
              <Table>
                <Thead>
                  <Tr>
                    <Th>Status</Th>
                    <Th>Title</Th>
                    <Th>Points</Th>
                    <Th>Hours</Th>
                    <Th>Assignee</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {epic.stories.map((story) => {
                    const warnings = hasWarnings(story);

                    return (
                      <React.Fragment key={story.id}>
                        <Tr>
                          <Td>
                            <Flex spaceItems={{ default: 'spaceItemsXs' }} alignItems={{ default: 'alignItemsCenter' }}>
                              <FlexItem>{getStatusIcon(story.status)}</FlexItem>
                              <FlexItem>
                                <Badge>{getStatusLabel(story.status)}</Badge>
                              </FlexItem>
                              {warnings && (
                                <FlexItem>
                                  <Tooltip content="Has warnings">
                                    <ExclamationTriangleIcon color="var(--pf-global--warning-color--100)" />
                                  </Tooltip>
                                </FlexItem>
                              )}
                            </Flex>
                          </Td>
                          <Td>
                            <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>{story.title}</div>
                            {story.description && (
                              <div style={{ color: 'var(--pf-global--Color--200)', fontSize: '0.875rem' }}>
                                {story.description.length > 60
                                  ? `${story.description.substring(0, 60)}...`
                                  : story.description}
                              </div>
                            )}
                          </Td>
                          <Td>{story.story_points ? <Label>{formatStoryPoints(story.story_points)}</Label> : '--'}</Td>
                          <Td>
                            <Flex spaceItems={{ default: 'spaceItemsXs' }} alignItems={{ default: 'alignItemsCenter' }}>
                              <FlexItem>
                                <ClockIcon size={16} />
                              </FlexItem>
                              <FlexItem>
                                <span style={{ fontSize: '0.875rem' }}>
                                  {formatHours(story.actual_hours)} / {formatHours(story.estimated_hours)}
                                </span>
                              </FlexItem>
                            </Flex>
                          </Td>
                          <Td>
                            {story.assignee ? (
                              <Flex
                                spaceItems={{ default: 'spaceItemsXs' }}
                                alignItems={{ default: 'alignItemsCenter' }}
                              >
                                <FlexItem>
                                  <UserIcon size={16} />
                                </FlexItem>
                                <FlexItem>
                                  <span style={{ fontSize: '0.875rem' }}>{story.assignee}</span>
                                </FlexItem>
                              </Flex>
                            ) : (
                              '--'
                            )}
                          </Td>
                          <Td>
                            {story.description && (
                              <Button
                                variant="link"
                                isInline
                                onClick={() => setSelectedStory(selectedStory?.id === story.id ? null : story)}
                                style={{ padding: 0, fontSize: 'var(--pf-global--FontSize--sm)' }}
                              >
                                {selectedStory?.id === story.id ? 'Hide details' : 'Show details'}
                              </Button>
                            )}
                          </Td>
                        </Tr>
                        {selectedStory?.id === story.id && story.description && (
                          <Tr>
                            <Td colSpan={6}>
                              <div
                                style={{
                                  padding: '1rem',
                                  backgroundColor: 'var(--pf-global--BackgroundColor--150)',
                                  borderRadius: '4px',
                                  margin: '0.5rem 0',
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: '0.875rem',
                                    whiteSpace: 'pre-wrap',
                                    lineHeight: '1.5',
                                  }}
                                  dangerouslySetInnerHTML={{
                                    __html: story.description
                                      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                                      .replace(/\*([^*]+?)\*/g, '<em>$1</em>')
                                      .replace(/\n/g, '<br/>'),
                                  }}
                                />
                              </div>
                            </Td>
                          </Tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </Tbody>
              </Table>
            </FlexItem>
          )}
        </Flex>
      </div>
    </Modal>
  );
};

export default StoriesModal;
