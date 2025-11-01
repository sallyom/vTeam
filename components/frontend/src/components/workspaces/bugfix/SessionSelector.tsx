'use client';

import React, { useState } from 'react';
import { Play, Search, Wrench } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Card,
  CardHeader,
} from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { bugfixApi } from '@/services/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { successToast, errorToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

interface SessionSelectorProps {
  projectName: string;
  workflowId: string;
  githubIssueNumber: number;
  disabled?: boolean;
}

interface SessionType {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
}

const SESSION_TYPES: SessionType[] = [
  {
    id: 'bug-review',
    name: 'Bug Review & Assessment',
    description: 'Analyze the bug, research the codebase, identify root causes, and create a detailed resolution plan with fix strategy. If a Claude assessment already exists (indicated by "claude" label), it will be used as a starting point.',
    icon: <Search className="h-5 w-5" />,
    badge: 'Recommended first',
  },
  {
    id: 'bug-implement-fix',
    name: 'Implement Fix',
    description: 'Implement the fix based on the resolution plan. Make code changes, add tests, update documentation, and prepare for review.',
    icon: <Wrench className="h-5 w-5" />,
  },
];

type PRConflictInfo = {
  prNumber: number;
  prURL: string;
  prTitle: string;
  prBranch: string;
  prState: string;
  issueURL: string;
};

export default function SessionSelector({ projectName, workflowId, githubIssueNumber, disabled }: SessionSelectorProps) {
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('bug-review'); // Default to recommended first option
  const [customTitle, setCustomTitle] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [interactive, setInteractive] = useState(false);
  const [autoPushOnComplete, setAutoPushOnComplete] = useState(true); // Default true for bugfix sessions
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4000);
  const [timeout, setTimeout] = useState(300); // 5 minutes default
  const [prConflict, setPRConflict] = useState<PRConflictInfo | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  const createSessionMutation = useMutation({
    mutationFn: (data: {
      sessionType: 'bug-review' | 'bug-implement-fix';
      title?: string;
      prompt?: string;
      description?: string;
      interactive?: boolean;
      autoPushOnComplete?: boolean;
      // Resource overrides will be sent via resourceOverrides field
      resourceOverrides?: {
        model?: string;
        temperature?: number;
        maxTokens?: number;
        timeout?: number;
      };
    }) =>
      bugfixApi.createBugFixSession(projectName, workflowId, data),
    onSuccess: (session) => {
      successToast(`${session.sessionType} session created successfully`);
      queryClient.invalidateQueries({ queryKey: ['bugfix-sessions', projectName, workflowId] });
      setOpen(false);
      // Navigate to the session detail page
      router.push(`/projects/${projectName}/sessions/${session.id}`);
    },
    onError: (error: unknown) => {
      // Check if this is a PR conflict (409 response)
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { status?: number; data?: unknown } };
        if (axiosError.response?.status === 409 && axiosError.response.data) {
          const data = axiosError.response.data as {
            prNumber?: number;
            prURL?: string;
            prTitle?: string;
            prBranch?: string;
            prState?: string;
            issueURL?: string;
          };

          if (data.prNumber && data.prURL) {
            // Show PR conflict dialog
            setPRConflict({
              prNumber: data.prNumber,
              prURL: data.prURL,
              prTitle: data.prTitle || '',
              prBranch: data.prBranch || '',
              prState: data.prState || '',
              issueURL: data.issueURL || '',
            });
            setOpen(false); // Close the session creation dialog
            return;
          }
        }
      }

      // Generic error handling
      const message = error instanceof Error ? error.message : 'Failed to create session';
      errorToast(message);
    },
  });

  const handleCreateSession = () => {
    if (!selectedType) return;

    const data: {
      sessionType: 'bug-review' | 'bug-implement-fix';
      title?: string;
      prompt?: string;
      description?: string;
      interactive?: boolean;
      autoPushOnComplete?: boolean;
      resourceOverrides?: {
        model?: string;
        temperature?: number;
        maxTokens?: number;
        timeout?: number;
      };
    } = {
      sessionType: selectedType as 'bug-review' | 'bug-implement-fix',
      interactive,
      autoPushOnComplete,
      resourceOverrides: {
        model,
        temperature,
        maxTokens,
        timeout,
      },
    };

    if (customTitle) data.title = customTitle;
    if (customPrompt) data.prompt = customPrompt;
    if (customDescription) data.description = customDescription;

    createSessionMutation.mutate(data);
  };

  const selectedSessionType = SESSION_TYPES.find(t => t.id === selectedType);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={disabled || createSessionMutation.isPending}
      >
        <Play className="mr-2 h-4 w-4" />
        Create Session
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Create Session for Bug #{githubIssueNumber}</DialogTitle>
            <DialogDescription>
              Choose a session type and configure your bugfix workflow
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            <div className="space-y-6">
              {/* Session Type Selection - Always visible, full width */}
              <div>
                <h3 className="text-sm font-medium mb-3">Session Type</h3>
                <RadioGroup value={selectedType} onValueChange={setSelectedType}>
                  <div className="grid grid-cols-2 gap-4">
                    {SESSION_TYPES.map((type) => (
                      <Card
                        key={type.id}
                        className={`cursor-pointer transition-all ${
                          selectedType === type.id
                            ? 'border-primary shadow-md ring-2 ring-primary/20'
                            : 'hover:border-primary/50 hover:shadow-sm'
                        }`}
                        onClick={() => setSelectedType(type.id)}
                      >
                        <CardHeader className="pb-4">
                          <div className="flex flex-col space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-primary">
                                {type.icon}
                                <RadioGroupItem value={type.id} id={type.id} className="sr-only" />
                              </div>
                              {type.badge && (
                                <Badge variant="secondary" className="text-xs">
                                  {type.badge}
                                </Badge>
                              )}
                            </div>
                            <div>
                              <Label htmlFor={type.id} className="cursor-pointer text-base font-semibold">
                                {type.name}
                              </Label>
                              <p className="text-sm text-muted-foreground mt-2 line-clamp-3">
                                {type.description}
                              </p>
                            </div>
                          </div>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                </RadioGroup>
              </div>

              {/* Session Configuration - Always visible */}
              <div className="space-y-4 border-t pt-6">
                <h3 className="text-sm font-medium mb-4">Session Configuration</h3>
                {/* Interactive Mode */}
                <div className="flex items-center space-x-2">
                    <Checkbox
                      id="interactive"
                      checked={interactive}
                      onCheckedChange={(checked) => setInteractive(checked === true)}
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label
                        htmlFor="interactive"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Interactive chat
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        When enabled, the session runs in chat mode. You can send messages and receive streamed responses.
                      </p>
                    </div>
                  </div>

                  {/* Auto Push */}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="autoPush"
                      checked={autoPushOnComplete}
                      onCheckedChange={(checked) => setAutoPushOnComplete(checked === true)}
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label
                        htmlFor="autoPush"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Auto-push to GitHub on completion
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically commit and push changes to the feature branch when session completes
                      </p>
                    </div>
                  </div>

                  {/* Custom Prompt */}
                  <div className="space-y-2">
                    <Label htmlFor="prompt" className="text-sm">
                      Custom Prompt (optional)
                    </Label>
                    <Textarea
                      id="prompt"
                      placeholder="Override the default prompt for this session type..."
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave empty to use the default prompt for {selectedSessionType?.name}
                    </p>
                  </div>

                  {/* Title */}
                  <div className="space-y-2">
                    <Label htmlFor="title" className="text-sm">
                      Custom Title (optional)
                    </Label>
                    <Input
                      id="title"
                      placeholder={`Default: ${selectedSessionType?.name}: Issue #${githubIssueNumber}`}
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <Label htmlFor="description" className="text-sm">
                      Description (optional)
                    </Label>
                    <Textarea
                      id="description"
                      placeholder="Add any additional context or instructions for this session..."
                      value={customDescription}
                      onChange={(e) => setCustomDescription(e.target.value)}
                      rows={3}
                    />
                  </div>

                  {/* LLM Configuration */}
                  <div className="space-y-4 border-t pt-4">
                    <h4 className="text-sm font-semibold">LLM Configuration</h4>

                    {/* Model */}
                    <div className="space-y-2">
                      <Label htmlFor="model" className="text-sm">
                        Model
                      </Label>
                      <Select value={model} onValueChange={setModel}>
                        <SelectTrigger id="model">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="claude-sonnet-4-20250514">Claude Sonnet 4</SelectItem>
                          <SelectItem value="claude-3-7-sonnet-latest">Claude Sonnet 3.7</SelectItem>
                          <SelectItem value="claude-3-5-sonnet-latest">Claude Sonnet 3.5</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Temperature and Max Tokens in a grid */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="temperature" className="text-sm">
                          Temperature
                        </Label>
                        <Input
                          id="temperature"
                          type="number"
                          min="0"
                          max="2"
                          step="0.1"
                          value={temperature}
                          onChange={(e) => setTemperature(parseFloat(e.target.value))}
                        />
                        <p className="text-xs text-muted-foreground">Controls randomness (0.0 - 2.0)</p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="maxTokens" className="text-sm">
                          Max Tokens
                        </Label>
                        <Input
                          id="maxTokens"
                          type="number"
                          min="100"
                          max="8000"
                          step="100"
                          value={maxTokens}
                          onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                        />
                        <p className="text-xs text-muted-foreground">Maximum response length (default: 4000)</p>
                      </div>
                    </div>

                    {/* Timeout */}
                    <div className="space-y-2">
                      <Label htmlFor="timeout" className="text-sm">
                        Timeout (seconds)
                      </Label>
                      <Input
                        id="timeout"
                        type="number"
                        min="60"
                        max="7200"
                        step="60"
                        value={timeout}
                        onChange={(e) => setTimeout(parseInt(e.target.value))}
                      />
                      <p className="text-xs text-muted-foreground">Session timeout (default: 300s / 5 minutes)</p>
                    </div>
                  </div>
                </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateSession}
              disabled={!selectedType || createSessionMutation.isPending}
            >
              {createSessionMutation.isPending ? 'Creating...' : 'Create Session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PR Conflict Dialog */}
      <Dialog open={!!prConflict} onOpenChange={(open) => !open && setPRConflict(null)}>
        <DialogContent className="w-full max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pull Request Already Exists</DialogTitle>
            <DialogDescription>
              An open pull request already exists for this issue. Would you like to review it or proceed with a new implementation?
            </DialogDescription>
          </DialogHeader>

          {prConflict && (
            <div className="space-y-4 py-4">
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium">PR #{prConflict.prNumber}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{prConflict.prTitle}</p>
                  </div>
                  <Badge variant="secondary">{prConflict.prState}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>Branch: <code className="text-xs bg-muted px-1 py-0.5 rounded">{prConflict.prBranch}</code></p>
                </div>
                <a
                  href={prConflict.prURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                >
                  View PR on GitHub →
                </a>
              </div>

              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-2">What would you like to do?</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li><strong>Review PR:</strong> Create a review session to analyze the existing pull request against the bug assessment</li>
                  <li><strong>Implement Anyway:</strong> Proceed with creating a new implementation (may create duplicate work)</li>
                </ul>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPRConflict(null)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (!prConflict) return;
                // Create a bug-review session with custom prompt to review the PR
                const reviewPrompt = `Review the existing pull request at ${prConflict.prURL} for issue ${prConflict.issueURL}. Compare the PR implementation against the bug assessment and provide feedback on whether it correctly addresses the issue. Check for code quality, test coverage, and alignment with the resolution plan.`;

                createSessionMutation.mutate({
                  sessionType: 'bug-review',
                  title: `Review PR #${prConflict.prNumber}`,
                  prompt: reviewPrompt,
                  interactive,
                  autoPushOnComplete: false, // Don't push when reviewing
                  resourceOverrides: {
                    model,
                    temperature,
                    maxTokens,
                    timeout,
                  },
                });
                setPRConflict(null);
              }}
            >
              Review PR
            </Button>
            <Button
              onClick={() => {
                // Proceed with original implementation session
                const data = {
                  sessionType: 'bug-implement-fix' as const,
                  title: customTitle || undefined,
                  prompt: customPrompt || undefined,
                  description: customDescription || undefined,
                  interactive,
                  autoPushOnComplete,
                  resourceOverrides: {
                    model,
                    temperature,
                    maxTokens,
                    timeout,
                  },
                };
                createSessionMutation.mutate(data);
                setPRConflict(null);
              }}
            >
              Implement Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}