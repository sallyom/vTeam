import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { simpleApiService } from '../services/simpleApi';
import {
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Flex,
  FlexItem,
  PageSection,
  Popover,
  Spinner,
  Title,
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { InfoCircleIcon, ExternalLinkAltIcon, ArrowLeftIcon } from '@patternfly/react-icons';

type Project = {
  project_id: string;
  name: string;
  description: string;
  project_type: string;
  created_by: string;
  auto_routing_enabled: boolean;
  is_active: boolean;
  created_at: string;
  last_updated?: string;
  stores: Array<{
    store_id: string;
    store_type: string;
    vector_db_id: string;
    name: string;
    description: string;
    document_count: number;
  }>;
  total_documents: number;
};

type Document = {
  document_id: string;
  name: string;
  source_url: string;
  mime_type: string;
  source_type?: string;
  rag_store_name?: string;
  rag_store_type?: string;
  ingestion_date: string;
  last_updated?: string;
  chunk_count: number;
  ingestion_method: string;
  document_metadata?: Record<string, any>;
  is_active: boolean;
};

type ProjectDocumentsResponse = {
  project_id: string;
  documents: Document[];
  total: number;
};

export default function ProjectDetails() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load project details and documents
  const loadProjectData = async () => {
    if (!projectId) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch project details and documents in parallel
      const [projectData, documentsData] = await Promise.all([
        simpleApiService.getProject(projectId),
        simpleApiService.getProjectDocuments(projectId),
      ]);

      setProject(projectData);
      setDocuments(documentsData.documents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjectData();
  }, [projectId]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getSourceTypeDisplay = (sourceType?: string) => {
    if (!sourceType) return 'Unknown';

    const typeMap: Record<string, string> = {
      github_repo: 'GitHub Repository',
      github_file: 'GitHub File',
      web_page: 'Web Page',
      pdf_document: 'PDF Document',
      api_doc: 'API Documentation',
      markdown: 'Markdown',
      text_document: 'Text Document',
    };

    return typeMap[sourceType] || sourceType.replace('_', ' ').toUpperCase();
  };

  const MetadataPopover: React.FC<{ metadata?: Record<string, any> }> = ({ metadata }) => {
    if (!metadata || Object.keys(metadata).length === 0) {
      return <span style={{ color: 'var(--pf-v5-global--Color--200)' }}>No metadata</span>;
    }

    return (
      <Popover
        aria-label="Document metadata"
        bodyContent={
          <div style={{ maxHeight: '300px', overflow: 'auto' }}>
            <pre
              style={{
                fontSize: '12px',
                whiteSpace: 'pre-wrap',
                margin: 0,
                padding: '8px',
                backgroundColor: 'var(--pf-v5-global--BackgroundColor--100)',
                border: '1px solid var(--pf-v5-global--BorderColor--100)',
                borderRadius: '4px',
              }}
            >
              {JSON.stringify(metadata, null, 2)}
            </pre>
          </div>
        }
      >
        <Button variant="link" icon={<InfoCircleIcon />} size="sm">
          View Metadata
        </Button>
      </Popover>
    );
  };

  if (loading) {
    return (
      <PageSection>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <Spinner size="lg" />
          <p style={{ marginTop: '1rem' }}>Loading project details...</p>
        </div>
      </PageSection>
    );
  }

  if (error) {
    return (
      <PageSection>
        <Alert variant="danger" title="Error loading project">
          {error}
        </Alert>
      </PageSection>
    );
  }

  if (!project) {
    return (
      <PageSection>
        <Alert variant="warning" title="Project not found">
          The requested project could not be found.
        </Alert>
      </PageSection>
    );
  }

  return (
    <PageSection>
      <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsLg' }}>
        {/* Breadcrumbs */}
        <FlexItem>
          <Breadcrumb>
            <BreadcrumbItem>
              <Link to="/projects">Knowledge Base</Link>
            </BreadcrumbItem>
            <BreadcrumbItem isActive>{project.name}</BreadcrumbItem>
          </Breadcrumb>
        </FlexItem>

        {/* Header */}
        <FlexItem>
          <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsMd' }}>
            <FlexItem>
              <Button variant="link" icon={<ArrowLeftIcon />} onClick={() => navigate('/projects')}>
                Back to Projects
              </Button>
            </FlexItem>
            <FlexItem flex={{ default: 'flex_1' }}>
              <Title headingLevel="h1" size="2xl">
                {project.name}
              </Title>
            </FlexItem>
            <FlexItem>
              <Button
                variant="secondary"
                icon={<ExternalLinkAltIcon />}
                onClick={() => {
                  // TODO: Add ingestion functionality to project details page
                  console.log('Add documents to project:', project.project_id);
                }}
              >
                Add Documents
              </Button>
            </FlexItem>
          </Flex>
        </FlexItem>

        {/* Project Information */}
        <FlexItem>
          <Title headingLevel="h3" size="lg">
            Project Information
          </Title>
          <Flex spaceItems={{ default: 'spaceItems2xl' }} wrap="wrap" style={{ marginTop: '1rem' }}>
            <FlexItem>
              <div>
                <strong>Project ID:</strong>
                <br />
                <code
                  style={{
                    backgroundColor: 'var(--pf-v5-global--BackgroundColor--100)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}
                >
                  {project.project_id}
                </code>
              </div>
            </FlexItem>

            <FlexItem>
              <div>
                <strong>Description:</strong>
                <br />
                {project.description || <em>No description provided</em>}
              </div>
            </FlexItem>

            <FlexItem>
              <div>
                <strong>Project Type:</strong>
                <br />
                {project.project_type}
              </div>
            </FlexItem>

            <FlexItem>
              <div>
                <strong>Created:</strong>
                <br />
                {formatDate(project.created_at)}
              </div>
            </FlexItem>

            <FlexItem>
              <div>
                <strong>Total Documents:</strong>
                <br />
                <span
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    color: 'var(--pf-v5-global--primary-color--100)',
                  }}
                >
                  {project.total_documents}
                </span>
              </div>
            </FlexItem>
          </Flex>
        </FlexItem>

        {/* RAG Stores Table */}
        <FlexItem>
          <Title headingLevel="h3" size="lg">
            RAG Stores
          </Title>
          {project.stores.length === 0 ? (
            <p style={{ marginTop: '1rem' }}>
              <em>No RAG stores configured</em>
            </p>
          ) : (
            <Table aria-label="RAG Stores table" variant="compact" style={{ marginTop: '1rem' }}>
              <Thead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Type</Th>
                  <Th>Vector DB ID</Th>
                  <Th>Description</Th>
                  <Th>Documents</Th>
                </Tr>
              </Thead>
              <Tbody>
                {project.stores.map((store) => (
                  <Tr key={store.store_id}>
                    <Td>
                      <strong>{store.name}</strong>
                    </Td>
                    <Td>{store.store_type}</Td>
                    <Td>
                      <code style={{ fontSize: '0.9rem' }}>{store.vector_db_id}</code>
                    </Td>
                    <Td>{store.description || <em>No description</em>}</Td>
                    <Td>
                      <span
                        style={{
                          fontWeight: 'bold',
                          color: 'var(--pf-v5-global--success-color--100)',
                        }}
                      >
                        {store.document_count}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </FlexItem>

        {/* Documents Table */}
        <FlexItem>
          <Title headingLevel="h3" size="lg">
            Documents ({documents.length})
          </Title>
          {documents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <p>
                <em>No documents found in this project.</em>
              </p>
            </div>
          ) : (
            <Table aria-label="Documents table" variant="compact" style={{ marginTop: '1rem' }}>
              <Thead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Source URL</Th>
                  <Th>Type</Th>
                  <Th>Source Type</Th>
                  <Th>RAG Store</Th>
                  <Th>Ingestion Date</Th>
                  <Th>Chunks</Th>
                  <Th>Metadata</Th>
                </Tr>
              </Thead>
              <Tbody>
                {documents.map((doc) => (
                  <Tr key={doc.document_id}>
                    <Td>
                      <div style={{ maxWidth: '200px' }}>
                        <strong>{doc.name}</strong>
                        <br />
                        <small
                          style={{
                            color: 'var(--pf-v5-global--Color--200)',
                            fontSize: '0.8rem',
                          }}
                        >
                          {doc.document_id}
                        </small>
                      </div>
                    </Td>
                    <Td>
                      <div style={{ maxWidth: '250px' }}>
                        <a
                          href={doc.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            wordBreak: 'break-all',
                            fontSize: '0.9rem',
                          }}
                        >
                          {doc.source_url}
                          <ExternalLinkAltIcon style={{ marginLeft: '4px', fontSize: '0.8rem' }} />
                        </a>
                      </div>
                    </Td>
                    <Td>
                      <span
                        style={{
                          padding: '2px 8px',
                          backgroundColor: 'var(--pf-v5-global--BackgroundColor--100)',
                          border: '1px solid var(--pf-v5-global--BorderColor--100)',
                          borderRadius: '12px',
                          fontSize: '0.85rem',
                        }}
                      >
                        {doc.mime_type}
                      </span>
                    </Td>
                    <Td>{getSourceTypeDisplay(doc.source_type)}</Td>
                    <Td>
                      {doc.rag_store_name ? (
                        <div>
                          <strong>{doc.rag_store_name}</strong>
                          <br />
                          <small style={{ color: 'var(--pf-v5-global--Color--200)' }}>{doc.rag_store_type}</small>
                        </div>
                      ) : (
                        <em>No store</em>
                      )}
                    </Td>
                    <Td>
                      <div style={{ fontSize: '0.9rem' }}>{formatDate(doc.ingestion_date)}</div>
                    </Td>
                    <Td>
                      <span
                        style={{
                          fontSize: '1.1rem',
                          fontWeight: 'bold',
                          color:
                            doc.chunk_count > 0
                              ? 'var(--pf-v5-global--success-color--100)'
                              : 'var(--pf-v5-global--Color--200)',
                        }}
                      >
                        {doc.chunk_count}
                      </span>
                    </Td>
                    <Td>
                      <MetadataPopover metadata={doc.document_metadata} />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </FlexItem>
      </Flex>
    </PageSection>
  );
}
