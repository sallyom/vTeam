"use client";

import { useState } from "react";
import { GitBranch, X, Link, Loader2, GitMerge, Shield } from "lucide-react";
import { AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Repository = {
  input: {
    url: string;
    branch?: string;
    baseBranch?: string;
    featureBranch?: string;
    allowProtectedWork?: boolean;
    sync?: {
      url: string;
      branch?: string;
    };
  };
};

type RepositoriesAccordionProps = {
  repositories?: Repository[];
  onAddRepository: () => void;
  onRemoveRepository: (repoName: string) => void;
};

export function RepositoriesAccordion({
  repositories = [],
  onAddRepository,
  onRemoveRepository,
}: RepositoriesAccordionProps) {
  const [removingRepo, setRemovingRepo] = useState<string | null>(null);

  const handleRemove = async (repoName: string) => {
    if (confirm(`Remove repository ${repoName}?`)) {
      setRemovingRepo(repoName);
      try {
        await onRemoveRepository(repoName);
      } finally {
        setRemovingRepo(null);
      }
    }
  };

  return (
    <AccordionItem value="context" className="border rounded-lg px-3 bg-card">
      <AccordionTrigger className="text-base font-semibold hover:no-underline py-3">
        <div className="flex items-center gap-2">
          <Link className="h-4 w-4" />
          <span>Context</span>
          {repositories.length > 0 && (
            <Badge variant="secondary" className="ml-auto mr-2">
              {repositories.length}
            </Badge>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="pt-2 pb-3">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Add additional context to improve AI responses.
          </p>

          {/* Repository List */}
          {repositories.length === 0 ? (
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-2">
                <Link className="h-5 w-5 text-muted-foreground/60" />
              </div>
              <p className="text-sm text-muted-foreground mb-3">No context added yet</p>
              <Button size="sm" variant="outline" onClick={onAddRepository}>
                <Link className="mr-2 h-3 w-3" />
                Add Context
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {repositories.map((repo, idx) => {
                const repoName = repo.input.url.split('/').pop()?.replace('.git', '') || `repo-${idx}`;
                const isRemoving = removingRepo === repoName;

                // Determine which branch info to show
                const baseBranch = repo.input.baseBranch || repo.input.branch || 'main';
                const featureBranch = repo.input.featureBranch;
                const hasSync = !!repo.input.sync?.url;
                const allowProtected = repo.input.allowProtectedWork;

                return (
                  <div key={idx} className="border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-start gap-2 p-3">
                      <GitBranch className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="text-sm font-medium truncate">{repoName}</div>
                          {hasSync && (
                            <Badge variant="outline" className="text-xs">
                              <GitMerge className="h-3 w-3 mr-1" />
                              Synced
                            </Badge>
                          )}
                          {allowProtected && (
                            <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
                              <Shield className="h-3 w-3 mr-1" />
                              Protected
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate mb-2">{repo.input.url}</div>

                        {/* Branch information */}
                        <div className="flex flex-wrap gap-1 text-xs">
                          <div className="inline-flex items-center gap-1 bg-background px-2 py-0.5 rounded border">
                            <span className="text-muted-foreground">Base:</span>
                            <span className="font-mono">{baseBranch}</span>
                          </div>
                          {featureBranch && (
                            <div className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                              <span className="text-blue-700 dark:text-blue-300">Feature:</span>
                              <span className="font-mono text-blue-900 dark:text-blue-100">{featureBranch}</span>
                            </div>
                          )}
                          {hasSync && (
                            <div className="inline-flex items-center gap-1 bg-green-50 dark:bg-green-950 px-2 py-0.5 rounded border border-green-200 dark:border-green-800">
                              <GitMerge className="h-3 w-3 text-green-600 dark:text-green-400" />
                              <span className="text-green-700 dark:text-green-300">
                                {repo.input.sync?.url.split('/').pop()?.replace('.git', '')}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 flex-shrink-0"
                        onClick={() => handleRemove(repoName)}
                        disabled={isRemoving}
                      >
                        {isRemoving ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
              <Button onClick={onAddRepository} variant="outline" className="w-full" size="sm">
                <Link className="mr-2 h-3 w-3" />
                Add Context
              </Button>
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
