// @vitest-environment jsdom

import type { ReleasesView } from '@kromatv/client/releases';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const app = vi.hoisted(() => {
  const list = vi.fn<() => Promise<ReleasesView>>();
  return { ready: true, signedIn: true, list, client: { releases: { list } } };
});

vi.mock('#tv/app/router', () => ({
  useClient: () => app.client,
}));
vi.mock('#tv/app/providers/auth', () => ({
  useAuth: () => ({ ready: app.ready, user: app.signedIn ? { id: 'u1' } : null }),
}));

import { useReleases } from './useReleases';

const VIEW: ReleasesView = { current: '0.1.39', unseen: null, releases: [] };

const settle = () => act(() => Promise.resolve());

beforeEach(() => {
  vi.clearAllMocks();
  app.ready = true;
  app.signedIn = true;
  app.list.mockResolvedValue(VIEW);
});

describe('useReleases', () => {
  it('returns the list once the session is ready', async () => {
    const { result } = renderHook(() => useReleases());

    await waitFor(() => expect(result.current).toEqual(VIEW));
  });

  it('does not ask while the session has no reader', async () => {
    app.signedIn = false;

    renderHook(() => useReleases());
    await settle();

    expect(app.list).not.toHaveBeenCalled();
  });

  it('stays empty when the list cannot be fetched', async () => {
    app.list.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useReleases());
    await settle();

    expect(result.current).toBeNull();
  });
});
