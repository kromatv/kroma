// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  answered,
  client,
  elapse,
  emit,
  FakeEvents,
  installHarness,
  invalidated,
  library,
  matched,
  REFRESH_MS,
  renderFeed,
  SERVER,
  server,
  session,
  stream,
  streams,
} from '#web/features/setup/use-scan-feed.fixture';

vi.mock('@kromatv/client/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kromatv/client/events')>()),
  KromaEvents: FakeEvents,
}));
vi.mock('#web/shared/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#web/shared/lib/api')>()),
  apiBase: () => SERVER,
}));
vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => ({ user: session.user }) }));
vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const runtime = createWebTestRuntime(client);
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

import { useScanFeed } from './use-scan-feed.hook';

installHarness();

describe('the stream it opens', () => {
  it('connects once to the server the app talks to', async () => {
    const { rerender } = await renderFeed(useScanFeed);

    rerender();

    expect(streams).toHaveLength(1);
    expect(stream()).toMatchObject({ base: SERVER, connected: 1, closed: 0 });
  });

  it('signs in with the session the app holds at that moment', async () => {
    await renderFeed(useScanFeed);

    session.token = crypto.randomUUID();

    expect(stream().handlers.token()).toBe(session.token);
  });

  it('renews its session through the app', async () => {
    const renewed = crypto.randomUUID();
    server.refreshSession.mockResolvedValue(renewed);
    await renderFeed(useScanFeed);

    const token = await stream().handlers.refresh();

    expect(token).toBe(renewed);
  });

  it('closes when the screen is left', async () => {
    const { unmount } = await renderFeed(useScanFeed);

    unmount();

    expect(stream().closed).toBe(1);
  });
});

describe('the walk the server announces', () => {
  it('reads the library as being read from the start of a walk', async () => {
    library({ movies: [matched('m1')] });
    const { result } = await renderFeed(useScanFeed);

    emit('scan.started');

    expect(result.current.phase).toBe('reading');
  });

  it('reads the library as ready again at the end of the walk', async () => {
    library({ movies: [matched('m1')] });
    const { result } = await renderFeed(useScanFeed);
    emit('scan.started');

    emit('scan.completed');

    expect(result.current.phase).toBe('ready');
  });

  it('keeps reading through a change that does not end the walk', async () => {
    library({ movies: [matched('m1')] });
    const { result } = await renderFeed(useScanFeed);
    emit('scan.started');

    emit('item.updated');

    expect(result.current.phase).toBe('reading');
  });
});

describe('what makes it ask the catalog again', () => {
  it.each([
    'scan.completed',
    'library.updated',
    'item.updated',
    'show.updated',
    'enrich.completed',
  ])('reads the films and the series again after %s', async (type) => {
    const { result } = await renderFeed(useScanFeed);
    library({ movies: [matched('m1')], shows: [matched('s1')] });

    emit(type);
    await elapse(REFRESH_MS);
    await answered();

    expect(result.current).toMatchObject({ found: 2, matched: 2 });
  });

  it.each(['scan.started', 'scan.progress', 'enrich.progress', 'job.progress'])(
    'asks nothing after %s, which adds no title',
    async (type) => {
      await renderFeed(useScanFeed);

      emit(type);
      await elapse(REFRESH_MS * 4);

      expect(server.movieCards).toHaveBeenCalledOnce();
      expect(server.showCards).toHaveBeenCalledOnce();
    },
  );

  it('waits before it asks, so that a burst of changes costs one request', async () => {
    await renderFeed(useScanFeed);

    emit('item.updated');
    await elapse(REFRESH_MS - 1);

    expect(server.movieCards).toHaveBeenCalledOnce();
  });

  it('asks once for every change inside one wait', async () => {
    await renderFeed(useScanFeed);

    emit('item.updated');
    emit('show.updated');
    emit('enrich.completed');
    await elapse(REFRESH_MS);

    expect(server.movieCards).toHaveBeenCalledTimes(2);
    expect(server.showCards).toHaveBeenCalledTimes(2);
  });

  it('asks again for a change that comes after the wait', async () => {
    await renderFeed(useScanFeed);
    emit('item.updated');
    await elapse(REFRESH_MS);
    await answered();

    emit('item.updated');
    await elapse(REFRESH_MS);

    expect(server.movieCards).toHaveBeenCalledTimes(3);
  });

  it('leaves the catalog alone after the screen is left', async () => {
    const { unmount } = await renderFeed(useScanFeed);

    emit('item.updated');
    unmount();
    await elapse(REFRESH_MS * 2);

    expect(invalidated()).toEqual([]);
  });
});
