import { afterEach, describe, expect, it, vi } from 'vitest';
import { moduleIdInput, moduleVersions } from './get-module';

const RELEASES = [
  {
    tag_name: 'tv.kroma.vpn@1.0.0',
    published_at: '2026-02-01T00:00:00Z',
    assets: [
      {
        name: 'tv.kroma.vpn-x86_64-unknown-linux-musl.kmod',
        browser_download_url: 'https://dl.test/vpn.kmod',
        size: 42,
      },
    ],
  },
];

function upstream() {
  const calls: string[] = [];
  vi.stubGlobal('caches', undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return Response.json(RELEASES);
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('moduleVersions', () => {
  it('reads back every version the module has released', async () => {
    upstream();
    expect(await moduleVersions({ data: { id: 'tv.kroma.vpn' } })).toEqual([
      {
        version: '1.0.0',
        tag: 'tv.kroma.vpn@1.0.0',
        publishedAt: '2026-02-01T00:00:00Z',
        url: 'https://dl.test/vpn.kmod',
        size: 42,
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
