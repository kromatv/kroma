// @vitest-environment jsdom
//
// Keeping an open catalogue fiche fresh while the server enriches it.
//
// A scan, a nightly pass, or an operator correcting a TMDB match all rewrite a
// title's poster, name and synopsis minutes after the page was opened. The
// server broadcasts that; this hook listens for the ONE id on screen and
// invalidates its cache entry so the new artwork swaps itself in.
//
// Three things make it safe to leave running on every fiche, and all three are
// invisible from the call site. It reacts only to its own id and its own event
// type - a library-wide enrich pass emits thousands of updates, and a hook that
// invalidated on all of them would refetch the open page once per unrelated
// title. It coalesces a burst into ONE refetch, because a single title's enrich
// emits several updates in a row. And it closes the stream on unmount: this
// mounts on every fiche a user opens, so a leaked connection is a connection per
// title browsed, held for the session.

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Handlers {
  onEvent: (e: { type: string; id: string }) => void;
}

/** The event stream, captured instead of opened. */
const streams: Array<{
  base: string;
  handlers: Handlers;
  connected: number;
  closed: number;
}> = [];

const KromaEvents = vi.hoisted(() =>
  vi.fn(function Events(this: Record<string, unknown>, base: string, handlers: Handlers) {
    const stream = { base, handlers, connected: 0, closed: 0 };
    streams.push(stream);
    this.connect = () => {
      stream.connected += 1;
    };
    this.close = () => {
      stream.closed += 1;
    };
  }),
);

vi.mock('@kroma/core', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  KromaEvents,
}));
vi.mock('#web/shared/lib/api', () => ({ apiBase: () => 'https://kroma.test' }));

const invalidateQueries = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }));

import { useCatalogLiveRefresh } from './use-live-refresh';

const COALESCE_MS = 600;

/** The stream this render opened. */
function stream() {
  const last = streams.at(-1);
  if (!last) throw new Error('no event stream was opened');
  return last;
}

/** Deliver a server event. */
const emit = (type: string, id: string) => stream().handlers.onEvent({ type, id });

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
    // This mounts on every fiche a user opens; a leak here is one held
    // connection per title browsed.
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
    // By key PREFIX, so a show's bundle under ['show', id, 'bundle'] refreshes
    // with it.
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['item', 'itm_1'] });
  });

  it('ignores an update for a DIFFERENT title', () => {
    renderHook(() => useCatalogLiveRefresh('item', 'itm_1'));
    // A library-wide enrich pass emits thousands of these.
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
    // A show fiche must not wake on an episode's item.updated.
    emit('item.updated', 'shw_1');
    vi.advanceTimersByTime(COALESCE_MS * 2);
    expect(invalidateQueries).not.toHaveBeenCalled();

    emit('show.updated', 'shw_1');
    vi.advanceTimersByTime(COALESCE_MS);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['show', 'shw_1'] });
  });
});

describe('coalescing a burst', () => {
  it('refetches ONCE for a run of updates', () => {
    renderHook(() => useCatalogLiveRefresh('item', 'itm_1'));
    // One title's enrich emits several updates in a row - artwork, then
    // metadata, then the match.
    for (let i = 0; i < 8; i++) emit('item.updated', 'itm_1');
    vi.advanceTimersByTime(COALESCE_MS);
    expect(invalidateQueries).toHaveBeenCalledOnce();
  });

  it('waits before refetching, rather than firing on the first event', () => {
    renderHook(() => useCatalogLiveRefresh('item', 'itm_1'));
    emit('item.updated', 'itm_1');
    vi.advanceTimersByTime(COALESCE_MS - 1);
    // Refetching immediately reads the half-enriched record and shows it.
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
    // A later pass over the same title still has to reach the open page.
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
  });

  it('does not refetch after the page is gone', () => {
    const { unmount } = renderHook(() => useCatalogLiveRefresh('item', 'itm_1'));
    emit('item.updated', 'itm_1');
    unmount();
    vi.advanceTimersByTime(COALESCE_MS * 2);
    // The pending timer is cleared with the stream; firing would refetch a query
    // nothing is watching.
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
