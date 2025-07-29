import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Flex, FlexItem, PageSection, Split, SplitItem, Title } from '@patternfly/react-core';
import { Session } from '../types/api';
import { apiService } from '../services/api';
import ChatPanel from './ChatPanel';
import OutputPanel from './OutputPanel';

const SessionManager: React.FunctionComponent = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <PageSection hasBodyWrapper={false} style={{ height: '100vh', overflow: 'hidden' }}>
      {selectedSession ? (
        <Split hasGutter>
          {/* Chat Panel - Left Side */}
          <SplitItem isFilled style={{ minWidth: '40%' }}>
            <ChatPanel session={selectedSession} />
          </SplitItem>

          {/* Output Panel - Right Side */}
          <SplitItem isFilled style={{ minWidth: '40%' }}>
            <OutputPanel session={selectedSession} />
          </SplitItem>
        </Split>
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
    </PageSection>
  );
};

export default SessionManager;
