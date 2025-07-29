import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Panel,
  PanelHeader,
  PanelMain,
  PanelMainBody,
  Spinner,
  Tab,
  TabContent,
  TabTitleText,
  Tabs,
  Title,
} from '@patternfly/react-core';
import { FileIcon } from '@patternfly/react-icons';
import { Output, Session, Stage } from '../types/api';
import { apiService } from '../services/api';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type OutputPanelProps = {
  session: Session;
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

const getStageLabel = (stage: Stage): string => {
  switch (stage) {
    case 'refine':
      return 'Refinement';
    case 'epics':
      return 'Epics';
    case 'jiras':
      return 'JIRAs';
    case 'estimate':
      return 'Estimate';
    default:
      return stage;
  }
};

const OutputPanel: React.FunctionComponent<OutputPanelProps> = React.memo(({ session }) => {
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTabKey, setActiveTabKey] = useState<string>('');

  const loadOutputs = useCallback(
    async (showLoader: boolean = false) => {
      if (!session) return;

      try {
        if (showLoader) {
          setLoading(true);
        }
        setError(null);

        const outputsResponse = await apiService.getSessionOutputs(session.id);

        // Only update state if data has actually changed
        if (JSON.stringify(outputsResponse) !== JSON.stringify(outputs)) {
          setOutputs(outputsResponse);
        }

        // Set the first available tab as active
        if (outputsResponse.length > 0 && !activeTabKey) {
          setActiveTabKey(outputsResponse[0].stage);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load outputs');
      } finally {
        if (showLoader) {
          setLoading(false);
        }
      }
    },
    [session, outputs, activeTabKey],
  );

  useEffect(() => {
    loadOutputs(true); // Show loader for initial load
  }, [session]);

  // Auto-refresh every 5 seconds when session is running
  useEffect(() => {
    if (session.status === 'running' || session.status === 'pending') {
      const interval = setInterval(() => loadOutputs(false), 5000); // Don't show loader for auto-refresh
      return () => clearInterval(interval);
    }
    return undefined;
  }, [session.status, loadOutputs]);

  const handleTabClick = useCallback((event: React.MouseEvent<HTMLElement, MouseEvent>, tabIndex: string | number) => {
    setActiveTabKey(tabIndex.toString());
  }, []);

  // Group outputs by stage - memoized to prevent unnecessary recalculation
  const outputsByStage = useMemo(() => {
    return outputs.reduce(
      (acc, output) => {
        if (!acc[output.stage]) {
          acc[output.stage] = [];
        }
        acc[output.stage].push(output);
        return acc;
      },
      {} as Record<Stage, Output[]>,
    );
  }, [outputs]);

  const stages: Stage[] = ['refine', 'epics', 'jiras', 'estimate'];
  const availableStages = useMemo(() => {
    return stages.filter((stage) => outputsByStage[stage]?.length > 0);
  }, [stages, outputsByStage]);

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
            <Alert variant="danger" title="Error loading outputs">
              {error}
            </Alert>
          </PanelMainBody>
        </PanelMain>
      </Panel>
    );
  }

  if (outputs.length === 0) {
    return (
      <Panel>
        <PanelHeader>
          <Title headingLevel="h3" size="lg">
            Session Outputs
          </Title>
        </PanelHeader>
        <PanelMain>
          <PanelMainBody>
            <EmptyState>
              <EmptyState icon={FileIcon} />
              <EmptyStateBody>
                No outputs yet. Output files will appear here as the session progresses through different stages.
              </EmptyStateBody>
            </EmptyState>
          </PanelMainBody>
        </PanelMain>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHeader>
        <Title headingLevel="h3" size="lg">
          Session Outputs
        </Title>
      </PanelHeader>

      <PanelMain>
        <PanelMainBody>
          <Tabs activeKey={activeTabKey} onSelect={handleTabClick} isBox hasNoBorderBottom>
            {availableStages.map((stage) => (
              <Tab
                key={stage}
                eventKey={stage}
                title={
                  <TabTitleText>
                    <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
                      <FlexItem>{getStageLabel(stage)}</FlexItem>
                      <FlexItem>
                        <Badge color={getStageColor(stage)}>{outputsByStage[stage].length}</Badge>
                      </FlexItem>
                    </Flex>
                  </TabTitleText>
                }
              >
                <TabContent id={`${stage}-content`}>
                  <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsMd' }}>
                    {outputsByStage[stage].map((output, index) => (
                      <FlexItem key={`${output.id}-${index}`}>
                        <Card>
                          <CardHeader>
                            <CardTitle>
                              <Flex
                                alignItems={{ default: 'alignItemsCenter' }}
                                spaceItems={{ default: 'spaceItemsSm' }}
                              >
                                <FlexItem>
                                  <FileIcon />
                                </FlexItem>
                                <FlexItem>{output.filename}</FlexItem>
                                <FlexItem>
                                  <Badge color={getStageColor(output.stage)}>{output.stage}</Badge>
                                </FlexItem>
                              </Flex>
                            </CardTitle>
                          </CardHeader>
                          <CardBody>
                            <div
                              style={{
                                maxHeight: '600px',
                                overflowY: 'auto',
                                border: '1px solid var(--pf-v5-global--BorderColor--100)',
                                borderRadius: '4px',
                                padding: '16px',
                                backgroundColor: 'var(--pf-v5-global--BackgroundColor--100)',
                              }}
                            >
                              <Markdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  // Add basic styling for common elements
                                  h1: ({ children }) => (
                                    <h1
                                      style={{
                                        fontSize: '1.5rem',
                                        fontWeight: 'bold',
                                        marginBottom: '1rem',
                                        color: 'var(--pf-v5-global--Color--100)',
                                      }}
                                    >
                                      {children}
                                    </h1>
                                  ),
                                  h2: ({ children }) => (
                                    <h2
                                      style={{
                                        fontSize: '1.25rem',
                                        fontWeight: 'bold',
                                        marginBottom: '0.75rem',
                                        color: 'var(--pf-v5-global--Color--100)',
                                      }}
                                    >
                                      {children}
                                    </h2>
                                  ),
                                  h3: ({ children }) => (
                                    <h3
                                      style={{
                                        fontSize: '1.1rem',
                                        fontWeight: 'bold',
                                        marginBottom: '0.5rem',
                                        color: 'var(--pf-v5-global--Color--100)',
                                      }}
                                    >
                                      {children}
                                    </h3>
                                  ),
                                  p: ({ children }) => (
                                    <p
                                      style={{
                                        marginBottom: '1rem',
                                        lineHeight: '1.5',
                                        color: 'var(--pf-v5-global--Color--100)',
                                      }}
                                    >
                                      {children}
                                    </p>
                                  ),
                                  ul: ({ children }) => (
                                    <ul
                                      style={{
                                        marginBottom: '1rem',
                                        paddingLeft: '1.5rem',
                                        color: 'var(--pf-v5-global--Color--100)',
                                      }}
                                    >
                                      {children}
                                    </ul>
                                  ),
                                  ol: ({ children }) => (
                                    <ol
                                      style={{
                                        marginBottom: '1rem',
                                        paddingLeft: '1.5rem',
                                        color: 'var(--pf-v5-global--Color--100)',
                                      }}
                                    >
                                      {children}
                                    </ol>
                                  ),
                                  li: ({ children }) => (
                                    <li style={{ marginBottom: '0.25rem', color: 'var(--pf-v5-global--Color--100)' }}>
                                      {children}
                                    </li>
                                  ),
                                  code: ({ children, className }) => {
                                    const isInline = !className?.includes('language-');
                                    return isInline ? (
                                      <code
                                        style={{
                                          backgroundColor: 'var(--pf-v5-global--BackgroundColor--200)',
                                          color: 'var(--pf-v5-global--Color--100)',
                                          padding: '2px 4px',
                                          borderRadius: '3px',
                                          fontSize: '0.9em',
                                          fontFamily: 'monospace',
                                        }}
                                      >
                                        {children}
                                      </code>
                                    ) : (
                                      <code
                                        style={{
                                          display: 'block',
                                          backgroundColor: 'var(--pf-v5-global--BackgroundColor--200)',
                                          color: 'var(--pf-v5-global--Color--100)',
                                          padding: '1rem',
                                          borderRadius: '4px',
                                          fontSize: '0.9em',
                                          fontFamily: 'monospace',
                                          whiteSpace: 'pre-wrap',
                                          overflowX: 'auto',
                                        }}
                                      >
                                        {children}
                                      </code>
                                    );
                                  },
                                  pre: ({ children }) => <pre style={{ margin: 0, overflowX: 'auto' }}>{children}</pre>,
                                  table: ({ children }) => (
                                    <table
                                      style={{
                                        borderCollapse: 'collapse',
                                        width: '100%',
                                        marginBottom: '1rem',
                                        color: 'var(--pf-v5-global--Color--100)',
                                      }}
                                    >
                                      {children}
                                    </table>
                                  ),
                                  th: ({ children }) => (
                                    <th
                                      style={{
                                        border: '1px solid var(--pf-v5-global--BorderColor--100)',
                                        padding: '8px',
                                        backgroundColor: 'var(--pf-v5-global--BackgroundColor--200)',
                                        fontWeight: 'bold',
                                        textAlign: 'left',
                                      }}
                                    >
                                      {children}
                                    </th>
                                  ),
                                  td: ({ children }) => (
                                    <td
                                      style={{
                                        border: '1px solid var(--pf-v5-global--BorderColor--100)',
                                        padding: '8px',
                                      }}
                                    >
                                      {children}
                                    </td>
                                  ),
                                  blockquote: ({ children }) => (
                                    <blockquote
                                      style={{
                                        borderLeft: '4px solid var(--pf-v5-global--primary-color--100)',
                                        marginLeft: 0,
                                        paddingLeft: '1rem',
                                        color: 'var(--pf-v5-global--Color--200)',
                                        fontStyle: 'italic',
                                      }}
                                    >
                                      {children}
                                    </blockquote>
                                  ),
                                  strong: ({ children }) => (
                                    <strong style={{ fontWeight: 'bold', color: 'var(--pf-v5-global--Color--100)' }}>
                                      {children}
                                    </strong>
                                  ),
                                  em: ({ children }) => (
                                    <em style={{ fontStyle: 'italic', color: 'var(--pf-v5-global--Color--100)' }}>
                                      {children}
                                    </em>
                                  ),
                                }}
                              >
                                {(() => {
                                  // Strip markdown code fence wrapper if present
                                  let content = output.content;
                                  if (content.startsWith('```markdown\n') || content.startsWith('```markdown ')) {
                                    content = content.replace(/^```markdown\s*\n?/, '');
                                  }
                                  if (content.endsWith('\n```') || content.endsWith('```')) {
                                    content = content.replace(/\n?```$/, '');
                                  }
                                  return content;
                                })()}
                              </Markdown>
                            </div>
                          </CardBody>
                        </Card>
                      </FlexItem>
                    ))}
                  </Flex>
                </TabContent>
              </Tab>
            ))}
          </Tabs>
        </PanelMainBody>
      </PanelMain>
    </Panel>
  );
});

OutputPanel.displayName = 'OutputPanel';

export default OutputPanel;
