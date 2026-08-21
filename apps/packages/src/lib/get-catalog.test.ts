import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_REPO } from './catalog';

vi.mock('@tanstack/react-start/server', () => ({
  getRequest: () => new Request('https://packages.kroma.tv/browse?channel=canary'),
}));

const RELEASES = [
  {
    tag_name: 'v1.0.0',
    name: 'KROMA 1.0.0',
    draft: false,
    prerelease: false,
    published_at: '2026-07-01T00:00:00Z',
    html_url: 'https://github.com/o/r/releases/v1.0.0',
    assets: [
      {
        name: 'kroma-1.0.0-1-x86_64.spk',
        size: 2097152,
        browser_download_url: 'https://dl.test/kroma.spk',
      },
    ],
  },
];

// The in-memory catalog cache is keyed on the env object, which is the same one
// for the whole process: a fresh module graph per test keeps them independent.
async function payload(source: string) {
  vi.resetModules();
  const { catalogPayload } = await import('./get-catalog');
  return catalogPayload(source);
}

function ghServing(releases: unknown[]) {
  vi.stubGlobal('caches', undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (new URL(String(input)).hostname === 'api.github.com') return Response.json(releases);
      return new Response('', { status: 404 });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('catalogPayload', () => {
  it('turns every published release into a row DSM and the page agree on', async () => {
    ghServing(RELEASES);
    const { source, repo, fetchedAt, rows } = await payload('https://packages.kroma.tv/');
    expect(source).toBe('https://packages.kroma.tv/');
    expect(repo).toBe(DEFAULT_REPO);
    expect(fetchedAt).not.toBeNull();
    expect(rows).toEqual([
      {
        channel: 'stable',
        version: '1.0.0-1',
        day: '2026-07-01',
        size: '2.0 MB',
        spk: 'https://dl.test/kroma.spk',
        release: 'https://github.com/o/r/releases/v1.0.0',
        notes: '',
        md5: null,
      },
    ]);
  });

  it('serves the page an empty list rather than failing when GitHub is unreachable', async () => {
    vi.stubGlobal('caches', undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.7:443');
      }),
    );
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await payload('https://packages.kroma.tv/')).toEqual({
      source: 'https://packages.kroma.tv/',
      fetchedAt: null,
      repo: DEFAULT_REPO,
      rows: [],
    });
    expect(logged).toHaveBeenCalled();
  });
});

describe('catalogForRequest', () => {
  it('sources the catalog at the origin the page was reached at, path and query dropped', async () => {
    ghServing(RELEASES);
    vi.resetModules();
    const { catalogForRequest } = await import('./get-catalog');
    const { source, rows } = await catalogForRequest();
    expect(source).toBe('https://packages.kroma.tv/');
    expect(rows.map((r) => r.version)).toEqual(['1.0.0-1']);
  });
});
