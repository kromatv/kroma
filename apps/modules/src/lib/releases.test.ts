import { afterEach, describe, expect, it, vi } from 'vitest';
import { releaseHistory } from './releases';

const DIGEST = `sha256:${'ab'.repeat(32)}`;
const SRI = `sha256-${btoa(String.fromCharCode(...Array(32).fill(0xab)))}`;

const asset = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  size: 10,
  browser_download_url: `https://dl/${name}`,
  digest: DIGEST,
  ...over,
});

const RELEASES = [
  { tag_name: 'tv.kroma.torrents@0.1.7', assets: [asset('tv.kroma.torrents-x86_64-linux.kmod')] },
  { tag_name: 'tv.kroma.torrents@0.1.6', assets: [asset('tv.kroma.torrents-x86_64-linux.kmod')] },
  { tag_name: 'tv.kroma.scene@0.1.0', assets: [asset('tv.kroma.scene.kmod')] },
  // Not a module release, and not a module asset.
  { tag_name: 'v0.1.38', assets: [asset('kroma-server.tar.gz')] },
  { tag_name: 'modules', assets: [asset('modules.json')] },
  { tag_name: 'tv.kroma.draft@9.9.9', draft: true, assets: [asset('tv.kroma.draft.kmod')] },
];

function serving(pages: unknown[][]) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      const page = Number(new URL(String(input)).searchParams.get('page') ?? '1');
      return new Response(JSON.stringify(pages[page - 1] ?? []));
    }),
  );
  return calls;
}

const noCache = () => vi.stubGlobal('caches', undefined);
const bg = () => vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('releaseHistory', () => {
  it('collects every version of every module from its own release tag', async () => {
    noCache();
    serving([RELEASES]);
    const history = await releaseHistory({}, bg());
    expect(Object.keys(history).sort()).toEqual(['tv.kroma.scene', 'tv.kroma.torrents']);
    expect(Object.keys(history['tv.kroma.torrents']?.versions ?? {}).sort()).toEqual([
      '0.1.6',
      '0.1.7',
    ]);
  });

  it('turns the digest GitHub computed into the wire format integrity', async () => {
    noCache();
    serving([RELEASES]);
    const history = await releaseHistory({}, bg());
    const artifact = history['tv.kroma.torrents']?.versions?.['0.1.7']?.artifacts[0];
    expect(artifact).toMatchObject({ target: 'x86_64-linux', size: 10, integrity: SRI });
  });

  it('reads the target off the filename, null for a bundle with no native binary', async () => {
    noCache();
    serving([RELEASES]);
    const history = await releaseHistory({}, bg());
    expect(history['tv.kroma.scene']?.versions?.['0.1.0']?.artifacts[0]?.target).toBeNull();
  });

  it('drops an asset with no digest rather than offering one nothing vouches for', async () => {
    noCache();
    serving([
      [{ tag_name: 'tv.kroma.x@1.0.0', assets: [asset('tv.kroma.x.kmod', { digest: null })] }],
    ]);
    expect(await releaseHistory({}, bg())).toEqual({});
  });

  it('pages until the listing is short, and never past the cap', async () => {
    noCache();
    const full = Array.from({ length: 100 }, (_, i) => ({
      tag_name: `tv.kroma.m${i}@1.0.0`,
      assets: [asset(`tv.kroma.m${i}.kmod`)],
    }));
    const calls = serving([full, full, full, full]);
    await releaseHistory({}, bg());
    expect(calls).toHaveLength(3);
    expect(calls[0]).toContain('page=1');
  });

  it('stops as soon as a page is not full', async () => {
    noCache();
    const calls = serving([RELEASES]);
    await releaseHistory({}, bg());
    expect(calls).toHaveLength(1);
  });

  it('reads the configured repo', async () => {
    noCache();
    const calls = serving([RELEASES]);
    await releaseHistory({ GITHUB_REPO: 'someone/fork' }, bg());
    expect(calls[0]).toContain('https://api.github.com/repos/someone/fork/releases');
  });

  it('is empty rather than an error when the listing cannot be read', async () => {
    noCache();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 403 })),
    );
    expect(await releaseHistory({}, bg())).toEqual({});
  });
});
