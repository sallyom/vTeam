'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link';
import { ArrowLeft, Loader2, Bug, GitBranch } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Breadcrumbs } from '@/components/breadcrumbs';

import { bugfixApi, type CreateBugFixWorkflowRequest } from '@/services/api';
import { successToast, errorToast } from '@/hooks/use-toast';

// GitHub Issue URL validation
const githubIssueUrlRegex = /^https?:\/\/github\.com\/[\w-]+\/[\w.-]+\/issues\/\d+\/?$/;

const repoSchema = z.object({
  url: z.string().url('Please enter a valid repository URL'),
  branch: z.string().optional(),
});

// Form schema for GitHub Issue URL flow
const issueUrlSchema = z.object({
  githubIssueURL: z.string()
    .url('Please enter a valid URL')
    .regex(githubIssueUrlRegex, 'Must be a valid GitHub Issue URL (e.g., https://github.com/owner/repo/issues/123)'),
  umbrellaRepo: repoSchema,
  branchName: z.string().optional(),
});

// Form schema for text description flow
const textDescriptionSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(200, 'Title must be less than 200 characters'),
  symptoms: z.string().min(20, 'Symptoms must be at least 20 characters'),
  reproductionSteps: z.string().optional(),
  expectedBehavior: z.string().optional(),
  actualBehavior: z.string().optional(),
  additionalContext: z.string().optional(),
  targetRepository: z.string().url('Please enter a valid repository URL'),
  umbrellaRepo: repoSchema,
  branchName: z.string().optional(),
});

type IssueUrlFormValues = z.infer<typeof issueUrlSchema>;
type TextDescriptionFormValues = z.infer<typeof textDescriptionSchema>;

export default function NewBugFixWorkspacePage() {
  const router = useRouter();
  const params = useParams();
  const projectName = params?.name as string;
  const [activeTab, setActiveTab] = React.useState<'issue-url' | 'text-description'>('issue-url');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Form for GitHub Issue URL
  const issueUrlForm = useForm<IssueUrlFormValues>({
    resolver: zodResolver(issueUrlSchema),
    defaultValues: {
      githubIssueURL: '',
      umbrellaRepo: { url: '', branch: 'main' },
      branchName: '',
    },
  });

  // Form for text description
  const textDescriptionForm = useForm<TextDescriptionFormValues>({
    resolver: zodResolver(textDescriptionSchema),
    defaultValues: {
      title: '',
      symptoms: '',
      reproductionSteps: '',
      expectedBehavior: '',
      actualBehavior: '',
      additionalContext: '',
      targetRepository: '',
      umbrellaRepo: { url: '', branch: 'main' },
      branchName: '',
    },
  });

  // Auto-generate branch name from GitHub Issue URL
  const githubIssueURL = issueUrlForm.watch('githubIssueURL');
  React.useEffect(() => {
    const match = githubIssueURL?.match(/\/issues\/(\d+)/);
    if (match) {
      const issueNumber = match[1];
      issueUrlForm.setValue('branchName', `bugfix/gh-${issueNumber}`, { shouldValidate: false });
    }
  }, [githubIssueURL, issueUrlForm]);

  const onSubmitIssueUrl = async (values: IssueUrlFormValues) => {
    setIsSubmitting(true);
    try {
      const request: CreateBugFixWorkflowRequest = {
        githubIssueURL: values.githubIssueURL.trim(),
        umbrellaRepo: {
          url: values.umbrellaRepo.url.trim(),
          branch: values.umbrellaRepo.branch?.trim() || 'main',
        },
        branchName: values.branchName?.trim() || undefined,
      };

      const workflow = await bugfixApi.createBugFixWorkflow(projectName, request);

      successToast(`BugFix workspace created for Issue #${workflow.githubIssueNumber}`);
      router.push(`/projects/${encodeURIComponent(projectName)}/bugfix/${encodeURIComponent(workflow.id)}`);
    } catch (error) {
      console.error('Failed to create BugFix workspace:', error);
      errorToast(error instanceof Error ? error.message : 'Failed to create workspace');
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmitTextDescription = async (values: TextDescriptionFormValues) => {
    setIsSubmitting(true);
    try {
      const request: CreateBugFixWorkflowRequest = {
        textDescription: {
          title: values.title,
          symptoms: values.symptoms,
          reproductionSteps: values.reproductionSteps || undefined,
          expectedBehavior: values.expectedBehavior || undefined,
          actualBehavior: values.actualBehavior || undefined,
          additionalContext: values.additionalContext || undefined,
          targetRepository: values.targetRepository.trim(),
        },
        umbrellaRepo: {
          url: values.umbrellaRepo.url.trim(),
          branch: values.umbrellaRepo.branch?.trim() || 'main',
        },
        branchName: values.branchName?.trim() || undefined,
      };

      const workflow = await bugfixApi.createBugFixWorkflow(projectName, request);

      successToast(`BugFix workspace created for Issue #${workflow.githubIssueNumber}`);
      router.push(`/projects/${encodeURIComponent(projectName)}/bugfix/${encodeURIComponent(workflow.id)}`);
    } catch (error) {
      console.error('Failed to create BugFix workspace:', error);
      errorToast(error instanceof Error ? error.message : 'Failed to create workspace');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <Breadcrumbs
        items={[
          { label: 'Projects', href: '/projects' },
          { label: projectName, href: `/projects/${projectName}` },
          { label: 'BugFix Workspaces', href: `/projects/${projectName}/bugfix` },
          { label: 'New', href: `/projects/${projectName}/bugfix/new` },
        ]}
      />

      <div className="flex items-center gap-4 mb-6 mt-4">
        <Link href={`/projects/${projectName}/bugfix`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bug className="h-8 w-8" />
            Create BugFix Workspace
          </h1>
          <p className="text-muted-foreground mt-1">
            Create a workspace from a GitHub Issue URL or describe a new bug
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Choose Creation Method</CardTitle>
          <CardDescription>
            Create a workspace from an existing GitHub Issue or describe a new bug to create an issue automatically
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="issue-url">From GitHub Issue URL</TabsTrigger>
              <TabsTrigger value="text-description">From Bug Description</TabsTrigger>
            </TabsList>

            {/* GitHub Issue URL Tab */}
            <TabsContent value="issue-url" className="mt-6">
              <Form {...issueUrlForm}>
                <form onSubmit={issueUrlForm.handleSubmit(onSubmitIssueUrl)} className="space-y-6">
                  <FormField
                    control={issueUrlForm.control}
                    name="githubIssueURL"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>GitHub Issue URL *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://github.com/owner/repo/issues/123"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Enter the full URL of the GitHub Issue you want to work on
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={issueUrlForm.control}
                    name="umbrellaRepo.url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Spec Repository URL *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://github.com/owner/specs"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Repository where bug documentation will be stored
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={issueUrlForm.control}
                    name="branchName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <GitBranch className="h-4 w-4" />
                          Branch Name
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="bugfix/gh-123" {...field} />
                        </FormControl>
                        <FormDescription>
                          Auto-generated from issue number. Leave empty to use default.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end gap-4">
                    <Link href={`/projects/${projectName}/bugfix`}>
                      <Button type="button" variant="outline">
                        Cancel
                      </Button>
                    </Link>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create Workspace
                    </Button>
                  </div>
                </form>
              </Form>
            </TabsContent>

            {/* Text Description Tab */}
            <TabsContent value="text-description" className="mt-6">
              <Form {...textDescriptionForm}>
                <form onSubmit={textDescriptionForm.handleSubmit(onSubmitTextDescription)} className="space-y-6">
                  <FormField
                    control={textDescriptionForm.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bug Title *</FormLabel>
                        <FormControl>
                          <Input placeholder="Brief description of the bug" {...field} />
                        </FormControl>
                        <FormDescription>
                          A concise title for the bug (5-200 characters)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={textDescriptionForm.control}
                    name="symptoms"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bug Symptoms *</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe what's wrong and how it manifests..."
                            rows={4}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Detailed description of the problem (minimum 20 characters)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={textDescriptionForm.control}
                    name="reproductionSteps"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reproduction Steps</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="1. Go to...\n2. Click on...\n3. See error..."
                            rows={3}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Steps to reproduce the bug (optional)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={textDescriptionForm.control}
                      name="expectedBehavior"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expected Behavior</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="What should happen..."
                              rows={3}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={textDescriptionForm.control}
                      name="actualBehavior"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Actual Behavior</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="What actually happens..."
                              rows={3}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={textDescriptionForm.control}
                    name="targetRepository"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target Repository *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://github.com/owner/repo"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Repository where the GitHub Issue will be created
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={textDescriptionForm.control}
                    name="umbrellaRepo.url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Spec Repository URL *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://github.com/owner/specs"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Repository where bug documentation will be stored
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end gap-4">
                    <Link href={`/projects/${projectName}/bugfix`}>
                      <Button type="button" variant="outline">
                        Cancel
                      </Button>
                    </Link>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create Issue & Workspace
                    </Button>
                  </div>
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
