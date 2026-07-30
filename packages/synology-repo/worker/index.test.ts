// The DSM package-repository worker: what Synology's Package Center gets when
// it points at repo.kroma.tv, and what a browser gets when a human pastes the
// same URL.
//
// The routes matter more than they look. DSM asks for JSON with an urlencoded
// POST and no Accept header it means; a browser GETs the identical URL wanting
// HTML. Serving either one the other's answer is how a repository silently
// stops working, and there is no error to read when it does.

import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index';

type Ctx = { waitUntil: (p: Promise<unknown>) => void };
const ctx = (): Ctx => ({ waitUntil: vi.fn() });
const req = (path: string, init?: RequestInit) => new Request(`https://repo.kroma.tv${path}`, init);

// One published release carrying a .spk, which is all a catalog entry is.
const RELEASES = [
  {
    draft: false,
    prerelease: false,
    tag_name: 'v1.2.3',
    name: 'v1.2.3',
    published_at: '2026-07-01T00:00:00Z',
    html_url: 'https://github.com/o/r/releases/v1.2.3',
    assets: [
      {
        name: 'kroma-1.2.3-3439372-x86_64.spk',
        browser_download_url: 'https://dl/kroma-1.2.3.spk',
        size: 1024,
      },
    ],
  },
];

// GitHub answers the releases API; every other fetch (the .info.json sidecar,
// the icon) 404s, which the catalog treats as "no extra detail".
function githubServing(releases: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      // Match on the HOST, not on a substring of the URL: `includes` would
      // also accept https://api.github.com.evil.test/ and, in a stub that
      // stands in for the real API, a sloppy match teaches a sloppy shape.
      const { hostname } = new URL(String(input));
      if (hostname === 'api.github.com') {
        return new Response(JSON.stringify(releases), { status: 200 });
      }
      return new Response('', { status: 404 });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('synology repo worker', () => {
  it('answers /ping without touching GitHub', async () => {
    const res = await worker.fetch(req('/ping'), {}, ctx());
    expect(await res.text()).toBe('pong');
  });

  // Without this, /favicon.ico falls through to the JSON catch-all, and a
  // browser caches that JSON body as the tab icon.
  it('serves the brand mark at /favicon.svg and /favicon.ico, never the catalog', async () => {
    for (const path of ['/favicon.svg', '/favicon.ico']) {
      const res = await worker.fetch(req(path), {}, ctx());
      expect(res.headers.get('content-type')).toBe('image/svg+xml');
      expect(await res.text()).toContain('aria-label="KROMA"');
    }
  });

  it('offers the stable release as a DSM package', async () => {
    githubServing(RELEASES);
    const res = await worker.fetch(req('/catalog.json'), {}, ctx());
    const body = (await res.json()) as { packages: { version: string }[] };
    expect(body.packages).toHaveLength(1);
    expect(body.packages[0]?.version).toBe('1.2.3-3439372');
  });

  it('lists every channel on /all.json', async () => {
    githubServing(RELEASES);
    const res = await worker.fetch(req('/all.json'), {}, ctx());
    const body = (await res.json()) as { repo: string; packages: { channel: string }[] };
    expect(body.repo).toBeTruthy();
    expect(body.packages.map((p) => p.channel)).toContain('stable');
  });

  it('renders the landing page as HTML for a human', async () => {
    githubServing(RELEASES);
    const res = await worker.fetch(req('/browse'), {}, ctx());
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('<');
  });

  it('degrades to an empty package list when GitHub is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const res = await worker.fetch(req('/catalog.json'), {}, ctx());
    expect(res.status).toBe(503);
    const body = (await res.json()) as { packages: unknown[]; error: string };
    expect(body.packages).toEqual([]);
    expect(body.error).toBe('catalog unavailable');
  });

  // This endpoint is public and unauthenticated: `String(err)` on a failed fetch
  // names the upstream URL and repeats whatever a thrown message carries.
  it('does not disclose the upstream failure to the caller', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.7:443 fetching secret-host');
      }),
    );
    const res = await worker.fetch(req('/catalog.json'), {}, ctx());
    const raw = await res.text();
    expect(raw).not.toContain('ECONNREFUSED');
    expect(raw).not.toContain('secret-host');
    expect(raw).not.toContain('10.0.0.7');
  });

  it('treats a trailing slash as the same route', async () => {
    githubServing(RELEASES);
    const res = await worker.fetch(req('/catalog.json/'), {}, ctx());
    expect(res.status).toBe(200);
  });
});
