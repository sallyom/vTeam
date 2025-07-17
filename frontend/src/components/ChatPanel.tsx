import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Dropdown,
  DropdownItem,
  DropdownList,
  EmptyState,
  EmptyStateBody,
  ExpandableSection,
  Flex,
  FlexItem,
  MenuToggle,
  MenuToggleElement,
  Panel,
  PanelHeader,
  PanelMain,
  PanelMainBody,
  Spinner,
  Title,
} from '@patternfly/react-core';
import { CommentIcon, FilterIcon } from '@patternfly/react-icons';
import Message from '@patternfly/chatbot/dist/dynamic/Message';
import { MCPUsage, Message as MessageType, Session, Stage } from '../types/api';
import { apiService } from '../services/api';
import { WebSocketMessage, webSocketService } from '../services/websocket';
import UserIconSvg from '../assets/user-solid.svg';
import RobotIconSvg from '../assets/robot-solid.svg';

type ChatPanelProps = {
  session: Session;
};

const formatTimestamp = (timestamp: string) => {
  return new Date(timestamp).toLocaleString();
};

const getStageColor = (stage: Stage): 'blue' | 'green' | 'orange' | 'red' | 'grey' => {
  switch (stage) {
    case 'refine':
      return 'blue';
    case 'epics':
      return 'orange';
    case 'jiras':
      return 'green';
    case 'estimate':
      return 'grey';
    default:
      return 'grey';
  }
};

const renderMessage = (message: MessageType, userAvatarUrl: string, robotAvatarUrl: string) => {
  const isError: boolean = message.status === 'error';
  const isLoading: boolean = message.status === 'loading';

  return (
    <Message
      hasRoundAvatar={false}
      name={message.role === 'user' ? 'You' : 'Assistant'}
      role={message.role === 'user' ? 'user' : 'bot'}
      content={message.content}
      timestamp={formatTimestamp(message.timestamp)}
      avatar={message.role === 'user' ? userAvatarUrl : robotAvatarUrl}
      isLoading={isLoading}
      error={isError ? { title: 'Error', children: message.content, variant: 'danger' } : undefined}
      extraContent={{
        beforeMainContent: (
          <Flex>
            <FlexItem>
              <Badge color={getStageColor(message.stage)} isRead>
                {message.stage}
              </Badge>
            </FlexItem>
          </Flex>
        ),
      }}
    />
  );
};

const ChatPanel: React.FunctionComponent<ChatPanelProps> = React.memo(({ session }) => {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [mcpUsages, setMcpUsages] = useState<MCPUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null);
  const [isStageDropdownOpen, setIsStageDropdownOpen] = useState(false);

  // Convert raw SVG strings to data URLs
  const userAvatarUrl = `data:image/svg+xml;utf8,${encodeURIComponent(UserIconSvg)}`;
  const robotAvatarUrl = `data:image/svg+xml;utf8,${encodeURIComponent(RobotIconSvg)}`;

  const loadChatData = useCallback(
    async (showLoader: boolean = false) => {
      if (!session) return;

      try {
        if (showLoader) {
          setLoading(true);
        }
        setError(null);

        const [messagesResponse, mcpUsageResponse] = await Promise.all([
          apiService.getSessionMessages(session.id, 100, selectedStage || undefined),
          apiService.getSessionMCPUsage(session.id),
        ]);

        // Only update state if data has actually changed
        if (JSON.stringify(messagesResponse) !== JSON.stringify(messages)) {
          setMessages(messagesResponse);
        }
        if (JSON.stringify(mcpUsageResponse) !== JSON.stringify(mcpUsages)) {
          setMcpUsages(mcpUsageResponse);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load chat data');
      } finally {
        if (showLoader) {
          setLoading(false);
        }
      }
    },
    [session, selectedStage, messages, mcpUsages],
  );

  useEffect(() => {
    loadChatData(true); // Show loader for initial load and stage changes
  }, [session, selectedStage, loadChatData]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!session) return;

    // Connect to WebSocket
    webSocketService.connect(session.id);

    // Subscribe to messages
    const unsubscribe = webSocketService.subscribe(session.id, (wsMessage: WebSocketMessage) => {
      if (wsMessage.type === 'message') {
        const message = wsMessage.data as MessageType;
        if (!selectedStage || message.stage === selectedStage) {
          setMessages((prevMessages) => {
            // Check if message already exists to avoid duplicates
            const exists = prevMessages.some((m) => m.id === message.id);
            if (!exists) {
              return [...prevMessages, message].sort(
                (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
              );
            }
            return prevMessages;
          });
        }
      } else if (wsMessage.type === 'mcp_usage') {
        const mcpUsage = wsMessage.data as MCPUsage;
        if (!selectedStage || mcpUsage.stage === selectedStage) {
          setMcpUsages((prevUsages) => {
            // Check if usage already exists to avoid duplicates
            const exists = prevUsages.some((u) => u.id === mcpUsage.id);
            if (!exists) {
              return [...prevUsages, mcpUsage].sort(
                (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
              );
            }
            return prevUsages;
          });
        }
      }
    });

    // Cleanup on unmount
    return () => {
      unsubscribe();
      webSocketService.disconnect();
    };
  }, [session, selectedStage]);

  const filteredMcpUsages = useMemo(() => {
    return mcpUsages.filter((usage) => !selectedStage || usage.stage === selectedStage);
  }, [mcpUsages, selectedStage]);

  // Create a merged timeline of messages and MCP usage
  type TimelineItem = {
    type: 'message' | 'mcp';
    timestamp: string;
    data: MessageType | MCPUsage;
  };

  const timeline = useMemo(() => {
    const timelineItems: TimelineItem[] = [
      ...messages.map(
        (message): TimelineItem => ({
          type: 'message',
          timestamp: message.timestamp,
          data: message,
        }),
      ),
      ...filteredMcpUsages.map(
        (usage): TimelineItem => ({
          type: 'mcp',
          timestamp: usage.timestamp,
          data: usage,
        }),
      ),
    ];

    return timelineItems.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [messages, filteredMcpUsages]);

  const stages: Stage[] = ['refine', 'epics', 'jiras', 'estimate'];

  const stageDropdownItems = [
    <DropdownItem key="all" onClick={() => setSelectedStage(null)}>
      All Stages
    </DropdownItem>,
    ...stages.map((stage) => (
      <DropdownItem key={stage} onClick={() => setSelectedStage(stage)}>
        {stage.charAt(0).toUpperCase() + stage.slice(1)}
      </DropdownItem>
    )),
  ];

  if (loading) {
    return (
      <Panel>
        <PanelMain>
          <PanelMainBody>
            <Flex justifyContent={{ default: 'justifyContentCenter' }} alignItems={{ default: 'alignItemsCenter' }}>
              <Spinner size="lg" />
            </Flex>
          </PanelMainBody>
        </PanelMain>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel>
        <PanelMain>
          <PanelMainBody>
            <Alert variant="danger" title="Error loading chat data">
              {error}
            </Alert>
          </PanelMainBody>
        </PanelMain>
      </Panel>
    );
  }

  return (
    <Panel style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <PanelHeader>
        <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            <Title headingLevel="h3" size="lg">
              Session Chat & Activity
            </Title>
          </FlexItem>
          <FlexItem>
            <Dropdown
              isOpen={isStageDropdownOpen}
              onSelect={() => setIsStageDropdownOpen(false)}
              toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                <MenuToggle
                  ref={toggleRef}
                  onClick={() => setIsStageDropdownOpen(!isStageDropdownOpen)}
                  isExpanded={isStageDropdownOpen}
                  icon={<FilterIcon />}
                >
                  {selectedStage ? selectedStage.charAt(0).toUpperCase() + selectedStage.slice(1) : 'All Stages'}
                </MenuToggle>
              )}
            >
              <DropdownList>{stageDropdownItems}</DropdownList>
            </Dropdown>
          </FlexItem>
        </Flex>
      </PanelHeader>

      <PanelMain style={{ flex: 1, overflow: 'hidden' }}>
        <PanelMainBody style={{ height: '100%', overflow: 'auto', padding: '1rem' }}>
          <Card>
            <CardHeader>
              <CardTitle>
                <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
                  <FlexItem>
                    <CommentIcon />
                  </FlexItem>
                  <FlexItem>Session Timeline ({timeline.length})</FlexItem>
                </Flex>
              </CardTitle>
            </CardHeader>
            <CardBody style={{ overflow: 'auto' }}>
              {timeline.length === 0 ? (
                <EmptyState>
                  <EmptyStateBody>
                    No activity yet. Messages and tool usage will appear here as the session progresses.
                  </EmptyStateBody>
                </EmptyState>
              ) : (
                <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsSm' }}>
                  {timeline.map((item, index) => (
                    <FlexItem key={`${item.type}-${index}`}>
                      {item.type === 'message' ? (
                        <div>{renderMessage(item.data as MessageType, userAvatarUrl, robotAvatarUrl)}</div>
                      ) : (
                        <div>
                          <Message
                            hasRoundAvatar={false}
                            name="System"
                            role="bot"
                            avatar={robotAvatarUrl}
                            content={`🔧 **Tool Used:** ${(item.data as MCPUsage).tool_name}`}
                            timestamp={formatTimestamp(item.timestamp)}
                            extraContent={{
                              beforeMainContent: (
                                <Badge color={getStageColor((item.data as MCPUsage).stage)} isRead>
                                  {(item.data as MCPUsage).stage}
                                </Badge>
                              ),
                              afterMainContent: (
                                <Card isCompact>
                                  <CardBody>
                                    <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsSm' }}>
                                      <FlexItem>
                                        <ExpandableSection
                                          toggleText="Input Data"
                                          toggleTextExpanded="Input Data"
                                          isDetached
                                        >
                                          <div
                                            style={{
                                              maxHeight: '200px',
                                              overflow: 'auto',
                                              backgroundColor: 'var(--pf-v5-global--BackgroundColor--200)',
                                              borderRadius: '4px',
                                              padding: '12px',
                                              marginTop: '8px',
                                            }}
                                          >
                                            <pre
                                              style={{
                                                fontSize: '12px',
                                                wordBreak: 'break-all',
                                                whiteSpace: 'pre-wrap',
                                                margin: 0,
                                                color: 'var(--pf-v5-global--Color--100)',
                                                fontFamily: 'var(--pf-v5-global--FontFamily--monospace)',
                                              }}
                                            >
                                              {JSON.stringify((item.data as MCPUsage).input_data, null, 2)}
                                            </pre>
                                          </div>
                                        </ExpandableSection>
                                      </FlexItem>
                                      <FlexItem>
                                        <ExpandableSection
                                          toggleText="Output Data"
                                          toggleTextExpanded="Output Data"
                                          isDetached
                                        >
                                          <div
                                            style={{
                                              maxHeight: '200px',
                                              overflow: 'auto',
                                              backgroundColor: 'var(--pf-v5-global--BackgroundColor--200)',
                                              borderRadius: '4px',
                                              padding: '12px',
                                              marginTop: '8px',
                                            }}
                                          >
                                            <pre
                                              style={{
                                                fontSize: '12px',
                                                wordBreak: 'break-all',
                                                whiteSpace: 'pre-wrap',
                                                margin: 0,
                                                color: 'var(--pf-v5-global--Color--100)',
                                                fontFamily: 'var(--pf-v5-global--FontFamily--monospace)',
                                              }}
                                            >
                                              {JSON.stringify((item.data as MCPUsage).output_data, null, 2)}
                                            </pre>
                                          </div>
                                        </ExpandableSection>
                                      </FlexItem>
                                    </Flex>
                                  </CardBody>
                                </Card>
                              ),
                            }}
                          />
                        </div>
                      )}
                    </FlexItem>
                  ))}
                </Flex>
              )}
            </CardBody>
          </Card>
        </PanelMainBody>
      </PanelMain>
    </Panel>
  );
});

ChatPanel.displayName = 'ChatPanel';

export default ChatPanel;
