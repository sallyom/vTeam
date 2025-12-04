"use client";

import { useState } from "react";
import { Loader2, Info, ChevronDown, ChevronUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  const [syncUrl, setSyncUrl] = useState("");

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

    // Add sync/upstream configuration
    if (syncUrl.trim()) {
      data.input.sync = {
        url: syncUrl.trim(),
        branch: baseBranch.trim() || 'main',
      };
    }

    try {
      await onAddRepository(data);
      // Reset form on success
      resetForm();
    } catch (error) {
      // Error handling is done by the parent component
      console.error('Failed to add repository:', error);
    }
  };

  const resetForm = () => {
    setRepoUrl("");
    setBaseBranch("main");
    setFeatureBranch("");
    setSyncUrl("");
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
                <Label htmlFor="feature-branch">Working Branch (optional)</Label>
                <Input
                  id="feature-branch"
                  placeholder="feature/my-feature"
                  value={featureBranch}
                  onChange={(e) => setFeatureBranch(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Create or checkout a specific branch for your changes
                </p>
              </div>

              <div className="space-y-3 pt-2 border-t pt-4">
                <Label htmlFor="sync-url">Upstream Repository (optional)</Label>
                <Input
                  id="sync-url"
                  placeholder="https://github.com/upstream/repo"
                  value={syncUrl}
                  onChange={(e) => setSyncUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  If this repository is a fork, specify the upstream repository to sync changes from
                </p>
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

