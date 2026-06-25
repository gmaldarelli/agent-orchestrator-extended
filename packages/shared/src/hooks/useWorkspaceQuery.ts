// packages/shared/src/hooks/useWorkspaceQuery.ts
import { useQuery } from '@tanstack/react-query';
import { ApiClient } from '../api/client';

export interface Session {
  id: string;
  projectId: string;
  agent: string;
  status: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  sessions: Session[];
}

export interface WorkspaceResponse {
  workspaces: Project[];
}

const WORKSPACE_QUERY_KEY = ['workspaces'] as const;

export function useWorkspaceQuery(client?: ApiClient) {
  const apiClient = client || new ApiClient();

  const query = useQuery({
    queryKey: WORKSPACE_QUERY_KEY,
    queryFn: async () => {
      const response = await apiClient.get<WorkspaceResponse>('/api/v1/workspaces');
      return response;
    },
    enabled: false, // Manually refetch on SSE events
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  return {
    ...query,
    refetch: () => query.refetch(),
  };
}

export { WORKSPACE_QUERY_KEY };
