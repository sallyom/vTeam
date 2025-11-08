"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Save, Loader2, Info } from "lucide-react";
import { Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { successToast, errorToast } from "@/hooks/use-toast";
import { useProject, useUpdateProject } from "@/services/queries/use-projects";
import { useSecretsConfig, useSecretsValues, useUpdateSecretsConfig, useUpdateSecrets } from "@/services/queries/use-secrets";
import { useMemo } from "react";

type SettingsSectionProps = {
  projectName: string;
};

export function SettingsSection({ projectName }: SettingsSectionProps) {
  const [formData, setFormData] = useState({ displayName: "", description: "" });

  // Runner secret state
  const [runnerSecretName, setRunnerSecretName] = useState<string>("ambient-runner-secrets");
  const [anthropicApiKey, setAnthropicApiKey] = useState<string>("");
  const [showAnthropicKey, setShowAnthropicKey] = useState<boolean>(false);
  const [customSecrets, setCustomSecrets] = useState<Array<{ key: string; value: string }>>([]);
  const [showCustomValues, setShowCustomValues] = useState<Record<number, boolean>>({});

  // Git auth secret state
  const [gitSecretName, setGitSecretName] = useState<string>("github-auth");
  const [gitUserName, setGitUserName] = useState<string>("");
  const [gitUserEmail, setGitUserEmail] = useState<string>("");
  const [gitToken, setGitToken] = useState<string>("");
  const [showGitToken, setShowGitToken] = useState<boolean>(false);

  // Jira connection secret state
  const [jiraSecretName, setJiraSecretName] = useState<string>("jira-connection");
  const [jiraUrl, setJiraUrl] = useState<string>("");
  const [jiraProject, setJiraProject] = useState<string>("");
  const [jiraEmail, setJiraEmail] = useState<string>("");
  const [jiraToken, setJiraToken] = useState<string>("");
  const [showJiraToken, setShowJiraToken] = useState<boolean>(false);

  // Fixed keys that shouldn't appear in custom secrets
  const FIXED_KEYS = useMemo(() => [
    "ANTHROPIC_API_KEY",
    "GIT_USER_NAME",
    "GIT_USER_EMAIL",
    "GIT_TOKEN",
    "JIRA_URL",
    "JIRA_PROJECT",
    "JIRA_EMAIL",
    "JIRA_API_TOKEN"
  ] as const, []);

  // React Query hooks
  const { data: project, isLoading: projectLoading } = useProject(projectName);
  const { data: secretsConfig } = useSecretsConfig(projectName);
  const { data: secretsValues } = useSecretsValues(projectName);
  const updateProjectMutation = useUpdateProject();
  const updateSecretsConfigMutation = useUpdateSecretsConfig();
  const updateSecretsMutation = useUpdateSecrets();

  // Sync project data to form
  useEffect(() => {
    if (project) {
      setFormData({ displayName: project.displayName || "", description: project.description || "" });
    }
  }, [project]);

  // Sync secrets config to state
  useEffect(() => {
    if (secretsConfig) {
      setRunnerSecretName(secretsConfig.runnerSecretName || "ambient-runner-secrets");
      setGitSecretName(secretsConfig.githubAuthSecretName || "github-auth");
      setJiraSecretName(secretsConfig.jiraConnectionSecretName || "jira-connection");
    }
  }, [secretsConfig]);

  // Sync secrets values to state
  useEffect(() => {
    if (secretsValues) {
      const byKey: Record<string, string> = Object.fromEntries(secretsValues.map(s => [s.key, s.value]));

      // Runner secret keys
      setAnthropicApiKey(byKey["ANTHROPIC_API_KEY"] || "");

      // Git auth keys
      setGitUserName(byKey["GIT_USER_NAME"] || "");
      setGitUserEmail(byKey["GIT_USER_EMAIL"] || "");
      setGitToken(byKey["GIT_TOKEN"] || "");

      // Jira connection keys
      setJiraUrl(byKey["JIRA_URL"] || "");
      setJiraProject(byKey["JIRA_PROJECT"] || "");
      setJiraEmail(byKey["JIRA_EMAIL"] || "");
      setJiraToken(byKey["JIRA_API_TOKEN"] || "");

      // Custom secrets (anything not in FIXED_KEYS)
      setCustomSecrets(secretsValues.filter(s => !FIXED_KEYS.includes(s.key as typeof FIXED_KEYS[number])));
    }
  }, [secretsValues, FIXED_KEYS]);

  const handleSaveProject = () => {
    if (!project) return;
    updateProjectMutation.mutate(
      {
        name: projectName,
        data: {
          displayName: formData.displayName.trim(),
          description: formData.description.trim() || undefined,
          annotations: project.annotations || {},
        },
      },
      {
        onSuccess: () => {
          successToast("Project settings updated successfully!");
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : "Failed to update project";
          errorToast(message);
        },
      }
    );
  };

  const handleSaveRunnerSecret = () => {
    const secretName = runnerSecretName.trim() || "ambient-runner-secrets";

    // Update config first
    updateSecretsConfigMutation.mutate(
      { projectName, config: { runnerSecretName: secretName } },
      {
        onSuccess: () => {
          // Then update secret values
          const data: Record<string, string> = {};
          if (anthropicApiKey) data["ANTHROPIC_API_KEY"] = anthropicApiKey;

          // Add custom secrets
          for (const { key, value } of customSecrets) {
            if (!key || FIXED_KEYS.includes(key as typeof FIXED_KEYS[number])) continue;
            data[key] = value ?? "";
          }

          // Also include git and jira values to preserve them
          if (gitUserName) data["GIT_USER_NAME"] = gitUserName;
          if (gitUserEmail) data["GIT_USER_EMAIL"] = gitUserEmail;
          if (gitToken) data["GIT_TOKEN"] = gitToken;
          if (jiraUrl) data["JIRA_URL"] = jiraUrl;
          if (jiraProject) data["JIRA_PROJECT"] = jiraProject;
          if (jiraEmail) data["JIRA_EMAIL"] = jiraEmail;
          if (jiraToken) data["JIRA_API_TOKEN"] = jiraToken;

          updateSecretsMutation.mutate(
            {
              projectName,
              secrets: Object.entries(data).map(([key, value]) => ({ key, value })),
            },
            {
              onSuccess: () => {
                successToast(`Successfully updated ${secretName}`);
              },
              onError: (error) => {
                const message = error instanceof Error ? error.message : "Failed to save runner secret";
                errorToast(message);
              },
            }
          );
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : "Failed to save runner secret config";
          errorToast(message);
        },
      }
    );
  };

  const handleSaveGitSecret = () => {
    const secretName = gitSecretName.trim() || "github-auth";

    // Update config first
    updateSecretsConfigMutation.mutate(
      { projectName, config: { githubAuthSecretName: secretName } },
      {
        onSuccess: () => {
          // Then update secret values
          const data: Record<string, string> = {};
          if (gitUserName) data["GIT_USER_NAME"] = gitUserName;
          if (gitUserEmail) data["GIT_USER_EMAIL"] = gitUserEmail;
          if (gitToken) data["GIT_TOKEN"] = gitToken;

          // Preserve other secrets
          if (anthropicApiKey) data["ANTHROPIC_API_KEY"] = anthropicApiKey;
          for (const { key, value } of customSecrets) {
            if (!key || FIXED_KEYS.includes(key as typeof FIXED_KEYS[number])) continue;
            data[key] = value ?? "";
          }
          if (jiraUrl) data["JIRA_URL"] = jiraUrl;
          if (jiraProject) data["JIRA_PROJECT"] = jiraProject;
          if (jiraEmail) data["JIRA_EMAIL"] = jiraEmail;
          if (jiraToken) data["JIRA_API_TOKEN"] = jiraToken;

          updateSecretsMutation.mutate(
            {
              projectName,
              secrets: Object.entries(data).map(([key, value]) => ({ key, value })),
            },
            {
              onSuccess: () => {
                successToast(`Successfully updated ${secretName}`);
              },
              onError: (error) => {
                const message = error instanceof Error ? error.message : "Failed to save git authentication";
                errorToast(message);
              },
            }
          );
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : "Failed to save git auth config";
          errorToast(message);
        },
      }
    );
  };

  const handleSaveJiraSecret = () => {
    const secretName = jiraSecretName.trim() || "jira-connection";

    // Update config first
    updateSecretsConfigMutation.mutate(
      { projectName, config: { jiraConnectionSecretName: secretName } },
      {
        onSuccess: () => {
          // Then update secret values
          const data: Record<string, string> = {};
          if (jiraUrl) data["JIRA_URL"] = jiraUrl;
          if (jiraProject) data["JIRA_PROJECT"] = jiraProject;
          if (jiraEmail) data["JIRA_EMAIL"] = jiraEmail;
          if (jiraToken) data["JIRA_API_TOKEN"] = jiraToken;

          // Preserve other secrets
          if (anthropicApiKey) data["ANTHROPIC_API_KEY"] = anthropicApiKey;
          for (const { key, value } of customSecrets) {
            if (!key || FIXED_KEYS.includes(key as typeof FIXED_KEYS[number])) continue;
            data[key] = value ?? "";
          }
          if (gitUserName) data["GIT_USER_NAME"] = gitUserName;
          if (gitUserEmail) data["GIT_USER_EMAIL"] = gitUserEmail;
          if (gitToken) data["GIT_TOKEN"] = gitToken;

          updateSecretsMutation.mutate(
            {
              projectName,
              secrets: Object.entries(data).map(([key, value]) => ({ key, value })),
            },
            {
              onSuccess: () => {
                successToast(`Successfully updated ${secretName}`);
              },
              onError: (error) => {
                const message = error instanceof Error ? error.message : "Failed to save Jira integration";
                errorToast(message);
              },
            }
          );
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : "Failed to save Jira connection config";
          errorToast(message);
        },
      }
    );
  };

  const addCustomSecret = () => {
    setCustomSecrets((prev) => [...prev, { key: "", value: "" }]);
  };

  const removeCustomSecret = (idx: number) => {
    setCustomSecrets((prev) => prev.filter((_, i) => i !== idx));
  };

  const isSaving = updateSecretsConfigMutation.isPending || updateSecretsMutation.isPending;

  return (
    <div className="flex-1 space-y-6">
      {/* General Settings */}
      {project?.isOpenShift ? (
        <Card>
          <CardHeader>
            <CardTitle>General Settings</CardTitle>
            <CardDescription>Basic workspace configuration</CardDescription>
          </CardHeader>
          <Separator />
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={formData.displayName}
                onChange={(e) => setFormData((prev) => ({ ...prev, displayName: e.target.value }))}
                placeholder="My Awesome Workspace"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspaceName">Workspace Name</Label>
              <Input
                id="workspaceName"
                value={projectName}
                readOnly
                disabled
                className="bg-muted/80 text-muted-foreground"
              />
              <p className="text-sm text-muted-foreground">Workspace name cannot be changed after creation</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Describe the purpose and goals of this workspace..."
                maxLength={500}
                rows={3}
              />
            </div>
            <div className="pt-2">
              <Button onClick={handleSaveProject} disabled={updateProjectMutation.isPending || projectLoading || !project}>
                {updateProjectMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Running on vanilla Kubernetes. Project display name and description editing is not available.
            The project namespace is: <strong>{projectName}</strong>
          </AlertDescription>
        </Alert>
      )}

      {/* Runner Secret */}
      <Card>
        <CardHeader>
          <CardTitle>Runner Secret</CardTitle>
          <CardDescription>
            Configure the Anthropic API key and additional runner secrets. Secret name: <strong>{runnerSecretName}</strong>
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="anthropicApiKey">Anthropic API Key</Label>
            <div className="text-xs text-muted-foreground mb-2">Your Anthropic API key for Claude Code runner</div>
            <div className="flex items-center gap-2">
              <Input
                id="anthropicApiKey"
                type={showAnthropicKey ? "text" : "password"}
                placeholder="sk-ant-..."
                value={anthropicApiKey}
                onChange={(e) => setAnthropicApiKey(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowAnthropicKey((v) => !v)}
                aria-label={showAnthropicKey ? "Hide key" : "Show key"}
              >
                {showAnthropicKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <Label>Additional Custom Secrets</Label>
            <div className="text-xs text-muted-foreground mb-2">Add any additional key-value pairs for your runners</div>
            <div className="space-y-2">
              {customSecrets.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Input
                    value={item.key}
                    onChange={(e) =>
                      setCustomSecrets((prev) => prev.map((it, i) => (i === idx ? { ...it, key: e.target.value } : it)))
                    }
                    placeholder="KEY"
                    className="w-1/3"
                  />
                  <div className="flex-1 flex items-center gap-2">
                    <Input
                      type={showCustomValues[idx] ? "text" : "password"}
                      value={item.value}
                      onChange={(e) =>
                        setCustomSecrets((prev) => prev.map((it, i) => (i === idx ? { ...it, value: e.target.value } : it)))
                      }
                      placeholder="value"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowCustomValues((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                      aria-label={showCustomValues[idx] ? "Hide value" : "Show value"}
                    >
                      {showCustomValues[idx] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  <Button variant="ghost" onClick={() => removeCustomSecret(idx)} aria-label="Remove row">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="outline" onClick={addCustomSecret} size="sm">
              <Plus className="w-4 h-4 mr-2" /> Add Custom Secret
            </Button>
          </div>

          <div className="pt-2">
            <Button onClick={handleSaveRunnerSecret} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Runner Secret
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Git Authentication */}
      <Card>
        <CardHeader>
          <CardTitle>Git Authentication</CardTitle>
          <CardDescription>
            Configure Git credentials for repository operations. Secret name: <strong>{gitSecretName}</strong>
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent className="space-y-4">
          <div className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded p-2 mb-3">
            <strong>Note:</strong> These fields are only needed if you have not connected a GitHub Application. When GitHub App integration is configured, it will be used automatically and these fields will serve as a fallback.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="gitUserName">Git User Name</Label>
              <Input
                id="gitUserName"
                placeholder="Your Name"
                value={gitUserName}
                onChange={(e) => setGitUserName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gitUserEmail">Git User Email</Label>
              <Input
                id="gitUserEmail"
                placeholder="you@example.com"
                value={gitUserEmail}
                onChange={(e) => setGitUserEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gitToken">GitHub API Token</Label>
            <div className="flex items-center gap-2">
              <Input
                id="gitToken"
                type={showGitToken ? "text" : "password"}
                placeholder="ghp_... or glpat-..."
                value={gitToken}
                onChange={(e) => setGitToken(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowGitToken((v) => !v)}
                aria-label={showGitToken ? "Hide token" : "Show token"}
              >
                {showGitToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">GitHub personal access token or fine-grained token for git operations and API access</div>
          </div>

          <div className="pt-2">
            <Button onClick={handleSaveGitSecret} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Git Authentication
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Jira Integration */}
      <Card>
        <CardHeader>
          <CardTitle>Jira Integration</CardTitle>
          <CardDescription>
            Configure Jira integration for issue management. Secret name: <strong>{jiraSecretName}</strong>
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="jiraUrl">Jira Base URL</Label>
              <Input
                id="jiraUrl"
                placeholder="https://your-domain.atlassian.net"
                value={jiraUrl}
                onChange={(e) => setJiraUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jiraProject">Jira Project Key</Label>
              <Input
                id="jiraProject"
                placeholder="ABC"
                value={jiraProject}
                onChange={(e) => setJiraProject(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jiraEmail">Jira Email/Username</Label>
              <Input
                id="jiraEmail"
                placeholder="you@example.com"
                value={jiraEmail}
                onChange={(e) => setJiraEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jiraToken">Jira API Token</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="jiraToken"
                  type={showJiraToken ? "text" : "password"}
                  placeholder="token"
                  value={jiraToken}
                  onChange={(e) => setJiraToken(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowJiraToken((v) => !v)}
                  aria-label={showJiraToken ? "Hide token" : "Show token"}
                >
                  {showJiraToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Button onClick={handleSaveJiraSecret} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Jira Integration
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
