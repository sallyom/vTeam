"use client";

import { useState } from "react";
import { Info, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type Repo = {
  url: string;
  branch?: string;
  workingBranch?: string;
  allowProtectedWork?: boolean;
  sync?: {
    url: string;
    branch?: string;
  };
};

type RepositoryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repo: Repo;
  onRepoChange: (repo: Repo) => void;
  onSave: () => void;
  isEditing: boolean;
};

export function RepositoryDialog({
  open,
  onOpenChange,
  repo,
  onRepoChange,
  onSave,
  isEditing,
}: RepositoryDialogProps) {
  const [syncExpanded, setSyncExpanded] = useState(false);

  // Check if working branch is likely protected
  const isProtectedBranch = (branch: string): boolean => {
    const protectedNames = ['main', 'master', 'develop', 'dev', 'development',
                           'production', 'prod', 'staging', 'stage', 'qa', 'test', 'stable'];
    return protectedNames.includes(branch.toLowerCase().trim());
  };

  const workingBranch = repo.workingBranch || '';
  const showProtectedWarning = workingBranch && isProtectedBranch(workingBranch);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Repository" : "Add Repository"}</DialogTitle>
          <DialogDescription>Configure repository with advanced git workflow options</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="repo-url">Repository URL</Label>
            <Input
              id="repo-url"
              placeholder="https://github.com/org/repo.git"
              value={repo.url}
              onChange={(e) => onRepoChange({ ...repo, url: e.target.value })}
            />
          </div>

          {/* Repository Options Section */}
          <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
            <h4 className="text-sm font-semibold">Branch Configuration</h4>

            <div className="space-y-2">
              <Label htmlFor="working-branch">Working Branch (optional)</Label>
              <Input
                id="working-branch"
                placeholder="Leave empty to auto-create from session name"
                value={repo.workingBranch || ''}
                onChange={(e) => onRepoChange({ ...repo, workingBranch: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                The branch to work on. If left empty, a branch will be created based on the session name (e.g., &apos;Fix-login-bug&apos;). If specified and it exists remotely, it will be checked out. If it doesn&apos;t exist, it will be created from the repository&apos;s default branch.
              </p>
            </div>

            {/* Protected Branch Warning & Checkbox */}
            {showProtectedWarning && (
              <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
                <Info className="h-4 w-4 text-orange-600" />
                <AlertDescription className="space-y-2">
                  <p className="text-sm text-orange-800 dark:text-orange-200">
                    &apos;<strong>{workingBranch}</strong>&apos; appears to be a protected branch.
                  </p>
                  <div className="flex items-center space-x-2 mt-2">
                    <Checkbox
                      id="allow-protected"
                      checked={repo.allowProtectedWork || false}
                      onCheckedChange={(checked) => onRepoChange({ ...repo, allowProtectedWork: checked === true })}
                    />
                    <label
                      htmlFor="allow-protected"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      Allow direct work on this protected branch
                    </label>
                  </div>
                  <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                    {repo.allowProtectedWork
                      ? "⚠️ Any changes will be made directly to this protected branch"
                      : "A temporary working branch will be created automatically to preserve this branch"}
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {/* Sync Configuration (Collapsible) */}
            <Collapsible open={syncExpanded} onOpenChange={setSyncExpanded}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-0 hover:bg-transparent">
                  <div className="flex items-center gap-2">
                    {syncExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="text-sm font-medium">Sync with Remote/Upstream Repository (optional)</span>
                  </div>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 mt-3 pl-6 border-l-2 border-muted">
                <div className="space-y-2">
                  <Label htmlFor="sync-url">Remote/Upstream Repository URL</Label>
                  <Input
                    id="sync-url"
                    placeholder="https://github.com/upstream/repo"
                    value={repo.sync?.url || ''}
                    onChange={(e) => onRepoChange({
                      ...repo,
                      sync: {
                        url: e.target.value,
                        branch: repo.sync?.branch || 'main'
                      }
                    })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Remote repository to sync from (useful for forks or keeping up-to-date with upstream)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sync-branch">Remote/Upstream Branch</Label>
                  <Input
                    id="sync-branch"
                    placeholder="main"
                    value={repo.sync?.branch || ''}
                    onChange={(e) => onRepoChange({
                      ...repo,
                      sync: {
                        url: repo.sync?.url || '',
                        branch: e.target.value
                      }
                    })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Branch to sync from remote. Your working branch will be rebased onto this.
                  </p>
                </div>

                <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-xs text-blue-800 dark:text-blue-200">
                    When configured, the system will run: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">git fetch upstream &amp;&amp; git rebase upstream/main</code> before starting work.
                  </AlertDescription>
                </Alert>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (!repo.url) return;
              onSave();
              onOpenChange(false);
            }}
          >
            {isEditing ? "Update" : "Add"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
