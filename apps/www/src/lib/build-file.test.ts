import { describe, expect, it } from 'vitest';
import { fromCanaryFile, fromDownload } from './build-file.ts';
import type { CanaryFile } from './canary.ts';
import type { SiteDownload } from './releases.ts';

const release = (over: Partial<SiteDownload> = {}): SiteDownload =>
  ({
    target: 'macos',
    name: 'KROMA_0.1.38_aarch64.dmg',
    url: 'https://github.com/x/y/releases/download/v0.1.38/KROMA_0.1.38_aarch64.dmg',
    bytes: 52_807_435,
    sha256: 'a'.repeat(64),
    builtAt: '2026-08-14T02:17:00Z',
    ...over,
  }) as SiteDownload;

const canary = (over: Partial<CanaryFile> = {}): CanaryFile => ({
  target: 'tizen',
  label: 'Samsung',
  contains: ['.wgt'],
  bytes: 11_115_004,
  url: 'https://kroma.tv/api/canary/dl/1/tizen',
  ...over,
});

describe('fromDownload', () => {
  it('reads a release asset as the row renders it', () => {
    const file = fromDownload(release());

    expect(file.platform).toBe('macOS');
    expect(file.kind).toBe('.dmg');
    expect(file.meta).toBe('50.4 MB · Apple silicon');
    expect(file.sha256).toBe('a'.repeat(64));
  });

  it('leaves the architecture out for a platform that ships one build', () => {
    const wgt = release({ target: 'tizen', name: 'KROMA-tizen-0.1.38.wgt', bytes: 11_115_004 });

    expect(fromDownload(wgt).meta).toBe('10.6 MB');
  });

  it('carries the platform glyph, so a list with no heading still says which', () => {
    expect(fromDownload(release()).icon).toBeDefined();
  });

  it('carries a null digest through rather than inventing one', () => {
    expect(fromDownload(release({ sha256: null })).sha256).toBeNull();
  });
});

describe('fromCanaryFile', () => {
  it('reads a run artifact, which names a platform but no single file', () => {
    const file = fromCanaryFile(canary());

    expect(file.platform).toBe('Samsung');
    expect(file.kind).toBe('.wgt');
    expect(file.name).toBe('Samsung (zip)');
    expect(file.icon).toBeDefined();
  });

  it('spells every extension a zip carries', () => {
    expect(fromCanaryFile(canary({ target: 'linux', contains: ['.AppImage', '.deb'] })).kind).toBe(
      '.AppImage .deb',
    );
  });

  it('has no glyph for a platform this site does not offer', () => {
    expect(fromCanaryFile(canary({ target: 'plan9' })).icon).toBeUndefined();
  });
});
