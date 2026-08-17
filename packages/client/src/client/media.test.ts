import { describe, expect, it } from 'vitest';
import { KromaApiError, type RequestContext } from './base';
import {
  downloadUrl,
  featured,
  health,
  hlsMasterUrl,
  items,
  logs,
  logsUrl,
  movies,
  personCredits,
  personDetails,
  search,
  splash,
  storyboard,
  streamUrl,
  subtitleUrl,
  themed,
} from './media';

// The URL builders only read `ctx.baseUrl`, so a minimal stub suffices.
const ctx = { baseUrl: 'http://kroma.test' } as unknown as RequestContext;

function recordCtx(resp?: { ok?: boolean; status?: number; json?: unknown; text?: string }) {
  const calls: string[] = [];
  const rich = {
    baseUrl: 'http://kroma.test',
    json: async (path: string) => {
      calls.push(path);
      return [] as never;
    },
    fetchFn: async () =>
      ({
        ok: resp?.ok ?? true,
        status: resp?.status ?? 200,
        json: async () => resp?.json ?? {},
        text: async () => resp?.text ?? '',
      }) as unknown as Response,
  } as unknown as RequestContext;
  return { ctx: rich, calls };
}

describe('splash', () => {
  function splashCtx(entries: unknown[]) {
    const calls: string[] = [];
    const rich = {
      baseUrl: 'http://kroma.test',
      json: async (path: string) => {
        calls.push(path);
        return entries as never;
      },
    } as unknown as RequestContext;
    return { ctx: rich, calls };
  }

  it('asks the anonymous endpoint', async () => {
    const { ctx: c, calls } = splashCtx([]);
    await splash(c);
    expect(calls).toEqual(['/splash']);
  });

  it('resolves each art path against the server, like every other poster', async () => {
    // The sign-in screen has no session yet, so nothing else would rewrite
    // these for it: a bare `/api/images/...` would resolve against the app's
    // own origin, which on a TV shell is a file:// bundle.
    const { ctx: c } = splashCtx([
      { backdropUrl: '/api/images/a', caption: 'Un' },
      { backdropUrl: '/api/images/b', caption: 'Deux' },
    ]);
    const out = await splash(c);
    expect(out.map((e) => e.backdropUrl)).toEqual([
      'http://kroma.test/api/images/a',
      'http://kroma.test/api/images/b',
    ]);
  });

  it('leaves an absolute URL alone and keeps the rest of the entry', async () => {
    const { ctx: c } = splashCtx([
      { backdropUrl: 'https://image.tmdb.org/x.jpg', caption: 'Trois', title: 'Dune' },
    ]);
    const [entry] = await splash(c);
    expect(entry).toMatchObject({
      backdropUrl: 'https://image.tmdb.org/x.jpg',
      caption: 'Trois',
      title: 'Dune',
    });
  });

  it('keeps the original when there is nothing to resolve', async () => {
    const { ctx: c } = splashCtx([{ backdropUrl: '', caption: 'Quatre' }]);
    const [entry] = await splash(c);
    expect(entry?.backdropUrl).toBe('');
  });

  it('answers an empty sample with an empty list', async () => {
    const { ctx: c } = splashCtx([]);
    expect(await splash(c)).toEqual([]);
  });
});

describe('health', () => {
  it('passes the init straight through, so a heartbeat can bound the probe', async () => {
    const seen: Array<[string, RequestInit | undefined]> = [];
    const c = {
      baseUrl: 'http://kroma.test',
      json: async (path: string, init?: RequestInit) => {
        seen.push([path, init]);
        return {} as never;
      },
    } as unknown as RequestContext;
    const signal = AbortSignal.abort();
    await health(c, { signal });
    expect(seen).toEqual([['/health', { signal }]]);
  });

  it('works with no init at all', async () => {
    const seen: string[] = [];
    const c = {
      baseUrl: 'http://kroma.test',
      json: async (path: string) => {
        seen.push(path);
        return {} as never;
      },
    } as unknown as RequestContext;
    await health(c);
    expect(seen).toEqual(['/health']);
  });
});

describe('hlsMasterUrl', () => {
  it('emits the copy program at anchor 0, audio 0', () => {
    expect(hlsMasterUrl(ctx, 'abc')).toBe(
      'http://kroma.test/api/items/abc/hls/copy/0/0/index.m3u8',
    );
  });

  it('emits the aac program for the AAC variant', () => {
    expect(hlsMasterUrl(ctx, 'abc', true)).toBe(
      'http://kroma.test/api/items/abc/hls/aac/0/0/index.m3u8',
    );
  });

  it('puts the anchor (rounded, clamped) and audio track in the path', () => {
    expect(hlsMasterUrl(ctx, 'abc', false, 600.4, 1)).toBe(
      'http://kroma.test/api/items/abc/hls/copy/600/1/index.m3u8',
    );
    expect(hlsMasterUrl(ctx, 'abc', false, -5, 0)).toBe(
      'http://kroma.test/api/items/abc/hls/copy/0/0/index.m3u8',
    );
  });

  it('url-encodes the item id', () => {
    expect(hlsMasterUrl(ctx, 'a b/c', true, 0, 2)).toBe(
      'http://kroma.test/api/items/a%20b%2Fc/hls/aac/0/2/index.m3u8',
    );
  });

  it('a loudness filter becomes the mode segment (forcing the transcode path)', () => {
    expect(hlsMasterUrl(ctx, 'abc', false, 600.4, 1, 'night')).toBe(
      'http://kroma.test/api/items/abc/hls/aac-night/600/1/index.m3u8',
    );
    // The filter supersedes `aac` (a filtered program is always transcoded).
    expect(hlsMasterUrl(ctx, 'abc', true, 0, 0, 'standard')).toBe(
      'http://kroma.test/api/items/abc/hls/aac-standard/0/0/index.m3u8',
    );
  });

  it('declares decodable codecs so the server can override an unplayable copy', () => {
    expect(hlsMasterUrl(ctx, 'abc', false, 0, 0, undefined, ['aac', 'eac3'])).toBe(
      'http://kroma.test/api/items/abc/hls/copy/0/0/index.m3u8?copy=aac%2Ceac3',
    );
    // Decodes none: an empty array is a declaration, not "no preference".
    expect(hlsMasterUrl(ctx, 'abc', false, 0, 0, undefined, [])).toBe(
      'http://kroma.test/api/items/abc/hls/copy/0/0/index.m3u8?copy=',
    );
  });

  it('ignores declared codecs once the request already transcodes', () => {
    expect(hlsMasterUrl(ctx, 'abc', true, 0, 0, undefined, ['aac'])).toBe(
      'http://kroma.test/api/items/abc/hls/aac/0/0/index.m3u8',
    );
    expect(hlsMasterUrl(ctx, 'abc', false, 0, 0, 'night', ['aac'])).toBe(
      'http://kroma.test/api/items/abc/hls/aac-night/0/0/index.m3u8',
    );
  });
});

describe('stream / subtitle URL builders', () => {
  it('builds encoded stream + subtitle URLs', () => {
    expect(streamUrl(ctx, 'a b')).toBe('http://kroma.test/api/items/a%20b/stream');
    expect(subtitleUrl(ctx, 'id', 3)).toBe('http://kroma.test/api/items/id/subtitles/3.vtt');
  });

  it('logsUrl carries the tail count (default 200)', () => {
    expect(logsUrl(ctx)).toBe('http://kroma.test/api/logs?tail=200');
    expect(logsUrl(ctx, 50)).toBe('http://kroma.test/api/logs?tail=50');
  });

  it('downloadUrl carries the client copy-codec set only when given', () => {
    expect(downloadUrl(ctx, 'a b')).toBe('http://kroma.test/api/items/a%20b/download');
    expect(downloadUrl(ctx, 'id', ['aac', 'ac3', 'eac3'])).toBe(
      'http://kroma.test/api/items/id/download?copy=aac%2Cac3%2Ceac3',
    );
  });

  it('downloadUrl keeps "copy nothing" distinct from "no preference"', () => {
    // Empty set = transcode every track; omitted = the server's full copy set.
    expect(downloadUrl(ctx, 'id', [])).toBe('http://kroma.test/api/items/id/download?copy=');
    expect(downloadUrl(ctx, 'id')).toBe('http://kroma.test/api/items/id/download');
  });
});

describe('catalogue reads (json delegation)', () => {
  it('appends the library query where supported', () => {
    const { ctx: c, calls } = recordCtx();
    void items(c, 'lib1');
    void movies(c);
    expect(calls).toEqual(['/items?library=lib1', '/movies']);
  });

  it('search builds q + optional limit/library', () => {
    const { ctx: c, calls } = recordCtx();
    void search(c, 'star wars', { limit: 20, libraryId: 'lib1' });
    void search(c, 'plain');
    expect(calls[0]).toBe('/search?q=star+wars&limit=20&library=lib1');
    expect(calls[1]).toBe('/search?q=plain');
  });

  it('personCredits + themed encode their params', () => {
    const { ctx: c, calls } = recordCtx();
    void personCredits(c, 'Ana de Armas', { libraryId: 'lib1' });
    void themed(c, 'christmas movie');
    expect(calls[0]).toBe('/people?name=Ana+de+Armas&library=lib1');
    // themed uses encodeURIComponent (space -> %20), not URLSearchParams (+).
    expect(calls[1]).toBe('/themed?q=christmas%20movie');
  });

  it('personDetails asks the provider endpoint, not the catalogue one', () => {
    const { ctx: c, calls } = recordCtx();
    void personDetails(c, 'Ana de Armas');
    expect(calls[0]).toBe('/people/details?name=Ana+de+Armas');
  });

  it('featured reads the hero endpoint', () => {
    const { ctx: c, calls } = recordCtx();
    void featured(c);
    expect(calls).toEqual(['/home/featured']);
  });
});

describe('logs (raw text)', () => {
  it('returns the log body on success', async () => {
    const { ctx: c } = recordCtx({ ok: true, text: 'line1\nline2' });
    await expect(logs(c, 10)).resolves.toBe('line1\nline2');
  });

  it('throws KromaApiError on a non-ok response', async () => {
    const { ctx: c } = recordCtx({ ok: false, status: 500 });
    await expect(logs(c)).rejects.toBeInstanceOf(KromaApiError);
  });
});

describe('storyboard', () => {
  it('maps 202 to pending, non-ok to null, and 200 to the manifest', async () => {
    const manifest = {
      url: '/s.jpg',
      interval: 5,
      tileW: 1,
      tileH: 1,
      cols: 1,
      rows: 1,
      count: 1,
      duration: 5,
    };
    await expect(storyboard(recordCtx({ status: 202 }).ctx, 'x')).resolves.toBe('pending');
    await expect(storyboard(recordCtx({ ok: false, status: 404 }).ctx, 'x')).resolves.toBeNull();
    await expect(
      storyboard(recordCtx({ ok: true, status: 200, json: manifest }).ctx, 'x'),
    ).resolves.toEqual(manifest);
  });
});
