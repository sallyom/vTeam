import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Dropdown,
  DropdownItem,
  DropdownList,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  FormGroup,
  List,
  ListItem,
  MenuToggle,
  MenuToggleElement,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Pagination,
  PaginationVariant,
  Spinner,
  TextInput,
  Title,
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { ChevronDownIcon, CubeIcon, PlusIcon, TrashIcon } from '@patternfly/react-icons';
import { CreateSessionRequest, Session, SessionStatus, VectorDBInfo } from '../types/api';
import { apiService } from '../services/api';
import { loadCustomPrompts } from '../services/localStorage';

type SessionSidebarProps = {
  selectedSession: Session | null;
  onSessionSelect: (session: Session) => void;
};

const getStatusColor = (status: SessionStatus): 'blue' | 'green' | 'red' | 'orange' | 'grey' => {
  switch (status) {
    case 'pending':
      return 'grey';
    case 'running':
      return 'blue';
    case 'completed':
      return 'green';
    case 'failed':
      return 'red';
    case 'cancelled':
      return 'orange';
    default:
      return 'grey';
  }
};

const SessionSidebar: React.FunctionComponent<SessionSidebarProps> = React.memo(
  ({ selectedSession, onSessionSelect }) => {
    const navigate = useNavigate();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(10);
    const [totalSessions, setTotalSessions] = useState(0);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [jiraKey, setJiraKey] = useState('');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    // Vector database selection state
    const [availableVectorDbs, setAvailableVectorDbs] = useState<VectorDBInfo[]>([]);
    const [selectedVectorDbIds, setSelectedVectorDbIds] = useState<string[]>([]);
    const [vectorDbDropdownOpen, setVectorDbDropdownOpen] = useState(false);
    const [loadingVectorDbs, setLoadingVectorDbs] = useState(false);

    const loadSessions = useCallback(
      async (currentPage: number = page, showLoader: boolean = false) => {
        try {
          if (showLoader) {
            setLoading(true);
          }
          setError(null);
          const response = await apiService.listSessions(currentPage, pageSize);

          // Only update state if data has actually changed
          if (JSON.stringify(response.sessions) !== JSON.stringify(sessions) || response.total !== totalSessions) {
            setSessions(response.sessions);
            setTotalSessions(response.total);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load sessions');
        } finally {
          if (showLoader) {
            setLoading(false);
          }
        }
      },
      [page, pageSize, sessions, totalSessions],
    );

    const loadVectorDatabases = useCallback(async () => {
      try {
        setLoadingVectorDbs(true);
        const response = await apiService.listVectorDatabases();
        setAvailableVectorDbs(response.vector_dbs);
      } catch (err) {
        console.error('Failed to load vector databases:', err);
      } finally {
        setLoadingVectorDbs(false);
      }
    }, []);

    const handleCreateSession = useCallback(async () => {
      if (!jiraKey.trim()) {
        setCreateError('JIRA key is required');
        return;
      }

      try {
        setCreating(true);
        setCreateError(null);

        // Load custom prompts from localStorage
        const customPrompts = loadCustomPrompts();
        const hasCustomPrompts = Object.keys(customPrompts).length > 0;

        const request: CreateSessionRequest = {
          jira_key: jiraKey.trim(),
          soft_mode: true,
          // Only include custom_prompts if there are any custom prompts
          ...(hasCustomPrompts && { custom_prompts: customPrompts }),
          // Include selected vector databases
          ...(selectedVectorDbIds.length > 0 && { vector_db_ids: selectedVectorDbIds }),
        };

        const newSession = await apiService.createSession(request);

        // Add the new session to the beginning of the list
        setSessions((prev) => [newSession, ...prev]);

        // Clear form and close modal
        setJiraKey('');
        setSelectedVectorDbIds([]);
        setShowCreateModal(false);

        // Select the new session
        onSessionSelect(newSession);
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : 'Failed to create session');
      } finally {
        setCreating(false);
      }
    }, [jiraKey, selectedVectorDbIds, onSessionSelect]);

    const handleDeleteSession = useCallback(
      async (sessionId: string, event: React.MouseEvent) => {
        event.stopPropagation();

        try {
          await apiService.deleteSession(sessionId);
          setSessions((prev) => prev.filter((s) => s.id !== sessionId));

          // If the deleted session was selected, clear selection
          if (selectedSession?.id === sessionId) {
            // Find the next available session to select, or null if none
            const remainingSessions = sessions.filter((s) => s.id !== sessionId);
            const nextSession = remainingSessions.length > 0 ? remainingSessions[0] : null;

            // This will trigger navigation to the next session or back to the main page
            if (nextSession) {
              onSessionSelect(nextSession);
            } else {
              // Navigate back to the main page when no sessions remain
              navigate('/');
            }
          }
        } catch (err) {
          console.error('Failed to delete session:', err);
        }
      },
      [selectedSession, sessions, navigate, onSessionSelect],
    );

    const handlePageChange = useCallback(
      (newPage: number) => {
        setPage(newPage);
        loadSessions(newPage, true); // Show loader for page changes
      },
      [loadSessions],
    );

    const handleVectorDbSelection = useCallback((vectorDbId: string, selected: boolean) => {
      setSelectedVectorDbIds((prev) => (selected ? [...prev, vectorDbId] : prev.filter((id) => id !== vectorDbId)));
    }, []);

    const handleRemoveVectorDb = useCallback((vectorDbId: string) => {
      setSelectedVectorDbIds((prev) => prev.filter((id) => id !== vectorDbId));
    }, []);

    const getSelectedVectorDbs = useCallback(() => {
      return availableVectorDbs.filter((db) => selectedVectorDbIds.includes(db.vector_db_id));
    }, [availableVectorDbs, selectedVectorDbIds]);

    useEffect(() => {
      loadSessions(page, true); // Show loader for initial load
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-refresh every 5 seconds when there are running sessions
    useEffect(() => {
      const hasRunningSessions = sessions.some((s) => s.status === 'running' || s.status === 'pending');

      if (hasRunningSessions) {
        const interval = setInterval(() => {
          loadSessions(page, false); // Don't show loader for auto-refresh
        }, 5000);

        return () => clearInterval(interval);
      }
      return undefined;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessions, page]);

    // Load vector databases when create modal opens
    useEffect(() => {
      if (showCreateModal) {
        loadVectorDatabases();
      }
    }, [showCreateModal, loadVectorDatabases]);

    // Component content directly

    return (
      <>
        <Flex
          direction={{ default: 'column' }}
          spaceItems={{ default: 'spaceItemsNone' }}
          style={{ height: '100vh', padding: '1rem' }}
        >
          <FlexItem>
            <Title headingLevel="h2" size="xl" style={{ marginBottom: '1rem' }}>
              JIRA RFE Sessions
            </Title>
          </FlexItem>

          <FlexItem>
            <Flex
              justifyContent={{ default: 'justifyContentSpaceBetween' }}
              alignItems={{ default: 'alignItemsCenter' }}
              style={{ marginBottom: '1rem' }}
            >
              <FlexItem>
                <Title headingLevel="h3" size="lg">
                  Sessions
                </Title>
              </FlexItem>
              <FlexItem>
                <Button variant="primary" icon={<PlusIcon />} onClick={() => setShowCreateModal(true)} size="sm">
                  New
                </Button>
              </FlexItem>
            </Flex>
          </FlexItem>

          <FlexItem flex={{ default: 'flex_1' }}>
            {loading ? (
              <Flex
                justifyContent={{ default: 'justifyContentCenter' }}
                alignItems={{ default: 'alignItemsCenter' }}
                style={{ height: '100%' }}
              >
                <Spinner size="md" />
              </Flex>
            ) : error ? (
              <Alert variant="danger" title="Error loading sessions" isInline>
                {error}
              </Alert>
            ) : sessions.length === 0 ? (
              <EmptyState>
                <EmptyState icon={CubeIcon} />
                <EmptyStateBody>No sessions yet. Create your first session to get started.</EmptyStateBody>
              </EmptyState>
            ) : (
              <List>
                {sessions.map((session) => (
                  <ListItem
                    key={session.id}
                    onClick={() => onSessionSelect(session)}
                    style={{
                      cursor: 'pointer',
                      backgroundColor:
                        selectedSession?.id === session.id
                          ? 'var(--pf-v5-global--BackgroundColor--200)'
                          : 'transparent',
                      padding: '0.75rem',
                      borderRadius: '4px',
                      border:
                        selectedSession?.id === session.id
                          ? '1px solid var(--pf-v5-global--BorderColor--100)'
                          : '1px solid transparent',
                      marginBottom: '0.25rem',
                    }}
                  >
                    <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsXs' }}>
                      <FlexItem>
                        <Flex
                          justifyContent={{ default: 'justifyContentSpaceBetween' }}
                          alignItems={{ default: 'alignItemsCenter' }}
                          flexWrap={{ default: 'nowrap' }}
                        >
                          <FlexItem>
                            <strong>{session.jira_key}</strong>
                          </FlexItem>
                          <FlexItem>
                            <Button
                              variant="plain"
                              icon={<TrashIcon />}
                              onClick={(e) => handleDeleteSession(session.id, e)}
                              size="sm"
                              aria-label="Delete session"
                            />
                          </FlexItem>
                        </Flex>
                      </FlexItem>
                      <FlexItem>
                        <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsXs' }}>
                          <FlexItem>
                            <Badge color={getStatusColor(session.status)}>{session.status}</Badge>
                          </FlexItem>
                          {session.current_stage && (
                            <FlexItem>
                              <Badge>{session.current_stage}</Badge>
                            </FlexItem>
                          )}
                        </Flex>
                      </FlexItem>
                      <FlexItem>
                        <small>
                          {session.started_at ? new Date(session.started_at).toLocaleString() : 'Not started'}
                        </small>
                      </FlexItem>
                    </Flex>
                  </ListItem>
                ))}
              </List>
            )}
          </FlexItem>

          {totalSessions > pageSize && (
            <FlexItem>
              <Pagination
                itemCount={totalSessions}
                perPage={pageSize}
                page={page}
                onSetPage={(_, newPage) => handlePageChange(newPage)}
                variant={PaginationVariant.bottom}
                isCompact
              />
            </FlexItem>
          )}
        </Flex>

        <Modal variant={ModalVariant.small} isOpen={showCreateModal} onClose={() => setShowCreateModal(false)}>
          <ModalHeader>
            <Title headingLevel="h2" size="xl">
              Create New Session
            </Title>
          </ModalHeader>
          <ModalBody>
            <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsMd' }}>
              {createError && (
                <FlexItem>
                  <Alert variant="danger" title="Error" isInline>
                    {createError}
                  </Alert>
                </FlexItem>
              )}

              <FlexItem>
                <FormGroup label="JIRA Key" isRequired fieldId="jira-key">
                  <TextInput
                    id="jira-key"
                    type="text"
                    value={jiraKey}
                    onChange={(_event, value) => setJiraKey(value)}
                    placeholder="e.g., RHOAI-1234"
                    isRequired
                  />
                </FormGroup>
              </FlexItem>

              <FlexItem>
                <Checkbox
                  id="soft-mode"
                  label="Soft Mode"
                  isDisabled
                  description="Soft mode will block any jira creation requests. This is useful for testing the system without creating actual jira tickets."
                  isChecked={true}
                />
              </FlexItem>

              <FlexItem>
                <FormGroup label="Vector Databases" fieldId="vector-databases">
                  <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsSm' }}>
                    <FlexItem>
                      <Dropdown
                        isOpen={vectorDbDropdownOpen}
                        onSelect={() => setVectorDbDropdownOpen(false)}
                        onOpenChange={(isOpen) => setVectorDbDropdownOpen(isOpen)}
                        toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                          <MenuToggle
                            ref={toggleRef}
                            onClick={() => setVectorDbDropdownOpen(!vectorDbDropdownOpen)}
                            isExpanded={vectorDbDropdownOpen}
                            isDisabled={loadingVectorDbs}
                            style={{ width: '100%' }}
                          >
                            {loadingVectorDbs ? 'Loading databases...' : 'Select Vector Databases'}
                            <ChevronDownIcon />
                          </MenuToggle>
                        )}
                      >
                        <DropdownList>
                          {availableVectorDbs.map((vectorDb) => (
                            <DropdownItem
                              key={vectorDb.vector_db_id}
                              onClick={(e) => e.stopPropagation()}
                              isDisabled={false}
                            >
                              <Checkbox
                                id={`vector-db-${vectorDb.vector_db_id}`}
                                label={`${vectorDb.name} (${vectorDb.document_count} docs, ${vectorDb.total_chunks} chunks)`}
                                isChecked={selectedVectorDbIds.includes(vectorDb.vector_db_id)}
                                onChange={(_event, checked) => handleVectorDbSelection(vectorDb.vector_db_id, checked)}
                                description={vectorDb.description}
                              />
                            </DropdownItem>
                          ))}
                          {availableVectorDbs.length === 0 && !loadingVectorDbs && (
                            <DropdownItem isDisabled>No vector databases available</DropdownItem>
                          )}
                        </DropdownList>
                      </Dropdown>
                    </FlexItem>

                    {selectedVectorDbIds.length > 0 && (
                      <FlexItem>
                        <Title headingLevel="h4" size="md">
                          Selected Databases ({selectedVectorDbIds.length})
                        </Title>
                        <Table variant="compact" borders={false}>
                          <Thead>
                            <Tr>
                              <Th>Database</Th>
                              <Th>Documents</Th>
                              <Th>Chunks</Th>
                              <Th>Use Case</Th>
                              <Th></Th>
                            </Tr>
                          </Thead>
                          <Tbody>
                            {getSelectedVectorDbs().map((vectorDb) => (
                              <Tr key={vectorDb.vector_db_id}>
                                <Td>
                                  <div>
                                    <strong>{vectorDb.name}</strong>
                                    {vectorDb.description && (
                                      <div style={{ fontSize: '0.875rem', color: 'var(--pf-v5-global--Color--200)' }}>
                                        {vectorDb.description}
                                      </div>
                                    )}
                                  </div>
                                </Td>
                                <Td>{vectorDb.document_count}</Td>
                                <Td>{vectorDb.total_chunks.toLocaleString()}</Td>
                                <Td>
                                  <Badge>{vectorDb.use_case}</Badge>
                                </Td>
                                <Td>
                                  <Button
                                    variant="plain"
                                    icon={<TrashIcon />}
                                    onClick={() => handleRemoveVectorDb(vectorDb.vector_db_id)}
                                    size="sm"
                                    aria-label={`Remove ${vectorDb.name}`}
                                  />
                                </Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      </FlexItem>
                    )}
                  </Flex>
                </FormGroup>
              </FlexItem>
            </Flex>
          </ModalBody>
          <ModalFooter>
            <Flex spaceItems={{ default: 'spaceItemsSm' }}>
              <FlexItem>
                <Button variant="primary" onClick={handleCreateSession} isLoading={creating} isDisabled={creating}>
                  Create Session
                </Button>
              </FlexItem>
              <FlexItem>
                <Button variant="link" onClick={() => setShowCreateModal(false)} isDisabled={creating}>
                  Cancel
                </Button>
              </FlexItem>
            </Flex>
          </ModalFooter>
        </Modal>
      </>
    );
  },
);

SessionSidebar.displayName = 'SessionSidebar';

export default SessionSidebar;
