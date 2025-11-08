import { useQuery } from "@tanstack/react-query";
import * as workflowsApi from "@/services/api/workflows";

export const workflowKeys = {
  all: ["workflows"] as const,
  ootb: () => [...workflowKeys.all, "ootb"] as const,
  metadata: (projectName: string, sessionName: string) =>
    [...workflowKeys.all, "metadata", projectName, sessionName] as const,
};

export function useOOTBWorkflows() {
  return useQuery({
    queryKey: workflowKeys.ootb(),
    queryFn: () => workflowsApi.listOOTBWorkflows(),
    staleTime: 5 * 60 * 1000, // 5 minutes - workflows don't change often
  });
}

export function useWorkflowMetadata(
  projectName: string,
  sessionName: string,
  enabled: boolean
) {
  return useQuery({
    queryKey: workflowKeys.metadata(projectName, sessionName),
    queryFn: () => workflowsApi.getWorkflowMetadata(projectName, sessionName),
    enabled: enabled && !!projectName && !!sessionName,
    staleTime: 60 * 1000, // 1 minute
  });
}

