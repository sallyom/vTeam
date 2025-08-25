import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardBody,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Modal,
  ModalBody,
  ModalFooter,
  ModalVariant,
  PageSection,
  Progress,
  ProgressSize,
  Spinner,
  TextArea,
  TextInput,
  Title,
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { ExternalLinkAltIcon, PlusIcon, TrashIcon } from '@patternfly/react-icons';

type Project = {
  project_id: string;
  name: string;
  description: string;
  project_type: string;
  created_by: string;
  auto_routing_enabled: boolean;
  created_at: string;
  last_updated?: string;
  total_documents: number;
  is_active: boolean;
  stores: Array<{
    store_id: string;
    store_type: string;
    vector_db_id: string;
    name: string;
    description: string;
    document_count: number;
  }>;
};

type IngestionStatus = {
  session_id: string;
  status: string;
  progress: number;
  current_step?: string;
  processed_items?: number;
  total_items?: number;
  error_message?: string;
  result?: Record<string, unknown>;
  created_at: string;
  started_at?: string;
  completed_at?: string;
};

export default function ProjectManager() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  // Form states
  const [newProject, setNewProject] = useState({
    project_id: '',
    name: '',
    description: '',
  });

  // Ingestion states
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);
  const [selectedProjectForIngestion, setSelectedProjectForIngestion] = useState<string | null>(null);
  const [selectedVectorStore, setSelectedVectorStore] = useState<string>('');
  const [ingestionUrl, setIngestionUrl] = useState('');
  const [ingestionStatus, setIngestionStatus] = useState<IngestionStatus | null>(null);
  const [isIngesting, setIsIngesting] = useState(false);

  // Load projects
  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8001/projects');
      if (!response.ok) throw new Error('Failed to load projects');
      const data = await response.json();
      setProjects(data.projects || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  // Create project
  const createProject = async () => {
    try {
      const projectData = {
        ...newProject,
        project_id: newProject.project_id.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      };

      const response = await fetch('http://localhost:8001/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create project');
      }

      const project = await response.json();
      setProjects((prev) => [project, ...prev]);

      // Reset form
      setNewProject({
        project_id: '',
        name: '',
        description: '',
      });
      setIsCreateModalOpen(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    }
  };

  // Delete project
  // Auto-detect processing type based on URL
  const detectProcessingType = (url: string) => {
    if (url.includes('github.com') && url.includes('/tree/')) {
      return 'github_repo';
    } else if (url.includes('github.com') || url.includes('githubusercontent.com')) {
      return 'github_file';
    } else if (url.endsWith('.pdf')) {
      return 'pdf_document';
    } else if (url.endsWith('.md')) {
      return 'markdown';
    } else {
      return 'web_scraping';
    }
  };

  const deleteProject = async (projectId: string) => {
    try {
      const response = await fetch(`http://localhost:8001/projects/${projectId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete project');

      setProjects((prev) => prev.filter((p) => p.project_id !== projectId));
      setIsDeleteModalOpen(false);
      setProjectToDelete(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
    }
  };

  // Start ingestion
  const startIngestion = async () => {
    if (!selectedProjectForIngestion || !selectedVectorStore || !ingestionUrl.trim()) return;

    try {
      setIsIngesting(true);
      setIngestionStatus(null);

      const processingType = detectProcessingType(ingestionUrl);

      // Use direct RAG store ingestion instead of project auto-routing
      const response = await fetch('http://localhost:8001/rag/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: selectedVectorStore,
          documents: [
            {
              name: ingestionUrl.split('/').pop() || 'document',
              url: ingestionUrl.trim(),
              mime_type: 'text/plain',
            },
          ],
          processing_type: processingType,
          enable_progress_tracking: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to start ingestion');
      }

      const { session_id } = await response.json();

      // Start polling for progress
      pollIngestionProgress(session_id, 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start ingestion');
      setIsIngesting(false);
    }
  };

  // Poll ingestion progress
  const pollIngestionProgress = async (sessionId: string, attemptCount = 0) => {
    const maxAttempts = 300; // 10 minutes at 2-second intervals

    try {
      const response = await fetch(`http://localhost:8001/rag/ingest/${sessionId}/progress`);
      if (!response.ok) {
        if (attemptCount < maxAttempts) {
          setTimeout(() => pollIngestionProgress(sessionId, attemptCount + 1), 2000);
        } else {
          setIsIngesting(false);
          setError('Progress tracking timed out - ingestion may still be running in background');
        }
        return;
      }

      const progress: IngestionStatus = await response.json();
      setIngestionStatus(progress);

      if (progress.status === 'completed') {
        setIsIngesting(false);
        setIsIngestModalOpen(false);
        setSelectedProjectForIngestion(null);
        setSelectedVectorStore('');
        setIngestionUrl('');

        loadProjects(); // Refresh to show updated document counts
        setTimeout(() => setIngestionStatus(null), 3000); // Clear after 3 seconds
      } else if (progress.status === 'failed') {
        setIsIngesting(false);
        setIsIngestModalOpen(false);
        setSelectedProjectForIngestion(null);
        setSelectedVectorStore('');
        setIngestionUrl('');

        setError(progress.error_message || 'Ingestion failed');
        setTimeout(() => setIngestionStatus(null), 5000); // Clear after 5 seconds
      } else if (progress.status === 'running' || progress.status === 'pending') {
        // Continue polling with attempt tracking
        if (attemptCount < maxAttempts) {
          setTimeout(() => pollIngestionProgress(sessionId, attemptCount + 1), 2000);
        } else {
          setIsIngesting(false);
          setError('Ingestion timed out - task may still be running in background');
        }
      }
    } catch (err) {
      console.error('Error polling progress:', err);
      if (attemptCount < maxAttempts) {
        setTimeout(() => pollIngestionProgress(sessionId, attemptCount + 1), 2000);
      } else {
        setIsIngesting(false);
        setError('Failed to track progress - ingestion may still be running');
      }
    }
  };

  return (
    <PageSection>
      <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsLg' }}>
        {/* Header */}
        <FlexItem>
          <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
            <FlexItem>
              <Title headingLevel="h1" size="2xl">
                🧠 Knowledge Base
              </Title>
              <p style={{ marginTop: '8px', color: 'var(--pf-v5-global--Color--200)' }}>
                Manage projects and ingest documents into your RAG knowledge base. Each project has its own dedicated
                storage.
              </p>
            </FlexItem>
            <FlexItem>
              <Button variant="primary" icon={<PlusIcon />} onClick={() => setIsCreateModalOpen(true)}>
                New Project
              </Button>
            </FlexItem>
          </Flex>
        </FlexItem>

        {/* Error Alert */}
        {error && (
          <FlexItem>
            <Alert variant="danger" title="Error" isInline>
              {error}
            </Alert>
          </FlexItem>
        )}

        {/* Ingestion Status */}
        {ingestionStatus && (
          <FlexItem>
            <Card>
              <CardBody>
                <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsSm' }}>
                  <FlexItem>
                    <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
                      <FlexItem>
                        <strong>Ingestion Status: {ingestionStatus.status}</strong>
                      </FlexItem>
                      {ingestionStatus.processed_items !== undefined && ingestionStatus.total_items !== undefined && (
                        <FlexItem>
                          <span
                            style={{
                              color: 'var(--pf-v5-global--Color--200)',
                              fontSize: 'var(--pf-v5-global--FontSize--sm)',
                            }}
                          >
                            ({ingestionStatus.processed_items}/{ingestionStatus.total_items} items)
                          </span>
                        </FlexItem>
                      )}
                    </Flex>
                  </FlexItem>

                  {/* Current Step Display */}
                  {ingestionStatus.current_step && (
                    <FlexItem>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 'var(--pf-v5-global--FontSize--sm)',
                          color: 'var(--pf-v5-global--Color--100)',
                        }}
                      >
                        {ingestionStatus.current_step}
                      </p>
                    </FlexItem>
                  )}

                  {/* Progress Bar for Running Status */}
                  {ingestionStatus.status === 'running' && (
                    <FlexItem>
                      <Progress
                        value={Math.round(ingestionStatus.progress * 100)}
                        title={`${Math.round(ingestionStatus.progress * 100)}% Complete`}
                        size={ProgressSize.sm}
                        label={
                          ingestionStatus.processed_items && ingestionStatus.total_items
                            ? `${ingestionStatus.processed_items}/${ingestionStatus.total_items}`
                            : undefined
                        }
                      />
                    </FlexItem>
                  )}

                  {/* Success Message */}
                  {ingestionStatus.status === 'completed' && (
                    <FlexItem>
                      <span style={{ color: 'var(--pf-v5-global--success-color--200)' }}>
                        ✅ Documents successfully ingested!
                        {ingestionStatus.result &&
                          typeof ingestionStatus.result === 'object' &&
                          'total_chunks_created' in ingestionStatus.result && (
                            <span style={{ marginLeft: '8px', fontSize: 'var(--pf-v5-global--FontSize--sm)' }}>
                              ({(ingestionStatus.result as { total_chunks_created?: number }).total_chunks_created || 0}{' '}
                              chunks created)
                            </span>
                          )}
                      </span>
                    </FlexItem>
                  )}

                  {/* Error Display */}
                  {ingestionStatus.status === 'failed' && ingestionStatus.error_message && (
                    <FlexItem>
                      <span style={{ color: 'var(--pf-v5-global--danger-color--100)' }}>
                        ❌ {ingestionStatus.error_message}
                      </span>
                    </FlexItem>
                  )}
                </Flex>
              </CardBody>
            </Card>
          </FlexItem>
        )}

        {/* Projects Table */}
        <FlexItem>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <Spinner />
              <p style={{ marginTop: '1rem' }}>Loading projects...</p>
            </div>
          ) : (
            <Table aria-label="Projects table" variant="compact">
              <Thead>
                <Tr>
                  <Th>Project</Th>
                  <Th>Description</Th>
                  <Th>Documents</Th>
                  <Th>Created</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {projects.length === 0 ? (
                  <Tr>
                    <Td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                      <p>No projects found. Create your first project to get started!</p>
                    </Td>
                  </Tr>
                ) : (
                  projects.map((project) => (
                    <Tr key={project.project_id}>
                      <Td>
                        <div>
                          <Button
                            variant="link"
                            isInline
                            onClick={() => navigate(`/projects/${project.project_id}`)}
                            style={{ fontSize: '1rem', fontWeight: 'bold', padding: 0 }}
                          >
                            {project.name}
                          </Button>
                        </div>
                        <small style={{ color: 'var(--pf-v5-global--Color--300)' }}>{project.project_id}</small>
                      </Td>
                      <Td>{project.description || <em>No description</em>}</Td>
                      <Td>
                        <strong>{project.total_documents}</strong>
                      </Td>
                      <Td>{new Date(project.created_at).toLocaleDateString()}</Td>
                      <Td>
                        <Flex spaceItems={{ default: 'spaceItemsSm' }}>
                          <FlexItem>
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<ExternalLinkAltIcon />}
                              onClick={() => {
                                setSelectedProjectForIngestion(project.project_id);
                                setSelectedVectorStore(''); // Reset vector store selection
                                setIsIngestModalOpen(true);
                              }}
                            >
                              Add Documents
                            </Button>
                          </FlexItem>
                          <FlexItem>
                            <Button
                              variant="danger"
                              size="sm"
                              icon={<TrashIcon />}
                              onClick={() => {
                                setProjectToDelete(project.project_id);
                                setIsDeleteModalOpen(true);
                              }}
                            >
                              Delete
                            </Button>
                          </FlexItem>
                        </Flex>
                      </Td>
                    </Tr>
                  ))
                )}
              </Tbody>
            </Table>
          )}
        </FlexItem>
      </Flex>

      {/* Create Project Modal */}
      <Modal
        variant={ModalVariant.medium}
        title="Create New Project"
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      >
        <ModalBody>
          <Form>
            <FormGroup label="Project Name" isRequired>
              <TextInput
                value={newProject.name}
                onChange={(_, value) =>
                  setNewProject((prev) => ({
                    ...prev,
                    name: value,
                    project_id: value
                      .toLowerCase()
                      .replace(/[^a-z0-9\s]/g, '')
                      .replace(/\s+/g, '-'),
                  }))
                }
                placeholder="e.g., RHOAI Dashboard"
              />
            </FormGroup>

            <FormGroup label="Project ID">
              <TextInput
                value={newProject.project_id}
                onChange={(_, value) =>
                  setNewProject((prev) => ({
                    ...prev,
                    project_id: value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                  }))
                }
                placeholder="Auto-generated from name"
              />
              <small style={{ color: 'var(--pf-v5-global--Color--200)' }}>
                Used in URLs and vector store IDs. Auto-generated from project name.
              </small>
            </FormGroup>

            <FormGroup label="Description">
              <TextArea
                value={newProject.description}
                onChange={(_, value) => setNewProject((prev) => ({ ...prev, description: value }))}
                placeholder="Brief description of what this project covers..."
                rows={3}
              />
            </FormGroup>
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={createProject} isDisabled={!newProject.name}>
            Create Project
          </Button>
          <Button variant="link" onClick={() => setIsCreateModalOpen(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      {/* Ingestion Modal */}
      <Modal
        variant={ModalVariant.medium}
        title="Add Documents to Project"
        isOpen={isIngestModalOpen}
        onClose={() => {
          if (!isIngesting) {
            setIsIngestModalOpen(false);
            setSelectedProjectForIngestion(null);
            setSelectedVectorStore('');
            setIngestionUrl('');
          }
        }}
      >
        <ModalBody>
          <Form>
            <FormGroup label="Project" isRequired>
              <TextInput
                value={projects.find((p) => p.project_id === selectedProjectForIngestion)?.name || ''}
                isDisabled={true}
              />
            </FormGroup>

            <FormGroup label="Vector Store" isRequired>
              <FormSelect
                value={selectedVectorStore}
                onChange={(_, value) => setSelectedVectorStore(value)}
                isDisabled={isIngesting}
              >
                <FormSelectOption value="" label="Select a vector store..." />
                {projects
                  .find((p) => p.project_id === selectedProjectForIngestion)
                  ?.stores?.map((store) => (
                    <FormSelectOption
                      key={store.vector_db_id}
                      value={store.vector_db_id}
                      label={`${store.name} (${store.store_type}) - ${store.document_count} docs`}
                    />
                  ))}
              </FormSelect>
              <small style={{ color: 'var(--pf-v5-global--Color--200)' }}>
                Choose which knowledge store to add the documents to
              </small>
            </FormGroup>

            <FormGroup label="Document URL" isRequired>
              <TextInput
                value={ingestionUrl}
                onChange={(_, value) => setIngestionUrl(value)}
                placeholder="Enter GitHub URL, web page, or document URL..."
                isDisabled={isIngesting}
              />
              <small style={{ color: 'var(--pf-v5-global--Color--200)' }}>
                Supports: GitHub repositories/files, web pages, PDFs, Markdown files, and more
              </small>
            </FormGroup>

            {ingestionUrl && (
              <FormGroup label="Auto-detected Type">
                <TextInput
                  value={detectProcessingType(ingestionUrl).replace('_', ' ').toUpperCase()}
                  isDisabled={true}
                />
              </FormGroup>
            )}
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={startIngestion}
            isLoading={isIngesting}
            isDisabled={isIngesting || !selectedVectorStore || !ingestionUrl.trim()}
          >
            {isIngesting ? 'Ingesting...' : 'Start Ingestion'}
          </Button>
          <Button
            variant="link"
            onClick={() => {
              setIsIngestModalOpen(false);
              setSelectedProjectForIngestion(null);
              setSelectedVectorStore('');
              setIngestionUrl('');

              // Keep ingestion status visible even if modal is closed
            }}
          >
            {isIngesting ? 'Close (Continue in Background)' : 'Cancel'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        variant={ModalVariant.small}
        title="Delete Project"
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
      >
        <ModalBody>
          <p>
            Are you sure you want to delete the project <strong>{projectToDelete}</strong>? This will remove all
            associated documents and cannot be undone.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={() => projectToDelete && deleteProject(projectToDelete)}>
            Delete
          </Button>
          <Button variant="link" onClick={() => setIsDeleteModalOpen(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </PageSection>
  );
}
