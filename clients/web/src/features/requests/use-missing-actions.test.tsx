// @vitest-environment jsdom
import type { CalendarEntry } from '@kromatv/client/requests';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupByTitle, type MissingGroup } from '#web/features/requests/missing-model';

const client = {
  monitoring: { search: vi.fn(), monitor: vi.fn(), setEpisodes: vi.fn() },
  requests: { autoSearch: vi.fn(), create: vi.fn() },
};
let permissions: string[] = [];

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({ user: { permissions }, client }),
}));
vi.mock('#web/shared/lib/web-runtime', () => ({
  useWebRuntime: () => ({
    queries: { userQueries: { missing: () => ({ queryKey: ['missing'] }) } },
  }),
}));

const { useMissingActions } = await import('#web/features/requests/use-missing-actions');

let queries: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queries}>{children}</QueryClientProvider>;
}

function entry(over: Partial<CalendarEntry>): CalendarEntry {
  return {
    requestId: null,
    kind: 'show',
    tmdbId: 10,
    title: 'Show',
    year: 2020,
    posterUrl: null,
    season: 1,
    episode: 1,
    status: 'missing',
    ...over,
  } as CalendarEntry;
}

const GAP = entry({});
const MONITORED = entry({ tmdbId: 20, status: 'wanted' });
const REQUESTED = entry({ tmdbId: 30, requestId: 'r1' as CalendarEntry['requestId'] });

function pick(groups: MissingGroup[], at: number): MissingGroup {
  const group = groups[at];
  if (!group) throw new Error(`no group at ${at}`);
  return group;
}

function mount(entries: CalendarEntry[]) {
  const groups = groupByTitle(entries);
  const hook = renderHook(() => useMissingActions(groups), { wrapper });
  return { groups, ...hook };
}

beforeEach(() => {
  queries = new QueryClient();
  permissions = [];
  client.monitoring.search.mockReset().mockResolvedValue({ started: true });
  client.monitoring.monitor.mockReset().mockResolvedValue(undefined);
  client.monitoring.setEpisodes.mockReset().mockResolvedValue(undefined);
  client.requests.autoSearch.mockReset().mockResolvedValue(undefined);
  client.requests.create.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the action a missing group offers', () => {
  it('follows an unfollowed group for a library manager', () => {
    permissions = ['library.manage'];
    const { result, groups } = mount([GAP]);

    expect(result.current.canMonitor).toBe(true);
    expect(result.current.actionOf(pick(groups, 0))).toBe('follow');
  });

  it('requests an unfollowed group for anyone else', () => {
    const { result, groups } = mount([GAP]);

    expect(result.current.actionOf(pick(groups, 0))).toBe('request');
  });

  it('searches a followed group for a library manager', () => {
    permissions = ['library.manage'];
    const { result, groups } = mount([MONITORED]);

    expect(result.current.actionOf(pick(groups, 0))).toBe('search');
  });

  it('searches a requested group for a request manager', () => {
    permissions = ['requests.manage'];
    const { result, groups } = mount([REQUESTED]);

    expect(result.current.actionOf(pick(groups, 0))).toBe('search');
  });

  it('offers nothing on a followed group the user cannot act on', () => {
    const { result, groups } = mount([MONITORED, REQUESTED]);

    expect(groups.map(result.current.actionOf)).toEqual(['none', 'none']);
  });
});

describe('running a group', () => {
  it('follows the title and its episodes through monitoring', async () => {
    permissions = ['library.manage'];
    const { result, groups } = mount([GAP]);

    act(() => result.current.run(pick(groups, 0), pick(groups, 0).items));

    await waitFor(() => expect(result.current.startedKeys.size).toBe(1));
    expect(client.monitoring.monitor).toHaveBeenCalledWith('show', 10, { preset: 'none' });
    expect(client.monitoring.setEpisodes).toHaveBeenCalledWith(10, {
      episodes: [{ season: 1, episode: 1, monitored: true }],
    });
  });

  it('follows a film without setting episodes', async () => {
    permissions = ['library.manage'];
    const film = entry({ kind: 'movie', season: null, episode: null });
    const { result, groups } = mount([film]);

    act(() => result.current.run(pick(groups, 0), pick(groups, 0).items));

    await waitFor(() => expect(result.current.startedKeys.size).toBe(1));
    expect(client.monitoring.setEpisodes).not.toHaveBeenCalled();
  });

  it('creates a request for a user who cannot monitor', async () => {
    const { result, groups } = mount([GAP]);

    act(() => result.current.run(pick(groups, 0), pick(groups, 0).items));

    await waitFor(() => expect(result.current.startedKeys.size).toBe(1));
    expect(client.requests.create).toHaveBeenCalledWith({
      kind: 'show',
      tmdbId: 10,
      seasons: null,
      episodes: [{ season: 1, episode: 1 }],
    });
  });

  it('queues a search for a library manager and marks the rows started', async () => {
    permissions = ['library.manage'];
    const { result, groups } = mount([MONITORED]);

    act(() => result.current.toggleRow(`tmdb:20:1:1`));
    act(() => result.current.run(pick(groups, 0), pick(groups, 0).items));

    await waitFor(() => expect(result.current.startedKeys.size).toBe(1));
    expect(client.monitoring.search).toHaveBeenCalledWith('show', 20, [{ season: 1, episode: 1 }]);
    expect(result.current.selected.size).toBe(0);
    expect(result.current.busyKeys.size).toBe(0);
  });

  it('marks nothing started when the server started nothing', async () => {
    permissions = ['library.manage'];
    client.monitoring.search.mockResolvedValue({ started: false });
    const { result, groups } = mount([MONITORED]);

    act(() => result.current.run(pick(groups, 0), pick(groups, 0).items));

    await waitFor(() => expect(result.current.busyKeys.size).toBe(0));
    expect(result.current.startedKeys.size).toBe(0);
  });

  it('auto-searches a request for a request manager', async () => {
    permissions = ['requests.manage'];
    const { result, groups } = mount([REQUESTED]);

    act(() => result.current.run(pick(groups, 0), pick(groups, 0).items));

    await waitFor(() => expect(result.current.startedKeys.size).toBe(1));
    expect(client.requests.autoSearch).toHaveBeenCalledWith('r1');
  });

  it('does nothing for a group with no action', async () => {
    const { result, groups } = mount([MONITORED]);

    act(() => result.current.run(pick(groups, 0), pick(groups, 0).items));

    await waitFor(() => expect(result.current.busyKeys.size).toBe(0));
    expect(result.current.startedKeys.size).toBe(0);
  });

  it('swallows a failed call and clears the busy mark', async () => {
    client.requests.create.mockRejectedValue(new Error('boom'));
    const { result, groups } = mount([GAP]);

    act(() => result.current.run(pick(groups, 0), pick(groups, 0).items));

    await waitFor(() => expect(client.requests.create).toHaveBeenCalled());
    await waitFor(() => expect(result.current.busyKeys.size).toBe(0));
    expect(result.current.startedKeys.size).toBe(0);
  });

  it('drops the started mark after thirty seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const { result, groups } = mount([GAP]);

    await act(async () => {
      result.current.run(pick(groups, 0), pick(groups, 0).items);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.startedKeys.size).toBe(1);

    act(() => vi.advanceTimersByTime(30_000));

    expect(result.current.startedKeys.size).toBe(0);
  });
});

describe('the selection', () => {
  it('toggles a row on and off', () => {
    const { result } = mount([GAP]);

    act(() => result.current.toggleRow('k'));
    expect(result.current.selectedCount).toBe(1);

    act(() => result.current.toggleRow('k'));
    expect(result.current.selectedCount).toBe(0);
  });

  it('picks and drops a whole group', () => {
    const { result, groups } = mount([GAP, entry({ episode: 2 })]);

    act(() => result.current.toggleGroup(pick(groups, 0), true));
    expect(result.current.selectedCount).toBe(2);

    act(() => result.current.toggleGroup(pick(groups, 0), false));
    expect(result.current.selectedCount).toBe(0);
  });

  it('clears everything picked', () => {
    const { result, groups } = mount([GAP]);
    act(() => result.current.toggleGroup(pick(groups, 0), true));

    act(() => result.current.clearSelection());

    expect(result.current.selected.size).toBe(0);
  });

  it('reports the shared action of the picked groups, or mixed', () => {
    permissions = ['library.manage'];
    const { result, groups } = mount([GAP, MONITORED]);

    expect(result.current.selectedAction).toBe('mixed');

    act(() => result.current.toggleGroup(pick(groups, 0), true));
    expect(result.current.selectedAction).toBe('follow');

    act(() => result.current.toggleGroup(pick(groups, 1), true));
    expect(result.current.selectedAction).toBe('mixed');
  });

  it('runs every group with something picked', async () => {
    permissions = ['library.manage'];
    const { result, groups } = mount([GAP, MONITORED, entry({ tmdbId: 40 })]);
    act(() => result.current.toggleGroup(pick(groups, 0), true));
    act(() => result.current.toggleGroup(pick(groups, 1), true));

    act(() => result.current.runSelected());

    await waitFor(() => expect(result.current.startedKeys.size).toBe(2));
    expect(client.monitoring.monitor).toHaveBeenCalledTimes(1);
    expect(client.monitoring.search).toHaveBeenCalledTimes(1);
  });
});
