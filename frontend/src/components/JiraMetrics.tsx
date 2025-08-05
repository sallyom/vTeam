import React, { useState } from 'react';
import {
  Alert,
  AlertVariant,
  Button,
  Card,
  CardBody,
  CardTitle,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Form,
  FormGroup,
  Grid,
  GridItem,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalVariant,
  Spinner,
  Split,
  SplitItem,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core';
import { ChartLineIcon, CheckCircleIcon, ClockIcon, ListIcon } from '@patternfly/react-icons';
import { apiService } from '../services/api';
import { JiraMetricsResponse } from '../types/api';

type JiraMetricsProps = {
  isOpen: boolean;
  onClose: () => void;
};

const JiraMetrics: React.FunctionComponent<JiraMetricsProps> = ({ isOpen, onClose }) => {
  const [jiraKey, setJiraKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<JiraMetricsResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jiraKey.trim()) {
      setError('Please enter a JIRA key');
      return;
    }

    setLoading(true);
    setError(null);
    setMetrics(null);

    try {
      const response = await apiService.getJiraMetrics(jiraKey.trim());
      setMetrics(response);
    } catch (err: unknown) {
      const errorMessage =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Failed to fetch JIRA metrics';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setJiraKey('');
    setError(null);
    setMetrics(null);
    setLoading(false);
    onClose();
  };

  const formatDays = (days: number): string => {
    if (days === 0) return '0 days';
    if (days < 1) return `${Math.round(days * 24)} hours`;
    return `${Math.round(days)} days`;
  };

  return (
    <Modal variant={ModalVariant.large} title="JIRA Epic Metrics" isOpen={isOpen} onClose={handleClose}>
      <ModalBody>
        <Stack hasGutter>
          <StackItem>
            <Form onSubmit={handleSubmit}>
              <FormGroup label="JIRA Key" isRequired fieldId="jira-key">
                <Split hasGutter>
                  <SplitItem isFilled>
                    <TextInput
                      id="jira-key"
                      value={jiraKey}
                      onChange={(_event, value) => setJiraKey(value)}
                      placeholder="e.g., PROJ-123"
                      isDisabled={loading}
                    />
                  </SplitItem>
                  <SplitItem>
                    <Button
                      type="submit"
                      variant="primary"
                      isDisabled={loading || !jiraKey.trim()}
                      icon={loading ? <Spinner size="sm" /> : undefined}
                    >
                      {loading ? 'Fetching...' : 'Get Metrics'}
                    </Button>
                  </SplitItem>
                </Split>
              </FormGroup>
            </Form>
          </StackItem>

          {error && (
            <StackItem>
              <Alert variant={AlertVariant.danger} title="Error" isInline>
                {error}
              </Alert>
            </StackItem>
          )}

          {metrics && (
            <StackItem>
              <Stack hasGutter>
                {/* Overall Summary */}
                <StackItem>
                  <Card>
                    <CardTitle>
                      <Split>
                        <SplitItem>
                          <ChartLineIcon /> Overall Summary
                        </SplitItem>
                        <SplitItem isFilled />
                        <SplitItem>
                          <Label color="blue">
                            {metrics.done_issues}/{metrics.processed_issues} Done
                          </Label>
                        </SplitItem>
                      </Split>
                    </CardTitle>
                    <CardBody>
                      <Grid hasGutter>
                        <GridItem span={6}>
                          <DescriptionList isHorizontal>
                            <DescriptionListGroup>
                              <DescriptionListTerm>Total Story Points</DescriptionListTerm>
                              <DescriptionListDescription>
                                <Label color="green" icon={<ChartLineIcon />}>
                                  {metrics.total_story_points}
                                </Label>
                              </DescriptionListDescription>
                            </DescriptionListGroup>
                            <DescriptionListGroup>
                              <DescriptionListTerm>Total Days to Done</DescriptionListTerm>
                              <DescriptionListDescription>
                                <Label color="orange" icon={<ClockIcon />}>
                                  {formatDays(metrics.total_days_to_done)}
                                </Label>
                              </DescriptionListDescription>
                            </DescriptionListGroup>
                          </DescriptionList>
                        </GridItem>
                        <GridItem span={6}>
                          <DescriptionList isHorizontal>
                            <DescriptionListGroup>
                              <DescriptionListTerm>Issues Processed</DescriptionListTerm>
                              <DescriptionListDescription>
                                <Label color="blue" icon={<ListIcon />}>
                                  {metrics.processed_issues}
                                </Label>
                              </DescriptionListDescription>
                            </DescriptionListGroup>
                            <DescriptionListGroup>
                              <DescriptionListTerm>Issues Done</DescriptionListTerm>
                              <DescriptionListDescription>
                                <Label color="green" icon={<CheckCircleIcon />}>
                                  {metrics.done_issues}
                                </Label>
                              </DescriptionListDescription>
                            </DescriptionListGroup>
                          </DescriptionList>
                        </GridItem>
                      </Grid>
                    </CardBody>
                  </Card>
                </StackItem>

                {/* Component Breakdown */}
                {Object.keys(metrics.components).length > 0 && (
                  <StackItem>
                    <Card>
                      <CardTitle>Component Breakdown</CardTitle>
                      <CardBody>
                        <Grid hasGutter>
                          {Object.entries(metrics.components).map(([componentName, componentMetrics]) => (
                            <GridItem span={6} key={componentName}>
                              <Card isCompact>
                                <CardTitle>{componentName}</CardTitle>
                                <CardBody>
                                  <DescriptionList isCompact>
                                    <DescriptionListGroup>
                                      <DescriptionListTerm>Story Points</DescriptionListTerm>
                                      <DescriptionListDescription>
                                        <Label color="green">{componentMetrics.total_story_points}</Label>
                                      </DescriptionListDescription>
                                    </DescriptionListGroup>
                                    <DescriptionListGroup>
                                      <DescriptionListTerm>Days to Done</DescriptionListTerm>
                                      <DescriptionListDescription>
                                        <Label color="orange">{formatDays(componentMetrics.total_days_to_done)}</Label>
                                      </DescriptionListDescription>
                                    </DescriptionListGroup>
                                  </DescriptionList>
                                </CardBody>
                              </Card>
                            </GridItem>
                          ))}
                        </Grid>
                      </CardBody>
                    </Card>
                  </StackItem>
                )}

                {Object.keys(metrics.components).length === 0 && (
                  <StackItem>
                    <Alert variant={AlertVariant.info} title="No Components Found" isInline>
                      All issues may be unassigned to components or have no &apos;Done&apos; resolution.
                    </Alert>
                  </StackItem>
                )}
              </Stack>
            </StackItem>
          )}
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={handleClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default JiraMetrics;
