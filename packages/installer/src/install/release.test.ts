import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAsset, type ReleaseAsset, releaseAssets } from './release';

const download = vi.hoisted(() =>
  vi.fn(async (_url: string, _dest: string, _log: unknown, _pinned?: unknown) => {}),
);
vi.mock('./download', () => ({ download }));

const base = mkdtempSync(join(tmpdir(), 'kroma-release-'));
const digest = (text: string) => createHash('sha256').update(text).digest('hex');

const listed = (over: Record<string, unknown> = {}) => ({
  name: 'KROMA-tizen-0.1.38.wgt',
  size: 10_199_496,
  digest: `sha256:${'f'.repeat(64)}`,
  browser_download_url:
    'https://github.com/kromatv/kroma/releases/download/v0.1.38/KROMA-tizen-0.1.38.wgt',
  updated_at: '2026-11-08T10:00:00Z',
  ...over,
});

const asked: string[] = [];
const answering = (body: unknown, status = 200) =>
  vi.stubGlobal('fetch', (url: string) => {
    asked.push(url);
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  });

const lines: string[] = [];
const log = (line: string) => lines.push(line);

beforeEach(() => {
  asked.length = 0;
  lines.length = 0;
  download.mockClear();
});

afterEach(() => vi.unstubAllGlobals());

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('releaseAssets', () => {
  it('reads the latest release for the stable channel', async () => {
    answering({ assets: [] });

    await releaseAssets('stable');

    expect(asked).toEqual(['https://api.github.com/repos/kromatv/kroma/releases/latest']);
  });

  it('reads the rolling prerelease for the canary channel', async () => {
    answering({ assets: [] });

    await releaseAssets('canary');

    expect(asked).toEqual(['https://api.github.com/repos/kromatv/kroma/releases/tags/canary']);
  });

  it('answers each asset with where it is, how big, and what it hashes to', async () => {
    answering({ assets: [listed()] });

    expect(await releaseAssets('stable')).toEqual([
      {
        name: 'KROMA-tizen-0.1.38.wgt',
        url: 'https://github.com/kromatv/kroma/releases/download/v0.1.38/KROMA-tizen-0.1.38.wgt',
        size: 10_199_496,
        sha256: 'f'.repeat(64),
        updatedMs: Date.parse('2026-11-08T10:00:00Z'),
      },
    ]);
  });

  it('answers no digest for an asset that lists none, or one of another kind', async () => {
    answering({ assets: [listed({ digest: null }), listed({ digest: 'md5:abc' })] });

    const assets = await releaseAssets('stable');

    expect(assets.map((asset) => asset.sha256)).toEqual([null, null]);
  });

  it('says what GitHub allows when it would not list the release', async () => {
    answering({ message: 'API rate limit exceeded' }, 403);

    await expect(releaseAssets('stable')).rejects.toThrow(
      'GitHub did not list the stable release. It answers 60 anonymous requests an hour',
    );
  });

  it('refuses a listing that is not a release', async () => {
    answering({ assets: [listed({ size: 'large' })] });

    await expect(releaseAssets('canary')).rejects.toThrow('GitHub did not list the canary release');
  });
});

describe('fetchAsset', () => {
  const asset = (over: Partial<ReleaseAsset> = {}): ReleaseAsset => ({
    name: 'KROMA-tizen-0.1.38.wgt',
    url: 'https://github.com/kromatv/kroma/releases/download/v0.1.38/KROMA-tizen-0.1.38.wgt',
    size: 6,
    sha256: digest('widget'),
    updatedMs: 0,
    ...over,
  });

  it('downloads the asset pinned to the size and digest its release lists', async () => {
    const directory = join(base, 'fresh');

    const path = await fetchAsset(asset(), directory, log);

    expect(path).toBe(join(directory, 'KROMA-tizen-0.1.38.wgt'));
    expect(download).toHaveBeenCalledWith(asset().url, path, log, {
      sha256: digest('widget'),
      size: 6,
    });
    expect(lines).toEqual(['downloading KROMA-tizen-0.1.38.wgt']);
  });

  it('keeps the file already here when it has the digest the release lists', async () => {
    const directory = join(base, 'kept');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'KROMA-tizen-0.1.38.wgt'), 'widget');

    await fetchAsset(asset(), directory, log);

    expect(download).not.toHaveBeenCalled();
  });

  it('downloads again over a file whose bytes are not the ones listed', async () => {
    const directory = join(base, 'stale');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'KROMA-tizen-0.1.38.wgt'), 'another build');

    await fetchAsset(asset(), directory, log);

    expect(download).toHaveBeenCalledTimes(1);
  });

  it('clears the builds an earlier run left in the folder', async () => {
    const directory = join(base, 'crowded');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'KROMA-tizen-0.1.37.wgt'), 'older');

    await fetchAsset(asset(), directory, log);

    expect(existsSync(join(directory, 'KROMA-tizen-0.1.37.wgt'))).toBe(false);
  });

  it('refuses an asset that lists nothing to check the download against', async () => {
    await expect(fetchAsset(asset({ sha256: null }), join(base, 'unpinned'), log)).rejects.toThrow(
      'KROMA-tizen-0.1.38.wgt lists no digest to check a download against',
    );
  });
});
