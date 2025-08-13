import React, { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  MenuToggle,
  MenuToggleElement,
  Modal,
  ModalBody,
  ModalFooter,
  ModalVariant,
  PageSection,
  Select,
  SelectList,
  SelectOption,
  Spinner,
  TextArea,
  TextInput,
  Title,
} from '@patternfly/react-core';
import { ExpandableRowContent, Table, TableVariant, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { DatabaseIcon, EyeIcon, PlusCircleIcon, TrashIcon } from '@patternfly/react-icons';

import simpleApiService from '../services/simpleApi';
import type { RAGStoreInfo } from '../services/simpleApi';

type ViewMode = 'list' | 'detail';

interface ChunkInfo {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  document_id: string;
  document_name: string;
  created_at: string;
}

const RAGManager: React.FC = () => {
  // State
  const [vectorDbs, setVectorDbs] = useState<RAGStoreInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedStore, setSelectedStore] = useState<RAGStoreInfo | null>(null);
  const [chunks, setChunks] = useState<ChunkInfo[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [expandedChunkIds, setExpandedChunkIds] = useState<string[]>([]);

  // Modal states
  const [showCreateDbModal, setShowCreateDbModal] = useState(false);
  const [showIngestModal, setShowIngestModal] = useState(false);

  // Form states
  const [newDbConfig, setNewDbConfig] = useState({
    vector_db_id: '',
    name: '',
    description: '',
    embedding_model: 'all-MiniLM-L6-v2',
    embedding_dimension: 384,
    use_case: '',
  });

  // Select states
  const [isUseCaseSelectOpen, setIsUseCaseSelectOpen] = useState(false);

  // Document ingestion states
  const [isIngesting, setIsIngesting] = useState(false);
  const [useLlamaIndex, setUseLlamaIndex] = useState(true);
  const [documentList, setDocumentList] = useState<
    Array<{
      id: string;
      name: string;
      url: string;
      mime_type: string;
      metadata: Record<string, unknown>;
      source_type?: 'web' | 'github_repo' | 'github_file' | 'document' | 'api';
    }>
  >([]);

  // New document form states
  const [newDoc, setNewDoc] = useState({
    name: '',
    url: '',
    mime_type: 'text/html',
    metadata: {} as Record<string, unknown>,
    source_type: 'web' as 'web' | 'github_repo' | 'github_file' | 'document' | 'api',
  });

  useEffect(() => {
    loadVectorDatabases();
  }, []);

  const detectSourceType = (url: string): 'web' | 'github_repo' | 'github_file' | 'document' | 'api' => {
    if (url.includes('github.com')) {
      if (url.includes('/blob/') || url.includes('/raw/')) {
        return 'github_file';
      }
      return 'github_repo';
    }
    if (url.includes('api.') || url.includes('/api/')) {
      return 'api';
    }
    if (url.match(/\.(pdf|doc|docx|txt|md)$/i)) {
      return 'document';
    }
    return 'web';
  };

  const loadVectorDatabases = async () => {
    try {
      setLoading(true);
      const response = await simpleApiService.listRagStores();
      setVectorDbs(response.stores);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load RAG stores');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDatabase = async () => {
    try {
      await simpleApiService.createRAGStore(newDbConfig.vector_db_id, newDbConfig.name, newDbConfig.description);
      setSuccess('RAG store created successfully');
      setShowCreateDbModal(false);
      setNewDbConfig({
        vector_db_id: '',
        name: '',
        description: '',
        embedding_model: 'all-MiniLM-L6-v2',
        embedding_dimension: 384,
        use_case: '',
      });
      loadVectorDatabases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create RAG store');
    }
  };

  const handleSetupPredefined = async () => {
    try {
      setLoading(true);
      const result = await simpleApiService.setupPredefinedRAGStores();
      setSuccess(`${result.message}. Check the logs for details.`);
      loadVectorDatabases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to setup predefined stores');
    } finally {
      setLoading(false);
    }
  };

  const handleStoreSelect = async (store: RAGStoreInfo) => {
    setSelectedStore(store);
    setViewMode('detail');
    await loadStoreChunks();
  };

  const loadStoreChunks = async () => {
    try {
      setChunksLoading(true);
      // For now, create mock data since the API doesn't have chunks endpoint yet
      const mockChunks: ChunkInfo[] = [
        {
          id: 'chunk-1',
          content:
            'This is a sample chunk of text from a document that contains information about PatternFly components and their usage patterns...',
          metadata: { source: 'patternfly-docs.html', page: 1, section: 'introduction', category: 'design-system' },
          document_id: 'doc-1',
          document_name: 'PatternFly Documentation',
          created_at: new Date().toISOString(),
        },
        {
          id: 'chunk-2',
          content:
            'Another chunk with different content about React hooks and state management best practices for building scalable applications...',
          metadata: { source: 'react-guide.md', section: 'hooks', framework: 'react', difficulty: 'intermediate' },
          document_id: 'doc-2',
          document_name: 'React Best Practices Guide',
          created_at: new Date().toISOString(),
        },
        {
          id: 'chunk-3',
          content:
            'Information about Kubernetes deployment strategies and container orchestration patterns for cloud-native applications...',
          metadata: { source: 'k8s-deployment.yaml', type: 'deployment', namespace: 'default' },
          document_id: 'doc-3',
          document_name: 'Kubernetes Deployment Guide',
          created_at: new Date().toISOString(),
        },
      ];
      setChunks(mockChunks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chunks');
    } finally {
      setChunksLoading(false);
    }
  };

  const handleBackToList = () => {
    setViewMode('list');
    setSelectedStore(null);
    setChunks([]);
  };

  const addDocumentToList = () => {
    if (!newDoc.url.trim()) return;

    const detectedType = detectSourceType(newDoc.url);
    const doc = {
      id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: newDoc.name.trim() || `Document ${documentList.length + 1}`,
      url: newDoc.url.trim(),
      mime_type: newDoc.mime_type,
      metadata: {
        ...newDoc.metadata,
        detected_type: detectedType,
      },
      source_type: detectedType,
    };

    setDocumentList([...documentList, doc]);
    setNewDoc({ name: '', url: '', mime_type: 'text/html', metadata: {}, source_type: 'web' });
  };

  const removeDocumentFromList = (id: string) => {
    setDocumentList(documentList.filter((doc) => doc.id !== id));
  };

  const handleIngestDocuments = async () => {
    if (!selectedStore || documentList.length === 0) return;

    const documents = documentList.map((doc) => ({
      name: doc.name,
      url: doc.url,
      mime_type: doc.mime_type,
      metadata: doc.metadata,
    }));

    try {
      setIsIngesting(true);
      setError(null);

      // Use LlamaIndex for advanced processing or basic ingestion
      const result = useLlamaIndex
        ? await simpleApiService.ingestDocumentsWithLlamaIndex(selectedStore.store_id, documents)
        : await simpleApiService.ingestDocuments(selectedStore.store_id, documents);

      const method = useLlamaIndex ? 'LlamaIndex (advanced)' : 'basic';
      setSuccess(`Documents ingested successfully using ${method} processing`);
      setDocumentList([]);
      setShowIngestModal(false);
      loadVectorDatabases(); // Refresh the list
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to ingest documents';
      setError(errorMessage);
    } finally {
      setIsIngesting(false);
    }
  };

  const renderBreadcrumbs = () => (
    <Breadcrumb style={{ marginBottom: '1rem' }}>
      <BreadcrumbItem to="#" onClick={handleBackToList}>
        RAG Stores
      </BreadcrumbItem>
      {selectedStore && <BreadcrumbItem isActive>{selectedStore.name}</BreadcrumbItem>}
    </Breadcrumb>
  );

  const renderStoreTable = () => (
    <Table aria-label="RAG Vector Databases" variant={TableVariant.compact}>
      <Thead>
        <Tr>
          <Th>Name</Th>
          <Th>Store ID</Th>
          <Th>Description</Th>
          <Th>Documents</Th>
          <Th>Created</Th>
          <Th>Actions</Th>
        </Tr>
      </Thead>
      <Tbody>
        {vectorDbs.map((store) => (
          <Tr key={store.store_id}>
            <Td>
              <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
                <FlexItem>
                  <DatabaseIcon />
                </FlexItem>
                <FlexItem>
                  <strong>{store.name}</strong>
                </FlexItem>
              </Flex>
            </Td>
            <Td>
              <Badge color="blue">{store.store_id}</Badge>
            </Td>
            <Td>
              <span
                style={{
                  color: store.description ? 'inherit' : 'var(--pf-v5-global--Color--200)',
                  fontStyle: store.description ? 'normal' : 'italic',
                }}
              >
                {store.description || 'No description'}
              </span>
            </Td>
            <Td>
              <Badge color={store.document_count > 0 ? 'green' : 'grey'}>{store.document_count}</Badge>
            </Td>
            <Td>{new Date(store.created_at).toLocaleDateString()}</Td>
            <Td>
              <Flex spaceItems={{ default: 'spaceItemsSm' }}>
                <FlexItem>
                  <Button variant="primary" size="sm" icon={<EyeIcon />} onClick={() => handleStoreSelect(store)}>
                    View Details
                  </Button>
                </FlexItem>
                <FlexItem>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<PlusCircleIcon />}
                    onClick={() => {
                      setSelectedStore(store);
                      setShowIngestModal(true);
                    }}
                  >
                    Ingest
                  </Button>
                </FlexItem>
              </Flex>
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );

  const setChunkExpanded = (chunk: ChunkInfo, isExpanding = true) => {
    setExpandedChunkIds((prevExpanded) => {
      const otherExpandedChunkIds = prevExpanded.filter((id) => id !== chunk.id);
      return isExpanding ? [...otherExpandedChunkIds, chunk.id] : otherExpandedChunkIds;
    });
  };

  const isChunkExpanded = (chunk: ChunkInfo) => expandedChunkIds.includes(chunk.id);

  const renderChunksTable = () => (
    <Card>
      <CardHeader>
        <CardTitle>
          <Title headingLevel="h3" size="md">
            Chunks ({chunks.length})
          </Title>
        </CardTitle>
      </CardHeader>
      <CardBody>
        {chunksLoading ? (
          <Flex
            justifyContent={{ default: 'justifyContentCenter' }}
            style={{ padding: 'var(--pf-v5-global--spacer--xl)' }}
          >
            <FlexItem>
              <Spinner size="lg" />
            </FlexItem>
          </Flex>
        ) : chunks.length === 0 ? (
          <EmptyState>
            <EmptyStateBody>
              <p>No chunks found in this RAG store.</p>
            </EmptyStateBody>
          </EmptyState>
        ) : (
          <Table isExpandable aria-label="Chunks" variant={TableVariant.compact}>
            <Thead>
              <Tr>
                <Th screenReaderText="Row expansion" />
                <Th>Chunk ID</Th>
                <Th>Document</Th>
                <Th>Content Preview</Th>
                <Th>Created</Th>
              </Tr>
            </Thead>
            {chunks.map((chunk, rowIndex) => (
              <Tbody key={chunk.id} isExpanded={isChunkExpanded(chunk)}>
                <Tr>
                  <Td
                    expand={{
                      rowIndex,
                      isExpanded: isChunkExpanded(chunk),
                      onToggle: () => setChunkExpanded(chunk, !isChunkExpanded(chunk)),
                      expandId: `chunk-expandable-${chunk.id}`,
                    }}
                  />
                  <Td>
                    <Badge color="blue">{chunk.id}</Badge>
                  </Td>
                  <Td>
                    <strong>{chunk.document_name}</strong>
                  </Td>
                  <Td>
                    <div
                      style={{
                        maxWidth: '400px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {chunk.content.substring(0, 150)}...
                    </div>
                  </Td>
                  <Td>{new Date(chunk.created_at).toLocaleDateString()}</Td>
                </Tr>
                <Tr isExpanded={isChunkExpanded(chunk)}>
                  <Td />
                  <Td colSpan={4}>
                    <ExpandableRowContent>
                      <Table aria-label="Chunk metadata" variant={TableVariant.compact} isNested>
                        <Thead>
                          <Tr>
                            <Th>Metadata</Th>
                            <Th>Value</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {Object.entries(chunk.metadata).map(([key, value]) => (
                            <Tr key={key}>
                              <Td>
                                <strong>{key}</strong>
                              </Td>
                              <Td>{String(value)}</Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    </ExpandableRowContent>
                  </Td>
                </Tr>
              </Tbody>
            ))}
          </Table>
        )}
      </CardBody>
    </Card>
  );

  const renderStoreDetail = () => {
    if (!selectedStore) return null;

    return (
      <div>
        <Card style={{ marginBottom: '2rem' }}>
          <CardHeader>
            <CardTitle>
              <Flex alignItems={{ default: 'alignItemsCenter' }}>
                <FlexItem>
                  <DatabaseIcon style={{ marginRight: '0.5rem' }} />
                </FlexItem>
                <FlexItem>{selectedStore.name}</FlexItem>
              </Flex>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsSm' }}>
              <FlexItem>
                <strong>Store ID:</strong> {selectedStore.store_id}
              </FlexItem>
              <FlexItem>
                <strong>Description:</strong> {selectedStore.description || 'No description'}
              </FlexItem>
              <FlexItem>
                <strong>Document Count:</strong> <Badge color="green">{selectedStore.document_count}</Badge>
              </FlexItem>
              <FlexItem>
                <strong>Created:</strong> {new Date(selectedStore.created_at).toLocaleString()}
              </FlexItem>
              <FlexItem>
                <Button variant="primary" icon={<PlusCircleIcon />} onClick={() => setShowIngestModal(true)}>
                  Ingest Documents
                </Button>
              </FlexItem>
            </Flex>
          </CardBody>
        </Card>

        {renderChunksTable()}
      </div>
    );
  };

  if (loading) {
    return (
      <PageSection>
        <Spinner size="lg" />
      </PageSection>
    );
  }

  return (
    <PageSection>
      {/* Breadcrumbs */}
      {renderBreadcrumbs()}

      {/* Page Header */}
      <Flex
        justifyContent={{ default: 'justifyContentSpaceBetween' }}
        alignItems={{ default: 'alignItemsCenter' }}
        style={{ marginBottom: '2rem' }}
      >
        <FlexItem>
          <Title headingLevel="h1" size="2xl">
            <DatabaseIcon style={{ marginRight: '0.5rem' }} />
            {viewMode === 'list' ? 'RAG Vector Databases' : `RAG Store: ${selectedStore?.name}`}
          </Title>
        </FlexItem>
        {viewMode === 'list' && (
          <FlexItem>
            <Flex spaceItems={{ default: 'spaceItemsSm' }}>
              <FlexItem>
                <Button variant="secondary" onClick={handleSetupPredefined}>
                  Setup Predefined DBs
                </Button>
              </FlexItem>
              <FlexItem>
                <Button variant="primary" icon={<PlusCircleIcon />} onClick={() => setShowCreateDbModal(true)}>
                  Create Database
                </Button>
              </FlexItem>
            </Flex>
          </FlexItem>
        )}
      </Flex>

      {/* Alerts */}
      {error && (
        <Alert
          variant="danger"
          title="Error"
          isInline
          actionClose={
            <Button variant="plain" onClick={() => setError(null)} aria-label="Close error alert">
              ×
            </Button>
          }
          style={{ marginBottom: 'var(--pf-v5-global--spacer--lg)' }}
        >
          {error}
        </Alert>
      )}

      {success && (
        <Alert
          variant="success"
          title="Success"
          isInline
          actionClose={
            <Button variant="plain" onClick={() => setSuccess(null)} aria-label="Close success alert">
              ×
            </Button>
          }
          style={{ marginBottom: 'var(--pf-v5-global--spacer--lg)' }}
        >
          {success}
        </Alert>
      )}

      {/* Main Content */}
      {viewMode === 'list' ? (
        vectorDbs.length === 0 ? (
          <EmptyState>
            <EmptyStateBody>
              <DatabaseIcon
                style={{
                  fontSize: '48px',
                  marginBottom: 'var(--pf-v5-global--spacer--lg)',
                  color: 'var(--pf-v5-global--Color--200)',
                  display: 'block',
                  margin: '0 auto var(--pf-v5-global--spacer--lg)',
                }}
              />
              <Title
                headingLevel="h2"
                size="lg"
                style={{ marginBottom: 'var(--pf-v5-global--spacer--md)', textAlign: 'center' }}
              >
                No Vector Databases
              </Title>
              <p style={{ textAlign: 'center', marginBottom: 'var(--pf-v5-global--spacer--xl)' }}>
                You haven&apos;t created any vector databases yet. Create your first database to start using RAG
                functionality.
              </p>
              <Button variant="primary" size="lg" icon={<PlusCircleIcon />} onClick={() => setShowCreateDbModal(true)}>
                Create Your First Database
              </Button>
            </EmptyStateBody>
          </EmptyState>
        ) : (
          <Card>
            <CardBody>{renderStoreTable()}</CardBody>
          </Card>
        )
      ) : (
        renderStoreDetail()
      )}

      {/* Create Database Modal */}
      <Modal
        variant={ModalVariant.medium}
        title="Create Vector Database"
        isOpen={showCreateDbModal}
        onClose={() => setShowCreateDbModal(false)}
      >
        <ModalBody>
          <Form>
            <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsLg' }}>
              <FlexItem>
                <FormGroup label="Database ID" isRequired fieldId="db-id">
                  <TextInput
                    id="db-id"
                    value={newDbConfig.vector_db_id}
                    onChange={(_, value) => setNewDbConfig({ ...newDbConfig, vector_db_id: value })}
                    placeholder="e.g., my_custom_docs"
                  />
                </FormGroup>
              </FlexItem>

              <FlexItem>
                <FormGroup label="Name" isRequired fieldId="db-name">
                  <TextInput
                    id="db-name"
                    value={newDbConfig.name}
                    onChange={(_, value) => setNewDbConfig({ ...newDbConfig, name: value })}
                    placeholder="e.g., My Custom Documentation"
                  />
                </FormGroup>
              </FlexItem>

              <FlexItem>
                <FormGroup label="Description" fieldId="db-description">
                  <TextArea
                    id="db-description"
                    value={newDbConfig.description}
                    onChange={(_, value) => setNewDbConfig({ ...newDbConfig, description: value })}
                    placeholder="Brief description of this vector database..."
                    rows={3}
                  />
                </FormGroup>
              </FlexItem>

              <FlexItem>
                <FormGroup label="Use Case" isRequired fieldId="db-use-case">
                  <Select
                    role="menu"
                    id="db-use-case"
                    isOpen={isUseCaseSelectOpen}
                    selected={newDbConfig.use_case}
                    onSelect={(_, selection) => {
                      setNewDbConfig({ ...newDbConfig, use_case: selection as string });
                      setIsUseCaseSelectOpen(false);
                    }}
                    onOpenChange={(nextOpen: boolean) => setIsUseCaseSelectOpen(nextOpen)}
                    toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                      <MenuToggle
                        ref={toggleRef}
                        onClick={() => setIsUseCaseSelectOpen(!isUseCaseSelectOpen)}
                        isExpanded={isUseCaseSelectOpen}
                        style={{ width: '100%' } as React.CSSProperties}
                      >
                        {newDbConfig.use_case || 'Select use case...'}
                      </MenuToggle>
                    )}
                  >
                    <SelectList>
                      <SelectOption value="documentation">Documentation</SelectOption>
                      <SelectOption value="patternfly">PatternFly</SelectOption>
                      <SelectOption value="github_repos">GitHub Repositories</SelectOption>
                      <SelectOption value="custom">Custom</SelectOption>
                    </SelectList>
                  </Select>
                </FormGroup>
              </FlexItem>

              <FlexItem>
                <Flex spaceItems={{ default: 'spaceItemsMd' }}>
                  <FlexItem flex={{ default: 'flex_2' }}>
                    <FormGroup label="Embedding Model" fieldId="db-embedding-model">
                      <TextInput
                        id="db-embedding-model"
                        value={newDbConfig.embedding_model}
                        onChange={(_, value) => setNewDbConfig({ ...newDbConfig, embedding_model: value })}
                        placeholder="all-MiniLM-L6-v2"
                      />
                    </FormGroup>
                  </FlexItem>
                  <FlexItem flex={{ default: 'flex_1' }}>
                    <FormGroup label="Embedding Dimension" fieldId="db-embedding-dimension">
                      <TextInput
                        id="db-embedding-dimension"
                        type="number"
                        value={(newDbConfig.embedding_dimension || 384).toString()}
                        onChange={(_, value) =>
                          setNewDbConfig({ ...newDbConfig, embedding_dimension: parseInt(value) || 384 })
                        }
                      />
                    </FormGroup>
                  </FlexItem>
                </Flex>
              </FlexItem>
            </Flex>
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={handleCreateDatabase}
            isDisabled={!newDbConfig.vector_db_id.trim() || !newDbConfig.name.trim() || !newDbConfig.use_case}
          >
            Create Database
          </Button>
          <Button variant="link" onClick={() => setShowCreateDbModal(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      {/* Document Ingestion Modal */}
      <Modal
        variant={ModalVariant.large}
        title="Ingest Documents with AI Processing"
        isOpen={showIngestModal}
        onClose={() => {
          setShowIngestModal(false);
          setDocumentList([]);
        }}
      >
        <ModalBody>
          <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsMd' }}>
            {/* Processing Method Selector */}
            <FlexItem>
              <Card isCompact>
                <CardHeader>
                  <CardTitle>Processing Method</CardTitle>
                </CardHeader>
                <CardBody>
                  <Flex spaceItems={{ default: 'spaceItemsMd' }} alignItems={{ default: 'alignItemsCenter' }}>
                    <FlexItem>
                      <input
                        type="radio"
                        id="llamaindex-processing"
                        name="processing-method"
                        checked={useLlamaIndex}
                        onChange={() => setUseLlamaIndex(true)}
                        style={{ marginRight: '8px' }}
                      />
                      <label
                        htmlFor="llamaindex-processing"
                        style={{ fontWeight: 'bold', color: 'var(--pf-v5-global--palette--blue-400)' }}
                      >
                        🚀 LlamaIndex (Recommended)
                      </label>
                      <p
                        style={{
                          fontSize: 'var(--pf-v5-global--FontSize--sm)',
                          color: 'var(--pf-v5-global--Color--200)',
                          margin: '4px 0 0 24px',
                        }}
                      >
                        Advanced processing for GitHub repos, web scraping, smart chunking
                      </p>
                    </FlexItem>
                    <FlexItem>
                      <input
                        type="radio"
                        id="basic-processing"
                        name="processing-method"
                        checked={!useLlamaIndex}
                        onChange={() => setUseLlamaIndex(false)}
                        style={{ marginRight: '8px' }}
                      />
                      <label htmlFor="basic-processing">📄 Basic Processing</label>
                      <p
                        style={{
                          fontSize: 'var(--pf-v5-global--FontSize--sm)',
                          color: 'var(--pf-v5-global--Color--200)',
                          margin: '4px 0 0 24px',
                        }}
                      >
                        Simple URL-based ingestion
                      </p>
                    </FlexItem>
                  </Flex>
                </CardBody>
              </Card>
            </FlexItem>

            {/* Add Document Form */}
            <FlexItem>
              <Card isCompact>
                <CardHeader>
                  <CardTitle>Add New Document</CardTitle>
                  {useLlamaIndex && (
                    <p
                      style={{
                        fontSize: 'var(--pf-v5-global--FontSize--sm)',
                        color: 'var(--pf-v5-global--Color--200)',
                        margin: '8px 0 0 0',
                      }}
                    >
                      💡 <strong>Examples:</strong> GitHub repos (https://github.com/owner/repo), web pages
                      (https://docs.example.com), PDF files, API docs
                    </p>
                  )}
                </CardHeader>
                <CardBody>
                  <Form>
                    <Flex spaceItems={{ default: 'spaceItemsMd' }} alignItems={{ default: 'alignItemsFlexEnd' }}>
                      <FlexItem flex={{ default: 'flex_2' }}>
                        <FormGroup label="Document Name" fieldId="doc-name">
                          <TextInput
                            id="doc-name"
                            value={newDoc.name}
                            onChange={(_event, value) => setNewDoc({ ...newDoc, name: value })}
                            placeholder="Enter document name"
                          />
                        </FormGroup>
                      </FlexItem>
                      <FlexItem flex={{ default: 'flex_3' }}>
                        <FormGroup label="Document URL" isRequired fieldId="doc-url">
                          <TextInput
                            id="doc-url"
                            value={newDoc.url}
                            onChange={(_event, value) => setNewDoc({ ...newDoc, url: value })}
                            placeholder="https://example.com/document.pdf"
                          />
                        </FormGroup>
                      </FlexItem>
                      <FlexItem flex={{ default: 'flex_1' }}>
                        <FormGroup label="MIME Type" fieldId="doc-mime">
                          <select
                            id="doc-mime"
                            value={newDoc.mime_type}
                            onChange={(e) => setNewDoc({ ...newDoc, mime_type: e.target.value })}
                            style={{
                              width: '100%',
                              padding: 'var(--pf-v5-global--spacer--sm)',
                              border: '1px solid var(--pf-v5-global--BorderColor--100)',
                              borderRadius: 'var(--pf-v5-global--BorderRadius--sm)',
                              fontSize: 'var(--pf-v5-global--FontSize--md)',
                              backgroundColor: 'var(--pf-v5-global--BackgroundColor--100)',
                            }}
                          >
                            <option value="text/html">HTML</option>
                            <option value="application/pdf">PDF</option>
                            <option value="text/plain">Text</option>
                            <option value="application/json">JSON</option>
                            <option value="text/markdown">Markdown</option>
                          </select>
                        </FormGroup>
                      </FlexItem>
                      <FlexItem>
                        <Button
                          variant="primary"
                          onClick={addDocumentToList}
                          isDisabled={!newDoc.url.trim()}
                          icon={<PlusCircleIcon />}
                        >
                          Add
                        </Button>
                      </FlexItem>
                    </Flex>
                  </Form>
                </CardBody>
              </Card>
            </FlexItem>

            {/* Document List */}
            {documentList.length > 0 && (
              <FlexItem>
                <Card>
                  <CardHeader>
                    <CardTitle>Documents to Ingest ({documentList.length})</CardTitle>
                  </CardHeader>
                  <CardBody>
                    <Table aria-label="Documents to ingest" variant={TableVariant.compact}>
                      <Thead>
                        <Tr>
                          <Th>Name</Th>
                          <Th>URL</Th>
                          <Th>Source Type</Th>
                          <Th>MIME Type</Th>
                          <Th>Actions</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {documentList.map((doc) => (
                          <Tr key={doc.id}>
                            <Td>{doc.name || 'Untitled'}</Td>
                            <Td>
                              <a
                                href={doc.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: 'var(--pf-v5-global--FontSize--sm)' }}
                              >
                                {doc.url.length > 50 ? `${doc.url.substring(0, 50)}...` : doc.url}
                              </a>
                            </Td>
                            <Td>
                              <Badge
                                color={
                                  doc.source_type === 'github_repo'
                                    ? 'purple'
                                    : doc.source_type === 'github_file'
                                      ? 'purple'
                                      : doc.source_type === 'web'
                                        ? 'green'
                                        : doc.source_type === 'document'
                                          ? 'orange'
                                          : 'grey'
                                }
                              >
                                {doc.source_type === 'github_repo'
                                  ? '📁 GitHub Repo'
                                  : doc.source_type === 'github_file'
                                    ? '📄 GitHub File'
                                    : doc.source_type === 'web'
                                      ? '🌐 Web Page'
                                      : doc.source_type === 'document'
                                        ? '📋 Document'
                                        : doc.source_type === 'api'
                                          ? '🔗 API'
                                          : 'Unknown'}
                              </Badge>
                            </Td>
                            <Td>
                              <Badge color="blue">{doc.mime_type}</Badge>
                            </Td>
                            <Td>
                              <Button
                                variant="plain"
                                size="sm"
                                aria-label="Remove document"
                                onClick={() => removeDocumentFromList(doc.id)}
                              >
                                <TrashIcon />
                              </Button>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </CardBody>
                </Card>
              </FlexItem>
            )}
          </Flex>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={handleIngestDocuments}
            isDisabled={isIngesting || documentList.length === 0}
            isLoading={isIngesting}
          >
            {isIngesting
              ? 'Ingesting...'
              : `Ingest ${documentList.length} Document${documentList.length !== 1 ? 's' : ''}`}
          </Button>
          <Button variant="link" onClick={() => setShowIngestModal(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </PageSection>
  );
};

export default RAGManager;
