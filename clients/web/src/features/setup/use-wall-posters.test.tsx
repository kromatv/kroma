// @vitest-environment jsdom

import { SplashEntry } from '@kromatv/client/media';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { c } from '#web/shared/lib/queries.fixture';

vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const runtime = createWebTestRuntime(c);
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

import { stillGathering, useWallPosters, wallFill, wallPoster } from './use-wall-posters.hook';

const ASK_AGAIN_MS = 4000;
const NOTIFY_MS = 1;
const ENOUGH = 12;
const WIDEST_WALL = 40;

function title(name: string, over: { posterUrl?: string; trending?: boolean } = {}) {
  return SplashEntry.parse({
    kind: 'movie',
    title: name,
    year: 2020,
    backdropUrl: `/backdrop/${name}`,
    posterUrl: `/poster/${name}`,
    ...over,
  });
}

function sample(count: number) {
  return Array.from({ length: count }, (_, at) => title(`sample-${at}`));
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

async function elapse(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function answered() {
  await elapse(NOTIFY_MS);
}

beforeEach(() => {
  c.media.splash.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the artwork of one title', () => {
  it('is its poster', () => {
    expect(wallPoster(title('arrival'))).toBe('/poster/arrival');
  });

  it('is its backdrop when it has no poster', () => {
    expect(wallPoster(title('arrival', { posterUrl: undefined }))).toBe('/backdrop/arrival');
  });
});

describe('whether the server still gathers artwork', () => {
  it('does before it gave a sample', () => {
    expect(stillGathering(undefined)).toBe(true);
  });

  it('does while the sample is short', () => {
    expect(stillGathering(sample(ENOUGH - 1))).toBe(true);
  });

  it('does not once the sample is whole', () => {
    expect(stillGathering(sample(ENOUGH))).toBe(false);
  });
});

describe('what fills the wall around the posters of the library', () => {
  const entries = [title('local'), title('worldwide', { trending: true })];

  it('is the whole sample for a wall with none of its own', () => {
    expect(wallFill(entries, { hasOwn: false })).toEqual(['/poster/local', '/poster/worldwide']);
  });

  it('is only what the world watches for a wall with posters of its own', () => {
    expect(wallFill(entries, { hasOwn: true })).toEqual(['/poster/worldwide']);
  });
});

describe('the wall behind the setup', () => {
  it('is empty before the server gave a sample', () => {
    c.media.splash.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useWallPosters([]), { wrapper: wrapper() });

    expect(result.current).toEqual([]);
  });

  it('repeats the sample until every slot holds a poster', async () => {
    c.media.splash.mockResolvedValue([title('first'), title('second')]);

    const { result } = renderHook(() => useWallPosters([]), { wrapper: wrapper() });
    await answered();

    expect(result.current).toHaveLength(WIDEST_WALL);
    expect(result.current.slice(0, 3)).toEqual([
      '/poster/first',
      '/poster/second',
      '/poster/first',
    ]);
  });

  it('gives the first slots to the posters of the library, the oldest first', async () => {
    c.media.splash.mockResolvedValue([title('local'), title('worldwide', { trending: true })]);

    const { result } = renderHook(() => useWallPosters(['/own/newest', '/own/oldest']), {
      wrapper: wrapper(),
    });
    await answered();

    expect(result.current.slice(0, 4)).toEqual([
      '/own/oldest',
      '/own/newest',
      '/poster/worldwide',
      '/poster/worldwide',
    ]);
  });

  it('asks for the sample again while the server still gathers it', async () => {
    c.media.splash.mockResolvedValueOnce(sample(2)).mockResolvedValue(sample(ENOUGH));
    const { result } = renderHook(() => useWallPosters([]), { wrapper: wrapper() });
    await answered();

    await elapse(ASK_AGAIN_MS);
    await answered();

    expect(result.current.slice(0, ENOUGH)).toEqual(sample(ENOUGH).map(wallPoster));
    expect(c.media.splash).toHaveBeenCalledTimes(2);
  });

  it('asks for the sample no more once it is whole', async () => {
    c.media.splash.mockResolvedValue(sample(ENOUGH));
    renderHook(() => useWallPosters([]), { wrapper: wrapper() });
    await answered();

    await elapse(ASK_AGAIN_MS * 4);

    expect(c.media.splash).toHaveBeenCalledOnce();
  });
});
