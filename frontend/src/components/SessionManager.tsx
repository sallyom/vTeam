import * as React from 'react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardTitle,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  Gallery,
  GalleryItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalVariant,
  Page,
  PageSection,
  Spinner,
  TextInput,
  Title,
} from '@patternfly/react-core';
import { CheckCircleIcon, ExclamationCircleIcon, InProgressIcon, PlusIcon } from '@patternfly/react-icons';
import { simpleApiService } from '../services/simpleApi';

type SessionStatus = 'pending' | 'processing' | 'ready' | 'error';

interface Session {
  id: string;
  jira_key: string;
  status: SessionStatus;
  rag_store_ids: string[];
  created_at: string;
  updated_at: string;
  refinement_content?: string;
  jira_structure?: Record<string, unknown>;
  progress_message?: string;
  error_message?: string;
}

interface CreateSessionForm {
  jira_key: string;
  rag_store_ids: string[];
}

const SessionManager: React.FunctionComponent = () => {
  const [sessions, setSessions] = React.useState<Session[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string>('');
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [createForm, setCreateForm] = React.useState<CreateSessionForm>({
    jira_key: '',
    rag_store_ids: [],
  });
  const [createLoading, setCreateLoading] = React.useState(false);
  const [availableRagStores, setAvailableRagStores] = React.useState<string[]>([]);

  // Load sessions on component mount
  React.useEffect(() => {
    loadSessions();
    loadRagStores();
  }, []);

  const loadSessions = async () => {
    try {
      setLoading(true);
      console.log('SessionManager: Starting to load sessions...');
      const response = await simpleApiService.listSessions();
      console.log('SessionManager: Received response:', response);
      console.log('SessionManager: Response.sessions:', response.sessions);
      console.log('SessionManager: Response.sessions length:', response.sessions?.length);
      setSessions(response.sessions || []);
      setError('');
    } catch (err) {
      console.error('SessionManager: Failed to load sessions:', err);
      setError('Failed to load sessions. Please check if the API server is running.');
    } finally {
      setLoading(false);
    }
  };

  const loadRagStores = async () => {
    try {
      const response = await simpleApiService.listRagStores();
      setAvailableRagStores(response.stores?.map((store) => store.store_id) || []);
    } catch (err) {
      console.error('Failed to load RAG stores:', err);
    }
  };

  const handleCreateSession = async () => {
    if (!createForm.jira_key.trim()) {
      return;
    }

    try {
      setCreateLoading(true);
      await simpleApiService.createSession({
        jira_key: createForm.jira_key.trim(),
        rag_store_ids: createForm.rag_store_ids,
      });

      // Reset form and close modal
      setCreateForm({ jira_key: '', rag_store_ids: [] });
      setIsCreateModalOpen(false);

      // Reload sessions
      await loadSessions();
    } catch (err) {
      console.error('Failed to create session:', err);
      setError('Failed to create session. Please try again.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this session?')) {
      return;
    }

    try {
      await simpleApiService.deleteSession(sessionId);
      await loadSessions();
    } catch (err) {
      console.error('Failed to delete session:', err);
      setError('Failed to delete session. Please try again.');
    }
  };

  const getStatusIcon = (status: SessionStatus) => {
    switch (status) {
      case 'pending':
        return <InProgressIcon />;
      case 'processing':
        return <Spinner size="sm" />;
      case 'ready':
        return <CheckCircleIcon />;
      case 'error':
        return <ExclamationCircleIcon />;
      default:
        return null;
    }
  };

  const getStatusLabel = (status: SessionStatus) => {
    return (
      <span
        style={{
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          backgroundColor:
            status === 'ready'
              ? '#d4edda'
              : status === 'error'
                ? '#f8d7da'
                : status === 'processing'
                  ? '#fff3cd'
                  : '#d1ecf1',
          color:
            status === 'ready'
              ? '#155724'
              : status === 'error'
                ? '#721c24'
                : status === 'processing'
                  ? '#856404'
                  : '#0c5460',
        }}
      >
        {status.toUpperCase()}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const addRagStore = (store: string) => {
    if (!createForm.rag_store_ids.includes(store)) {
      setCreateForm({
        ...createForm,
        rag_store_ids: [...createForm.rag_store_ids, store],
      });
    }
  };

  const removeRagStore = (store: string) => {
    setCreateForm({
      ...createForm,
      rag_store_ids: createForm.rag_store_ids.filter((s) => s !== store),
    });
  };

  if (loading) {
    return (
      <Page>
        <PageSection isFilled>
          <EmptyState>
            <Spinner size="lg" />
            <Title headingLevel="h2" size="lg">
              Loading sessions...
            </Title>
          </EmptyState>
        </PageSection>
      </Page>
    );
  }

  return (
    <>
      {sessions.length === 0 ? (
        // Full page empty state without any page wrapper
        <div
          style={{
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--pf-v5-global--BackgroundColor--100)',
            padding: 'var(--pf-v5-global--spacer--xl)',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: '500px' }}>
            <EmptyState>
              <PlusIcon
                style={{
                  fontSize: '40px',
                  marginBottom: 'var(--pf-v5-global--spacer--md)',
                  color: 'var(--pf-v5-global--Color--200)',
                  display: 'block',
                  margin: '0 auto var(--pf-v5-global--spacer--md)',
                }}
              />
              <Title
                headingLevel="h1"
                size="xl"
                style={{ marginBottom: 'var(--pf-v5-global--spacer--md)', textAlign: 'center' }}
              >
                No sessions found
              </Title>
              <EmptyStateBody style={{ textAlign: 'center' }}>
                <p
                  style={{
                    fontSize: 'var(--pf-v5-global--FontSize--md)',
                    marginBottom: 'var(--pf-v5-global--spacer--sm)',
                    lineHeight: '1.5',
                  }}
                >
                  Create your first session to start planning features with AI assistance.
                </p>
                <p
                  style={{
                    color: 'var(--pf-v5-global--Color--200)',
                    fontSize: 'var(--pf-v5-global--FontSize--sm)',
                    lineHeight: '1.4',
                    marginBottom: 'var(--pf-v5-global--spacer--lg)',
                  }}
                >
                  Each session will help you analyze JIRA issues and generate comprehensive refinement documents.
                </p>
              </EmptyStateBody>
              <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
                Create Your First Session
              </Button>
            </EmptyState>
          </div>
        </div>
      ) : (
        // Normal page layout with sessions
        <Page>
          <PageSection>
            <Flex
              justifyContent={{ default: 'justifyContentSpaceBetween' }}
              alignItems={{ default: 'alignItemsFlexStart' }}
            >
              <FlexItem>
                <Title headingLevel="h1" size="2xl" style={{ marginBottom: 'var(--pf-v5-global--spacer--sm)' }}>
                  Sessions
                </Title>
                <p style={{ color: 'var(--pf-v5-global--Color--200)', margin: 0 }}>
                  Manage your feature planning sessions. Each session processes a JIRA issue and generates refinement
                  documents and implementation plans.
                </p>
              </FlexItem>
              <FlexItem>
                <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
                  Create Session
                </Button>
              </FlexItem>
            </Flex>
          </PageSection>

          <PageSection>
            {error && (
              <Alert
                variant="danger"
                title="Error"
                isInline
                style={{ marginBottom: 'var(--pf-v5-global--spacer--lg)' }}
              >
                {error}
              </Alert>
            )}

            <Card>
              <CardTitle>
                <Title headingLevel="h2" size="lg">
                  All Sessions ({sessions.length})
                </Title>
              </CardTitle>
              <CardBody>
                <Gallery hasGutter minWidths={{ default: '100%' }}>
                  {sessions.map((session) => (
                    <GalleryItem key={session.id}>
                      <Card isCompact>
                        <CardBody>
                          <Flex
                            justifyContent={{ default: 'justifyContentSpaceBetween' }}
                            alignItems={{ default: 'alignItemsCenter' }}
                            spaceItems={{ default: 'spaceItemsLg' }}
                          >
                            <FlexItem flex={{ default: 'flex_1' }}>
                              <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsSm' }}>
                                <FlexItem>
                                  <Flex
                                    alignItems={{ default: 'alignItemsCenter' }}
                                    spaceItems={{ default: 'spaceItemsSm' }}
                                  >
                                    <FlexItem>{getStatusIcon(session.status)}</FlexItem>
                                    <FlexItem>{getStatusLabel(session.status)}</FlexItem>
                                    <FlexItem>
                                      <Title headingLevel="h3" size="md">
                                        {session.jira_key}
                                      </Title>
                                    </FlexItem>
                                  </Flex>
                                </FlexItem>
                                {session.progress_message && (
                                  <FlexItem>
                                    <p
                                      style={{
                                        fontSize: 'var(--pf-v5-global--FontSize--sm)',
                                        color: 'var(--pf-v5-global--Color--200)',
                                        margin: 0,
                                      }}
                                    >
                                      {session.progress_message}
                                    </p>
                                  </FlexItem>
                                )}
                                {session.error_message && (
                                  <FlexItem>
                                    <p
                                      style={{
                                        fontSize: 'var(--pf-v5-global--FontSize--sm)',
                                        color: 'var(--pf-v5-global--danger-color--100)',
                                        margin: 0,
                                      }}
                                    >
                                      {session.error_message}
                                    </p>
                                  </FlexItem>
                                )}
                              </Flex>
                            </FlexItem>

                            <FlexItem flex={{ default: 'flex_1' }}>
                              <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsXs' }}>
                                <FlexItem>
                                  <p
                                    style={{
                                      fontSize: 'var(--pf-v5-global--FontSize--sm)',
                                      color: 'var(--pf-v5-global--Color--200)',
                                      margin: 0,
                                    }}
                                  >
                                    RAG Stores:
                                  </p>
                                </FlexItem>
                                <FlexItem>
                                  <Flex spaceItems={{ default: 'spaceItemsXs' }}>
                                    {session.rag_store_ids.length > 0 ? (
                                      session.rag_store_ids.map((store) => (
                                        <FlexItem key={store}>
                                          <span
                                            style={{
                                              padding: '2px 6px',
                                              backgroundColor: 'var(--pf-v5-global--palette--blue-50)',
                                              borderRadius: '4px',
                                              fontSize: 'var(--pf-v5-global--FontSize--xs)',
                                              border: '1px solid var(--pf-v5-global--palette--blue-200)',
                                            }}
                                          >
                                            {store}
                                          </span>
                                        </FlexItem>
                                      ))
                                    ) : (
                                      <FlexItem>
                                        <span
                                          style={{
                                            fontSize: 'var(--pf-v5-global--FontSize--sm)',
                                            color: 'var(--pf-v5-global--Color--200)',
                                            fontStyle: 'italic',
                                          }}
                                        >
                                          None
                                        </span>
                                      </FlexItem>
                                    )}
                                  </Flex>
                                </FlexItem>
                              </Flex>
                            </FlexItem>

                            <FlexItem>
                              <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsXs' }}>
                                <FlexItem>
                                  <p
                                    style={{
                                      fontSize: 'var(--pf-v5-global--FontSize--xs)',
                                      color: 'var(--pf-v5-global--Color--200)',
                                      margin: 0,
                                    }}
                                  >
                                    Created: {formatDate(session.created_at)}
                                  </p>
                                </FlexItem>
                                <FlexItem>
                                  <p
                                    style={{
                                      fontSize: 'var(--pf-v5-global--FontSize--xs)',
                                      color: 'var(--pf-v5-global--Color--200)',
                                      margin: 0,
                                    }}
                                  >
                                    Updated: {formatDate(session.updated_at)}
                                  </p>
                                </FlexItem>
                              </Flex>
                            </FlexItem>

                            <FlexItem>
                              <Flex spaceItems={{ default: 'spaceItemsSm' }}>
                                <FlexItem>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => window.open(`/?session=${session.id}`, '_blank')}
                                    isDisabled={session.status !== 'ready'}
                                  >
                                    View
                                  </Button>
                                </FlexItem>
                                <FlexItem>
                                  <Button variant="danger" size="sm" onClick={() => handleDeleteSession(session.id)}>
                                    Delete
                                  </Button>
                                </FlexItem>
                              </Flex>
                            </FlexItem>
                          </Flex>
                        </CardBody>
                      </Card>
                    </GalleryItem>
                  ))}
                </Gallery>
              </CardBody>
            </Card>
          </PageSection>
        </Page>
      )}

      {/* Create Session Modal */}
      <Modal
        variant={ModalVariant.medium}
        title="Create New Session"
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      >
        <ModalBody>
          <Form>
            <FormGroup label="JIRA Key" isRequired fieldId="jira-key">
              <TextInput
                isRequired
                type="text"
                id="jira-key"
                name="jira-key"
                value={createForm.jira_key}
                onChange={(_event, value) => setCreateForm({ ...createForm, jira_key: value })}
                placeholder="e.g., RHOAISTRAT-576"
              />
            </FormGroup>

            <FormGroup label="RAG Stores" fieldId="rag-stores">
              <p
                style={{
                  fontSize: 'var(--pf-v5-global--FontSize--sm)',
                  color: 'var(--pf-v5-global--Color--200)',
                  margin: '0 0 var(--pf-v5-global--spacer--sm) 0',
                }}
              >
                Select which knowledge bases to use for research (optional):
              </p>
              <Gallery hasGutter minWidths={{ default: '120px' }} maxWidths={{ default: '200px' }}>
                {availableRagStores.map((store) => (
                  <GalleryItem key={store}>
                    <Button
                      variant={createForm.rag_store_ids.includes(store) ? 'primary' : 'secondary'}
                      onClick={() =>
                        createForm.rag_store_ids.includes(store) ? removeRagStore(store) : addRagStore(store)
                      }
                      isBlock
                    >
                      {store}
                    </Button>
                  </GalleryItem>
                ))}
              </Gallery>
              {createForm.rag_store_ids.length > 0 && (
                <div style={{ marginTop: 'var(--pf-v5-global--spacer--sm)' }}>
                  <p
                    style={{
                      fontSize: 'var(--pf-v5-global--FontSize--sm)',
                      margin: '0 0 var(--pf-v5-global--spacer--xs) 0',
                    }}
                  >
                    <strong>Selected:</strong>
                  </p>
                  <Flex spaceItems={{ default: 'spaceItemsXs' }}>
                    {createForm.rag_store_ids.map((store) => (
                      <FlexItem key={store}>
                        <span
                          style={{
                            padding: '4px 8px',
                            backgroundColor: 'var(--pf-v5-global--palette--blue-50)',
                            borderRadius: '4px',
                            fontSize: 'var(--pf-v5-global--FontSize--sm)',
                            cursor: 'pointer',
                            border: '1px solid var(--pf-v5-global--palette--blue-200)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                          onClick={() => removeRagStore(store)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && removeRagStore(store)}
                        >
                          {store} ×
                        </span>
                      </FlexItem>
                    ))}
                  </Flex>
                </div>
              )}
            </FormGroup>
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={handleCreateSession}
            isDisabled={!createForm.jira_key.trim() || createLoading}
            isLoading={createLoading}
          >
            {createLoading ? 'Creating...' : 'Create Session'}
          </Button>
          <Button variant="link" onClick={() => setIsCreateModalOpen(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default SessionManager;
