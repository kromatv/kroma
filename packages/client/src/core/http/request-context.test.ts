import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { KromaApiError, KromaSchemaError } from './api-error';
import { createRequestContext, type TransportConfig } from './request-context';

const Item = z.object({ id: z.string() });

interface Reply {
  ok?: boolean;
  status?: number;
  text?: string;
  stream?: string[];
}

function transport(
  reply: Reply | ((url: string) => Reply) = {},
  config?: Partial<TransportConfig>,
) {
  const calls: { url: string; headers: Headers; method: string }[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init?.headers), method: init?.method ?? 'GET' });
    const r = typeof reply === 'function' ? reply(url) : reply;
    const chunks = r.stream;
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      text: async () => r.text ?? '',
      blob: async () => new Blob([r.text ?? '']),
      body: chunks
        ? {
            getReader: () => {
              let i = 0;
              return {
                read: async () =>
                  i < chunks.length
                    ? { done: false, value: new TextEncoder().encode(chunks[i++]) }
                    : { done: true, value: undefined },
                cancel: async () => undefined,
              };
            },
          }
        : null,
    } as unknown as Response;
  }) as typeof globalThis.fetch;

  const ctx = createRequestContext({
    baseUrl: 'http://kroma.test',
    fetchFn,
    token: () => 'tok',
    locale: () => 'fr',
    refresh: async () => undefined,
    ...config,
  });
  return { ctx, calls };
}

describe('the request itself', () => {
  it('hits <baseUrl>/api<path> with the bearer and the locale', async () => {
    const { ctx, calls } = transport({ text: '{"id":"i1"}' });

    await ctx.get('/items/:id', Item, { params: { id: 'i 1' } });

    expect(calls[0]?.url).toBe('http://kroma.test/api/items/i%201');
    expect(calls[0]?.headers.get('Authorization')).toBe('Bearer tok');
    expect(calls[0]?.headers.get('Accept-Language')).toBe('fr');
  });

  it('sends a JSON body with its content type, and none when there is no body', async () => {
    const { ctx, calls } = transport();

    await ctx.post('/auth/login', { body: { email: 'a' } });
    await ctx.post('/push/test');

    expect(calls[0]?.headers.get('content-type')).toBe('application/json');
    expect(calls[1]?.headers.get('content-type')).toBeNull();
  });

  it('builds the absolute URL a video element fetches for itself', () => {
    const { ctx } = transport();

    expect(ctx.url('/items/:id/stream', { params: { id: 'a b' } })).toBe(
      'http://kroma.test/api/items/a%20b/stream',
    );
  });
});

describe('reading the answer', () => {
  it('parses the body through the response schema', async () => {
    const { ctx } = transport({ text: '{"id":"i1","extra":1}' });

    await expect(ctx.get('/items/:id', Item, { params: { id: 'i1' } })).resolves.toEqual({
      id: 'i1',
    });
  });

  it('throws KromaSchemaError, naming the path, when the body is not what we asked for', async () => {
    const { ctx } = transport({ text: '{"id":42}' });

    const failure = ctx.get('/items/:id', Item, { params: { id: 'i1' } });

    await expect(failure).rejects.toBeInstanceOf(KromaSchemaError);
    await expect(failure).rejects.toThrow('/items/i1');
  });

  it('treats an empty 2xx as no body rather than a parse failure', async () => {
    const { ctx } = transport({ status: 204 });

    await expect(
      ctx.delete('/invites/:token', { params: { token: 't' } }),
    ).resolves.toBeUndefined();
  });

  it('reads a body streamed across chunks, multi-byte characters included', async () => {
    const { ctx } = transport({ stream: ['{"id":"caf', 'é"}'] });

    await expect(ctx.get('/items/:id', Item, { params: { id: 'i1' } })).resolves.toEqual({
      id: 'café',
    });
  });

  it('gives up on a body past the 64 MiB cap instead of buffering it whole', async () => {
    const huge = 'x'.repeat(8 * 1024 * 1024);
    const { ctx } = transport({ stream: Array.from({ length: 9 }, () => huge) });

    await expect(ctx.get('/items', Item.array())).rejects.toThrow('answered more than');
  });

  it('throws KromaApiError with the parsed error body on a non-2xx', async () => {
    const { ctx } = transport({ ok: false, status: 403, text: '{"error":"nope"}' });

    await expect(ctx.get('/items', Item.array())).rejects.toMatchObject({
      status: 403,
      body: { error: 'nope' },
    });
  });

  it('tolerates an error body it cannot parse', async () => {
    const { ctx } = transport({ ok: false, status: 500, text: 'not json' });

    await expect(ctx.get('/items', Item.array())).rejects.toBeInstanceOf(KromaApiError);
  });
});

describe('the query string', () => {
  it('encodes what is given and omits what is undefined', async () => {
    const { ctx, calls } = transport({ text: '[]' });

    await ctx.get('/items', Item.array(), { query: { library: 'lib 1', page: undefined } });

    expect(calls[0]?.url).toBe('http://kroma.test/api/items?library=lib+1');
  });
});

describe('a 401 and the silent refresh', () => {
  const unauthorized = (failFirst: string) => {
    let hits = 0;
    return (url: string): Reply => {
      if (!url.includes(failFirst)) return { text: '{}' };
      hits += 1;
      return hits === 1 ? { ok: false, status: 401, text: '{}' } : { text: '{"id":"i1"}' };
    };
  };

  it('refreshes once on a bearer endpoint and retries with the new token', async () => {
    const refresh = vi.fn(async () => 'fresh');
    let token = 'stale';
    const { ctx, calls } = transport(unauthorized('/items'), {
      token: () => token,
      refresh: async () => {
        token = 'fresh';
        return refresh();
      },
    });

    await expect(ctx.get('/items/:id', Item, { params: { id: 'i1' } })).resolves.toEqual({
      id: 'i1',
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.headers.get('Authorization')).toBe('Bearer fresh');
  });

  it('never refreshes a public endpoint, and sends it no bearer at all', async () => {
    const refresh = vi.fn(async () => 'fresh');
    const { ctx, calls } = transport({ ok: false, status: 401, text: '{}' }, { refresh });

    await expect(ctx.post('/auth/token', Item, { auth: 'public', body: {} })).rejects.toMatchObject(
      {
        status: 401,
      },
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get('Authorization')).toBeNull();
  });

  it('gives up after one retry rather than looping', async () => {
    const refresh = vi.fn(async () => 'fresh');
    const { ctx, calls } = transport({ ok: false, status: 401, text: '{}' }, { refresh });

    await expect(ctx.get('/home', Item)).rejects.toMatchObject({ status: 401 });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
  });

  it('does not refresh when the handler cannot mint a bearer', async () => {
    const refresh = vi.fn(async () => undefined);
    const { ctx, calls } = transport({ ok: false, status: 401, text: '{}' }, { refresh });

    await expect(ctx.get('/home', Item)).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(1);
  });

  it('leaves a non-401 failure alone', async () => {
    const refresh = vi.fn(async () => 'fresh');
    const { ctx } = transport({ ok: false, status: 500, text: '{}' }, { refresh });

    await expect(ctx.get('/home', Item)).rejects.toMatchObject({ status: 500 });
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('an abort signal', () => {
  it('reaches fetch, so a caller can bound its own request', async () => {
    const controller = new AbortController();
    let seen: AbortSignal | null | undefined;
    const ctx = createRequestContext({
      baseUrl: 'http://kroma.test',
      fetchFn: (async (_input: RequestInfo | URL, init?: RequestInit) => {
        seen = init?.signal;
        return { ok: true, status: 200, text: async () => '{"id":"i1"}', body: null } as Response;
      }) as typeof globalThis.fetch,
      token: () => undefined,
      locale: () => undefined,
      refresh: async () => undefined,
    });

    await ctx.get('/items/:id', Item, { params: { id: 'i1' }, signal: controller.signal });

    expect(seen).toBe(controller.signal);
  });
});

describe('concurrency policy', () => {
  function counting(delayed?: () => Promise<void>) {
    let calls = 0;
    const aborted: (AbortSignal | null | undefined)[] = [];
    const ctx = createRequestContext({
      baseUrl: 'http://kroma.test',
      fetchFn: (async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls += 1;
        aborted.push(init?.signal);
        await delayed?.();
        if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        return { ok: true, status: 200, text: async () => '{"id":"i1"}', body: null } as Response;
      }) as typeof globalThis.fetch,
      token: () => undefined,
      locale: () => undefined,
      refresh: async () => undefined,
    });
    return { ctx, aborted, calls: () => calls };
  }

  it('shares one fetch between two identical in-flight reads', async () => {
    const { ctx, calls } = counting(() => new Promise((r) => setTimeout(r, 5)));

    const both = await Promise.all([
      ctx.get('/items/:id', Item, { params: { id: 'i1' }, concurrency: 'share' }),
      ctx.get('/items/:id', Item, { params: { id: 'i1' }, concurrency: 'share' }),
    ]);

    expect(calls()).toBe(1);
    expect(both).toEqual([{ id: 'i1' }, { id: 'i1' }]);
  });

  it('shares nothing between two reads of different things', async () => {
    const { ctx, calls } = counting(() => new Promise((r) => setTimeout(r, 5)));

    await Promise.all([
      ctx.get('/items/:id', Item, { params: { id: 'i1' }, concurrency: 'share' }),
      ctx.get('/items/:id', Item, { params: { id: 'i2' }, concurrency: 'share' }),
    ]);

    expect(calls()).toBe(2);
  });

  it('serves a shared read to a caller that walked away, and to the one that stayed', async () => {
    const { ctx, calls } = counting(() => new Promise((r) => setTimeout(r, 5)));
    const walker = new AbortController();

    const leaving = ctx.get('/items/:id', Item, {
      params: { id: 'i1' },
      concurrency: 'share',
      signal: walker.signal,
    });
    const staying = ctx.get('/items/:id', Item, { params: { id: 'i1' }, concurrency: 'share' });
    walker.abort();

    await expect(staying).resolves.toEqual({ id: 'i1' });
    await expect(leaving).resolves.toEqual({ id: 'i1' });
    expect(calls()).toBe(1);
  });

  it('aborts the previous read when the latest one supersedes it', async () => {
    const { ctx } = counting(() => new Promise((r) => setTimeout(r, 5)));

    const first = ctx.get('/search', Item, { query: { q: 'du' }, concurrency: 'latest' });
    const second = ctx.get('/search', Item, { query: { q: 'du' }, concurrency: 'latest' });

    await expect(first).rejects.toThrow();
    await expect(second).resolves.toEqual({ id: 'i1' });
  });

  it('leaves a different key alone', async () => {
    const { ctx } = counting(() => new Promise((r) => setTimeout(r, 5)));

    const first = ctx.get('/search', Item, { query: { q: 'du' }, concurrency: 'latest' });
    const second = ctx.get('/search', Item, { query: { q: 'dune' }, concurrency: 'latest' });

    await expect(first).resolves.toEqual({ id: 'i1' });
    await expect(second).resolves.toEqual({ id: 'i1' });
  });
});
