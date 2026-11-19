// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  client,
  FakeEvents,
  installHarness,
  library,
  libraryBecomes,
  matched,
  renderFeed,
  SERVER,
  server,
  session,
  streams,
  unmatched,
  wrapper,
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

describe('a visitor who is not signed in', () => {
  it('asks nothing of the server and opens no stream', async () => {
    session.user = null;
    library({ movies: [matched('m1')] });

    const { result } = await renderFeed(useScanFeed);

    expect(result.current).toEqual({ found: 0, matched: 0, phase: 'reading', posters: [] });
    expect(server.movieCards).not.toHaveBeenCalled();
    expect(streams).toHaveLength(0);
  });
});

describe('what the library holds', () => {
  it('is nothing yet before the catalog has answered', () => {
    server.movieCards.mockReturnValue(new Promise(() => {}));
    server.showCards.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(useScanFeed, { wrapper });

    expect(result.current).toEqual({ found: 0, matched: 0, phase: 'reading', posters: [] });
  });

  it('counts the films and the series, and the ones among them that are matched', async () => {
    library({
      movies: [matched('m1'), unmatched('m2')],
      shows: [matched('s1'), unmatched('s2')],
    });

    const { result } = await renderFeed(useScanFeed);

    expect(result.current).toMatchObject({ found: 4, matched: 2, phase: 'matching' });
  });

  it('shows the posters of the matched titles alone', async () => {
    library({ movies: [matched('m1'), unmatched('m2')], shows: [matched('s1')] });

    const { result } = await renderFeed(useScanFeed);

    expect(result.current.posters).toEqual(['/poster/m1', '/poster/s1']);
  });

  it('is ready once every title is matched', async () => {
    library({ movies: [matched('m1')], shows: [matched('s1')] });

    const { result } = await renderFeed(useScanFeed);

    expect(result.current.phase).toBe('ready');
  });
});

describe('the posters as they arrive', () => {
  it('puts a new arrival before the ones already there', async () => {
    library({ movies: [matched('m1')] });
    const { result } = await renderFeed(useScanFeed);

    await libraryBecomes({ movies: [matched('m1'), matched('m2')] });

    expect(result.current.posters).toEqual(['/poster/m2', '/poster/m1']);
  });

  it('drops the poster of a title that left, and takes the one that replaced it', async () => {
    library({ movies: [matched('m1')] });
    const { result } = await renderFeed(useScanFeed);

    await libraryBecomes({ movies: [matched('m2')] });

    expect(result.current.posters).toEqual(['/poster/m2']);
  });

  it('remembers a replacement as an arrival, so that the next one comes before it', async () => {
    library({ movies: [matched('m1')] });
    const { result } = await renderFeed(useScanFeed);
    await libraryBecomes({ movies: [matched('m2')] });

    await libraryBecomes({ movies: [matched('m2'), matched('m3')] });

    expect(result.current.posters).toEqual(['/poster/m3', '/poster/m2']);
  });
});
