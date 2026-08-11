import { afterEach, describe, expect, it, vi } from 'vitest';
import { moduleIdInput, moduleVersions } from './get-module';

const RELEASES = [
  {
    tag_name: 'v0.2.0',
    published_at: '2026-02-01T00:00:00Z',
    assets: [{ name: 'modules.json', browser_download_url: 'https://dl.test/v0.2.0/modules.json' }],
  },
];

function upstream() {
  const calls: string[] = [];
  vi.stubGlobal('caches', undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith('https://api.github.com/')) return Response.json(RELEASES);
      return Response.json({ modules: [{ id: 'tv.kroma.vpn', version: '1.0.0' }] });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('moduleVersions', () => {
  it('reads back which version every recent release shipped', async () => {
    upstream();
    expect(await moduleVersions({ data: { id: 'tv.kroma.vpn' } })).toEqual([
      {
        version: '1.0.0',
        first: 'v0.2.0',
        firstAt: '2026-02-01T00:00:00Z',
        last: 'v0.2.0',
        url: null,
        size: null,
      },
    ]);
  });

  it('refuses an id that is not a module id, without ever reaching GitHub', async () => {
    const calls = upstream();
    for (const id of ['../../etc/passwd', 'a', '', 'tv kroma vpn', 'a'.repeat(65)]) {
      expect(await moduleVersions({ data: { id } })).toEqual([]);
    }
    expect(calls).toEqual([]);
  });
});

describe('moduleIdInput', () => {
  it('carries the id across and drops whatever else the caller attached', () => {
    const payload = { id: 'tv.kroma.vpn', repo: 'someone/fork' } as { id: string };
    expect(moduleIdInput(payload)).toEqual({ id: 'tv.kroma.vpn' });
  });
});
