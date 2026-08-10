import { KromaClient, sessionToken, setSessionToken } from '@kroma/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiBase,
  ensureSession,
  imageUrl,
  isAuthed,
  kromaClient,
  toMovieView,
  toShowView,
} from './api';

const H = vi.hoisted(() => ({
  session: null as { accessToken: string } | null,
  exchange: vi.fn(),
}));

vi.mock('@kroma/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kroma/core')>()),
  loadSession: () => H.session,
  sharedTokenExchange: (run: () => Promise<unknown>) => H.exchange(run),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  H.session = null;
  H.exchange.mockReset();
  setSessionToken(undefined);
});

describe('apiBase', () => {
  it('returns a non-empty origin with no trailing slash', () => {
    const base = apiBase();
    expect(base.length).toBeGreaterThan(0);
    expect(base.endsWith('/')).toBe(false);
  });

  it('prefers window.__KROMA_API__ and strips its trailing slashes', () => {
    vi.stubGlobal('window', { __KROMA_API__: 'http://custom:9000///' });
    expect(apiBase()).toBe('http://custom:9000');
  });

  it('uses the build-time server override when one is set', () => {
    vi.stubEnv('VITE_KROMA_SERVER', 'http://api.example:4040//');
    expect(apiBase()).toBe('http://api.example:4040');
  });

  it('calls the page origin in dev, where vite reverse-proxies /api', () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost:3000/' } });
    expect(apiBase()).toBe('http://localhost:3000');
  });

  it('calls the page origin in production, where one server serves both', () => {
    vi.stubEnv('DEV', false);
    vi.stubGlobal('window', { location: { origin: 'https://kroma.home/' } });
    expect(apiBase()).toBe('https://kroma.home');
  });

  it('falls back to the configured server url when prerendering without a window', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('KROMA_SERVER_URL', 'http://nas.local:4040/');
    vi.stubGlobal('window', undefined);
    expect(apiBase()).toBe('http://nas.local:4040');
  });

  it('falls back to the conventional local API when nothing is configured', () => {
    vi.stubEnv('DEV', false);
    vi.stubGlobal('window', undefined);
    expect(apiBase()).toBe('http://localhost:4040');
  });

  it('falls back to the conventional local API during a dev prerender', () => {
    vi.stubGlobal('window', undefined);
    expect(apiBase()).toBe('http://localhost:4040');
  });
});

describe('isAuthed', () => {
  it('is true only while an access token is stored on this device', () => {
    expect(isAuthed()).toBe(false);
    H.session = { accessToken: 'stored' };
    expect(isAuthed()).toBe(true);
  });
});

describe('ensureSession', () => {
  it('is a no-op once a bearer is in memory', async () => {
    setSessionToken('already-here');
    await ensureSession();
    expect(H.exchange).not.toHaveBeenCalled();
    expect(sessionToken()).toBe('already-here');
  });

  it('is a no-op when signed out, with nothing to exchange', async () => {
    await ensureSession();
    expect(H.exchange).not.toHaveBeenCalled();
    expect(sessionToken()).toBeUndefined();
  });

  it('exchanges the stored access token for a fresh bearer', async () => {
    H.session = { accessToken: 'stored' };
    H.exchange.mockResolvedValue({ token: 'fresh-bearer' });
    await ensureSession();
    expect(H.exchange).toHaveBeenCalledTimes(1);
    expect(sessionToken()).toBe('fresh-bearer');
  });

  it('exchanges through a client pointed at the API origin', async () => {
    H.session = { accessToken: 'stored' };
    const exchangeToken = vi
      .spyOn(KromaClient.prototype, 'exchangeToken')
      .mockResolvedValue({ token: 'bearer-3' } as Awaited<
        ReturnType<KromaClient['exchangeToken']>
      >);
    H.exchange.mockImplementation((run: () => Promise<unknown>) => run());
    await ensureSession();
    expect(exchangeToken).toHaveBeenCalledWith('stored');
    expect(sessionToken()).toBe('bearer-3');
  });

  it('leaves no bearer behind when the exchange fails', async () => {
    H.session = { accessToken: 'stored' };
    H.exchange.mockRejectedValue(new Error('401'));
    await ensureSession();
    expect(sessionToken()).toBeUndefined();
  });
});

describe('kromaClient', () => {
  it('refreshes the bearer from the stored access token on a 401', async () => {
    H.session = { accessToken: 'stored' };
    H.exchange.mockResolvedValue({ token: 'bearer-2' });
    const setRefreshHandler = vi.spyOn(KromaClient.prototype, 'setRefreshHandler');

    const client = kromaClient();
    expect(client).toBeInstanceOf(KromaClient);

    const refresh = setRefreshHandler.mock.calls[0]?.[0];
    await expect(refresh?.()).resolves.toBe('bearer-2');
    expect(sessionToken()).toBe('bearer-2');
  });

  it('hands the refresh handler nothing to do when signed out', async () => {
    const setRefreshHandler = vi.spyOn(KromaClient.prototype, 'setRefreshHandler');
    kromaClient();
    const refresh = setRefreshHandler.mock.calls[0]?.[0];
    await expect(refresh?.()).resolves.toBeUndefined();
    expect(H.exchange).not.toHaveBeenCalled();
  });
});

describe('imageUrl', () => {
  it('returns null for a missing url', () => {
    expect(imageUrl(null)).toBeNull();
    expect(imageUrl(undefined)).toBeNull();
    expect(imageUrl('')).toBeNull();
  });

  it('passes absolute urls through untouched', () => {
    expect(imageUrl('https://image.tmdb.org/x.jpg')).toBe('https://image.tmdb.org/x.jpg');
    expect(imageUrl('http://x/y')).toBe('http://x/y');
  });

  it('resolves a relative path against the api base', () => {
    expect(imageUrl('/api/images/x.webp')).toBe(`${apiBase()}/api/images/x.webp`);
  });
});

describe('toMovieView / toShowView', () => {
  const client = new KromaClient({ baseUrl: 'http://kroma.test' });

  it('resolves art + stream + subtitle urls, gating image subs to null', () => {
    const item = {
      id: 'i1',
      subtitles: [
        { language: 'en', codec: 'subrip' },
        { language: 'fr', codec: 'hdmv_pgs_subtitle' },
      ],
      metadata: { posterUrl: '/api/p.webp', backdropUrl: null },
      video: null,
    } as never;
    const v = toMovieView(client, item);
    expect(v.poster).toBe('http://kroma.test/api/p.webp');
    expect(v.stream).toBe('http://kroma.test/api/items/i1/stream');
    expect(v.backdrop).toBeNull();
    // Text sub -> a WebVTT url; PGS image sub -> null.
    expect(v.subs[0]?.url).toBe('http://kroma.test/api/items/i1/subtitles/0.vtt');
    expect(v.subs[1]?.url).toBeNull();
    expect(v.subs[1]?.language).toBe('fr');
  });

  it('toShowView resolves show art', () => {
    const show = {
      id: 's1',
      metadata: { posterUrl: '/api/sp.webp', backdropUrl: '/api/sb.webp' },
    } as never;
    const sv = toShowView(client, show);
    expect(sv.poster).toBe('http://kroma.test/api/sp.webp');
    expect(sv.backdrop).toBe('http://kroma.test/api/sb.webp');
  });
});
