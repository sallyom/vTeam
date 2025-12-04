"use client";

import { useState } from "react";
import { Loader2, Info, ChevronDown, ChevronUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import type { AddRepositoryRequest } from "@/types/api";

type AddContextModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddRepository: (data: AddRepositoryRequest) => Promise<void>;
  isLoading?: boolean;
};

export function AddContextModal({
  open,
  onOpenChange,
  onAddRepository,
  isLoading = false,
}: AddContextModalProps) {
  const [repoUrl, setRepoUrl] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced options
  const [featureBranch, setFeatureBranch] = useState("");
  const [allowProtectedWork, setAllowProtectedWork] = useState(false);
  const [syncUrl, setSyncUrl] = useState("");
  const [syncBranch, setSyncBranch] = useState("main");
  const [outputUrl, setOutputUrl] = useState("");
  const [outputBranch, setOutputBranch] = useState("");

  const handleSubmit = async () => {
    if (!repoUrl.trim()) return;

    // Derive repository name from URL
    const repoName = repoUrl.split('/').pop()?.replace('.git', '') || `repo-${Date.now()}`;

    const data: AddRepositoryRequest = {
      name: repoName,
      input: {
        url: repoUrl.trim(),
        baseBranch: baseBranch.trim() || 'main',
      },
    };

    // Add optional feature branch
    if (featureBranch.trim()) {
      data.input.featureBranch = featureBranch.trim();
    }

    // Add protected branch override if enabled
    if (allowProtectedWork) {
      data.input.allowProtectedWork = true;
    }

    // Add sync/upstream configuration
    if (syncUrl.trim()) {
      data.input.sync = {
        url: syncUrl.trim(),
        branch: syncBranch.trim() || 'main',
      };
    }

    // Add output repository (fork/target)
    if (outputUrl.trim()) {
      data.output = {
        url: outputUrl.trim(),
        branch: outputBranch.trim() || baseBranch.trim() || 'main',
      };
    }

    await onAddRepository(data);

    // Reset form
    resetForm();
  };

  const resetForm = () => {
    setRepoUrl("");
    setBaseBranch("main");
    setFeatureBranch("");
    setAllowProtectedWork(false);
    setSyncUrl("");
    setSyncBranch("main");
    setOutputUrl("");
    setOutputBranch("");
    setShowAdvanced(false);
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Repository Context</DialogTitle>
          <DialogDescription>
            Add a Git repository to your session workspace
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Repositories will be cloned into your session workspace. Additional context types (Jira, Google Drive, files, MCP Servers) are coming soon!
            </AlertDescription>
          </Alert>

          {/* Basic Configuration */}
          <div className="space-y-2">
            <Label htmlFor="repo-url">Repository URL *</Label>
            <Input
              id="repo-url"
              placeholder="https://github.com/org/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              GitHub repository URL (HTTPS format)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="base-branch">Base Branch</Label>
            <Input
              id="base-branch"
              placeholder="main"
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Primary branch to clone from (default: main)
            </p>
          </div>

          {/* Advanced Options Toggle */}
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full justify-between"
          >
            <span>Advanced Options</span>
            {showAdvanced ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>

          {/* Advanced Options */}
          {showAdvanced && (
            <div className="space-y-4 border-l-2 border-muted pl-4">
              <div className="space-y-2">
                <Label htmlFor="feature-branch">Feature Branch (optional)</Label>
                <Input
                  id="feature-branch"
                  placeholder="feature/my-feature"
                  value={featureBranch}
                  onChange={(e) => setFeatureBranch(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Create or checkout a specific working branch
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="allow-protected"
                  checked={allowProtectedWork}
                  onCheckedChange={(checked) => setAllowProtectedWork(checked === true)}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="allow-protected"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Allow work on protected branches
                  </label>
                  <p className="text-xs text-muted-foreground">
                    By default, a working branch is created for protected branches (main, master, develop, etc.)
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <Label className="text-sm font-semibold">Sync/Upstream Repository</Label>
                <div className="space-y-2">
                  <Label htmlFor="sync-url" className="text-xs font-normal">Upstream URL (optional)</Label>
                  <Input
                    id="sync-url"
                    placeholder="https://github.com/upstream/repo"
                    value={syncUrl}
                    onChange={(e) => setSyncUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Repository to sync from (for forks)
                  </p>
                </div>
                {syncUrl.trim() && (
                  <div className="space-y-2">
                    <Label htmlFor="sync-branch" className="text-xs font-normal">Sync Branch</Label>
                    <Input
                      id="sync-branch"
                      placeholder="main"
                      value={syncBranch}
                      onChange={(e) => setSyncBranch(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-2">
                <Label className="text-sm font-semibold">Output Repository</Label>
                <div className="space-y-2">
                  <Label htmlFor="output-url" className="text-xs font-normal">Target URL (optional)</Label>
                  <Input
                    id="output-url"
                    placeholder="https://github.com/user/fork"
                    value={outputUrl}
                    onChange={(e) => setOutputUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Repository to push changes to (for forks)
                  </p>
                </div>
                {outputUrl.trim() && (
                  <div className="space-y-2">
                    <Label htmlFor="output-branch" className="text-xs font-normal">Target Branch</Label>
                    <Input
                      id="output-branch"
                      placeholder={baseBranch || "main"}
                      value={outputBranch}
                      onChange={(e) => setOutputBranch(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!repoUrl.trim() || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cloning...
              </>
            ) : (
              'Add Repository'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

