'use client';

import React, { useState } from 'react';
import { Play, Code, Search, Wrench, Package } from 'lucide-react';

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
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
  {
    id: 'generic',
    name: 'Generic Session',
    description: 'Open-ended session for ad-hoc investigation, exploration, or other tasks',
    icon: <Package className="h-5 w-5" />,
  },
];

export default function SessionSelector({ projectName, workflowId, githubIssueNumber, disabled }: SessionSelectorProps) {
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('');
  const [customTitle, setCustomTitle] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const queryClient = useQueryClient();
  const router = useRouter();

  const createSessionMutation = useMutation({
    mutationFn: (data: { sessionType: string; title?: string; description?: string }) =>
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

    const data: any = { sessionType: selectedType };
    if (customTitle) data.title = customTitle;
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
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