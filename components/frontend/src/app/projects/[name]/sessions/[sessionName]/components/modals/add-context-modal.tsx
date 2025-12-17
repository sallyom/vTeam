"use client";

import { useState } from "react";
import { Loader2, Info, Upload, ChevronDown, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export type RepositoryConfig = {
  url: string;
  workingBranch?: string;
  allowProtectedWork?: boolean;
  sync?: {
    url: string;
    branch?: string;
  };
};

type AddContextModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddRepository: (config: RepositoryConfig) => Promise<void>;
  onUploadFile?: () => void;
  isLoading?: boolean;
};

export function AddContextModal({
  open,
  onOpenChange,
  onAddRepository,
  onUploadFile,
  isLoading = false,
}: AddContextModalProps) {
  const [contextUrl, setContextUrl] = useState("");
  const [workingBranch, setWorkingBranch] = useState("");
  const [allowProtectedWork, setAllowProtectedWork] = useState(false);
  const [syncExpanded, setSyncExpanded] = useState(false);
  const [syncUrl, setSyncUrl] = useState("");
  const [syncBranch, setSyncBranch] = useState("main");

  // Check if working branch is likely protected
  const isProtectedBranch = (branch: string): boolean => {
    const protectedNames = ['main', 'master', 'develop', 'dev', 'development',
                           'production', 'prod', 'staging', 'stage', 'qa', 'test', 'stable'];
    return protectedNames.includes(branch.toLowerCase().trim());
  };

  const showProtectedWarning = workingBranch && isProtectedBranch(workingBranch);

  const handleSubmit = async () => {
    if (!contextUrl.trim()) return;

    const config: RepositoryConfig = {
      url: contextUrl.trim(),
    };

    // Add working branch if specified
    if (workingBranch.trim()) {
      config.workingBranch = workingBranch.trim();
    }

    // Add protected work flag if specified
    if (allowProtectedWork) {
      config.allowProtectedWork = true;
    }

    // Add sync configuration if provided
    if (syncUrl.trim()) {
      config.sync = {
        url: syncUrl.trim(),
        branch: syncBranch.trim() || 'main',
      };
    }

    await onAddRepository(config);

    // Reset form
    resetForm();
  };

  const resetForm = () => {
    setContextUrl("");
    setWorkingBranch("");
    setAllowProtectedWork(false);
    setSyncExpanded(false);
    setSyncUrl("");
    setSyncBranch("main");
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Context</DialogTitle>
          <DialogDescription>
            Add additional repository context with advanced git workflow options.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Note: additional data sources like Jira, Google Drive, files, and MCP Servers are on the roadmap!
            </AlertDescription>
          </Alert>

          {/* Repository URL */}
          <div className="space-y-2">
            <Label htmlFor="context-url">Repository URL *</Label>
            <Input
              id="context-url"
              placeholder="https://github.com/org/repo"
              value={contextUrl}
              onChange={(e) => setContextUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Currently supports GitHub and GitLab repositories
            </p>
          </div>

          {/* Repository Options Section */}
          <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
            <h4 className="text-sm font-semibold">Repository Options</h4>

            {/* Working Branch */}
            <div className="space-y-2">
              <Label htmlFor="working-branch">Working Branch (optional)</Label>
              <Input
                id="working-branch"
                placeholder="Leave empty to auto-create from session name"
                value={workingBranch}
                onChange={(e) => setWorkingBranch(e.target.value)}
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
                      checked={allowProtectedWork}
                      onCheckedChange={(checked) => setAllowProtectedWork(checked === true)}
                    />
                    <label
                      htmlFor="allow-protected"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      Allow direct work on this protected branch
                    </label>
                  </div>
                  <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                    {allowProtectedWork
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
                    value={syncUrl}
                    onChange={(e) => setSyncUrl(e.target.value)}
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
                    value={syncBranch}
                    onChange={(e) => setSyncBranch(e.target.value)}
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

          {onUploadFile && (
            <>
              <Separator className="my-4" />
              <div className="space-y-2">
                <Label>Upload Files</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Upload files directly to your workspace for use as context
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onUploadFile();
                    onOpenChange(false);
                  }}
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Files
                </Button>
              </div>
            </>
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
            disabled={!contextUrl.trim() || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              'Add Context'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
