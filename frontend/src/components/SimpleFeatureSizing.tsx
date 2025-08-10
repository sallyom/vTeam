import React, { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardTitle,
  Form,
  FormGroup,
  Split,
  SplitItem,
  Stack,
  StackItem,
  Tab,
  TabTitleText,
  Tabs,
  TextArea,
  TextInput,
} from '@patternfly/react-core';
import {
  ChatMessage,
  ChatMessageRequest,
  CreateSessionRequest,
  RAGStoreInfo,
  SessionDetailResponse,
  simpleApi,
} from '../services/simpleApi';

const SimpleFeatureSizing: React.FC = () => {
  // State for session creation
  const [jiraKey, setJiraKey] = useState('');
  const [selectedRAGStores, setSelectedRAGStores] = useState<string[]>([]);
  const [existingRefinement, setExistingRefinement] = useState('');

  // State for current session
  const [currentSession, setCurrentSession] = useState<SessionDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for chat
  const [chatMessage, setChatMessage] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // State for RAG stores
  const [ragStores, setRAGStores] = useState<RAGStoreInfo[]>([]);

  // State for tabs
  const [activeTab, setActiveTab] = useState<string | number>('chat');

  // Load RAG stores on component mount
  useEffect(() => {
    loadRAGStores();
  }, []);

  const loadRAGStores = async () => {
    try {
      const response = await simpleApi.listRAGStores();
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

      const session = await simpleApi.createSession(request);

      // Poll for session updates
      pollSessionUpdates(session.id);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create session';
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  const pollSessionUpdates = async (sessionId: string) => {
    try {
      const session = await simpleApi.getSession(sessionId);
      setCurrentSession(session);

      // Continue polling if still processing
      if (session.status === 'processing' || session.status === 'pending') {
        setTimeout(() => pollSessionUpdates(sessionId), 2000);
      } else {
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Failed to fetch session:', error);
      setError('Failed to fetch session status. Please try again.');
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!chatMessage.trim() || !currentSession) return;

    setIsSendingMessage(true);

    try {
      const request: ChatMessageRequest = {
        message: chatMessage.trim(),
      };

      await simpleApi.sendChatMessage(currentSession.id, request);

      // Refresh session to get updated chat history
      const updatedSession = await simpleApi.getSession(currentSession.id);
      setCurrentSession(updatedSession);

      setChatMessage('');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      setError(errorMessage);
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleRAGStoreToggle = (selection: string) => {
    if (selectedRAGStores.includes(selection)) {
      setSelectedRAGStores(selectedRAGStores.filter((item) => item !== selection));
    } else {
      setSelectedRAGStores([...selectedRAGStores, selection]);
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
      <div
        key={message.id}
        style={{
          marginBottom: '1rem',
          padding: '0.75rem',
          borderRadius: '8px',
          backgroundColor: isUser ? '#f0f8ff' : isSystem ? '#f5f5f5' : '#fff',
          border: `1px solid ${isUser ? '#cce7ff' : isSystem ? '#ddd' : '#e1e1e1'}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <strong>{message.role === 'user' ? 'You' : message.role === 'agent' ? 'AI Agent' : 'System'}</strong>
          <small>{new Date(message.timestamp).toLocaleTimeString()}</small>
        </div>
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message.content}</div>
        {message.actions && message.actions.length > 0 && (
          <div style={{ marginTop: '0.5rem' }}>
            {message.actions.map((action) => (
              <Badge key={action} color="blue" style={{ marginRight: '0.25rem' }}>
                {action}
              </Badge>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (!currentSession) {
    return (
      <Card>
        <CardTitle>Create New Feature Sizing Session</CardTitle>
        <CardBody>
          <Form>
            <Stack hasGutter>
              <StackItem>
                <FormGroup label="JIRA Key" isRequired>
                  <TextInput
                    value={jiraKey}
                    onChange={(_event, value) => setJiraKey(value)}
                    placeholder="e.g., RHOAIENG-1234"
                  />
                </FormGroup>
              </StackItem>

              <StackItem>
                <FormGroup label="RAG Knowledge Stores">
                  <div>
                    <p>Available stores: {ragStores.map((store) => store.name).join(', ')}</p>
                    <p>Selected: {selectedRAGStores.join(', ') || 'None'}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                      {ragStores.map((store) => (
                        <Button
                          key={store.store_id}
                          variant={selectedRAGStores.includes(store.store_id) ? 'primary' : 'secondary'}
                          size="sm"
                          onClick={() => handleRAGStoreToggle(store.store_id)}
                        >
                          {store.name} ({store.document_count} docs)
                        </Button>
                      ))}
                    </div>
                  </div>
                </FormGroup>
              </StackItem>

              <StackItem>
                <FormGroup label="Existing Refinement Document (Optional)">
                  <TextArea
                    value={existingRefinement}
                    onChange={(_event, value) => setExistingRefinement(value)}
                    placeholder="Paste existing refinement document here if you have one..."
                    rows={5}
                  />
                </FormGroup>
              </StackItem>

              {error && (
                <StackItem>
                  <Alert variant="danger" title="Error">
                    {error}
                  </Alert>
                </StackItem>
              )}

              <StackItem>
                <Button
                  variant="primary"
                  onClick={handleCreateSession}
                  isLoading={isLoading}
                  isDisabled={isLoading || !jiraKey.trim()}
                >
                  {isLoading ? 'Processing Feature...' : 'Start Feature Sizing'}
                </Button>
              </StackItem>
            </Stack>
          </Form>
        </CardBody>
      </Card>
    );
  }

  return (
    <Stack hasGutter>
      {/* Session Header */}
      <StackItem>
        <Card>
          <CardBody>
            <Split hasGutter>
              <SplitItem>
                <strong>JIRA:</strong> {currentSession.jira_key}
              </SplitItem>
              <SplitItem>
                <Badge color={getStatusColor(currentSession.status)}>{currentSession.status.toUpperCase()}</Badge>
              </SplitItem>
              <SplitItem isFilled>
                {currentSession.progress_message && (
                  <span style={{ fontStyle: 'italic' }}>{currentSession.progress_message}</span>
                )}
              </SplitItem>
              <SplitItem>
                <Button variant="link" onClick={() => setCurrentSession(null)}>
                  New Session
                </Button>
              </SplitItem>
            </Split>
          </CardBody>
        </Card>
      </StackItem>

      {/* Main Content Tabs */}
      <StackItem>
        <Card>
          <CardBody>
            <Tabs activeKey={activeTab} onSelect={(_event, tabIndex) => setActiveTab(tabIndex)}>
              <Tab eventKey="chat" title={<TabTitleText>Chat</TabTitleText>}>
                <Stack hasGutter style={{ marginTop: '1rem' }}>
                  {/* Chat Messages */}
                  <StackItem>
                    <div
                      style={{
                        maxHeight: '400px',
                        overflowY: 'auto',
                        padding: '1rem',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                      }}
                    >
                      {currentSession.chat_history.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#666', fontStyle: 'italic' }}>
                          No messages yet. Start a conversation with the AI agent!
                        </div>
                      ) : (
                        currentSession.chat_history.map(renderChatMessage)
                      )}
                    </div>
                  </StackItem>

                  {/* Chat Input */}
                  <StackItem>
                    <Split hasGutter>
                      <SplitItem isFilled>
                        <TextArea
                          value={chatMessage}
                          onChange={(_event, value) => setChatMessage(value)}
                          placeholder="Ask the AI agent to modify the refinement, update JIRA structure, or answer questions..."
                          rows={3}
                        />
                      </SplitItem>
                      <SplitItem>
                        <Button
                          variant="primary"
                          onClick={handleSendMessage}
                          isLoading={isSendingMessage}
                          isDisabled={isSendingMessage || !chatMessage.trim()}
                        >
                          Send
                        </Button>
                      </SplitItem>
                    </Split>
                  </StackItem>
                </Stack>
              </Tab>

              <Tab eventKey="refinement" title={<TabTitleText>Refinement</TabTitleText>}>
                <div style={{ marginTop: '1rem' }}>
                  {currentSession.refinement_content ? (
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        padding: '1rem',
                        backgroundColor: '#f8f8f8',
                        borderRadius: '4px',
                        fontSize: '14px',
                      }}
                    >
                      {currentSession.refinement_content}
                    </pre>
                  ) : (
                    <div style={{ textAlign: 'center', color: '#666', fontStyle: 'italic', padding: '2rem' }}>
                      No refinement document available yet.
                    </div>
                  )}
                </div>
              </Tab>

              <Tab eventKey="jiras" title={<TabTitleText>JIRA Structure</TabTitleText>}>
                <div style={{ marginTop: '1rem' }}>
                  {currentSession.jira_structure ? (
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        padding: '1rem',
                        backgroundColor: '#f8f8f8',
                        borderRadius: '4px',
                        fontSize: '14px',
                      }}
                    >
                      {JSON.stringify(currentSession.jira_structure, null, 2)}
                    </pre>
                  ) : (
                    <div style={{ textAlign: 'center', color: '#666', fontStyle: 'italic', padding: '2rem' }}>
                      No JIRA structure available yet.
                    </div>
                  )}
                </div>
              </Tab>
            </Tabs>
          </CardBody>
        </Card>
      </StackItem>
    </Stack>
  );
};

export default SimpleFeatureSizing;
