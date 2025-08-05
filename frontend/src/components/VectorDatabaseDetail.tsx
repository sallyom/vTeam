import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Card,
  CardBody,
  CardExpandableContent,
  CardHeader,
  CardTitle,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  Gallery,
  MenuToggle,
  MenuToggleElement,
  Modal,
  ModalBody,
  ModalFooter,
  ModalVariant,
  PageSection,
  Progress,
  ProgressMeasureLocation,
  ProgressSize,
  Select,
  SelectList,
  SelectOption,
  Spinner,
  Split,
  SplitItem,
  Switch,
  Tab,
  TabContent,
  TabTitleText,
  Tabs,
  TextArea,
  TextInput,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core';
import { DatabaseIcon, FileIcon, PlusCircleIcon, SearchIcon } from '@patternfly/react-icons';

import { apiService } from '../services/api';
import type {
  BackgroundTaskInfo,
  BulkIngestionTaskRequest,
  BulkIngestionTaskResponse,
  ChunkBrowseRequest,
  ChunkBrowseResponse,
  ChunkInfo,
  DocumentSource,
  RAGQueryRequest,
  RAGQueryResponse,
  SourceInfo,
  VectorDBInfo,
} from '../types/api';

const VectorDatabaseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // State
  const [vectorDb, setVectorDb] = useState<VectorDBInfo | null>(null);
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');

  // Modal states
  const [showIngestModal, setShowIngestModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  // Form states
  const [newDocuments, setNewDocuments] = useState<DocumentSource[]>([
    { name: '', url: '', mime_type: 'text/plain', metadata: {} },
  ]);
  const [queryRequest, setQueryRequest] = useState<RAGQueryRequest>({
    vector_db_ids: [],
    query: '',
    max_chunks: 5,
  });
  const [queryResults, setQueryResults] = useState<RAGQueryResponse | null>(null);
  const [querying, setQuerying] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [useLlamaIndex, setUseLlamaIndex] = useState(true); // Default to LlamaIndex for better processing

  // Background task states
  const [currentTask, setCurrentTask] = useState<BackgroundTaskInfo | null>(null);
  const [taskPollingInterval, setTaskPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Add state for tracking expanded cards
  const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});

  // Chunk browsing states
  const [chunks, setChunks] = useState<ChunkInfo[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [chunkSearchQuery, setChunkSearchQuery] = useState('');
  const [totalChunks, setTotalChunks] = useState(0);
  const [chunksOffset, setChunksOffset] = useState(0);
  const chunksLimit = 10;

  // Select states
  const [mimeTypeSelectStates, setMimeTypeSelectStates] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (id) {
      loadVectorDatabase();
      loadSources();
      setQueryRequest((prev) => ({ ...prev, vector_db_ids: [id] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (taskPollingInterval) {
        clearInterval(taskPollingInterval);
      }
    };
  }, [taskPollingInterval]);

  const handleTabChange = (_: React.MouseEvent | React.KeyboardEvent | MouseEvent, key: string | number) => {
    const tabKey = key as string;
    setActiveTab(tabKey);

    // Load chunks when Browse Chunks tab is selected
    if (tabKey === 'chunks' && chunks.length === 0 && !chunksLoading) {
      loadChunks();
    }
  };

  const loadVectorDatabase = async () => {
    if (!id) return;

    try {
      setLoading(true);
      const db = await apiService.getVectorDatabase(id);
      setVectorDb(db);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vector database');
    } finally {
      setLoading(false);
    }
  };

  const loadSources = async () => {
    if (!id) return;

    try {
      const response = await apiService.listSources(id);
      setSources(response.sources);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sources');
    }
  };

  const loadChunks = async (offset = 0, searchQuery = '') => {
    if (!id) return;

    try {
      setChunksLoading(true);
      const request: ChunkBrowseRequest = {
        vector_db_id: id,
        search_query: searchQuery || undefined,
        limit: chunksLimit,
        offset,
      };
      const response: ChunkBrowseResponse = await apiService.browseChunks(request);
      setChunks(response.chunks);
      setTotalChunks(response.total_chunks);
      setChunksOffset(offset);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chunks');
    } finally {
      setChunksLoading(false);
    }
  };

  const handleDeleteDatabase = async () => {
    if (!id) return;

    try {
      await apiService.deleteVectorDatabase(id);
      setSuccess('Vector database deleted successfully');
      setTimeout(() => navigate('/rag'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete vector database');
    } finally {
      setShowDeleteModal(false);
    }
  };

  // Background task management functions
  const startTaskPolling = (taskId: string) => {
    const pollTask = async () => {
      try {
        const taskInfo = await apiService.getTaskStatus(taskId);
        setCurrentTask(taskInfo);

        // If task is completed or failed, stop polling
        if (taskInfo.status === 'completed' || taskInfo.status === 'failed') {
          if (taskPollingInterval) {
            clearInterval(taskPollingInterval);
            setTaskPollingInterval(null);
          }

          if (taskInfo.status === 'completed') {
            setSuccess('Documents ingested successfully using background processing');
            loadSources();
            loadVectorDatabase();
          } else if (taskInfo.status === 'failed') {
            setError(`Background task failed: ${taskInfo.error_message}`);
          }

          setIngesting(false);
          setCurrentTask(null);
        }
      } catch (err) {
        console.error('Error polling task status:', err);
        // Continue polling even on error - might be temporary
      }
    };

    // Poll immediately and then every 2 seconds
    pollTask();
    const interval = setInterval(pollTask, 2000);
    setTaskPollingInterval(interval);
  };

  const stopTaskPolling = () => {
    if (taskPollingInterval) {
      clearInterval(taskPollingInterval);
      setTaskPollingInterval(null);
    }
    setCurrentTask(null);
    setIngesting(false);
  };

  const handleIngestDocuments = async () => {
    if (!id) return;

    try {
      setIngesting(true);

      // Prepare background task request
      const request: BulkIngestionTaskRequest = {
        vector_db_id: id,
        documents: newDocuments.filter((doc) => doc.name && doc.url),
        chunk_size_in_tokens: 512,
        chunk_overlap_in_tokens: 0,
        use_llamaindex: useLlamaIndex,
      };

      // Start background task
      const taskResponse: BulkIngestionTaskResponse = await apiService.startBulkIngestion(request);

      // Start polling for task status
      startTaskPolling(taskResponse.task_id);

      // Close modal and reset form
      setShowIngestModal(false);
      setNewDocuments([{ name: '', url: '', mime_type: 'text/plain', metadata: {} }]);

      // Show initial success message
      const processingType = useLlamaIndex ? 'LlamaIndex smart loaders' : 'basic ingestion';
      setSuccess(`Document ingestion started using ${processingType}. Processing in background...`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start document ingestion');
      setIngesting(false);
    }
  };

  const handleQueryRAG = async () => {
    if (!queryRequest.query.trim()) return;

    try {
      setQuerying(true);
      const results = await apiService.queryRAG(queryRequest);
      setQueryResults(results);
      // Reset expanded state when new query results come in
      setExpandedCards({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to query RAG');
    } finally {
      setQuerying(false);
    }
  };

  const handleResetDatabase = async () => {
    if (!id) return;

    try {
      setLoading(true);
      await apiService.resetVectorDatabase(id);
      setSuccess('Vector database reset successfully');
      setShowResetModal(false);
      loadVectorDatabase();
      loadSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset vector database');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChunks = async () => {
    await loadChunks(0, chunkSearchQuery);
  };

  const handleChunksPrevPage = async () => {
    const newOffset = Math.max(0, chunksOffset - chunksLimit);
    await loadChunks(newOffset, chunkSearchQuery);
  };

  const handleChunksNextPage = async () => {
    const newOffset = chunksOffset + chunksLimit;
    if (newOffset < totalChunks) {
      await loadChunks(newOffset, chunkSearchQuery);
    }
  };

  // Add handler for card expansion
  const onCardExpand = (cardIndex: number) => {
    setExpandedCards((prev) => ({
      ...prev,
      [cardIndex]: !prev[cardIndex],
    }));
  };

  const addDocumentField = () => {
    setNewDocuments([...newDocuments, { name: '', url: '', mime_type: 'text/plain', metadata: {} }]);
  };

  const updateDocumentSource = (index: number, field: keyof DocumentSource, value: string) => {
    const updated = [...newDocuments];
    updated[index] = { ...updated[index], [field]: value };
    setNewDocuments(updated);
  };

  const removeDocumentField = (index: number) => {
    setNewDocuments(newDocuments.filter((_, i) => i !== index));
  };

  const getMimeTypeSelectId = (index: number) => `mime-type-select-${index}`;

  if (loading) {
    return (
      <PageSection>
        <Spinner size="lg" />
      </PageSection>
    );
  }

  if (!vectorDb) {
    return (
      <PageSection>
        <EmptyState title="Vector Database Not Found">
          <EmptyStateBody>The requested vector database could not be found.</EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  return (
    <PageSection>
      {/* Breadcrumb Navigation */}
      <Breadcrumb>
        <BreadcrumbItem to="/rag">RAG Manager</BreadcrumbItem>
        <BreadcrumbItem isActive>{vectorDb.name}</BreadcrumbItem>
      </Breadcrumb>

      {/* Page Header */}
      <Split hasGutter>
        <SplitItem>
          <Title headingLevel="h1" size="2xl">
            <DatabaseIcon style={{ marginRight: '0.5rem' }} />
            {vectorDb.name}
          </Title>
        </SplitItem>
        <SplitItem isFilled />
        <SplitItem>
          <Button variant="danger" onClick={() => setShowDeleteModal(true)}>
            Delete Database
          </Button>
        </SplitItem>
        <SplitItem>
          <Button variant="warning" onClick={() => setShowResetModal(true)}>
            Reset Database
          </Button>
        </SplitItem>
      </Split>

      {/* Alerts */}
      {error && (
        <Alert variant="danger" title="Error" isInline style={{ marginBottom: '1rem' }}>
          {error}
          <Button variant="plain" onClick={() => setError(null)} style={{ marginLeft: '10px' }}>
            ×
          </Button>
        </Alert>
      )}

      {success && (
        <Alert variant="success" title="Success" isInline style={{ marginBottom: '1rem' }}>
          {success}
          <Button variant="plain" onClick={() => setSuccess(null)} style={{ marginLeft: '10px' }}>
            ×
          </Button>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs activeKey={activeTab} onSelect={handleTabChange}>
        <Tab
          eventKey="overview"
          title={
            <TabTitleText>
              <DatabaseIcon /> Overview
            </TabTitleText>
          }
        >
          <TabContent id="overview-tab" style={{ marginTop: '1rem' }}>
            <Card isPlain>
              <CardHeader>
                <CardTitle>Database Information</CardTitle>
              </CardHeader>
              <CardBody>
                <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsMd' }}>
                  <FlexItem>
                    <strong>ID:</strong> {vectorDb.vector_db_id}
                  </FlexItem>
                  <FlexItem>
                    <strong>Description:</strong> {vectorDb.description || 'No description provided'}
                  </FlexItem>
                  <FlexItem>
                    <strong>Use Case:</strong> <Badge>{vectorDb.use_case}</Badge>
                  </FlexItem>
                  <FlexItem>
                    <strong>Embedding Model:</strong> {vectorDb.embedding_model}
                  </FlexItem>
                  <FlexItem>
                    <strong>Embedding Dimension:</strong> {vectorDb.embedding_dimension}
                  </FlexItem>
                  <FlexItem>
                    <strong>Sources:</strong> {sources.length}
                  </FlexItem>
                  <FlexItem>
                    <strong>Total Chunks:</strong> {vectorDb.total_chunks}
                  </FlexItem>
                  <FlexItem>
                    <strong>Created:</strong> {new Date(vectorDb.created_at).toLocaleString()}
                  </FlexItem>
                  {vectorDb.last_updated && (
                    <FlexItem>
                      <strong>Last Updated:</strong> {new Date(vectorDb.last_updated).toLocaleString()}
                    </FlexItem>
                  )}
                </Flex>
              </CardBody>
            </Card>
          </TabContent>
        </Tab>

        <Tab
          eventKey="sources"
          title={
            <TabTitleText>
              <DatabaseIcon /> Sources ({sources.length})
            </TabTitleText>
          }
        >
          <TabContent id="sources-tab" style={{ marginTop: '1rem' }}>
            <Toolbar>
              <ToolbarContent>
                <ToolbarItem>
                  <Button
                    variant="primary"
                    icon={<PlusCircleIcon />}
                    onClick={() => setShowIngestModal(true)}
                    isDisabled={ingesting}
                  >
                    {ingesting ? 'Processing...' : 'Ingest Documents'}
                  </Button>
                </ToolbarItem>
                {currentTask && (
                  <ToolbarItem>
                    <Button variant="secondary" onClick={stopTaskPolling} size="sm">
                      Cancel Task
                    </Button>
                  </ToolbarItem>
                )}
              </ToolbarContent>
            </Toolbar>

            {/* Background Task Progress Display */}
            {currentTask && (
              <Card style={{ marginBottom: '1rem' }}>
                <CardBody>
                  <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsSm' }}>
                    <FlexItem>
                      <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
                        <FlexItem>
                          <strong>Background Task Status:</strong>
                        </FlexItem>
                        <FlexItem>
                          <Badge
                            color={
                              currentTask.status === 'completed'
                                ? 'green'
                                : currentTask.status === 'failed'
                                  ? 'red'
                                  : currentTask.status === 'running'
                                    ? 'blue'
                                    : 'grey'
                            }
                          >
                            {currentTask.status.toUpperCase()}
                          </Badge>
                        </FlexItem>
                      </Flex>
                    </FlexItem>

                    {currentTask.current_step && (
                      <FlexItem>
                        <div style={{ fontSize: '0.875rem' }}>
                          <strong>Current Step:</strong> {currentTask.current_step}
                        </div>
                      </FlexItem>
                    )}

                    <FlexItem>
                      <Progress
                        value={Math.round(currentTask.progress * 100)}
                        title="Ingestion Progress"
                        size={ProgressSize.sm}
                        measureLocation={ProgressMeasureLocation.top}
                      />
                    </FlexItem>

                    {currentTask.total_items && currentTask.total_items > 0 && (
                      <FlexItem>
                        <div style={{ fontSize: '0.875rem' }}>
                          Progress: {currentTask.processed_items}/{currentTask.total_items} items processed
                        </div>
                      </FlexItem>
                    )}

                    {currentTask.error_message && (
                      <FlexItem>
                        <Alert variant="danger" title="Task Error" isInline>
                          {currentTask.error_message}
                        </Alert>
                      </FlexItem>
                    )}
                  </Flex>
                </CardBody>
              </Card>
            )}

            {sources.length === 0 ? (
              <EmptyState title="No Sources" headingLevel="h2" icon={DatabaseIcon}>
                <EmptyStateBody>
                  This vector database doesn&apos;t have any sources yet. Use the &quot;Ingest Documents&quot; button to
                  add some content.
                </EmptyStateBody>
              </EmptyState>
            ) : (
              <Gallery hasGutter minWidths={{ default: '300px' }}>
                {sources.map((source) => (
                  <Card key={source.source_id}>
                    <CardHeader>
                      <CardTitle>
                        <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
                          <FlexItem>
                            {source.source_type === 'github_repository' ? <DatabaseIcon /> : <FileIcon />}
                          </FlexItem>
                          <FlexItem>{source.source_name}</FlexItem>
                        </Flex>
                      </CardTitle>
                    </CardHeader>
                    <CardBody>
                      <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsSm' }}>
                        <FlexItem>
                          <strong>URL:</strong>{' '}
                          <a href={source.primary_url} target="_blank" rel="noopener noreferrer">
                            {source.primary_url}
                          </a>
                        </FlexItem>
                        <FlexItem>
                          <strong>Documents:</strong> {source.document_count}
                        </FlexItem>
                        <FlexItem>
                          <strong>Total Chunks:</strong> {source.total_chunks}
                        </FlexItem>
                        <FlexItem>
                          <strong>Method:</strong> <Badge>{source.ingestion_method}</Badge>
                        </FlexItem>
                        <FlexItem>
                          <strong>Status:</strong>{' '}
                          <Badge
                            color={
                              source.task_status === 'completed'
                                ? 'green'
                                : source.task_status === 'failed'
                                  ? 'red'
                                  : source.task_status === 'running'
                                    ? 'blue'
                                    : 'grey'
                            }
                          >
                            {source.task_status.toUpperCase()}
                          </Badge>
                        </FlexItem>
                        <FlexItem>
                          <strong>Ingested:</strong> {new Date(source.created_at).toLocaleString()}
                        </FlexItem>
                        {source.processing_time_ms && (
                          <FlexItem>
                            <strong>Processing Time:</strong> {Math.round(source.processing_time_ms / 1000)}s
                          </FlexItem>
                        )}
                        {source.error_count > 0 && (
                          <FlexItem>
                            <Alert variant="warning" title={`${source.error_count} errors occurred`} isInline>
                              {source.errors.slice(0, 2).map((error, idx) => (
                                <div key={idx}>{error}</div>
                              ))}
                              {source.errors.length > 2 && <div>... and {source.errors.length - 2} more</div>}
                            </Alert>
                          </FlexItem>
                        )}
                      </Flex>
                    </CardBody>
                  </Card>
                ))}
              </Gallery>
            )}
          </TabContent>
        </Tab>

        <Tab
          eventKey="query"
          title={
            <TabTitleText>
              <SearchIcon /> Query
            </TabTitleText>
          }
        >
          <TabContent id="query-tab" style={{ marginTop: '1rem' }}>
            <Card isPlain>
              <CardHeader>
                <CardTitle>Query This Database</CardTitle>
              </CardHeader>
              <CardBody>
                <Form>
                  <FormGroup label="Query" isRequired>
                    <TextArea
                      value={queryRequest.query}
                      onChange={(_, value) => setQueryRequest({ ...queryRequest, query: value })}
                      placeholder="Enter your query..."
                      rows={3}
                    />
                  </FormGroup>

                  <FormGroup label="Max Chunks">
                    <TextInput
                      type="number"
                      value={queryRequest.max_chunks}
                      onChange={(_, value) => setQueryRequest({ ...queryRequest, max_chunks: parseInt(value) || 5 })}
                      min={1}
                      max={20}
                    />
                  </FormGroup>

                  <Button
                    variant="primary"
                    onClick={handleQueryRAG}
                    isDisabled={!queryRequest.query.trim() || querying}
                    isLoading={querying}
                  >
                    {querying ? 'Querying...' : 'Query RAG System'}
                  </Button>
                </Form>

                {queryResults && (
                  <div style={{ marginTop: '2rem' }}>
                    <Title headingLevel="h3" size="lg">
                      Query Results
                    </Title>
                    <p>
                      Found <strong>{queryResults.total_chunks_found}</strong> chunks in{' '}
                      <strong>{queryResults.query_time_ms.toFixed(2)}ms</strong>
                    </p>

                    {queryResults.chunks.length === 0 ? (
                      <EmptyState title="No Results Found" headingLevel="h4" icon={SearchIcon}>
                        <EmptyStateBody>
                          No relevant content was found for your query. Try different keywords or check if documents are
                          properly ingested.
                        </EmptyStateBody>
                      </EmptyState>
                    ) : (
                      <div style={{ marginTop: '1rem' }}>
                        {queryResults.chunks.map((chunk, index) => (
                          <Card key={index} style={{ marginBottom: '1rem' }} isExpanded={expandedCards[index] || false}>
                            <CardHeader
                              onExpand={() => onCardExpand(index)}
                              toggleButtonProps={{
                                id: `toggle-button-${index}`,
                                'aria-label': 'Details',
                                'aria-labelledby': `chunk-card-title-${index} toggle-button-${index}`,
                                'aria-expanded': expandedCards[index] || false,
                              }}
                            >
                              <CardTitle id={`chunk-card-title-${index}`}>
                                <Flex
                                  direction={{ default: 'row' }}
                                  spaceItems={{ default: 'spaceItemsSm' }}
                                  alignItems={{ default: 'alignItemsCenter' }}
                                >
                                  <FlexItem>Chunk {index + 1}</FlexItem>
                                  <FlexItem>
                                    <Badge isRead>
                                      Score:{' '}
                                      {typeof chunk.metadata.score === 'number'
                                        ? chunk.metadata.score.toFixed(3)
                                        : chunk.metadata.score}
                                    </Badge>
                                  </FlexItem>
                                </Flex>
                              </CardTitle>
                              {chunk.metadata?.document_id && (
                                <div style={{ fontSize: '0.875rem', color: '#6a6e73', marginTop: '0.25rem' }}>
                                  Document: {chunk.metadata.document_id}
                                </div>
                              )}
                            </CardHeader>
                            <CardExpandableContent>
                              <CardBody>
                                <div style={{ marginBottom: '1rem' }}>
                                  <strong>Full Content:</strong>
                                </div>
                                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{chunk.content}</pre>
                                {chunk.metadata && (
                                  <div
                                    style={{
                                      marginTop: '1rem',
                                      padding: '0.5rem',
                                      background: '#f8f9fa',
                                      borderRadius: '4px',
                                    }}
                                  >
                                    <strong>Metadata:</strong>
                                    <pre style={{ fontSize: '0.8rem', margin: '0.5rem 0' }}>
                                      {JSON.stringify(chunk.metadata, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </CardBody>
                            </CardExpandableContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>
          </TabContent>
        </Tab>

        <Tab
          eventKey="chunks"
          title={
            <TabTitleText>
              <FileIcon /> Browse Chunks ({totalChunks})
            </TabTitleText>
          }
        >
          <TabContent id="chunks-tab" style={{ marginTop: '1rem' }}>
            <Card isPlain>
              <CardHeader>
                <CardTitle>Browse All Chunks</CardTitle>
              </CardHeader>
              <CardBody>
                <Toolbar>
                  <ToolbarContent>
                    <ToolbarItem>
                      <TextInput
                        type="text"
                        value={chunkSearchQuery}
                        onChange={(_, value) => setChunkSearchQuery(value)}
                        placeholder="Search within chunks..."
                        style={{ width: '300px' }}
                      />
                    </ToolbarItem>
                    <ToolbarItem>
                      <Button variant="primary" onClick={handleSearchChunks} isDisabled={chunksLoading}>
                        Search
                      </Button>
                    </ToolbarItem>
                    <ToolbarItem>
                      <Button variant="secondary" onClick={() => loadChunks(0, '')} isDisabled={chunksLoading}>
                        Show All
                      </Button>
                    </ToolbarItem>
                  </ToolbarContent>
                </Toolbar>

                {chunksLoading ? (
                  <div style={{ textAlign: 'center', padding: '2rem' }}>
                    <Spinner size="lg" />
                  </div>
                ) : chunks.length === 0 ? (
                  <EmptyState title="No Chunks Found" headingLevel="h3" icon={FileIcon}>
                    <EmptyStateBody>
                      No chunks found in this vector database. Try ingesting some documents first.
                    </EmptyStateBody>
                  </EmptyState>
                ) : (
                  <div>
                    <div style={{ marginBottom: '1rem' }}>
                      <p>
                        Showing {chunksOffset + 1}-{Math.min(chunksOffset + chunksLimit, totalChunks)} of {totalChunks}{' '}
                        chunks
                      </p>
                    </div>

                    <Gallery hasGutter minWidths={{ default: '400px' }}>
                      {chunks.map((chunk, index) => (
                        <Card key={chunk.chunk_id} style={{ height: '300px' }}>
                          <CardHeader>
                            <CardTitle>
                              <Badge isRead>Chunk {chunksOffset + index + 1}</Badge>
                            </CardTitle>
                            {chunk.document_id && (
                              <div style={{ fontSize: '0.8rem', color: '#6a6e73' }}>Doc: {chunk.document_id}</div>
                            )}
                          </CardHeader>
                          <CardBody style={{ overflow: 'auto' }}>
                            <pre
                              style={{
                                whiteSpace: 'pre-wrap',
                                fontSize: '0.8rem',
                                margin: 0,
                                fontFamily: 'inherit',
                              }}
                            >
                              {chunk.content.substring(0, 300)}
                              {chunk.content.length > 300 && '...'}
                            </pre>
                          </CardBody>
                        </Card>
                      ))}
                    </Gallery>

                    <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                      <Button
                        variant="secondary"
                        onClick={handleChunksPrevPage}
                        isDisabled={chunksOffset === 0 || chunksLoading}
                        style={{ marginRight: '1rem' }}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={handleChunksNextPage}
                        isDisabled={chunksOffset + chunksLimit >= totalChunks || chunksLoading}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          </TabContent>
        </Tab>
      </Tabs>

      {/* Ingest Documents Modal */}
      <Modal
        variant={ModalVariant.large}
        title="Ingest Documents"
        isOpen={showIngestModal}
        onClose={() => setShowIngestModal(false)}
      >
        <ModalBody>
          <Form>
            {newDocuments.map((doc, index) => (
              <Card key={index} style={{ marginBottom: '1rem' }} isPlain>
                <CardBody>
                  <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsSm' }}>
                    <FlexItem>
                      <FormGroup label="Document Name" isRequired>
                        <TextInput
                          value={doc.name}
                          onChange={(_, value) => updateDocumentSource(index, 'name', value)}
                          placeholder="e.g., PatternFly Button Component"
                        />
                      </FormGroup>
                    </FlexItem>

                    <FlexItem>
                      <FormGroup label="URL" isRequired>
                        <TextInput
                          value={doc.url}
                          onChange={(_, value) => updateDocumentSource(index, 'url', value)}
                          placeholder="https://example.com/document.md"
                        />
                      </FormGroup>
                    </FlexItem>

                    <Flex>
                      <FlexItem flex={{ default: 'flex_1' }}>
                        <FormGroup label="MIME Type">
                          <Select
                            role="menu"
                            id={getMimeTypeSelectId(index)}
                            isOpen={mimeTypeSelectStates[getMimeTypeSelectId(index)] || false}
                            selected={doc.mime_type}
                            onSelect={(_, selection) => {
                              updateDocumentSource(index, 'mime_type', selection as string);
                              setMimeTypeSelectStates({
                                ...mimeTypeSelectStates,
                                [getMimeTypeSelectId(index)]: false,
                              });
                            }}
                            onOpenChange={(nextOpen: boolean) =>
                              setMimeTypeSelectStates({
                                ...mimeTypeSelectStates,
                                [getMimeTypeSelectId(index)]: nextOpen,
                              })
                            }
                            toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                              <MenuToggle
                                ref={toggleRef}
                                onClick={() =>
                                  setMimeTypeSelectStates({
                                    ...mimeTypeSelectStates,
                                    [getMimeTypeSelectId(index)]: !mimeTypeSelectStates[getMimeTypeSelectId(index)],
                                  })
                                }
                                isExpanded={mimeTypeSelectStates[getMimeTypeSelectId(index)] || false}
                                style={{ width: '100%' } as React.CSSProperties}
                              >
                                {doc.mime_type}
                              </MenuToggle>
                            )}
                          >
                            <SelectList>
                              <SelectOption value="text/plain">text/plain</SelectOption>
                              <SelectOption value="text/markdown">text/markdown</SelectOption>
                              <SelectOption value="text/html">text/html</SelectOption>
                              <SelectOption value="application/pdf">application/pdf</SelectOption>
                            </SelectList>
                          </Select>
                        </FormGroup>
                      </FlexItem>

                      <FlexItem>
                        {newDocuments.length > 1 && (
                          <Button
                            variant="link"
                            isDanger
                            onClick={() => removeDocumentField(index)}
                            style={{ marginTop: '1.5rem' }}
                          >
                            Remove
                          </Button>
                        )}
                      </FlexItem>
                    </Flex>
                  </Flex>
                </CardBody>
              </Card>
            ))}

            <Button variant="link" icon={<PlusCircleIcon />} onClick={addDocumentField}>
              Add Another Document
            </Button>

            <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
              <Switch
                id="llama-index-toggle"
                label={useLlamaIndex ? 'Use LlamaIndex Smart Loaders' : 'Use Basic Ingestion'}
                isChecked={useLlamaIndex}
                onChange={(_, checked) => setUseLlamaIndex(checked)}
              />
              <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6a6e73' }}>
                {useLlamaIndex
                  ? '✨ LlamaIndex provides smart parsing for GitHub repositories, better chunking, and understands code structure.'
                  : 'Basic ingestion processes documents one-by-one with simple text splitting.'}
              </div>
            </div>
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={handleIngestDocuments} isDisabled={ingesting} isLoading={ingesting}>
            {ingesting ? 'Ingesting...' : 'Ingest Documents'}
          </Button>
          <Button variant="link" onClick={() => setShowIngestModal(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Vector Database Confirmation Modal */}
      <Modal
        variant={ModalVariant.small}
        title="Delete Vector Database"
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
      >
        <ModalBody>
          <p>
            Are you sure you want to delete the vector database <strong>{vectorDb.name}</strong>?
          </p>
          <p>This action cannot be undone and will permanently remove all documents and associated data.</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={handleDeleteDatabase}>
            Delete
          </Button>
          <Button variant="link" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      {/* Reset Vector Database Confirmation Modal */}
      <Modal
        variant={ModalVariant.small}
        title="Reset Vector Database"
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
      >
        <ModalBody>
          <p>
            Are you sure you want to reset the vector database <strong>{vectorDb.name}</strong>?
          </p>
          <p>
            This will delete all documents and chunks, then recreate the database fresh. All orphaned chunks will be
            cleaned up. This action cannot be undone.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="warning" onClick={handleResetDatabase}>
            Reset Database
          </Button>
          <Button variant="link" onClick={() => setShowResetModal(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </PageSection>
  );
};

export default VectorDatabaseDetail;
