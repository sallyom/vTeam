import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Flex,
  FlexItem,
  PageSection,
  Tab,
  TabTitleText,
  Tabs,
  TextArea,
  Title,
} from '@patternfly/react-core';
import { PaperPlaneIcon } from '@patternfly/react-icons';
import { ChatMessageRequest, Session } from '../types/api';
import { apiService } from '../services/api';
import ChatPanel from './ChatPanel';
import EpicsPanel from './EpicsPanel';
import RefinementPanel from './RefinementPanel';

const SessionManager: React.FunctionComponent = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTabKey, setActiveTabKey] = useState<string | number>(0);

  // Chat input state
  const [chatMessage, setChatMessage] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Chat functionality
  const sendChatMessage = useCallback(async () => {
    if (!selectedSession || !chatMessage.trim() || isSendingMessage) return;

    setIsSendingMessage(true);
    setChatError(null);

    try {
      const request: ChatMessageRequest = {
        message: chatMessage.trim(),
        context_type: getContextTypeForTab(activeTabKey),
      };

      await apiService.sendChatMessage(selectedSession.id, request);

      // Clear the input
      setChatMessage('');
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsSendingMessage(false);
    }
  }, [selectedSession, chatMessage, isSendingMessage, activeTabKey]);

  const handleKeyPress = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
      }
    },
    [sendChatMessage],
  );

  const getContextTypeForTab = (tabKey: string | number): string => {
    switch (tabKey) {
      case 0:
        return 'jiras';
      case 1:
        return 'refinement';
      case 2:
        return 'general';
      default:
        return 'general';
    }
  };

  const getPlaceholderForTab = (tabKey: string | number): string => {
    switch (tabKey) {
      case 0:
        return 'Ask about JIRAs, request changes to tickets, or update story points...';
      case 1:
        return 'Ask about the refinement document or request changes to requirements...';
      case 2:
        return 'Ask questions about the chat history or general topics...';
      default:
        return 'Ask a question or request changes...';
    }
  };

  // Load session when sessionId changes
  useEffect(() => {
    if (sessionId) {
      loadSession(sessionId);
    } else {
      setSelectedSession(null);
    }
  }, [sessionId]);

  const loadSession = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const session = await apiService.getSession(id);
      setSelectedSession(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session');
      setSelectedSession(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Flex
          direction={{ default: 'column' }}
          spaceItems={{ default: 'spaceItemsLg' }}
          alignItems={{ default: 'alignItemsCenter' }}
          justifyContent={{ default: 'justifyContentCenter' }}
          style={{ height: '100%' }}
        >
          <FlexItem>
            <Title headingLevel="h2" size="lg">
              Loading session...
            </Title>
          </FlexItem>
        </Flex>
      </PageSection>
    );
  }

  if (error) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Flex
          direction={{ default: 'column' }}
          spaceItems={{ default: 'spaceItemsLg' }}
          alignItems={{ default: 'alignItemsCenter' }}
          justifyContent={{ default: 'justifyContentCenter' }}
          style={{ height: '100%' }}
        >
          <FlexItem>
            <Alert variant="danger" title="Error loading session">
              {error}
            </Alert>
          </FlexItem>
        </Flex>
      </PageSection>
    );
  }

  const handleTabClick = (
    event: React.MouseEvent<unknown> | React.KeyboardEvent | MouseEvent,
    tabIndex: string | number,
  ) => {
    setActiveTabKey(tabIndex);
  };

  return (
    <>
      {selectedSession ? (
        <>
          {/* Header: Navigation Tabs */}
          <PageSection type="tabs" stickyOnBreakpoint={{ default: 'top' }}>
            <Tabs activeKey={activeTabKey} onSelect={handleTabClick}>
              <Tab eventKey={0} title={<TabTitleText>JIRAs</TabTitleText>} />
              <Tab eventKey={1} title={<TabTitleText>Refinement</TabTitleText>} />
              <Tab eventKey={2} title={<TabTitleText>Chat History</TabTitleText>} />
            </Tabs>
          </PageSection>

          {/* Body: Tab Content */}
          <PageSection isFilled>
            {activeTabKey === 0 && <EpicsPanel session={selectedSession} />}
            {activeTabKey === 1 && <RefinementPanel session={selectedSession} />}
            {activeTabKey === 2 && <ChatPanel session={selectedSession} />}
          </PageSection>

          {/* Footer: Chat Input */}
          <PageSection stickyOnBreakpoint={{ default: 'bottom' }}>
            {chatError && (
              <Alert variant="danger" title="Error sending message" style={{ marginBottom: '1rem' }}>
                {chatError}
              </Alert>
            )}
            <Flex alignItems={{ default: 'alignItemsFlexEnd' }} spaceItems={{ default: 'spaceItemsSm' }}>
              <FlexItem flex={{ default: 'flex_1' }}>
                <TextArea
                  value={chatMessage}
                  onChange={(_event, value) => setChatMessage(value)}
                  onKeyDown={handleKeyPress}
                  placeholder={getPlaceholderForTab(activeTabKey)}
                  rows={3}
                  isDisabled={isSendingMessage}
                  style={{ resize: 'none' }}
                />
              </FlexItem>
              <FlexItem>
                <Button
                  variant="primary"
                  onClick={sendChatMessage}
                  isDisabled={!chatMessage.trim() || isSendingMessage}
                  isLoading={isSendingMessage}
                  icon={<PaperPlaneIcon />}
                >
                  {isSendingMessage ? 'Sending...' : 'Send'}
                </Button>
              </FlexItem>
            </Flex>
          </PageSection>
        </>
      ) : (
        <Flex
          direction={{ default: 'column' }}
          spaceItems={{ default: 'spaceItemsLg' }}
          alignItems={{ default: 'alignItemsCenter' }}
          justifyContent={{ default: 'justifyContentCenter' }}
          style={{ height: '100%' }}
        >
          <FlexItem>
            <Title headingLevel="h1" size="2xl">
              JIRA RFE Session Manager
            </Title>
          </FlexItem>
          <FlexItem>
            <Alert variant="info" title="No session selected" isInline>
              Select a session from the sidebar to view its chat and output files, or create a new session to get
              started.
            </Alert>
          </FlexItem>
        </Flex>
      )}
    </>
  );
};

export default SessionManager;
