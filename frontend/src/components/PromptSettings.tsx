import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dropdown,
  DropdownItem,
  DropdownList,
  Flex,
  FlexItem,
  FormGroup,
  MenuToggle,
  MenuToggleElement,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  TextArea,
  Title,
} from '@patternfly/react-core';
import {
  CogIcon,
  ExternalLinkAltIcon,
  FileDownloadIcon,
  FileUploadIcon,
  RedoIcon,
  SaveIcon,
} from '@patternfly/react-icons';
import { apiService } from '../services/api';
import {
  CustomPrompts,
  deleteCustomPrompt,
  exportCustomPromptsToFile,
  importCustomPromptsFromFile,
  loadCustomPrompts,
  saveCustomPrompt,
} from '../services/localStorage';

type PromptSettingsProps = {
  isOpen: boolean;
  onClose: () => void;
};

const GITHUB_BASE_URL =
  'https://github.com/rhoai-feature-sizing/rhoai-ai-feature-sizing/tree/main/src/rhoai_ai_feature_sizing/prompts';

const PromptSettings: React.FunctionComponent<PromptSettingsProps> = ({ isOpen, onClose }) => {
  const [availablePrompts, setAvailablePrompts] = useState<string[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [currentContent, setCurrentContent] = useState<string>('');
  const [customPrompts, setCustomPrompts] = useState<CustomPrompts>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Load available prompts when modal opens
  useEffect(() => {
    if (isOpen) {
      loadAvailablePrompts();
      setCustomPrompts(loadCustomPrompts());
    }
  }, [isOpen]);

  // Track unsaved changes
  useEffect(() => {
    const isCustom = customPrompts[selectedPrompt] !== undefined;
    const comparisonContent = isCustom ? customPrompts[selectedPrompt] : originalContent;
    setHasUnsavedChanges(currentContent !== comparisonContent && currentContent !== '');
  }, [currentContent, originalContent, customPrompts, selectedPrompt]);

  const loadAvailablePrompts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const prompts = await apiService.getAvailablePrompts();
      setAvailablePrompts(prompts);

      // Select first prompt by default
      if (prompts.length > 0 && !selectedPrompt) {
        setSelectedPrompt(prompts[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prompts');
    } finally {
      setLoading(false);
    }
  }, [selectedPrompt]);

  const loadPromptContent = useCallback(
    async (promptName: string) => {
      if (!promptName) return;

      try {
        setLoading(true);
        setError(null);

        // Check if we have a custom version first
        const customContent = customPrompts[promptName];
        if (customContent) {
          setCurrentContent(customContent);
          setOriginalContent(''); // We'll load original on demand
        } else {
          // Load original content
          const response = await apiService.getPromptContent(promptName);
          setOriginalContent(response.content);
          setCurrentContent(response.content);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load prompt content');
      } finally {
        setLoading(false);
      }
    },
    [customPrompts],
  );

  // Load content when selected prompt changes
  useEffect(() => {
    if (selectedPrompt) {
      loadPromptContent(selectedPrompt);
    }
  }, [selectedPrompt, loadPromptContent]);

  const handleSave = useCallback(() => {
    if (!selectedPrompt || !currentContent.trim()) {
      setError('Please select a prompt and provide content');
      return;
    }

    saveCustomPrompt(selectedPrompt, currentContent);
    setCustomPrompts({ ...customPrompts, [selectedPrompt]: currentContent });
    setHasUnsavedChanges(false);
    setError(null);
  }, [selectedPrompt, currentContent, customPrompts]);

  const handleResetToDefault = useCallback(async () => {
    if (!selectedPrompt) return;

    try {
      setLoading(true);
      setError(null);

      // Delete custom version
      deleteCustomPrompt(selectedPrompt);
      const newCustomPrompts = { ...customPrompts };
      delete newCustomPrompts[selectedPrompt];
      setCustomPrompts(newCustomPrompts);

      // Load original content
      const response = await apiService.getPromptContent(selectedPrompt);
      setOriginalContent(response.content);
      setCurrentContent(response.content);
      setHasUnsavedChanges(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset prompt');
    } finally {
      setLoading(false);
    }
  }, [selectedPrompt, customPrompts]);

  const handleExportToFile = useCallback(() => {
    try {
      exportCustomPromptsToFile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export prompts');
    }
  }, []);

  const handleImportFromFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      importCustomPromptsFromFile(file)
        .then((imported) => {
          setCustomPrompts({ ...customPrompts, ...imported });
          setError(null);
          // Reload current prompt if it was imported
          if (selectedPrompt && imported[selectedPrompt]) {
            setCurrentContent(imported[selectedPrompt]);
          }
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Failed to import prompts');
        });

      // Reset file input
      event.target.value = '';
    },
    [customPrompts, selectedPrompt],
  );

  const handleOpenInGitHub = useCallback(() => {
    if (!selectedPrompt) return;
    const url = `${GITHUB_BASE_URL}/${selectedPrompt}.md`;
    window.open(url, '_blank');
  }, [selectedPrompt]);

  const isCustomVersion = useMemo(() => {
    return customPrompts[selectedPrompt] !== undefined;
  }, [customPrompts, selectedPrompt]);

  const dropdownItems = useMemo(() => {
    return availablePrompts.map((prompt) => (
      <DropdownItem key={prompt} onClick={() => setSelectedPrompt(prompt)}>
        <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
          <FlexItem>{prompt.replace(/_/g, ' ')}</FlexItem>
          {customPrompts[prompt] && (
            <FlexItem>
              <span style={{ color: 'var(--pf-v5-global--Color--100)', fontSize: '0.875rem' }}>(Custom)</span>
            </FlexItem>
          )}
        </Flex>
      </DropdownItem>
    ));
  }, [availablePrompts, customPrompts]);

  return (
    <Modal variant={ModalVariant.large} isOpen={isOpen} onClose={onClose} aria-label="Prompt Settings">
      <ModalHeader>
        <Title headingLevel="h2" size="xl">
          <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
            <FlexItem>
              <CogIcon />
            </FlexItem>
            <FlexItem>Prompt Settings</FlexItem>
          </Flex>
        </Title>
      </ModalHeader>

      <ModalBody style={{ padding: '1.5rem' }}>
        <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsMd' }}>
          {error && (
            <FlexItem>
              <Alert variant="danger" title="Error" isInline>
                {error}
              </Alert>
            </FlexItem>
          )}

          <FlexItem>
            <FormGroup label="Select Prompt" fieldId="prompt-selector">
              <Dropdown
                isOpen={isDropdownOpen}
                onSelect={() => setIsDropdownOpen(false)}
                toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                  <MenuToggle
                    ref={toggleRef}
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    isExpanded={isDropdownOpen}
                    style={{ width: '300px' }}
                  >
                    {selectedPrompt ? (
                      <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
                        <FlexItem>{selectedPrompt.replace(/_/g, ' ')}</FlexItem>
                        {isCustomVersion && (
                          <FlexItem>
                            <span style={{ color: 'var(--pf-v5-global--Color--100)', fontSize: '0.875rem' }}>
                              (Custom)
                            </span>
                          </FlexItem>
                        )}
                      </Flex>
                    ) : (
                      'Select a prompt...'
                    )}
                  </MenuToggle>
                )}
              >
                <DropdownList>{dropdownItems}</DropdownList>
              </Dropdown>
            </FormGroup>
          </FlexItem>

          <FlexItem style={{ flex: 1 }}>
            <FormGroup label="Prompt Content" fieldId="prompt-content">
              <TextArea
                id="prompt-content"
                value={currentContent}
                onChange={(_event, value) => setCurrentContent(value)}
                rows={20}
                style={{ fontFamily: 'monospace', fontSize: '14px' }}
                placeholder="Select a prompt to edit..."
                isDisabled={!selectedPrompt || loading}
              />
            </FormGroup>
          </FlexItem>
        </Flex>
      </ModalBody>

      <ModalFooter>
        <Flex spaceItems={{ default: 'spaceItemsSm' }}>
          <FlexItem>
            <Button
              variant="primary"
              icon={<SaveIcon />}
              onClick={handleSave}
              isDisabled={!selectedPrompt || !hasUnsavedChanges || loading}
            >
              Save
            </Button>
          </FlexItem>

          <FlexItem>
            <Button
              variant="secondary"
              icon={<RedoIcon />}
              onClick={handleResetToDefault}
              isDisabled={!selectedPrompt || !isCustomVersion || loading}
            >
              Reset to Default
            </Button>
          </FlexItem>

          <FlexItem>
            <Button
              variant="tertiary"
              icon={<FileDownloadIcon />}
              onClick={handleExportToFile}
              isDisabled={Object.keys(customPrompts).length === 0}
            >
              Export to File
            </Button>
          </FlexItem>

          <FlexItem>
            <Button variant="tertiary" icon={<FileUploadIcon />} component="label">
              Import from File
              <input type="file" accept=".json" onChange={handleImportFromFile} style={{ display: 'none' }} />
            </Button>
          </FlexItem>

          <FlexItem>
            <Button
              variant="link"
              icon={<ExternalLinkAltIcon />}
              onClick={handleOpenInGitHub}
              isDisabled={!selectedPrompt}
            >
              Open in GitHub
            </Button>
          </FlexItem>

          <FlexItem>
            <Button variant="link" onClick={onClose}>
              Close
            </Button>
          </FlexItem>
        </Flex>
      </ModalFooter>
    </Modal>
  );
};

export default PromptSettings;
