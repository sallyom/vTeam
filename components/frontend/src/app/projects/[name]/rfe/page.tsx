"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getApiUrl } from "@/lib/config";
import { RFEWorkflow, WorkflowPhase } from "@/types/agentic-session";
import { Plus, RefreshCw, MoreVertical, Loader2 } from "lucide-react";
import { ProjectSubpageHeader } from "@/components/project-subpage-header";
import { formatDistanceToNow } from "date-fns";

const phaseLabel: Record<WorkflowPhase, string> = {
  pre: "Pre",
  specify: "Specify",
  plan: "Plan",
  tasks: "Tasks",
  review: "Review",
  completed: "Completed",
};

function calcProgress(w: RFEWorkflow): number {
  const phases: WorkflowPhase[] = ["pre", "specify", "plan", "tasks", "review"];
  if (w.status === "completed") return 100;
  const phase = (w.currentPhase || "pre") as WorkflowPhase;
  const idx = phases.indexOf(phase);
  if (idx < 0) return 0;
  const inPhase = (w.agentSessions || []).filter(s => s.phase === phase);
  const done = inPhase.filter(s => s.status === "Completed").length;
  const perPhasePct = 100 / (phases.length);
  const phasePct = inPhase.length ? (done / inPhase.length) * perPhasePct : 0;
  return Math.min(idx * perPhasePct + phasePct, 100);
}

export default function ProjectRFEListPage() {
  const params = useParams();
  const project = params?.name as string;
  const [items, setItems] = useState<RFEWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaryById, setSummaryById] = useState<Record<string, { phase: WorkflowPhase; status: string; progress: number; updatedAt?: string }>>({});
  const [summariesLoading, setSummariesLoading] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const resp = await fetch(`${getApiUrl()}/projects/${encodeURIComponent(project)}/rfe-workflows`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setItems(Array.isArray(data.workflows) ? data.workflows : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const computeSummaries = useCallback(async (list: RFEWorkflow[]) => {
    try {
      setSummariesLoading(true);
      const api = getApiUrl();
      const resp = await fetch(`${api}/projects/${encodeURIComponent(project)}/agentic-sessions`);
      const data = await resp.json().catch(() => ({}));
      const sessions: any[] = Array.isArray(data.items) ? data.items : [];

      const exists = async (wfId: string, path: string) => {
        try {
          const listPath = path.startsWith('specs/') ? 'specs' : path.split('/')[0];
          const r = await fetch(`${api}/projects/${encodeURIComponent(project)}/rfe-workflows/${encodeURIComponent(wfId)}/artifacts/${encodeURIComponent(listPath)}`);
          if (!r.ok) return false;
          const txt = await r.text();
          // content/list returns application/json via backend proxy; handle text -> json
          const data = JSON.parse(txt);
          const items: Array<{ path: string; name: string; isDir: boolean }> = Array.isArray(data.items) ? data.items : [];
          const filename = path.split('/').pop();
          return items.some(it => !it.isDir && (it.name === filename));
        } catch { return false; }
      };

      const summaries: Record<string, { phase: WorkflowPhase; status: string; progress: number; updatedAt?: string }> = {};
      await Promise.all(list.map(async (w) => {
        const wfSessions = sessions.filter(s => (s?.metadata?.labels || {})["rfe-workflow"] === w.id);
        const anyRunning = wfSessions.some(s => String(s?.status?.phase || '').toLowerCase() === 'running');
        const anyFailed = wfSessions.some(s => ['failed','error'].includes(String(s?.status?.phase || '').toLowerCase()));

        const spec = await exists(w.id, 'specs/spec.md');
        const plan = await exists(w.id, 'specs/plan.md');
        const tasks = await exists(w.id, 'specs/tasks.md');

        const phase: WorkflowPhase = !spec ? 'specify' : !plan ? 'plan' : !tasks ? 'tasks' : 'completed';
        let status = 'not started';
        if (anyRunning) status = 'running';
        else if (spec || plan || tasks) status = 'in progress';
        if (spec && plan && tasks && !anyRunning) status = 'completed';
        if (anyFailed && status !== 'running') status = 'attention';

        const progress = ((spec ? 1 : 0) + (plan ? 1 : 0) + (tasks ? 1 : 0)) / 3 * 100;
        summaries[w.id] = { phase, status, progress, updatedAt: w.updatedAt };
      }));
      setSummaryById(summaries);
    } catch {}
    finally { setSummariesLoading(false); }
  }, [project]);

  useEffect(() => {
    if (project) load();
  }, [project]);

  useEffect(() => {
    if (items.length > 0) computeSummaries(items);
  }, [items, computeSummaries]);

  if (!project || (loading && items.length === 0)) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="animate-spin h-8 w-8" />
          <span className="ml-2">Loading workflows...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ProjectSubpageHeader
        title={<>RFE Workflows</>}
        description={<>Feature refinement workflows scoped to this project</>}
        actions={
          <>
            <Link href={`/projects/${encodeURIComponent(project)}/rfe/new`}><Button><Plus className="w-4 h-4 mr-2" />New Workflow</Button></Link>
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </>
        }
      />

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 text-red-600">{error}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>RFE Workflows ({items?.length || 0})</CardTitle>
          <CardDescription>Workflows scoped to this project</CardDescription>
        </CardHeader>
        <CardContent>
          {!items || items.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No RFE workflows yet</p>
              <Link href={`/projects/${encodeURIComponent(project)}/rfe/new`}>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create your first workflow
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px]">Name</TableHead>
                    <TableHead>Phase</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden xl:table-cell">Created</TableHead>
                    <TableHead className="w-[50px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="font-medium min-w-[220px]">
                        <Link href={`/projects/${encodeURIComponent(project)}/rfe/${w.id}`} className="text-blue-600 hover:underline hover:text-blue-800 transition-colors block">
                          <div>
                            <div className="font-medium">{w.title}</div>
                            <div className="text-xs text-gray-500 font-normal">{w.id}</div>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        {summariesLoading || !summaryById[w.id] ? (
                          <span className="text-muted-foreground inline-flex items-center"><Loader2 className="h-3 w-3 animate-spin" /></span>
                        ) : (
                          <span className="text-sm">{phaseLabel[(summaryById[w.id]?.phase || 'pre') as WorkflowPhase]}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {summariesLoading || !summaryById[w.id] ? (
                          <span className="text-muted-foreground inline-flex items-center"><Loader2 className="h-3 w-3 animate-spin" /></span>
                        ) : (
                          <span className="text-sm">{summaryById[w.id]?.status || '—'}</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        {w.createdAt ? formatDistanceToNow(new Date(w.createdAt), { addSuffix: true }) : "—"}
                      </TableCell>
                      <TableCell>
                        <Link href={`/projects/${encodeURIComponent(project)}/rfe/${w.id}`}>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
