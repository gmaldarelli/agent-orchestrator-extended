// packages/shared/src/hooks/useWorkspaceQuery.test.tsx
import React from 'react';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWorkspaceQuery } from './useWorkspaceQuery';
import { ApiClient } from '../api/client';
import { setPlatformBridge } from '../lib/bridge';

describe('useWorkspaceQuery', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    setPlatformBridge({
      getDaemonStatus: async () => ({ running: true, port: 3001 }),
      startDaemon: async () => {},
      stopDaemon: async () => {},
      getApiBaseUrl: () => 'http://test:3001',
      subscribeApiBaseUrl: () => () => {},
    });
  });

  it('should fetch workspace data', async () => {
    const mockWorkspaces = [
      { id: '1', name: 'Project A', sessions: [] },
      { id: '2', name: 'Project B', sessions: [] },
    ];

    globalThis.fetch = globalThis.fetch || jest.fn();
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ workspaces: mockWorkspaces }),
    });

    const { result } = renderHook(() => useWorkspaceQuery(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    // Trigger the query and wait for it to complete
    const refetchPromise = result.current.refetch();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await refetchPromise;

    expect(result.current.data).toEqual({ workspaces: mockWorkspaces });
  });
});
