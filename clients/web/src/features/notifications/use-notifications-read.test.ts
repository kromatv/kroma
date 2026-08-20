// @vitest-environment jsdom
import type { NotificationsView } from '@kroma/core';
import { useQuery } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  H,
  inbox,
  installHarness,
  type Listener,
  listNotifications,
  markNotificationsRead,
  markNotificationsUnread,
  render,
  row,
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

const { applyRead, NO_STICKY, unreadView, useReadState } = await import(
  '#web/features/notifications/use-notifications'
);
const { userQueries } = await import('#web/shared/lib/queries');

installHarness();

describe('moving one row between read and unread', () => {
  it('patches the rows and the badge by however many actually changed side', () => {
    const before = inbox(row('a', false), row('b', true), row('c', false));
    const after = applyRead(before, ['a', 'b'], true);

    expect(after.notifications.map((n) => n.read)).toEqual([true, true, false]);
    expect(after.unread).toBe(1);
  });

  it('hands back the very same view when nothing moved', () => {
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
    H.client.setQueryData(key, inbox(row('a', false), row('b', false)));
    const { result } = render(() => useReadState());

    act(() => result.current.markRead(['a']));
    expect(H.client.getQueryData<NotificationsView>(key)?.unread).toBe(1);
    expect(markNotificationsRead).toHaveBeenCalledWith(['a']);

    act(() => result.current.markUnread(['a']));
    expect(H.client.getQueryData<NotificationsView>(key)?.unread).toBe(2);
    expect(markNotificationsUnread).toHaveBeenCalledWith(['a']);
  });

  it('survives the refetch that follows, in both directions', async () => {
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
    H.client.setQueryData(key, inbox(row('a', true)));
    const { result } = render(() => useReadState());

    await act(async () => result.current.markUnread(['a']));
    await waitFor(() =>
      expect(H.client.getQueryData<NotificationsView>(key)?.notifications[0]?.read).toBe(true),
    );
    expect(H.client.getQueryData<NotificationsView>(key)?.unread).toBe(0);
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
