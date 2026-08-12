// @vitest-environment jsdom
//
// The bell is driven by two halves that never call each other: a stream writes
// the react-query cache, and a badge reads it. Nothing ties them to the same
// cache key, so these tests run both against the REAL `userQueries.notifications()`.
import type { NotificationsView } from '@kroma/core';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (e: { type: string; unread: number }) => void;

const H = vi.hoisted(() => ({
  streams: [] as { url: string; emit: Listener; closed: boolean }[],
}));

vi.mock('@kroma/core', () => {
  class KromaEvents {
    private readonly self: { url: string; emit: Listener; closed: boolean };
    constructor(url: string, opts: { onEvent: Listener }) {
      this.self = { url, emit: opts.onEvent, closed: false };
    }
    connect() {
      H.streams.push(this.self);
    }
    close() {
      this.self.closed = true;
    }
  }
  return { KromaEvents };
});

// The transport only. `queries.ts` itself is REAL below, so the cache key under
// test is the one production uses.
const listNotifications = vi.fn();
const markNotificationsRead = vi.fn();
const markNotificationsUnread = vi.fn();
vi.mock('#web/shared/lib/api', () => ({
  apiBase: () => 'http://server.test',
  kromaClient: () => ({ listNotifications, markNotificationsRead, markNotificationsUnread }),
  toMovieView: (v: unknown) => v,
  toShowView: (v: unknown) => v,
}));

const {
  applyRead,
  NO_STICKY,
  unreadView,
  useNotificationStream,
  usePanelState,
  useReadState,
  useUnreadCount,
} = await import('#web/features/notifications/use-notifications');
const { userQueries } = await import('#web/shared/lib/queries');

let client: QueryClient;

// Retries off so a rejected fetch settles.
function render<T>(hook: () => T) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(hook, { wrapper });
}

function view(unread: number): NotificationsView {
  return { notifications: [], unread } as unknown as NotificationsView;
}

// A fixed number of turns is not enough: react-query's batched observer
// notifications settle on their own schedule, slower under an instrumented CI run.
async function expectBadge(read: () => number, n: number) {
  await waitFor(() => expect(read()).toBe(n));
}

// The write has to happen INSIDE the `act`: react-query batches its observer
// notifications, so an `act` that returns first leaves the badge unmoved.
async function push(e: { type: string; unread: number }) {
  await act(async () => {
    stream().emit(e);
  });
}

function stream() {
  const s = H.streams.at(-1);
  if (!s) throw new Error('no stream was connected');
  return s;
}

function row(id: string, read: boolean): NotificationsView['notifications'][number] {
  return { id, read } as NotificationsView['notifications'][number];
}

function inbox(...rows: NotificationsView['notifications']): NotificationsView {
  return { notifications: rows, unread: rows.filter((r) => !r.read).length };
}

beforeEach(() => {
  H.streams.length = 0;
  listNotifications.mockReset().mockResolvedValue(view(0));
  markNotificationsRead.mockReset().mockResolvedValue({ unread: 0 });
  markNotificationsUnread.mockReset().mockResolvedValue({ unread: 1 });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  cleanup();
  client.clear();
});

describe('the unread badge', () => {
  it('reads zero before the inbox has ever loaded', () => {
    // The bell renders on every page. `undefined` here would put NaN in the
    // badge on the first paint of every cold load.
    const { result } = render(() => useUnreadCount());
    expect(result.current).toBe(0);
  });

  it('reports whatever the inbox fetch returns', async () => {
    listNotifications.mockResolvedValue(view(7));
    const { result } = render(() => useUnreadCount());
    await expectBadge(() => result.current, 7);
  });

  it('follows the inbox rather than latching the first count it saw', async () => {
    // Opening the panel marks things read, which refetches. A badge that kept
    // its first value would sit on a stale number until a full reload.
    listNotifications.mockResolvedValue(view(7));
    const { result } = render(() => useUnreadCount());
    await expectBadge(() => result.current, 7);

    listNotifications.mockResolvedValue(view(2));
    await act(async () => {
      await client.invalidateQueries({ queryKey: userQueries.notifications().queryKey });
    });
    await expectBadge(() => result.current, 2);
  });
});

describe('the event stream', () => {
  it('connects to the server the client is signed into', () => {
    render(() => useNotificationStream());
    expect(stream().url).toBe('http://server.test');
  });

  it('moves the badge from the event itself, without waiting for a refetch', async () => {
    // The refetch below NEVER resolves, so the only thing that can move this
    // badge is the count carried on the event. That is the point: the panel is
    // usually closed and the inbox response may be slow or never arrive.
    listNotifications.mockReturnValue(new Promise(() => {}));
    client.setQueryData(userQueries.notifications().queryKey, view(1));
    const { result } = render(() => {
      useNotificationStream();
      return useUnreadCount();
    });
    await expectBadge(() => result.current, 1);

    await push({ type: 'notification.created', unread: 4 });
    await expectBadge(() => result.current, 4);
  });

  it('reacts to a read the same way it reacts to a new one', async () => {
    // Marking one read on another device must take the badge DOWN here.
    listNotifications.mockReturnValue(new Promise(() => {}));
    client.setQueryData(userQueries.notifications().queryKey, view(5));
    const { result } = render(() => {
      useNotificationStream();
      return useUnreadCount();
    });
    await expectBadge(() => result.current, 5);

    await push({ type: 'notification.read', unread: 2 });
    await expectBadge(() => result.current, 2);
  });

  it('ignores every other kind of server event', async () => {
    // The stream carries the whole server's events - scans, playback, library
    // updates. Only two of them concern the bell, and the cache entry must come
    // out of the others byte-identical (not merely equal).
    listNotifications.mockReturnValue(new Promise(() => {}));
    const key = userQueries.notifications().queryKey;
    client.setQueryData(key, view(6));
    const { result } = render(() => {
      useNotificationStream();
      return useUnreadCount();
    });
    await expectBadge(() => result.current, 6);
    const before = client.getQueryData(key);

    await push({ type: 'scan.finished', unread: 99 });
    await expectBadge(() => result.current, 6);
    expect(client.getQueryData(key)).toBe(before);
  });

  it('does not invent an inbox for a user who has never loaded one', async () => {
    // Writing `{ unread }` into an empty cache would leave a view with no
    // notifications array, which the panel renders by crashing.
    render(() => useNotificationStream());
    await push({ type: 'notification.created', unread: 4 });
    expect(client.getQueryData(userQueries.notifications().queryKey)).toBeUndefined();
  });

  it('closes the stream when the bell unmounts', () => {
    // One socket per mount, and the shell remounts on sign-out; leaking them
    // leaves the browser reconnecting to a server it is no longer signed into.
    const { unmount } = render(() => useNotificationStream());
    const s = stream();
    expect(s.closed).toBe(false);
    unmount();
    expect(s.closed).toBe(true);
  });
});

describe('moving one row between read and unread', () => {
  it('patches the rows and the badge by however many actually changed side', () => {
    const before = inbox(row('a', false), row('b', true), row('c', false));
    const after = applyRead(before, ['a', 'b'], true);

    expect(after.notifications.map((n) => n.read)).toEqual([true, true, false]);
    expect(after.unread).toBe(1);
  });

  it('hands back the very same view when nothing moved', () => {
    // Not merely an equal one: react-query would otherwise re-render every
    // observer of the inbox for a press that changed nothing.
    const before = inbox(row('a', true));
    expect(applyRead(before, ['a'], true)).toBe(before);
    expect(applyRead(before, ['nobody'], false)).toBe(before);
  });

  it('puts a row back and takes the badge up with it', () => {
    const after = applyRead(inbox(row('a', true), row('b', true)), ['a'], false);
    expect(after.notifications[0]?.read).toBe(false);
    expect(after.unread).toBe(1);
  });

  it('answers in the frame it was pressed, then settles from the server', async () => {
    const key = userQueries.notifications().queryKey;
    listNotifications.mockReturnValue(new Promise(() => {}));
    client.setQueryData(key, inbox(row('a', false), row('b', false)));
    const { result } = render(() => useReadState());

    act(() => result.current.markRead(['a']));
    expect(client.getQueryData<NotificationsView>(key)?.unread).toBe(1);
    expect(markNotificationsRead).toHaveBeenCalledWith(['a']);

    act(() => result.current.markUnread(['a']));
    expect(client.getQueryData<NotificationsView>(key)?.unread).toBe(2);
    expect(markNotificationsUnread).toHaveBeenCalledWith(['a']);
  });

  it('survives the refetch that follows, in both directions', async () => {
    // The failure this pins is the one that looks exactly like a dead control:
    // the dot flips, the inbox is refetched, and the row comes back the way it
    // was. So the fake here is STATEFUL, and every assertion is made after the
    // refetch has settled rather than on the optimistic patch.
    const server = [row('a', false)];
    listNotifications.mockImplementation(async () => ({
      notifications: server.map((n) => ({ ...n })),
      unread: server.filter((n) => !n.read).length,
    }));
    const flip = (read: boolean) => async (ids: string[]) => {
      for (const n of server) if (ids.includes(n.id)) n.read = read;
      return { unread: server.filter((r) => !r.read).length };
    };
    markNotificationsRead.mockImplementation(flip(true));
    markNotificationsUnread.mockImplementation(flip(false));

    const { result } = render(() => ({
      ...useReadState(),
      inbox: useQuery(userQueries.notifications()).data,
    }));
    await waitFor(() => expect(result.current.inbox?.notifications[0]?.read).toBe(false));

    await act(async () => result.current.markRead(['a']));
    await waitFor(() => expect(result.current.inbox?.notifications[0]?.read).toBe(true));
    expect(result.current.inbox?.unread).toBe(0);

    await act(async () => result.current.markUnread(['a']));
    await waitFor(() => expect(result.current.inbox?.notifications[0]?.read).toBe(false));
    expect(result.current.inbox?.unread).toBe(1);
  });

  it('puts a rejected write back at once rather than leaving the dot wrong', async () => {
    const key = userQueries.notifications().queryKey;
    listNotifications.mockReturnValue(new Promise(() => {}));
    markNotificationsUnread.mockRejectedValue(new Error('no such route'));
    client.setQueryData(key, inbox(row('a', true)));
    const { result } = render(() => useReadState());

    await act(async () => result.current.markUnread(['a']));
    await waitFor(() =>
      expect(client.getQueryData<NotificationsView>(key)?.notifications[0]?.read).toBe(true),
    );
    expect(client.getQueryData<NotificationsView>(key)?.unread).toBe(0);
  });

  it('does not go to the server for an empty run', () => {
    const { result } = render(() => useReadState());
    act(() => result.current.markRead([]));
    act(() => result.current.markUnread([]));
    expect(markNotificationsRead).not.toHaveBeenCalled();
    expect(markNotificationsUnread).not.toHaveBeenCalled();
  });
});

describe('what the unread filter shows', () => {
  it('keeps only the rows still unread', () => {
    const view = unreadView([row('a', false), row('b', true), row('c', false)], NO_STICKY);
    expect(view.items.map((n) => n.id)).toEqual(['a', 'c']);
  });

  it('holds on to a row the reader has just marked read', () => {
    // The whole point of the toggle is that it can be undone; a row that left
    // the list on the press would take its own undo control with it.
    const first = unreadView([row('a', false), row('b', false)], NO_STICKY);
    const second = unreadView([row('a', true), row('b', false)], first.sticky);
    expect(second.items.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('forgets a row the server has dropped rather than remembering it forever', () => {
    const first = unreadView([row('a', false)], NO_STICKY);
    const second = unreadView([row('b', false)], first.sticky);
    expect([...second.sticky]).toEqual(['b']);
  });
});

describe('the panel latch', () => {
  it('starts closed and unopened, so the inbox is never fetched to draw a bell', () => {
    const { result } = render(() => usePanelState());
    expect(result.current.open).toBe(false);
    expect(result.current.everOpened).toBe(false);
  });

  it('flips both on the click that opens it', () => {
    const { result } = render(() => usePanelState());
    act(() => result.current.setOpen(true));
    expect(result.current.open).toBe(true);
    expect(result.current.everOpened).toBe(true);
  });

  it('stays latched once closed again', () => {
    // The latch keeps the inbox query mounted; if it reset on close, every
    // reopen would refetch and the panel would flash its skeleton each time.
    const { result } = render(() => usePanelState());
    act(() => result.current.setOpen(true));
    act(() => result.current.setOpen(false));
    expect(result.current.open).toBe(false);
    expect(result.current.everOpened).toBe(true);
  });

  it('closing without ever opening leaves the latch alone', () => {
    const { result } = render(() => usePanelState());
    act(() => result.current.setOpen(false));
    expect(result.current.everOpened).toBe(false);
  });
});

describe('a press that lands before the inbox does', () => {
  it('still sends the write, and leaves the empty cache empty', () => {
    // The bell can be pressed while the first fetch is still in flight, so the
    // optimistic patch has nothing to patch. It must not write a half view.
    const key = userQueries.notifications().queryKey;
    listNotifications.mockReturnValue(new Promise(() => {}));
    const { result } = render(() => useReadState());

    act(() => result.current.markRead(['a']));

    expect(client.getQueryData<NotificationsView>(key)).toBeUndefined();
    expect(markNotificationsRead).toHaveBeenCalledWith(['a']);
  });
});
