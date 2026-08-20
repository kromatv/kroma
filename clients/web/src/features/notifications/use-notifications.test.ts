// @vitest-environment jsdom
import type { NotificationsView } from '@kroma/core';
import { act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  expectBadge,
  H,
  installHarness,
  type Listener,
  listNotifications,
  markNotificationsRead,
  markNotificationsUnread,
  push,
  render,
  stream,
  view,
} from '#web/features/notifications/use-notifications.fixture';

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

vi.mock('#web/shared/lib/api', () => ({
  apiBase: () => 'http://server.test',
  kromaClient: () => ({ listNotifications, markNotificationsRead, markNotificationsUnread }),
  toMovieView: (v: unknown) => v,
  toShowView: (v: unknown) => v,
}));

const { useNotificationStream, usePanelState, useReadState, useUnreadCount } = await import(
  '#web/features/notifications/use-notifications'
);
const { userQueries } = await import('#web/shared/lib/queries');

installHarness();

describe('the unread badge', () => {
  it('reads zero before the inbox has ever loaded', () => {
    const { result } = render(() => useUnreadCount());
    expect(result.current).toBe(0);
  });

  it('reports whatever the inbox fetch returns', async () => {
    listNotifications.mockResolvedValue(view(7));
    const { result } = render(() => useUnreadCount());
    await expectBadge(() => result.current, 7);
  });

  it('follows the inbox rather than latching the first count it saw', async () => {
    listNotifications.mockResolvedValue(view(7));
    const { result } = render(() => useUnreadCount());
    await expectBadge(() => result.current, 7);

    listNotifications.mockResolvedValue(view(2));
    await act(async () => {
      await H.client.invalidateQueries({ queryKey: userQueries.notifications().queryKey });
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
    listNotifications.mockReturnValue(new Promise(() => {}));
    H.client.setQueryData(userQueries.notifications().queryKey, view(1));
    const { result } = render(() => {
      useNotificationStream();
      return useUnreadCount();
    });
    await expectBadge(() => result.current, 1);

    await push({ type: 'notification.created', unread: 4 });
    await expectBadge(() => result.current, 4);
  });

  it('reacts to a read the same way it reacts to a new one', async () => {
    listNotifications.mockReturnValue(new Promise(() => {}));
    H.client.setQueryData(userQueries.notifications().queryKey, view(5));
    const { result } = render(() => {
      useNotificationStream();
      return useUnreadCount();
    });
    await expectBadge(() => result.current, 5);

    await push({ type: 'notification.read', unread: 2 });
    await expectBadge(() => result.current, 2);
  });

  it('ignores every other kind of server event', async () => {
    listNotifications.mockReturnValue(new Promise(() => {}));
    const key = userQueries.notifications().queryKey;
    H.client.setQueryData(key, view(6));
    const { result } = render(() => {
      useNotificationStream();
      return useUnreadCount();
    });
    await expectBadge(() => result.current, 6);
    const before = H.client.getQueryData(key);

    await push({ type: 'scan.finished', unread: 99 });
    await expectBadge(() => result.current, 6);
    expect(H.client.getQueryData(key)).toBe(before);
  });

  it('does not invent an inbox for a user who has never loaded one', async () => {
    render(() => useNotificationStream());
    await push({ type: 'notification.created', unread: 4 });
    expect(H.client.getQueryData(userQueries.notifications().queryKey)).toBeUndefined();
  });

  it('closes the stream when the bell unmounts', () => {
    const { unmount } = render(() => useNotificationStream());
    const s = stream();
    expect(s.closed).toBe(false);
    unmount();
    expect(s.closed).toBe(true);
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
    const key = userQueries.notifications().queryKey;
    listNotifications.mockReturnValue(new Promise(() => {}));
    const { result } = render(() => useReadState());

    act(() => result.current.markRead(['a']));

    expect(H.client.getQueryData<NotificationsView>(key)).toBeUndefined();
    expect(markNotificationsRead).toHaveBeenCalledWith(['a']);
  });
});
