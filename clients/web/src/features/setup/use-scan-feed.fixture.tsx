import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, vi } from 'vitest';

export const SERVER = 'https://kroma.test';
export const REFRESH_MS = 1200;
const NOTIFY_MS = 1;

interface Handlers {
  token: () => string | undefined;
  refresh: () => Promise<string | undefined>;
  onEvent: (event: { type: string }) => void;
}

interface Stream {
  base: string;
  handlers: Handlers;
  connected: number;
  closed: number;
}

interface Holdings {
  movies?: object[];
  shows?: object[];
}

export const streams: Stream[] = [];

/** Stands in for `KromaEvents`: it opens no socket and records each stream the
 * hook asks for in `streams`. */
export class FakeEvents {
  private readonly opened: Stream;

  constructor(base: string, handlers: Handlers) {
    this.opened = { base, handlers, connected: 0, closed: 0 };
    streams.push(this.opened);
  }

  connect() {
    this.opened.connected += 1;
  }

  close() {
    this.opened.closed += 1;
  }
}

export const server = {
  movieCards: vi.fn(),
  showCards: vi.fn(),
  refreshSession: vi.fn(),
};

export const session: { user: { id: string } | null; token: string } = { user: null, token: '' };

function posterOf(title: { id: string }) {
  return `/poster/${title.id}`;
}

export const client = {
  media: {
    movieCards: server.movieCards,
    showCards: server.showCards,
    artwork: { posterFor: posterOf, showPosterFor: posterOf, backdropFor: () => null },
  },
  refreshSession: server.refreshSession,
  get sessionToken() {
    return session.token;
  },
};

export const matched = (id: string) => ({ id, metadata: { posterUrl: `/art/${id}` } });
export const unmatched = (id: string) => ({ id, metadata: null });

/** Sets what the catalog answers from now on. */
export function library(holds: Holdings) {
  server.movieCards.mockResolvedValue(holds.movies ?? []);
  server.showCards.mockResolvedValue(holds.shows ?? []);
}

/** The stream the hook opened last. It throws when the hook opened none. */
export function stream(): Stream {
  const last = streams.at(-1);
  if (!last) {
    throw new Error('no event stream was opened');
  }
  return last;
}

/** Sends one server event down the open stream. */
export function emit(type: string) {
  act(() => stream().handlers.onEvent({ type }));
}

const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });

/** The query cache the feed reads from, emptied before each test. */
export function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return <QueryClientProvider client={queries}>{children}</QueryClientProvider>;
}

/** The cached queries that something asked to read again. */
export function invalidated() {
  return queries
    .getQueryCache()
    .getAll()
    .filter((query) => query.state.isInvalidated);
}

/** Moves the fake clock forward by exactly `ms`. */
export async function elapse(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Lets an answer that has arrived reach the screen. */
export async function answered() {
  await elapse(NOTIFY_MS);
}

/** Changes what the catalog answers, announces the change, and waits until the
 * feed shows it. */
export async function libraryBecomes(holds: Holdings) {
  library(holds);
  emit('library.updated');
  await elapse(REFRESH_MS);
  await answered();
}

/** Renders a feed hook and waits for the first answer of the catalog. */
export async function renderFeed<Feed>(useFeed: () => Feed) {
  const rendered = renderHook(useFeed, { wrapper });
  await answered();
  return rendered;
}

/** Registers the reset every scan feed suite shares: an owner who is signed
 * in, an empty library, no stream, and a fake clock. */
export function installHarness(): void {
  beforeEach(() => {
    streams.length = 0;
    vi.clearAllMocks();
    queries.clear();
    session.user = { id: 'owner' };
    session.token = crypto.randomUUID();
    library({});
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}
