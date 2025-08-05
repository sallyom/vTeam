import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Flex,
  FlexItem,
  PageSection,
  Spinner,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core';
import { DownloadIcon, FileIcon } from '@patternfly/react-icons';
import { Output, Session } from '../types/api';
import { apiService } from '../services/api';

type RefinementPanelProps = {
  session: Session;
};

const RefinementPanel: React.FunctionComponent<RefinementPanelProps> = ({ session }) => {
  const [refinementOutput, setRefinementOutput] = useState<Output | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadRefinementDocument = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get session details to fetch outputs
        const sessionDetail = await apiService.getSession(session.id);

        // Find the refinement output
        const refinementDoc = sessionDetail.outputs.find((output) => output.stage === 'refine');

        if (refinementDoc) {
          setRefinementOutput(refinementDoc);
        } else {
          setError('No refinement document found for this session');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load refinement document');
      } finally {
        setLoading(false);
      }
    };

    loadRefinementDocument();
  }, [session.id]);

  const handleDownload = () => {
    if (!refinementOutput) return;

    const blob = new Blob([refinementOutput.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = refinementOutput.filename || 'refinement-document.md';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatMarkdownForDisplay = (content: string) => {
    // Convert markdown to simple HTML for display
    return content.split('\n').map((line, index) => {
      // Handle headers
      if (line.startsWith('# ')) {
        const headerText = line.substring(2).replace(/\*\*(.+?)\*\*/g, '$1'); // Remove ** from headers
        return (
          <Title key={index} headingLevel="h1" size="2xl" style={{ marginTop: '2rem', marginBottom: '1rem' }}>
            {headerText}
          </Title>
        );
      }
      if (line.startsWith('## ')) {
        const headerText = line.substring(3).replace(/\*\*(.+?)\*\*/g, '$1'); // Remove ** from headers
        return (
          <Title key={index} headingLevel="h2" size="xl" style={{ marginTop: '1.5rem', marginBottom: '0.75rem' }}>
            {headerText}
          </Title>
        );
      }
      if (line.startsWith('### ')) {
        const headerText = line.substring(4).replace(/\*\*(.+?)\*\*/g, '$1'); // Remove ** from headers
        return (
          <Title key={index} headingLevel="h3" size="lg" style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>
            {headerText}
          </Title>
        );
      }
      if (line.startsWith('#### ')) {
        const headerText = line.substring(5).replace(/\*\*(.+?)\*\*/g, '$1'); // Remove ** from headers
        return (
          <Title key={index} headingLevel="h4" size="md" style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
            {headerText}
          </Title>
        );
      }

      // Handle bullet points with formatting
      if (line.startsWith('- ') || line.startsWith('* ')) {
        const bulletContent = line.substring(2);
        const formattedContent = bulletContent
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*([^*]+?)\*/g, '<em>$1</em>');
        return (
          <p
            key={index}
            style={{ marginLeft: '1rem', marginBottom: '0.25rem' }}
            dangerouslySetInnerHTML={{ __html: `• ${formattedContent}` }}
          />
        );
      }

      // Handle numbered lists with formatting
      const numberedMatch = line.match(/^(\d+\.) (.+)/);
      if (numberedMatch) {
        const listContent = numberedMatch[2]
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*([^*]+?)\*/g, '<em>$1</em>');
        return (
          <p
            key={index}
            style={{ marginLeft: '1rem', marginBottom: '0.25rem' }}
            dangerouslySetInnerHTML={{ __html: `${numberedMatch[1]} ${listContent}` }}
          />
        );
      }

      // Handle bold text - support multi-word patterns
      let formattedLine = line.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');

      // Handle italic text - be more careful to avoid conflicts with bold
      formattedLine = formattedLine.replace(/(?<!\*)\*([^*\s][^*]*?[^*\s])\*(?!\*)/g, '<em>$1</em>');

      // Handle empty lines
      if (line.trim() === '') {
        return <div key={index} style={{ height: '1rem' }} />;
      }

      // Regular paragraph
      return <p key={index} style={{ marginBottom: '0.75rem' }} dangerouslySetInnerHTML={{ __html: formattedLine }} />;
    });
  };

  if (loading) {
    return (
      <PageSection>
        <Flex justifyContent={{ default: 'justifyContentCenter' }}>
          <Spinner size="lg" />
        </Flex>
      </PageSection>
    );
  }

  if (error) {
    return (
      <PageSection>
        <Alert variant="danger" title="Error loading refinement document">
          {error}
        </Alert>
      </PageSection>
    );
  }

  if (!refinementOutput) {
    return (
      <PageSection>
        <Flex
          direction={{ default: 'column' }}
          alignItems={{ default: 'alignItemsCenter' }}
          spaceItems={{ default: 'spaceItemsLg' }}
        >
          <FlexItem>
            <FileIcon size={48} color="var(--pf-global--Color--200)" />
          </FlexItem>
          <FlexItem>
            <div>
              <Title headingLevel="h3" size="md">
                No refinement document
              </Title>
              <p>The refinement document will appear here after the refinement stage completes.</p>
            </div>
          </FlexItem>
        </Flex>
      </PageSection>
    );
  }

  return (
    <>
      <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsSm' }}>
        {/* Header with actions */}
        <FlexItem>
          <Toolbar>
            <ToolbarContent>
              <ToolbarItem>
                <span style={{ color: 'var(--pf-global--Color--200)', fontSize: '0.875rem' }}>
                  Generated: {new Date(refinementOutput.created_at).toLocaleString()}
                </span>
              </ToolbarItem>
              <ToolbarItem align={{ default: 'alignEnd' }}>
                <Button variant="secondary" icon={<DownloadIcon />} onClick={handleDownload}>
                  Download
                </Button>
              </ToolbarItem>
            </ToolbarContent>
          </Toolbar>
        </FlexItem>

        {/* Document content */}
        <FlexItem>
          <div
            style={{
              backgroundColor: 'var(--pf-global--BackgroundColor--100)',
              borderRadius: '8px',
              border: '1px solid var(--pf-global--BorderColor--100)',
              maxHeight: '70vh',
              overflow: 'auto',
              fontFamily: 'var(--pf-global--FontFamily--text)',
              lineHeight: '1.6',
            }}
          >
            <div>{formatMarkdownForDisplay(refinementOutput.content)}</div>
          </div>
        </FlexItem>
      </Flex>
    </>
  );
};

export default RefinementPanel;
