// @vitest-environment jsdom

import type { ReleasesView } from '@kromatv/client/releases';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueries } from '#web/shared/lib/queries';
import { createWebTestClient } from '#web/shared/lib/web-runtime.fixture';

const api = vi.hoisted(() => ({ markSeen: vi.fn(), list: { queryKey: ['releases'] } }));

vi.mock('#web/shared/lib/api', () => ({
  kromaClient: () => ({
    releases: { markSeen: api.markSeen },
    query: { releases: { list: () => api.list } },
  }),
}));
vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const { QueryClient } =
    await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  const queryCache = new QueryClient();
  const runtime = createWebTestRuntime(
    {
      releases: { markSeen: api.markSeen },
      query: { releases: { list: () => api.list } },
    },
    () => queryCache,
  );
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

import { useMarkReleaseSeen } from './use-mark-release-seen';

const { userQueries } = createQueries(
  createWebTestClient({ query: { releases: { list: () => api.list } } }),
);

const RELEASES = userQueries.releases().queryKey;

const VIEW: ReleasesView = { current: '0.1.39', unseen: '0.1.39', releases: [] };

function render(unseen: string | null): QueryClient {
  const queries = new QueryClient();
  queries.setQueryData(RELEASES, VIEW);
  renderHook(() => useMarkReleaseSeen(unseen), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queries}>{children}</QueryClientProvider>
    ),
  });
  return queries;
}

beforeEach(() => {
  api.markSeen.mockReset().mockResolvedValue(undefined);
});

describe('useMarkReleaseSeen', () => {
  it('marks the unseen release seen, then reads the releases again', async () => {
    const queries = render('0.1.39');

    await waitFor(() => expect(queries.getQueryState(RELEASES)?.isInvalidated).toBe(true));

    expect(api.markSeen).toHaveBeenCalledWith('0.1.39');
  });

  it('asks nothing once every release was seen', () => {
    render(null);

    expect(api.markSeen).not.toHaveBeenCalled();
  });
});
