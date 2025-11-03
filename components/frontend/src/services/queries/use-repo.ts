/**
 * React Query hooks for repository operations
 */

import { useQuery } from '@tanstack/react-query';
import * as repoApi from '../api/repo';

type RepoParams = {
  repo: string;
  ref: string;
  path: string;
};

/**
 * Query keys for repository operations
 */
export const repoKeys = {
  all: ['repo'] as const,
  blobs: () => [...repoKeys.all, 'blob'] as const,
  blob: (projectName: string, params: RepoParams) =>
    [...repoKeys.blobs(), projectName, params.repo, params.ref, params.path] as const,
  trees: () => [...repoKeys.all, 'tree'] as const,
  tree: (projectName: string, params: RepoParams) =>
    [...repoKeys.trees(), projectName, params.repo, params.ref, params.path] as const,
  branches: () => [...repoKeys.all, 'branches'] as const,
  repoBranches: (projectName: string, repo: string) =>
    [...repoKeys.branches(), projectName, repo] as const,
};

/**
 * Hook to fetch a file blob from repository
 * Returns the Response object for status checking and content reading
 */
export function useRepoBlob(
  projectName: string,
  params: RepoParams,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: repoKeys.blob(projectName, params),
    queryFn: () => repoApi.getRepoBlob(projectName, params),
    enabled: (options?.enabled ?? true) && !!projectName && !!params.repo && !!params.ref && !!params.path,
    staleTime: 5 * 60 * 1000, // 5 minutes - files don't change frequently
  });
}

/**
 * Hook to fetch a directory tree from repository
 */
export function useRepoTree(
  projectName: string,
  params: RepoParams,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: repoKeys.tree(projectName, params),
    queryFn: () => repoApi.getRepoTree(projectName, params),
    enabled: (options?.enabled ?? true) && !!projectName && !!params.repo && !!params.ref && !!params.path,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to check if a file exists in repository
 */
export function useRepoFileExists(
  projectName: string,
  params: RepoParams,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: [...repoKeys.blob(projectName, params), 'exists'] as const,
    queryFn: () => repoApi.checkFileExists(projectName, params),
    enabled: (options?.enabled ?? true) && !!projectName && !!params.repo && !!params.ref && !!params.path,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch all branches in a repository
 */
export function useRepoBranches(
  projectName: string,
  repo: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: repoKeys.repoBranches(projectName, repo),
    queryFn: () => repoApi.listRepoBranches(projectName, repo),
    enabled: (options?.enabled ?? true) && !!projectName && !!repo,
    staleTime: 2 * 60 * 1000, // 2 minutes - branches may change more frequently than files
  });
}
