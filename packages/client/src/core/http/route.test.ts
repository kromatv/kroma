import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createRequestContext } from './request-context';
import { createRoute, type Route } from './route';

const CANONICAL = 'https://kroma.example';
const LAN = 'http://192.168.1.2:4040';
const Item = z.object({ id: z.string() });

const answer = (status = 200) =>
  ({ ok: status < 400, status, text: async () => '{"id":"i1"}', body: null }) as Response;

type Reply = (url: string, init?: RequestInit) => Promise<Response>;

function over(route: Route, reply: Reply) {
  const urls: string[] = [];
  const fetchFn = ((input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(input));
    return reply(String(input), init);
  }) as typeof globalThis.fetch;
  const ctx = createRequestContext({
    route,
    fetchFn,
    token: () => 'tok',
    locale: () => undefined,
    refresh: async () => undefined,
    mediaTicket: () => undefined,
    setMediaTicket: () => undefined,
  });
  return { ctx, urls };
}

const unreachableLan: Reply = async (url) => {
  if (url.startsWith(LAN)) throw new TypeError('Failed to fetch');
  return answer();
};

describe('the route', () => {
  it('starts on the canonical base and switches to a direct one', () => {
    const route = createRoute(CANONICAL);

    route.useDirect(LAN);

    expect(route.api()).toBe(LAN);
    expect(route.direct()).toBe(LAN);
    expect(route.canonical).toBe(CANONICAL);
  });

  it('keeps media on the canonical base unless it was built to follow the route', () => {
    const kept = createRoute(CANONICAL);
    const followed = createRoute(CANONICAL, { directMedia: true });

    kept.useDirect(LAN);
    followed.useDirect(LAN);

    expect(kept.media()).toBe(CANONICAL);
    expect(followed.media()).toBe(LAN);
  });

  it('tells a subscriber each time the direct base changes, and only then', () => {
    const route = createRoute(CANONICAL);
    const seen = vi.fn();
    const stop = route.subscribe(seen);

    route.useDirect(LAN);
    route.useDirect(LAN);
    route.drop();
    stop();
    route.useDirect(LAN);

    expect(seen.mock.calls).toEqual([[LAN], [undefined]]);
  });

  it('is not dropped by a request that failed on a route already replaced', () => {
    const route = createRoute(CANONICAL);
    route.useDirect('http://10.0.0.4:4040');
    route.useDirect(LAN);

    route.drop('http://10.0.0.4:4040');

    expect(route.direct()).toBe(LAN);
  });

  it('aborts what is waiting on a direct base when it is dropped', () => {
    const route = createRoute(CANONICAL);
    route.useDirect(LAN);
    const signal = route.directSignal();

    route.drop();

    expect(signal?.aborted).toBe(true);
    expect(route.directSignal()).toBeUndefined();
  });
});

describe('a request on the direct route', () => {
  it('goes to the direct base, and URLs for a player follow the media base', async () => {
    const route = createRoute(CANONICAL, { directMedia: true });
    route.useDirect(LAN);
    const { ctx, urls } = over(route, async () => answer());

    await ctx.get('/items/:id', Item, { params: { id: 'i1' } });

    expect(urls).toEqual([`${LAN}/api/items/i1`]);
    expect(ctx.url('/items/:id/stream', { params: { id: 'i1' } })).toBe(
      `${LAN}/api/items/i1/stream`,
    );
    expect(ctx.baseUrl).toBe(LAN);
  });

  it('is sent once more to the canonical base when the direct one cannot be reached', async () => {
    const route = createRoute(CANONICAL);
    route.useDirect(LAN);
    const { ctx, urls } = over(route, unreachableLan);

    const item = await ctx.get('/items/:id', Item, { params: { id: 'i1' } });

    expect(item).toEqual({ id: 'i1' });
    expect(urls).toEqual([`${LAN}/api/items/i1`, `${CANONICAL}/api/items/i1`]);
    expect(route.direct()).toBeUndefined();
  });

  it('keeps the route when the server answers with an error status', async () => {
    const route = createRoute(CANONICAL);
    route.useDirect(LAN);
    const { ctx, urls } = over(route, async () => answer(500));

    await expect(ctx.get('/items/:id', Item, { params: { id: 'i1' } })).rejects.toThrow();

    expect(urls).toEqual([`${LAN}/api/items/i1`]);
    expect(route.direct()).toBe(LAN);
  });

  it('drops the route but is not sent twice when it is not idempotent', async () => {
    const route = createRoute(CANONICAL);
    route.useDirect(LAN);
    const { ctx, urls } = over(route, unreachableLan);

    await expect(ctx.post('/requests', { body: { tmdbId: 1 } })).rejects.toThrow('Failed to fetch');

    expect(urls).toEqual([`${LAN}/api/requests`]);
    expect(route.direct()).toBeUndefined();
  });

  it('is not sent again, and keeps the route, when the caller aborted it', async () => {
    const route = createRoute(CANONICAL);
    route.useDirect(LAN);
    const controller = new AbortController();
    const { ctx, urls } = over(route, async () => {
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    });

    await expect(
      ctx.get('/items/:id', Item, { params: { id: 'i1' }, signal: controller.signal }),
    ).rejects.toThrow('Aborted');

    expect(urls).toHaveLength(1);
    expect(route.direct()).toBe(LAN);
  });

  it('moves to the canonical base when the route is dropped while it waits', async () => {
    const route = createRoute(CANONICAL);
    route.useDirect(LAN);
    const { ctx, urls } = over(route, (url, init) => {
      if (!url.startsWith(LAN)) return Promise.resolve(answer());
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')));
      });
    });

    const pending = ctx.get('/items/:id', Item, { params: { id: 'i1' } });
    await Promise.resolve();
    route.drop();

    await expect(pending).resolves.toEqual({ id: 'i1' });
    expect(urls).toEqual([`${LAN}/api/items/i1`, `${CANONICAL}/api/items/i1`]);
  });

  it('is never taken by a request pinned to the canonical base', async () => {
    const route = createRoute(CANONICAL);
    route.useDirect(LAN);
    const { ctx, urls } = over(route, async () => answer());

    await ctx.get('/server/direct', Item, { canonical: true });

    expect(urls).toEqual([`${CANONICAL}/api/server/direct`]);
  });
});
