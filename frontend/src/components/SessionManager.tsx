import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
  Flex,
  FlexItem,
  PageSection,
  Split,
  SplitItem,
  Tab,
  Tabs,
  TabTitleText,
  Title,
} from '@patternfly/react-core';
import { Session } from '../types/api';
import { apiService } from '../services/api';
import ChatPanel from './ChatPanel';
import EpicsPanel from './EpicsPanel';
import RefinementPanel from './RefinementPanel';
import OutputPanel from './OutputPanel';

const SessionManager: React.FunctionComponent = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTabKey, setActiveTabKey] = useState<string | number>(0);

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
    event: React.MouseEvent<any> | React.KeyboardEvent | MouseEvent,
    tabIndex: string | number,
  ) => {
    setActiveTabKey(tabIndex);
  };

  return (
    <PageSection hasBodyWrapper={false} style={{ height: '100vh', overflow: 'hidden' }}>
      {selectedSession ? (
        <Tabs
          activeKey={activeTabKey}
          onSelect={handleTabClick}
          isBox
          style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
          <Tab eventKey={0} title={<TabTitleText>Chat</TabTitleText>} style={{ height: '100%', overflow: 'hidden' }}>
            <div style={{ height: 'calc(100vh - 140px)', overflow: 'hidden' }}>
              <ChatPanel session={selectedSession} />
            </div>
          </Tab>

          <Tab eventKey={1} title={<TabTitleText>JIRAs</TabTitleText>} style={{ height: '100%', overflow: 'auto' }}>
            <div style={{ height: 'calc(100vh - 140px)', overflow: 'auto' }}>
              <EpicsPanel session={selectedSession} />
            </div>
          </Tab>

          <Tab
            eventKey={2}
            title={<TabTitleText>Refinement</TabTitleText>}
            style={{ height: '100%', overflow: 'auto' }}
          >
            <div style={{ height: 'calc(100vh - 140px)', overflow: 'auto' }}>
              <RefinementPanel session={selectedSession} />
            </div>
          </Tab>
        </Tabs>
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
