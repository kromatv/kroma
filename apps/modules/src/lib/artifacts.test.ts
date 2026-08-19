import { describe, expect, it } from 'vitest';
import type { ModuleEntry } from '#site/catalog';
import { downloads } from './artifacts';

type Artifact = NonNullable<ModuleEntry['artifacts']>[number];

const artifact = (target: string | null, url: string | null, size?: number): Artifact => ({
  target,
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

describe('downloads', () => {
  it('puts the likeliest platform first and an unknown target last', () => {
    const listed = downloads(
      entry({
        artifacts: [
          artifact('riscv64-unknown-linux-gnu', 'https://dl.test/riscv.kmod'),
          artifact('x86_64-apple-darwin', 'https://dl.test/mac-intel.kmod'),
          artifact('x86_64-unknown-linux-musl', 'https://dl.test/linux-x64.kmod'),
          artifact('aarch64-apple-darwin', 'https://dl.test/mac-arm.kmod'),
          artifact('aarch64-unknown-linux-musl', 'https://dl.test/linux-arm.kmod'),
        ],
      }),
    );

    expect(listed.map((d) => d.target)).toEqual([
      'x86_64-unknown-linux-musl',
      'aarch64-unknown-linux-musl',
      'aarch64-apple-darwin',
      'x86_64-apple-darwin',
      'riscv64-unknown-linux-gnu',
    ]);
  });

  it('carries the size and the checksum through', () => {
    const digest = 'a'.repeat(64);
    expect(
      downloads(
        entry({
          artifacts: [
            {
              target: 'x86_64-unknown-linux-musl',
              url: 'https://dl.test/a.kmod',
              size: 4096,
              sha256: digest,
              contentHash: null,
            },
          ],
        }),
      ),
    ).toEqual([
      {
        target: 'x86_64-unknown-linux-musl',
        url: 'https://dl.test/a.kmod',
        size: 4096,
        sha256: digest,
      },
    ]);
  });

  it('drops an artifact the catalog listed without a usable url', () => {
    const listed = downloads(
      entry({
        artifacts: [
          artifact('x86_64-unknown-linux-musl', null),
          artifact('aarch64-apple-darwin', 'https://dl.test/mac.kmod'),
        ],
      }),
    );
    expect(listed.map((d) => d.url)).toEqual(['https://dl.test/mac.kmod']);
  });

  it('sorts an artifact that names no target behind every one that does', () => {
    const listed = downloads(
      entry({
        artifacts: [
          artifact(null, 'https://dl.test/any.kmod'),
          artifact('x86_64-unknown-linux-musl', 'https://dl.test/linux.kmod'),
        ],
      }),
    );
    expect(listed).toEqual([
      {
        target: 'x86_64-unknown-linux-musl',
        url: 'https://dl.test/linux.kmod',
        size: null,
        sha256: null,
      },
      { target: null, url: 'https://dl.test/any.kmod', size: null, sha256: null },
    ]);
  });

  it('falls back to the top-level artifact of a single-file module', () => {
    expect(downloads(entry({ url: 'https://dl.test/one.kmod', size: 12 }))).toEqual([
      { target: null, url: 'https://dl.test/one.kmod', size: 12, sha256: null },
    ]);
    expect(downloads(entry({ url: 'https://dl.test/one.kmod' }))).toEqual([
      { target: null, url: 'https://dl.test/one.kmod', size: null, sha256: null },
    ]);
  });

  it('prefers the listed artifacts over the top-level one', () => {
    const listed = downloads(
      entry({
        url: 'https://dl.test/default.kmod',
        artifacts: [artifact('aarch64-apple-darwin', 'https://dl.test/mac.kmod')],
      }),
    );
    expect(listed.map((d) => d.url)).toEqual(['https://dl.test/mac.kmod']);
  });

  it('offers nothing at all for an entry with no artifact anywhere', () => {
    expect(downloads(entry())).toEqual([]);
    expect(downloads(entry({ artifacts: [] }))).toEqual([]);
    expect(downloads(entry({ artifacts: [artifact('x86_64-apple-darwin', null)] }))).toEqual([]);
  });
});
