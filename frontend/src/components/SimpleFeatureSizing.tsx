import React, { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  MenuToggle,
  MenuToggleElement,
  PageSection,
  Select,
  SelectList,
  SelectOption,
  Stack,
  StackItem,
  Tab,
  TabTitleText,
  Tabs,
  TextArea,
  TextInput,
  Title,
} from '@patternfly/react-core';
import {
  ChatMessage,
  ChatMessageRequest,
  CreateSessionRequest,
  RAGStoreInfo,
  SessionDetailResponse,
  simpleApiService,
} from '../services/simpleApi';

const SimpleFeatureSizing: React.FC = () => {
  // State for session creation
  const [jiraKey, setJiraKey] = useState('');
  const [selectedRAGStores, setSelectedRAGStores] = useState<string[]>([]);
  const [existingRefinement, setExistingRefinement] = useState('');
  const [isRAGSelectOpen, setIsRAGSelectOpen] = useState(false);

  // State for current session
  const [currentSession, setCurrentSession] = useState<SessionDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for chat
  const [chatMessage, setChatMessage] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // State for real-time updates
  const [isPolling, setIsPolling] = useState(false);
  const [lastMessageCount, setLastMessageCount] = useState(0);

  // State for RAG stores
  const [ragStores, setRAGStores] = useState<RAGStoreInfo[]>([]);

  // State for tabs
  const [activeTab, setActiveTab] = useState<string | number>('chat');

  // Load RAG stores on component mount
  useEffect(() => {
    loadRAGStores();
  }, []);

  // Polling effect for real-time updates when session is processing
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (currentSession?.status !== 'processing') {
        return;
      }

      setIsPolling(true);
      intervalId = setInterval(async () => {
        try {
          const updates = await simpleApiService.getSessionUpdates(currentSession.id, lastMessageCount);

          if (updates.has_updates) {
            // Update session info
            setCurrentSession((prev) =>
              prev
                ? {
                    ...prev,
                    ...updates.session,
                    chat_history: [...prev.chat_history, ...updates.new_messages],
                  }
                : null,
            );

            // Update message count
            setLastMessageCount(updates.total_messages);
          }

          // Stop polling if session is no longer processing
          if (updates.session.status !== 'processing') {
            setIsPolling(false);
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
          }
        } catch (error) {
          console.error('Failed to get session updates:', error);
        }
      }, 1000); // Poll every second
    };

    if (currentSession?.status === 'processing') {
      startPolling();
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      setIsPolling(false);
    };
  }, [currentSession?.id, currentSession?.status, lastMessageCount]);

  const loadRAGStores = async () => {
    try {
      const response = await simpleApiService.listRagStores();
      setRAGStores(response.stores);
    } catch (error) {
      console.error('Failed to load RAG stores:', error);
      setError('Failed to load available RAG stores. Please refresh the page.');
    }
  };

  const handleCreateSession = async () => {
    if (!jiraKey.trim()) {
      setError('JIRA key is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const request: CreateSessionRequest = {
        jira_key: jiraKey.trim(),
        rag_store_ids: selectedRAGStores,
        existing_refinement: existingRefinement.trim() || undefined,
      };

      const session = await simpleApiService.createSession(request);

      // Initialize session and start polling
      const fullSession = await simpleApiService.getSession(session.id);
      setCurrentSession(fullSession);
      setLastMessageCount(fullSession.chat_history.length);

      // The useEffect will handle polling automatically when status is 'processing'
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create session';
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  // Stop loading when session is no longer processing
  useEffect(() => {
    if (currentSession?.status !== 'processing' && currentSession?.status !== 'pending') {
      setIsLoading(false);
    }
  }, [currentSession?.status]);

  const handleSendMessage = async () => {
    if (!chatMessage.trim() || !currentSession) return;

    setIsSendingMessage(true);

    try {
      const request: ChatMessageRequest = {
        message: chatMessage.trim(),
      };

      await simpleApiService.sendChatMessage(currentSession.id, request);

      // Refresh session to get updated chat history
      const updatedSession = await simpleApiService.getSession(currentSession.id);
      setCurrentSession(updatedSession);

      setChatMessage('');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      setError(errorMessage);
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleRAGStoreSelect = (
    _event: React.MouseEvent<Element, MouseEvent> | undefined,
    selection: string | number | undefined,
  ) => {
    const value = selection as string;
    if (selectedRAGStores.includes(value)) {
      setSelectedRAGStores(selectedRAGStores.filter((item) => item !== value));
    } else {
      setSelectedRAGStores([...selectedRAGStores, value]);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready':
        return 'green';
      case 'processing':
        return 'blue';
      case 'error':
        return 'red';
      default:
        return 'grey';
    }
  };

  const renderChatMessage = (message: ChatMessage) => {
    const isUser = message.role === 'user';
    const isSystem = message.role === 'system';

    return (
      <Card
        key={message.id}
        isCompact
        style={{
          backgroundColor: isUser
            ? 'var(--pf-v5-global--palette--blue-50)'
            : isSystem
              ? 'var(--pf-v5-global--palette--gray-50)'
              : 'var(--pf-v5-global--BackgroundColor--100)',
          border: `1px solid ${
            isUser
              ? 'var(--pf-v5-global--palette--blue-200)'
              : isSystem
                ? 'var(--pf-v5-global--palette--gray-200)'
                : 'var(--pf-v5-global--BorderColor--100)'
          }`,
        }}
      >
        <CardBody>
          <Stack hasGutter>
            <StackItem>
              <Flex
                justifyContent={{ default: 'justifyContentSpaceBetween' }}
                alignItems={{ default: 'alignItemsCenter' }}
              >
                <FlexItem>
                  <p style={{ fontSize: 'var(--pf-v5-global--FontSize--sm)', margin: 0 }}>
                    <strong>
                      {message.role === 'user' ? 'You' : message.role === 'agent' ? 'AI Agent' : 'System'}
                    </strong>
                  </p>
                </FlexItem>
                <FlexItem>
                  <p
                    style={{
                      color: 'var(--pf-v5-global--Color--200)',
                      fontSize: 'var(--pf-v5-global--FontSize--sm)',
                      margin: 0,
                    }}
                  >
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </p>
                </FlexItem>
              </Flex>
            </StackItem>
            <StackItem>
              <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>{message.content}</p>
            </StackItem>
            {message.actions && message.actions.length > 0 && (
              <StackItem>
                <Flex spaceItems={{ default: 'spaceItemsXs' }}>
                  {message.actions.map((action) => (
                    <FlexItem key={action}>
                      <Badge color="blue">{action}</Badge>
                    </FlexItem>
                  ))}
                </Flex>
              </StackItem>
            )}
          </Stack>
        </CardBody>
      </Card>
    );
  };

  if (!currentSession) {
    return (
      <PageSection>
        <Card isCompact>
          <CardBody>
            <Stack hasGutter>
              <StackItem>
                <Title headingLevel="h1" size="lg">
                  Create New Feature Sizing Session
                </Title>
              </StackItem>

              <StackItem>
                <Form>
                  <Stack hasGutter>
                    <StackItem>
                      <Flex spaceItems={{ default: 'spaceItemsMd' }}>
                        <FlexItem flex={{ default: 'flex_1' }}>
                          <FormGroup label="JIRA Key" isRequired fieldId="jira-key">
                            <TextInput
                              id="jira-key"
                              value={jiraKey}
                              onChange={(_event, value) => setJiraKey(value)}
                              placeholder="e.g., RHOAIENG-1234"
                            />
                          </FormGroup>
                        </FlexItem>
                        <FlexItem flex={{ default: 'flex_1' }}>
                          <FormGroup label="RAG Knowledge Stores" fieldId="rag-stores">
                            <Select
                              role="menu"
                              id="rag-stores-select"
                              isOpen={isRAGSelectOpen}
                              selected={selectedRAGStores}
                              onSelect={handleRAGStoreSelect}
                              onOpenChange={(nextOpen: boolean) => setIsRAGSelectOpen(nextOpen)}
                              toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                                <MenuToggle
                                  ref={toggleRef}
                                  onClick={() => setIsRAGSelectOpen(!isRAGSelectOpen)}
                                  isExpanded={isRAGSelectOpen}
                                  style={{ width: '100%' }}
                                >
                                  {selectedRAGStores.length === 0
                                    ? 'Select RAG stores...'
                                    : `${selectedRAGStores.length} store${selectedRAGStores.length > 1 ? 's' : ''} selected`}
                                </MenuToggle>
                              )}
                            >
                              <SelectList>
                                {ragStores.map((store) => (
                                  <SelectOption
                                    key={store.store_id}
                                    value={store.store_id}
                                    isSelected={selectedRAGStores.includes(store.store_id)}
                                  >
                                    <Flex
                                      spaceItems={{ default: 'spaceItemsSm' }}
                                      alignItems={{ default: 'alignItemsCenter' }}
                                    >
                                      <FlexItem>{store.name}</FlexItem>
                                      <FlexItem>
                                        <Badge isRead={store.document_count === 0}>{store.document_count} docs</Badge>
                                      </FlexItem>
                                    </Flex>
                                  </SelectOption>
                                ))}
                              </SelectList>
                            </Select>
                          </FormGroup>
                        </FlexItem>
                      </Flex>
                    </StackItem>

                    <StackItem>
                      <FormGroup label="Existing Refinement Document (Optional)" fieldId="existing-refinement">
                        <TextArea
                          id="existing-refinement"
                          value={existingRefinement}
                          onChange={(_event, value) => setExistingRefinement(value)}
                          placeholder="Paste existing refinement document here if you have one..."
                          rows={4}
                        />
                      </FormGroup>
                    </StackItem>

                    {error && (
                      <StackItem>
                        <Alert variant="danger" title="Error" isInline>
                          {error}
                        </Alert>
                      </StackItem>
                    )}

                    <StackItem>
                      <Flex justifyContent={{ default: 'justifyContentFlexEnd' }}>
                        <FlexItem>
                          <Button
                            variant="primary"
                            onClick={handleCreateSession}
                            isLoading={isLoading}
                            isDisabled={isLoading || !jiraKey.trim()}
                          >
                            {isLoading ? 'Processing Feature...' : 'Start Feature Sizing'}
                          </Button>
                        </FlexItem>
                      </Flex>
                    </StackItem>
                  </Stack>
                </Form>
              </StackItem>
            </Stack>
          </CardBody>
        </Card>
      </PageSection>
    );
  }

  return (
    <PageSection>
      <Stack hasGutter>
        {/* Session Header */}
        <StackItem>
          <Card isCompact>
            <CardBody>
              <Flex
                justifyContent={{ default: 'justifyContentSpaceBetween' }}
                alignItems={{ default: 'alignItemsCenter' }}
              >
                <FlexItem>
                  <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
                    <FlexItem>
                      <Title headingLevel="h2" size="md">
                        {currentSession.jira_key}
                      </Title>
                    </FlexItem>
                    <FlexItem>
                      <Badge color={getStatusColor(currentSession.status)}>{currentSession.status.toUpperCase()}</Badge>
                    </FlexItem>
                    {currentSession.progress_message && (
                      <FlexItem>
                        <p
                          style={{
                            fontStyle: 'italic',
                            color: 'var(--pf-v5-global--Color--200)',
                            fontSize: 'var(--pf-v5-global--FontSize--sm)',
                            margin: 0,
                          }}
                        >
                          {currentSession.progress_message}
                        </p>
                      </FlexItem>
                    )}
                    {isPolling && (
                      <FlexItem>
                        <p
                          style={{
                            fontStyle: 'italic',
                            color: 'var(--pf-v5-global--palette--blue-300)',
                            fontSize: 'var(--pf-v5-global--FontSize--sm)',
                            margin: 0,
                          }}
                        >
                          🔄 Live updates active
                        </p>
                      </FlexItem>
                    )}
                  </Flex>
                </FlexItem>
                <FlexItem>
                  <Button variant="secondary" size="sm" onClick={() => setCurrentSession(null)}>
                    New Session
                  </Button>
                </FlexItem>
              </Flex>
            </CardBody>
          </Card>
        </StackItem>

        {/* Main Content Tabs */}
        <StackItem>
          <Card>
            <CardBody>
              <Tabs activeKey={activeTab} onSelect={(_event, tabIndex) => setActiveTab(tabIndex)}>
                <Tab eventKey="chat" title={<TabTitleText>Chat</TabTitleText>}>
                  <Stack hasGutter style={{ marginTop: 'var(--pf-v5-global--spacer--md)' }}>
                    {/* Chat Messages */}
                    <StackItem>
                      <Card>
                        <CardBody style={{ maxHeight: '400px', overflowY: 'auto' }}>
                          {currentSession.chat_history.length === 0 ? (
                            <Flex
                              justifyContent={{ default: 'justifyContentCenter' }}
                              alignItems={{ default: 'alignItemsCenter' }}
                              style={{ minHeight: '200px' }}
                            >
                              <FlexItem>
                                <p
                                  style={{
                                    textAlign: 'center',
                                    color: 'var(--pf-v5-global--Color--200)',
                                    fontStyle: 'italic',
                                    margin: 0,
                                  }}
                                >
                                  No messages yet. Start a conversation with the AI agent!
                                </p>
                              </FlexItem>
                            </Flex>
                          ) : (
                            <Stack hasGutter>
                              {currentSession.chat_history.map((message) => (
                                <StackItem key={message.id}>{renderChatMessage(message)}</StackItem>
                              ))}
                            </Stack>
                          )}
                        </CardBody>
                      </Card>
                    </StackItem>

                    {/* Chat Input */}
                    <StackItem>
                      <Card>
                        <CardBody>
                          <Form>
                            <FormGroup fieldId="chat-input">
                              <Flex
                                alignItems={{ default: 'alignItemsFlexEnd' }}
                                spaceItems={{ default: 'spaceItemsMd' }}
                              >
                                <FlexItem flex={{ default: 'flex_1' }}>
                                  <TextArea
                                    id="chat-input"
                                    value={chatMessage}
                                    onChange={(_event, value) => setChatMessage(value)}
                                    placeholder="Ask the AI agent to modify the refinement, update JIRA structure, or answer questions..."
                                    rows={3}
                                  />
                                </FlexItem>
                                <FlexItem>
                                  <Button
                                    variant="primary"
                                    onClick={handleSendMessage}
                                    isLoading={isSendingMessage}
                                    isDisabled={isSendingMessage || !chatMessage.trim()}
                                  >
                                    Send
                                  </Button>
                                </FlexItem>
                              </Flex>
                            </FormGroup>
                          </Form>
                        </CardBody>
                      </Card>
                    </StackItem>
                  </Stack>
                </Tab>

                <Tab eventKey="refinement" title={<TabTitleText>Refinement</TabTitleText>}>
                  <Stack hasGutter style={{ marginTop: 'var(--pf-v5-global--spacer--md)' }}>
                    <StackItem>
                      {currentSession.refinement_content ? (
                        <Card>
                          <CardBody>
                            <pre
                              style={{
                                whiteSpace: 'pre-wrap',
                                fontSize: '14px',
                                margin: 0,
                                fontFamily: 'var(--pf-v5-global--FontFamily--monospace)',
                              }}
                            >
                              {currentSession.refinement_content}
                            </pre>
                          </CardBody>
                        </Card>
                      ) : (
                        <Card>
                          <CardBody>
                            <Flex
                              justifyContent={{ default: 'justifyContentCenter' }}
                              alignItems={{ default: 'alignItemsCenter' }}
                              style={{ minHeight: '200px' }}
                            >
                              <FlexItem>
                                <p
                                  style={{
                                    textAlign: 'center',
                                    color: 'var(--pf-v5-global--Color--200)',
                                    fontStyle: 'italic',
                                    margin: 0,
                                  }}
                                >
                                  No refinement document available yet.
                                </p>
                              </FlexItem>
                            </Flex>
                          </CardBody>
                        </Card>
                      )}
                    </StackItem>
                  </Stack>
                </Tab>

                <Tab eventKey="jiras" title={<TabTitleText>JIRA Structure</TabTitleText>}>
                  <Stack hasGutter style={{ marginTop: 'var(--pf-v5-global--spacer--md)' }}>
                    <StackItem>
                      {currentSession.jira_structure ? (
                        <Card>
                          <CardBody>
                            <pre
                              style={{
                                whiteSpace: 'pre-wrap',
                                fontSize: '14px',
                                margin: 0,
                                fontFamily: 'var(--pf-v5-global--FontFamily--monospace)',
                              }}
                            >
                              {JSON.stringify(currentSession.jira_structure, null, 2)}
                            </pre>
                          </CardBody>
                        </Card>
                      ) : (
                        <Card>
                          <CardBody>
                            <Flex
                              justifyContent={{ default: 'justifyContentCenter' }}
                              alignItems={{ default: 'alignItemsCenter' }}
                              style={{ minHeight: '200px' }}
                            >
                              <FlexItem>
                                <p
                                  style={{
                                    textAlign: 'center',
                                    color: 'var(--pf-v5-global--Color--200)',
                                    fontStyle: 'italic',
                                    margin: 0,
                                  }}
                                >
                                  No JIRA structure available yet.
                                </p>
                              </FlexItem>
                            </Flex>
                          </CardBody>
                        </Card>
                      )}
                    </StackItem>
                  </Stack>
                </Tab>
              </Tabs>
            </CardBody>
          </Card>
        </StackItem>
      </Stack>
    </PageSection>
  );
};

export default SimpleFeatureSizing;
