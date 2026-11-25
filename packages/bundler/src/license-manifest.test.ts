import { describe, expect, it } from 'vitest';
import { licenseManifest, webAddress } from './license-manifest';
import type { Notice } from './notices';

const notice = (name: string, texts: string[], source: string | null = null): Notice => ({
  name,
  version: '1.0.0',
  license: 'MIT',
  source,
  texts,
});

describe('webAddress', () => {
  it.each([
    ['git+https://github.com/facebook/react.git', 'https://github.com/facebook/react'],
    ['git+ssh://git@github.com/video-dev/hls.js.git', 'https://github.com/video-dev/hls.js'],
    ['git@github.com:colinhacks/zod.git', 'https://github.com/colinhacks/zod'],
    ['git://github.com/a/b.git#main', 'https://github.com/a/b'],
    ['github:tanstack/query', 'https://github.com/tanstack/query'],
    ['  pmndrs/zustand ', 'https://github.com/pmndrs/zustand'],
    ['https://example.com/lib', 'https://example.com/lib'],
  ])('reads %s as %s', (raw, expected) => {
    expect(webAddress(raw)).toBe(expected);
  });

  it('drops what is not a web address', () => {
    expect([webAddress('svn://example.com/lib'), webAddress(null), webAddress('')]).toEqual([
      null,
      null,
      null,
    ]);
  });
});

describe('licenseManifest', () => {
  it('keeps each text once and points every package at the texts it ships', () => {
    const groups = [
      { kind: 'crate' as const, notices: [notice('serde', ['MIT text', 'Apache text'])] },
      { kind: 'npm' as const, notices: [notice('react', ['MIT text'])] },
    ];

    const manifest = licenseManifest(groups);

    expect(manifest.texts).toEqual(['MIT text', 'Apache text']);
    expect(manifest.entries.map((entry) => [entry.name, entry.texts])).toEqual([
      ['react', [0]],
      ['serde', [0, 1]],
    ]);
  });

  it('orders the packages by name, then a crate before a package of the same name', () => {
    const groups = [
      { kind: 'npm' as const, notices: [notice('semver', []), notice('ansi', [])] },
      { kind: 'crate' as const, notices: [notice('semver', [])] },
    ];

    const manifest = licenseManifest(groups);

    expect(manifest.entries.map((entry) => `${entry.kind}:${entry.name}`)).toEqual([
      'npm:ansi',
      'crate:semver',
      'npm:semver',
    ]);
  });

  it('links each package to its source as a web address', () => {
    const groups = [
      {
        kind: 'npm' as const,
        notices: [notice('react', [], 'git+https://github.com/facebook/react.git')],
      },
    ];

    const [entry] = licenseManifest(groups).entries;

    expect(entry).toEqual({
      kind: 'npm',
      name: 'react',
      version: '1.0.0',
      license: 'MIT',
      source: 'https://github.com/facebook/react',
      texts: [],
    });
  });
});
