import type { NotificationsView } from '@kroma/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, vi } from 'vitest';

export type Listener = (e: { type: string; unread: number }) => void;

const freshClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

/** The event streams the mocked `KromaEvents` records (newest last), and the
 *  query client the current test is rendering against. */
export const H = {
  streams: [] as { url: string; emit: Listener; closed: boolean }[],
  client: freshClient(),
};

export const listNotifications = vi.fn();
export const markNotificationsRead = vi.fn();
export const markNotificationsUnread = vi.fn();

export function render<T>(hook: () => T) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: H.client }, children);
  return renderHook(hook, { wrapper });
}

export function view(unread: number): NotificationsView {
  return { notifications: [], unread } as unknown as NotificationsView;
}

// A fixed number of turns is not enough: react-query's batched observer
// notifications settle on their own schedule, slower under an instrumented CI run.
export async function expectBadge(read: () => number, n: number) {
  await waitFor(() => expect(read()).toBe(n));
}

// The write has to happen INSIDE the `act`: react-query batches its observer
// notifications, so an `act` that returns first leaves the badge unmoved.
export async function push(e: { type: string; unread: number }) {
  await act(async () => {
    stream().emit(e);
  });
}

export function stream() {
  const s = H.streams.at(-1);
  if (!s) throw new Error('no stream was connected');
  return s;
}

export function row(id: string, read: boolean): NotificationsView['notifications'][number] {
  return { id, read } as NotificationsView['notifications'][number];
}

export function inbox(...rows: NotificationsView['notifications']): NotificationsView {
  return { notifications: rows, unread: rows.filter((r) => !r.read).length };
}

/** Registers the per-test reset every notifications suite shares. */
export function installHarness(): void {
  beforeEach(() => {
    H.streams.length = 0;
    listNotifications.mockReset().mockResolvedValue(view(0));
    markNotificationsRead.mockReset().mockResolvedValue({ unread: 0 });
    markNotificationsUnread.mockReset().mockResolvedValue({ unread: 1 });
    H.client = freshClient();
  });

  afterEach(() => {
    cleanup();
    H.client.clear();
  });
}
