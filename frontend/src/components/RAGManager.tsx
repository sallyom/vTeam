import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { ArrowRightIcon, DatabaseIcon, FileIcon, PlusCircleIcon, SearchIcon } from '@patternfly/react-icons';

import { apiService } from '../services/api';
import type { VectorDBConfig, VectorDBInfo } from '../types/api';

const RAGManager: React.FC = () => {
  const navigate = useNavigate();

  // State
  const [vectorDbs, setVectorDbs] = useState<VectorDBInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal states
  const [showCreateDbModal, setShowCreateDbModal] = useState(false);

  // Form states
  const [newDbConfig, setNewDbConfig] = useState<VectorDBConfig>({
    vector_db_id: '',
    name: '',
    description: '',
    embedding_model: 'all-MiniLM-L6-v2',
    embedding_dimension: 384,
    use_case: '',
  });

  // Select states
  const [isUseCaseSelectOpen, setIsUseCaseSelectOpen] = useState(false);

  useEffect(() => {
    loadVectorDatabases();
  }, []);

  const loadVectorDatabases = async () => {
    try {
      setLoading(true);
      const response = await apiService.listVectorDatabases();
      setVectorDbs(response.vector_dbs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vector databases');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDatabase = async () => {
    try {
      await apiService.createVectorDatabase(newDbConfig);
      setSuccess('Vector database created successfully');
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
      setError(err instanceof Error ? err.message : 'Failed to create vector database');
    }
  };

  const handleSetupPredefined = async () => {
    try {
      await apiService.setupPredefinedVectorDatabases();
      setSuccess('Predefined vector databases set up successfully');
      loadVectorDatabases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to setup predefined databases');
    }
  };

  const navigateToDatabase = (vectorDbId: string) => {
    navigate(`/rag/db/${vectorDbId}`);
  };

  const getUseCaseBadgeColor = (useCase: string) => {
    switch (useCase.toLowerCase()) {
      case 'patternfly':
        return 'blue';
      case 'documentation':
        return 'green';
      case 'github_repos':
        return 'purple';
      case 'custom':
        return 'orange';
      default:
        return 'grey';
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
              key={vdb.vector_db_id}
              onClick={() => navigateToDatabase(vdb.vector_db_id)}
              style={{ cursor: 'pointer' }}
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
                      <ArrowRightIcon />
                    </FlexItem>
                  </Flex>
                </CardTitle>
              </CardHeader>
              <CardBody>
                <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsSm' }}>
                  <FlexItem>
                    <Badge color={getUseCaseBadgeColor(vdb.use_case)}>{vdb.use_case}</Badge>
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
                            <strong>{vdb.total_chunks}</strong>
                          </FlexItem>
                          <FlexItem style={{ fontSize: '0.75rem', color: '#6a6e73' }}>Chunks</FlexItem>
                        </Flex>
                      </FlexItem>
                    </Flex>
                  </FlexItem>

                  <FlexItem style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #d2d2d2' }}>
                    <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsXs' }}>
                      <FlexItem style={{ fontSize: '0.75rem', color: '#6a6e73' }}>
                        <strong>Model:</strong> {vdb.embedding_model}
                      </FlexItem>
                      <FlexItem style={{ fontSize: '0.75rem', color: '#6a6e73' }}>
                        <strong>Created:</strong> {new Date(vdb.created_at).toLocaleDateString()}
                      </FlexItem>
                      {vdb.last_updated && (
                        <FlexItem style={{ fontSize: '0.75rem', color: '#6a6e73' }}>
                          <strong>Updated:</strong> {new Date(vdb.last_updated).toLocaleDateString()}
                        </FlexItem>
                      )}
                    </Flex>
                  </FlexItem>
                </Flex>
              </CardBody>
            </Card>
          ))}
        </Gallery>
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
    </PageSection>
  );
};

export default RAGManager;
