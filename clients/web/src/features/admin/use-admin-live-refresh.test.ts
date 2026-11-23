// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Handlers {
  onEvent: (e: { type: string }) => void;
}

const streams: Array<{ handlers: Handlers; connected: number; closed: number }> = [];

const KromaEvents = vi.hoisted(() =>
  vi.fn(function Events(this: Record<string, unknown>, _base: string, handlers: Handlers) {
    const opened = { handlers, connected: 0, closed: 0 };
    streams.push(opened);
    this.connect = () => {
      opened.connected += 1;
    };
    this.close = () => {
      opened.closed += 1;
    };
  }),
);

vi.mock('@kromatv/client/events', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  KromaEvents,
}));
vi.mock('#web/shared/lib/api', () => ({ apiBase: () => 'https://kroma.test' }));

const eventClient = vi.hoisted(() => ({ sessionToken: 'token', refreshSession: async () => true }));
vi.mock('#web/shared/lib/web-runtime', () => ({ useKromaClient: () => eventClient }));

const invalidateQueries = vi.hoisted(() => vi.fn(async () => undefined));
const queryClient = vi.hoisted(() => ({ invalidateQueries }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => queryClient }));

import { useAdminLiveRefresh } from './use-admin-live-refresh.hook';

const WINDOW_MS = 1500;

function send(type: string) {
  const last = streams.at(-1);
  if (!last) {
    throw new Error('no event stream was opened');
  }
  last.handlers.onEvent({ type });
}

describe('useAdminLiveRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    streams.length = 0;
    invalidateQueries.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refetches the admin queries once for a burst of changes inside one window', () => {
    renderHook(() => useAdminLiveRefresh());

    send('item.updated');
    send('job.finished');
    send('settings.updated');
    vi.advanceTimersByTime(WINDOW_MS);

    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['admin'] });
  });

  it.each([
    'pipeline.stats',
    'downloads.stats',
    'playback.updated',
    'cast.position',
    'enrich.progress',
    'probe.progress',
    'job.progress',
  ])('refetches nothing for a %s frame', (type) => {
    renderHook(() => useAdminLiveRefresh());

    send(type);
    vi.advanceTimersByTime(WINDOW_MS);

    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('refetches again for a change that arrives after the window closed', () => {
    renderHook(() => useAdminLiveRefresh());

    send('playback.started');
    vi.advanceTimersByTime(WINDOW_MS);
    send('playback.stopped');
    vi.advanceTimersByTime(WINDOW_MS);

    expect(invalidateQueries).toHaveBeenCalledTimes(2);
  });

  it('closes the stream and drops a pending refetch on unmount', () => {
    const { unmount } = renderHook(() => useAdminLiveRefresh());

    send('library.updated');
    unmount();
    vi.advanceTimersByTime(WINDOW_MS);

    expect(streams[0]).toMatchObject({ connected: 1, closed: 1 });
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
