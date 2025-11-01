'use client';

import React, { useState } from 'react';
import { Play, Code, Search, Wrench } from 'lucide-react';

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
    name: 'Bug Review',
    description: 'Analyze the bug, research the codebase, identify root causes, and document findings in the GitHub Issue',
    icon: <Search className="h-5 w-5" />,
    badge: 'Recommended first',
  },
  {
    id: 'bug-resolution-plan',
    name: 'Resolution Plan',
    description: 'Propose resolution strategies, create implementation plan, and generate bugfix.md file',
    icon: <Code className="h-5 w-5" />,
  },
  {
    id: 'bug-implement-fix',
    name: 'Implement Fix',
    description: 'Implement the fix in feature branch, write tests, update documentation, and document steps',
    icon: <Wrench className="h-5 w-5" />,
  },
];

export default function SessionSelector({ projectName, workflowId, githubIssueNumber, disabled }: SessionSelectorProps) {
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('');
  const [customTitle, setCustomTitle] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [interactive, setInteractive] = useState(false);
  const [autoPushOnComplete, setAutoPushOnComplete] = useState(true); // Default true for bugfix sessions
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(8000);
  const [timeout, setTimeout] = useState(3600); // 1 hour default
  const queryClient = useQueryClient();
  const router = useRouter();

  const createSessionMutation = useMutation({
    mutationFn: (data: {
      sessionType: 'bug-review' | 'bug-resolution-plan' | 'bug-implement-fix';
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
    onError: (error: Error) => {
      errorToast(error.message || 'Failed to create session');
    },
  });

  const handleCreateSession = () => {
    if (!selectedType) return;

    const data: {
      sessionType: 'bug-review' | 'bug-resolution-plan' | 'bug-implement-fix';
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
      sessionType: selectedType as 'bug-review' | 'bug-resolution-plan' | 'bug-implement-fix',
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
        <DialogContent className="w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Create New Session</DialogTitle>
            <DialogDescription>
              Select a session type to work on Bug #{githubIssueNumber}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            <div className="space-y-4">
              <RadioGroup value={selectedType} onValueChange={setSelectedType}>
                <div className="grid gap-4">
                  {SESSION_TYPES.map((type) => (
                    <Card
                      key={type.id}
                      className={`cursor-pointer transition-colors ${
                        selectedType === type.id ? 'border-primary' : 'hover:border-primary/50'
                      }`}
                      onClick={() => setSelectedType(type.id)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start space-x-3">
                          <RadioGroupItem value={type.id} id={type.id} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Label htmlFor={type.id} className="cursor-pointer flex items-center gap-2">
                                {type.icon}
                                <span className="font-semibold">{type.name}</span>
                              </Label>
                              {type.badge && (
                                <Badge variant="secondary" className="text-xs">
                                  {type.badge}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {type.description}
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </RadioGroup>

              {selectedType && (
                <div className="space-y-4 border-t pt-4">
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
                        <p className="text-xs text-muted-foreground">Maximum response length</p>
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
                      <p className="text-xs text-muted-foreground">Session timeout (60-7200 seconds)</p>
                    </div>
                  </div>
                </div>
              )}
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
    </>
  );
}