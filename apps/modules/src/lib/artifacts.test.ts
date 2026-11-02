import { describe, expect, it } from 'vitest';
import type { ModuleEntry } from '#site/catalog';
import { download } from './artifacts';

type Artifact = ModuleEntry['artifacts'][number];

const artifact = (url: string | null, size?: number): Artifact => ({
  url,
  size,
  sha256: null,
  contentHash: null,
});

const entry = (over: Partial<ModuleEntry> = {}): ModuleEntry => ({
  id: 'tv.kroma.vpn',
  name: 'VPN',
  version: '1.0.0',
  artifacts: [],
  url: null,
  sha256: null,
  ...over,
});

describe('download', () => {
  it('offers the one bundle of a module, its size and its checksum', () => {
    const digest = 'a'.repeat(64);

    const offered = download(
      entry({
        artifacts: [
          { url: 'https://dl.test/vpn.kmod', size: 4096, sha256: digest, contentHash: null },
        ],
      }),
    );

    expect(offered).toEqual({ url: 'https://dl.test/vpn.kmod', size: 4096, sha256: digest });
  });

  it('passes over an artifact the catalog listed without a usable url', () => {
    const offered = download(
      entry({ artifacts: [artifact(null), artifact('https://dl.test/vpn.kmod')] }),
    );

    expect(offered?.url).toBe('https://dl.test/vpn.kmod');
  });

  it('falls back to the top-level artifact of an older catalog', () => {
    expect(download(entry({ url: 'https://dl.test/one.kmod', size: 12 }))).toEqual({
      url: 'https://dl.test/one.kmod',
      size: 12,
      sha256: null,
    });
    expect(download(entry({ url: 'https://dl.test/one.kmod' }))).toEqual({
      url: 'https://dl.test/one.kmod',
      size: null,
      sha256: null,
    });
  });

  it('prefers the listed artifact over the top-level one', () => {
    const offered = download(
      entry({
        url: 'https://dl.test/default.kmod',
        artifacts: [artifact('https://dl.test/vpn.kmod')],
      }),
    );

    expect(offered?.url).toBe('https://dl.test/vpn.kmod');
  });

  it('offers nothing for an entry with no artifact anywhere', () => {
    expect(download(entry())).toBeNull();
    expect(download(entry({ artifacts: [artifact(null)] }))).toBeNull();
  });
});
