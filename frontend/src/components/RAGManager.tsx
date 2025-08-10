import React, { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
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
  Gallery,
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
import {
  ArrowRightIcon,
  CheckIcon,
  DatabaseIcon,
  FileIcon,
  PlusCircleIcon,
  SearchIcon,
  TrashIcon,
} from '@patternfly/react-icons';

import { simpleApi } from '../services/simpleApi';
import type { RAGStoreInfo } from '../services/simpleApi';

const RAGManager: React.FC = () => {
  // State
  const [vectorDbs, setVectorDbs] = useState<RAGStoreInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);

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
  const [ingestDocuments, setIngestDocuments] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);
  const [documentList, setDocumentList] = useState<
    Array<{
      id: string;
      name: string;
      url: string;
      mime_type: string;
      metadata: Record<string, unknown>;
    }>
  >([]);
  const [showAdvancedForm, setShowAdvancedForm] = useState(false);

  // New document form states
  const [newDoc, setNewDoc] = useState({
    name: '',
    url: '',
    mime_type: 'text/html',
    metadata: {} as Record<string, unknown>,
  });

  useEffect(() => {
    loadVectorDatabases();
  }, []);

  const loadVectorDatabases = async () => {
    try {
      setLoading(true);
      const response = await simpleApi.listRAGStores();
      setVectorDbs(response.stores);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load RAG stores');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDatabase = async () => {
    try {
      await simpleApi.createRAGStore(newDbConfig.vector_db_id, newDbConfig.name, newDbConfig.description);
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
      const result = await simpleApi.setupPredefinedRAGStores();
      setSuccess(`${result.message}. Check the logs for details.`);
      loadVectorDatabases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to setup predefined stores');
    } finally {
      setLoading(false);
    }
  };

  const handleStoreSelect = (storeId: string) => {
    setSelectedStore(selectedStore === storeId ? null : storeId);
  };

  const addDocumentToList = () => {
    if (!newDoc.url.trim()) return;

    const doc = {
      id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: newDoc.name.trim() || `Document ${documentList.length + 1}`,
      url: newDoc.url.trim(),
      mime_type: newDoc.mime_type,
      metadata: newDoc.metadata,
    };

    setDocumentList([...documentList, doc]);
    setNewDoc({ name: '', url: '', mime_type: 'text/html', metadata: {} });
  };

  const removeDocumentFromList = (id: string) => {
    setDocumentList(documentList.filter((doc) => doc.id !== id));
  };

  const addSampleDocuments = () => {
    const samples = [
      {
        id: `doc-${Date.now()}-1`,
        name: 'PatternFly Documentation',
        url: 'https://www.patternfly.org/get-started/',
        mime_type: 'text/html',
        metadata: { category: 'design-system' },
      },
      {
        id: `doc-${Date.now()}-2`,
        name: 'React Documentation',
        url: 'https://react.dev/learn',
        mime_type: 'text/html',
        metadata: { category: 'framework' },
      },
    ];
    setDocumentList([...documentList, ...samples]);
  };

  const handleIngestDocuments = async () => {
    if (!selectedStore) return;

    let documents: Array<Record<string, unknown>> = [];

    if (showAdvancedForm && documentList.length > 0) {
      documents = documentList.map((doc) => ({
        name: doc.name,
        url: doc.url,
        mime_type: doc.mime_type,
        metadata: doc.metadata,
      }));
    } else if (!showAdvancedForm && ingestDocuments.trim()) {
      // Parse simple text input
      try {
        documents = JSON.parse(ingestDocuments);
      } catch {
        // If not JSON, treat as newline-separated URLs
        documents = ingestDocuments
          .split('\n')
          .map((url) => url.trim())
          .filter((url) => url)
          .map((url) => ({ url }));
      }
    }

    if (documents.length === 0) return;

    try {
      setIsIngesting(true);
      setError(null);

      await simpleApi.ingestDocuments(selectedStore, documents);
      setSuccess('Documents ingested successfully');
      setIngestDocuments('');
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

  if (loading) {
    return (
      <PageSection>
        <Spinner size="lg" />
      </PageSection>
    );
  }

  return (
    <PageSection>
      {/* Page Header */}
      <Flex
        justifyContent={{ default: 'justifyContentSpaceBetween' }}
        alignItems={{ default: 'alignItemsCenter' }}
        style={{ marginBottom: '2rem' }}
      >
        <FlexItem>
          <Title headingLevel="h1" size="2xl">
            <DatabaseIcon style={{ marginRight: '0.5rem' }} />
            RAG Vector Databases
          </Title>
        </FlexItem>
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
      </Flex>

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

      {/* Vector Databases Grid */}
      {vectorDbs.length === 0 ? (
        <EmptyState>
          <EmptyStateBody>
            <DatabaseIcon
              style={{
                fontSize: '48px',
                marginBottom: '1rem',
                color: '#6a6e73',
                display: 'block',
                margin: '0 auto 1rem',
              }}
            />
            <Title headingLevel="h2" size="lg" style={{ marginBottom: '1rem', textAlign: 'center' }}>
              No Vector Databases
            </Title>
            <p style={{ textAlign: 'center', marginBottom: '2rem' }}>
              You haven&apos;t created any vector databases yet. Create your first database to start using RAG
              functionality.
            </p>
            <div style={{ textAlign: 'center' }}>
              <Button variant="primary" icon={<PlusCircleIcon />} onClick={() => setShowCreateDbModal(true)}>
                Create Your First Database
              </Button>
            </div>
          </EmptyStateBody>
        </EmptyState>
      ) : (
        <Gallery hasGutter minWidths={{ default: '350px' }}>
          {vectorDbs.map((vdb) => (
            <Card
              key={vdb.store_id}
              isClickable
              isSelected={selectedStore === vdb.store_id}
              onClick={() => handleStoreSelect(vdb.store_id)}
            >
              <CardHeader>
                <CardTitle>
                  <Flex
                    justifyContent={{ default: 'justifyContentSpaceBetween' }}
                    alignItems={{ default: 'alignItemsCenter' }}
                  >
                    <FlexItem>
                      <DatabaseIcon style={{ marginRight: '0.5rem' }} />
                      {vdb.name}
                    </FlexItem>
                    <FlexItem>
                      {selectedStore === vdb.store_id ? (
                        <CheckIcon color="var(--pf-global--success-color--100)" />
                      ) : (
                        <ArrowRightIcon />
                      )}
                    </FlexItem>
                  </Flex>
                </CardTitle>
              </CardHeader>
              <CardBody>
                <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsSm' }}>
                  <FlexItem>
                    <Badge color="blue">RAG Store</Badge>
                  </FlexItem>

                  {vdb.description && (
                    <FlexItem>
                      <p style={{ color: '#6a6e73', fontSize: '0.875rem' }}>{vdb.description}</p>
                    </FlexItem>
                  )}

                  <FlexItem>
                    <Flex spaceItems={{ default: 'spaceItemsLg' }}>
                      <FlexItem>
                        <Flex direction={{ default: 'column' }} alignItems={{ default: 'alignItemsCenter' }}>
                          <FlexItem>
                            <FileIcon style={{ color: '#06c' }} />
                          </FlexItem>
                          <FlexItem>
                            <strong>{vdb.document_count}</strong>
                          </FlexItem>
                          <FlexItem style={{ fontSize: '0.75rem', color: '#6a6e73' }}>Documents</FlexItem>
                        </Flex>
                      </FlexItem>

                      <FlexItem>
                        <Flex direction={{ default: 'column' }} alignItems={{ default: 'alignItemsCenter' }}>
                          <FlexItem>
                            <SearchIcon style={{ color: '#3e8635' }} />
                          </FlexItem>
                          <FlexItem>
                            <strong>N/A</strong>
                          </FlexItem>
                          <FlexItem style={{ fontSize: '0.75rem', color: '#6a6e73' }}>Chunks</FlexItem>
                        </Flex>
                      </FlexItem>
                    </Flex>
                  </FlexItem>

                  <FlexItem style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #d2d2d2' }}>
                    <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsXs' }}>
                      <FlexItem style={{ fontSize: '0.75rem', color: '#6a6e73' }}>
                        <strong>Store ID:</strong> {vdb.store_id}
                      </FlexItem>
                      <FlexItem style={{ fontSize: '0.75rem', color: '#6a6e73' }}>
                        <strong>Created:</strong> {new Date(vdb.created_at).toLocaleDateString()}
                      </FlexItem>
                    </Flex>
                  </FlexItem>
                </Flex>
              </CardBody>
            </Card>
          ))}
        </Gallery>
      )}

      {/* Selected Store Details */}
      {selectedStore && (
        <PageSection>
          <Title headingLevel="h3">Selected Store Details</Title>
          {(() => {
            const store = vectorDbs.find((vdb) => vdb.store_id === selectedStore);
            if (!store) return null;

            return (
              <Card>
                <CardBody>
                  <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsSm' }}>
                    <FlexItem>
                      <strong>Store ID:</strong> {store.store_id}
                    </FlexItem>
                    <FlexItem>
                      <strong>Name:</strong> {store.name}
                    </FlexItem>
                    {store.description && (
                      <FlexItem>
                        <strong>Description:</strong> {store.description}
                      </FlexItem>
                    )}
                    <FlexItem>
                      <strong>Document Count:</strong> {store.document_count}
                    </FlexItem>
                    <FlexItem>
                      <strong>Created:</strong> {new Date(store.created_at).toLocaleString()}
                    </FlexItem>
                    <FlexItem>
                      <Button variant="primary" icon={<PlusCircleIcon />} onClick={() => setShowIngestModal(true)}>
                        Ingest Documents
                      </Button>
                    </FlexItem>
                  </Flex>
                </CardBody>
              </Card>
            );
          })()}
        </PageSection>
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
            <FormGroup label="Database ID" isRequired>
              <TextInput
                value={newDbConfig.vector_db_id}
                onChange={(_, value) => setNewDbConfig({ ...newDbConfig, vector_db_id: value })}
                placeholder="e.g., my_custom_docs"
              />
            </FormGroup>

            <FormGroup label="Name" isRequired>
              <TextInput
                value={newDbConfig.name}
                onChange={(_, value) => setNewDbConfig({ ...newDbConfig, name: value })}
                placeholder="e.g., My Custom Documentation"
              />
            </FormGroup>

            <FormGroup label="Description">
              <TextArea
                value={newDbConfig.description}
                onChange={(_, value) => setNewDbConfig({ ...newDbConfig, description: value })}
                placeholder="Brief description of this vector database..."
                rows={3}
              />
            </FormGroup>

            <FormGroup label="Use Case" isRequired>
              <Select
                role="menu"
                id="use-case-select"
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

            <FormGroup label="Embedding Model">
              <TextInput
                value={newDbConfig.embedding_model}
                onChange={(_, value) => setNewDbConfig({ ...newDbConfig, embedding_model: value })}
                placeholder="all-MiniLM-L6-v2"
              />
            </FormGroup>

            <FormGroup label="Embedding Dimension">
              <TextInput
                type="number"
                value={(newDbConfig.embedding_dimension || 384).toString()}
                onChange={(_, value) => setNewDbConfig({ ...newDbConfig, embedding_dimension: parseInt(value) || 384 })}
              />
            </FormGroup>
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={handleCreateDatabase}>
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
        title="Ingest Documents"
        isOpen={showIngestModal}
        onClose={() => {
          setShowIngestModal(false);
          setDocumentList([]);
          setIngestDocuments('');
          setShowAdvancedForm(false);
        }}
      >
        <ModalBody>
          <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsMd' }}>
            {/* Toggle between simple and advanced modes */}
            <FlexItem>
              <Flex spaceItems={{ default: 'spaceItemsMd' }} alignItems={{ default: 'alignItemsCenter' }}>
                <FlexItem>
                  <Button
                    variant={!showAdvancedForm ? 'primary' : 'secondary'}
                    onClick={() => setShowAdvancedForm(false)}
                  >
                    Simple Mode
                  </Button>
                </FlexItem>
                <FlexItem>
                  <Button
                    variant={showAdvancedForm ? 'primary' : 'secondary'}
                    onClick={() => setShowAdvancedForm(true)}
                  >
                    Advanced Mode
                  </Button>
                </FlexItem>
                <FlexItem>
                  <Button variant="link" onClick={addSampleDocuments}>
                    Add Sample Documents
                  </Button>
                </FlexItem>
              </Flex>
            </FlexItem>

            {/* Simple Mode */}
            {!showAdvancedForm && (
              <FlexItem>
                <Form>
                  <FormGroup label="Documents" fieldId="simple-documents">
                    <TextArea
                      id="simple-documents"
                      value={ingestDocuments}
                      onChange={(_event, value) => setIngestDocuments(value)}
                      placeholder={`Enter document URLs (one per line) or JSON array:

Simple URLs:
https://example.com/doc1.pdf
https://example.com/doc2.html

Or JSON:
[{"name": "Doc 1", "url": "https://example.com/doc1.pdf"}]`}
                      rows={8}
                    />
                  </FormGroup>
                </Form>
              </FlexItem>
            )}

            {/* Advanced Mode */}
            {showAdvancedForm && (
              <>
                {/* Add Document Form */}
                <FlexItem>
                  <Card>
                    <CardHeader>
                      <CardTitle>Add New Document</CardTitle>
                    </CardHeader>
                    <CardBody>
                      <Form>
                        <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsSm' }}>
                          <FlexItem>
                            <Flex spaceItems={{ default: 'spaceItemsMd' }}>
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
                                  <Select
                                    id="doc-mime"
                                    selected={newDoc.mime_type}
                                    onSelect={(_event, value) => setNewDoc({ ...newDoc, mime_type: value as string })}
                                    toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                                      <MenuToggle ref={toggleRef} onClick={() => {}}>
                                        {newDoc.mime_type}
                                      </MenuToggle>
                                    )}
                                  >
                                    <SelectList>
                                      <SelectOption value="text/html">HTML</SelectOption>
                                      <SelectOption value="application/pdf">PDF</SelectOption>
                                      <SelectOption value="text/plain">Text</SelectOption>
                                      <SelectOption value="application/json">JSON</SelectOption>
                                      <SelectOption value="text/markdown">Markdown</SelectOption>
                                    </SelectList>
                                  </Select>
                                </FormGroup>
                              </FlexItem>
                            </Flex>
                          </FlexItem>
                          <FlexItem>
                            <Button
                              variant="primary"
                              onClick={addDocumentToList}
                              isDisabled={!newDoc.url.trim()}
                              icon={<PlusCircleIcon />}
                            >
                              Add Document
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
                        <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsSm' }}>
                          {documentList.map((doc) => (
                            <FlexItem key={doc.id}>
                              <Card isCompact>
                                <CardBody>
                                  <Flex
                                    justifyContent={{ default: 'justifyContentSpaceBetween' }}
                                    alignItems={{ default: 'alignItemsCenter' }}
                                  >
                                    <FlexItem>
                                      <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsXs' }}>
                                        <FlexItem>
                                          <strong>{doc.name}</strong>
                                        </FlexItem>
                                        <FlexItem>
                                          <a href={doc.url} target="_blank" rel="noopener noreferrer">
                                            {doc.url}
                                          </a>
                                        </FlexItem>
                                        <FlexItem>
                                          <Badge color="blue">{doc.mime_type}</Badge>
                                        </FlexItem>
                                      </Flex>
                                    </FlexItem>
                                    <FlexItem>
                                      <Button
                                        variant="plain"
                                        aria-label="Remove document"
                                        onClick={() => removeDocumentFromList(doc.id)}
                                      >
                                        <TrashIcon />
                                      </Button>
                                    </FlexItem>
                                  </Flex>
                                </CardBody>
                              </Card>
                            </FlexItem>
                          ))}
                        </Flex>
                      </CardBody>
                    </Card>
                  </FlexItem>
                )}
              </>
            )}
          </Flex>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={handleIngestDocuments}
            isDisabled={isIngesting || (showAdvancedForm ? documentList.length === 0 : !ingestDocuments.trim())}
            isLoading={isIngesting}
          >
            {isIngesting ? 'Ingesting...' : `Ingest ${showAdvancedForm ? documentList.length : 'Documents'}`}
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
