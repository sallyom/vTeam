"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { GitBranch, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Repo = {
  url: string;
  branch?: string;
};

// Git branch name validation based on git-check-ref-format rules
const isValidBranchName = (name: string): boolean => {
  if (!name || name.trim() === "") return true; // Empty is valid (will use default)

  // Invalid patterns
  const invalidPatterns = [
    /^\./,                    // Cannot start with .
    /\/\./,                   // Cannot contain /.
    /\.\.$/,                  // Cannot end with ..
    /\.\./,                   // Cannot contain ..
    /@\{/,                    // Cannot contain @{
    /[\x00-\x1f\x7f]/,       // No control characters
    /[\s~^:?*\[\\]/,         // No spaces or special chars
    /\/$/,                    // Cannot end with /
    /\.lock$/,                // Cannot end with .lock
    /^@$/,                    // Cannot be @
    /\/{2,}/,                 // Cannot have consecutive slashes
  ];

  return !invalidPatterns.some(pattern => pattern.test(name));
};

type RepositoryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repo: Repo;
  onRepoChange: (repo: Repo) => void;
  onSave: () => void;
  isEditing: boolean;
  projectName: string;
};

export function RepositoryDialog({
  open,
  onOpenChange,
  repo,
  onRepoChange,
  onSave,
  isEditing,
}: RepositoryDialogProps) {
  const currentBranch = repo.branch?.trim() || "";
  const isBranchValid = isValidBranchName(currentBranch);
  const isEmptyBranch = !currentBranch;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Repository" : "Add Repository"}</DialogTitle>
          <DialogDescription>Configure repository URL and branch</DialogDescription>
        </DialogHeader>
        {repo.branch && (
          <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-md border">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Current branch:</span>
            <Badge variant="secondary" className="font-mono">
              {repo.branch}
            </Badge>
          </div>
        )}

        {isEmptyBranch && repo.url && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No branch specified. The repository&apos;s default branch will be used.
              <strong className="block mt-1">Any changes made will be committed to the default branch.</strong>
            </AlertDescription>
          </Alert>
        )}

        {!isBranchValid && !isEmptyBranch && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Invalid branch name. Branch names cannot contain spaces, special characters (~^:?*[\\),
              consecutive slashes, or start with a dot.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Repository URL</label>
            <Input
              placeholder="https://github.com/org/repo.git"
              value={repo.url}
              onChange={(e) => onRepoChange({ ...repo, url: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Branch</label>
            <Input
              placeholder="main"
              value={repo.branch || ""}
              onChange={(e) => onRepoChange({ ...repo, branch: e.target.value })}
              className={!isBranchValid && !isEmptyBranch ? "border-destructive" : ""}
            />
            {!repo.url ? (
              <p className="text-xs text-muted-foreground">Enter repository URL first</p>
            ) : isEmptyBranch ? (
              <p className="text-xs text-muted-foreground">
                Leave empty to use the repository&apos;s default branch
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                If the branch doesn&apos;t exist, it will be created from the repository&apos;s default branch
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (!repo.url || !isBranchValid) return;
              onSave();
              onOpenChange(false);
            }}
            disabled={!repo.url || !isBranchValid}
          >
            {isEditing ? "Update" : "Add"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
