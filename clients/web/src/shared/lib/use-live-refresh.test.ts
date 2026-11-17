// @vitest-environment jsdom

import { ItemId, ShowId } from '@kromatv/client/media';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { c } from './queries.fixture';

interface Handlers {
  onEvent: (e: { type: string; id?: string }) => void;
}

const streams: Array<{
  base: string;
  handlers: Handlers;
  connected: number;
  closed: number;
}> = [];

const KromaEvents = vi.hoisted(() =>
  vi.fn(function Events(this: Record<string, unknown>, base: string, handlers: Handlers) {
    const opened = { base, handlers, connected: 0, closed: 0 };
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
vi.mock('#web/shared/lib/api', () => ({
  apiBase: () => 'https://kroma.test',
  kromaClient: () => c,
  toMovieView: (_c: unknown, m: unknown) => m,
  toShowView: (_c: unknown, s: unknown) => s,
}));
vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const { QueryClient } =
    await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  const queryCache = new QueryClient();
  const runtime = createWebTestRuntime(c, () => queryCache);
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

const invalidateQueries = vi.hoisted(() => vi.fn(async () => undefined));
const queryClient = vi.hoisted(() => ({ invalidateQueries }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => queryClient,
  queryOptions: <T>(options: T) => options,
}));

import { createQueries } from './queries';

const { catalogQueries, userQueries } = createQueries(c);

import { useCatalogLiveRefresh, useHomeLiveRefresh } from './use-live-refresh.hook';

const COALESCE_MS = 600;
const HOME_WINDOW_MS = 2500;

const homeKeys = [
  userQueries.home().queryKey,
  catalogQueries.featured().queryKey,
  catalogQueries.moviesView().queryKey,
  catalogQueries.showsView().queryKey,
];

const homeRefreshes = (count: number) => count * homeKeys.length;

function stream() {
  const last = streams.at(-1);
  if (!last) {
    throw new Error('no event stream was opened');
  }
  return last;
}

const emit = (type: string, id?: string) => stream().handlers.onEvent({ type, id });

beforeEach(() => {
  streams.length = 0;
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the stream it opens', () => {
  it('connects to the server the app is talking to', () => {
    renderHook(() => useCatalogLiveRefresh('item', 'itm_1'));
    expect(stream().base).toBe('https://kroma.test');
    expect(stream().connected).toBe(1);
  });

  it('closes it on unmount', () => {
    const { unmount } = renderHook(() => useCatalogLiveRefresh('item', 'itm_1'));
    unmount();
    expect(stream().closed).toBe(1);
  });

  it('reopens when the page moves to another title', () => {
    const { rerender } = renderHook(({ id }) => useCatalogLiveRefresh('item', id), {
      initialProps: { id: 'itm_1' },
    });
    expect(streams).toHaveLength(1);
    rerender({ id: 'itm_2' });
    expect(streams).toHaveLength(2);
    expect(streams[0]?.closed).toBe(1);
  });
});

describe('what it reacts to', () => {
  it('refreshes on an update for the title on screen', () => {
    renderHook(() => useCatalogLiveRefresh('item', 'itm_1'));
    emit('item.updated', 'itm_1');
    vi.advanceTimersByTime(COALESCE_MS);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: catalogQueries.item(ItemId.parse('itm_1')).queryKey,
    });
  });

  it('ignores an update for a DIFFERENT title', () => {
    renderHook(() => useCatalogLiveRefresh('item', 'itm_1'));
    emit('item.updated', 'itm_999');
    vi.advanceTimersByTime(COALESCE_MS * 2);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('ignores an event of another kind for the same id', () => {
    renderHook(() => useCatalogLiveRefresh('item', 'itm_1'));
    emit('item.deleted', 'itm_1');
    emit('scan.progress', 'itm_1');
    vi.advanceTimersByTime(COALESCE_MS * 2);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('listens for the show event on a show page', () => {
    renderHook(() => useCatalogLiveRefresh('show', 'shw_1'));
    emit('item.updated', 'shw_1');
    vi.advanceTimersByTime(COALESCE_MS * 2);
    expect(invalidateQueries).not.toHaveBeenCalled();

    emit('show.updated', 'shw_1');
    vi.advanceTimersByTime(COALESCE_MS);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: catalogQueries.show(ShowId.parse('shw_1')).queryKey,
    });
  });
});

describe('coalescing a burst', () => {
  it('refetches ONCE for a run of updates', () => {
    renderHook(() => useCatalogLiveRefresh('item', 'itm_1'));
    for (let i = 0; i < 8; i++) {
      emit('item.updated', 'itm_1');
    }
    vi.advanceTimersByTime(COALESCE_MS);
    expect(invalidateQueries).toHaveBeenCalledOnce();
  });

  it('waits before refetching, rather than firing on the first event', () => {
    renderHook(() => useCatalogLiveRefresh('item', 'itm_1'));
    emit('item.updated', 'itm_1');
    vi.advanceTimersByTime(COALESCE_MS - 1);
    // Refetching immediately would read the half-enriched record.
    expect(invalidateQueries).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(invalidateQueries).toHaveBeenCalledOnce();
  });

  it('is ready for the NEXT burst once the first has landed', () => {
    renderHook(() => useCatalogLiveRefresh('item', 'itm_1'));
    emit('item.updated', 'itm_1');
    vi.advanceTimersByTime(COALESCE_MS);
    emit('item.updated', 'itm_1');
    vi.advanceTimersByTime(COALESCE_MS);
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
  });

  it('does not refetch after the page is gone', () => {
    const { unmount } = renderHook(() => useCatalogLiveRefresh('item', 'itm_1'));
    emit('item.updated', 'itm_1');
    unmount();
    vi.advanceTimersByTime(COALESCE_MS * 2);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});

describe('the stream the home opens', () => {
  it('connects once, to the server the app is talking to', () => {
    const { rerender } = renderHook(() => useHomeLiveRefresh());

    rerender();

    expect(streams).toHaveLength(1);
    expect(stream().base).toBe('https://kroma.test');
    expect(stream().connected).toBe(1);
  });

  it('closes it when the home is left', () => {
    const { unmount } = renderHook(() => useHomeLiveRefresh());

    unmount();

    expect(stream().closed).toBe(1);
  });
});

describe('what refreshes the home', () => {
  it.each([
    'scan.completed',
    'library.updated',
    'item.updated',
    'show.updated',
    'enrich.completed',
  ])('refetches everything the home reads on %s', (type) => {
    renderHook(() => useHomeLiveRefresh());

    emit(type);
    vi.advanceTimersByTime(HOME_WINDOW_MS);

    expect(invalidateQueries.mock.calls).toEqual(homeKeys.map((queryKey) => [{ queryKey }]));
  });

  it.each(['scan.started', 'enrich.progress', 'probe.progress', 'job.progress'])(
    'ignores %s, which adds no title',
    (type) => {
      renderHook(() => useHomeLiveRefresh());

      emit(type);
      vi.advanceTimersByTime(HOME_WINDOW_MS * 2);

      expect(invalidateQueries).not.toHaveBeenCalled();
    },
  );

  it('asks nothing of a server that announces no change', () => {
    renderHook(() => useHomeLiveRefresh());

    vi.advanceTimersByTime(60 * 60_000);

    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});

describe('coalescing a scan on the home', () => {
  it('refetches ONCE for every title matched inside one window', () => {
    renderHook(() => useHomeLiveRefresh());

    for (let title = 0; title < 40; title++) {
      emit('item.updated', `itm_${title}`);
    }
    vi.advanceTimersByTime(HOME_WINDOW_MS);

    expect(invalidateQueries).toHaveBeenCalledTimes(homeRefreshes(1));
  });

  it('waits for the window to close before the first refetch', () => {
    renderHook(() => useHomeLiveRefresh());

    emit('scan.completed');
    emit('library.updated');
    vi.advanceTimersByTime(HOME_WINDOW_MS - 1);

    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('refetches once per window for as long as titles keep arriving', () => {
    renderHook(() => useHomeLiveRefresh());

    for (let elapsed = 0; elapsed < 4 * HOME_WINDOW_MS; elapsed += 100) {
      emit('item.updated', 'itm_1');
      vi.advanceTimersByTime(100);
    }

    expect(invalidateQueries).toHaveBeenCalledTimes(homeRefreshes(4));
  });

  it('refetches after the event that ends the scan, then stays quiet', () => {
    renderHook(() => useHomeLiveRefresh());
    emit('item.updated', 'itm_1');
    vi.advanceTimersByTime(HOME_WINDOW_MS);

    emit('show.updated', 'shw_1');
    vi.advanceTimersByTime(HOME_WINDOW_MS - 1);
    emit('enrich.completed');
    vi.advanceTimersByTime(1);

    expect(invalidateQueries).toHaveBeenCalledTimes(homeRefreshes(2));
    vi.advanceTimersByTime(60 * 60_000);
    expect(invalidateQueries).toHaveBeenCalledTimes(homeRefreshes(2));
  });

  it('does not refetch after the home is left', () => {
    const { unmount } = renderHook(() => useHomeLiveRefresh());

    emit('scan.completed');
    unmount();
    vi.advanceTimersByTime(HOME_WINDOW_MS * 2);

    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
