import { describe, expect, it } from 'vitest';
import { Artifact, Catalog, Entry } from './catalog';

const ARTIFACT = {
  target: 'aarch64-apple-darwin',
  file: 'tv.kroma.notes-aarch64-apple-darwin.kmod',
  url: 'https://modules.kroma.tv/tv.kroma.notes-aarch64-apple-darwin.kmod',
  size: 4096,
  sha256: 'aa',
  contentHash: 'bb',
};

const ENTRY = {
  id: 'tv.kroma.notes',
  name: 'Notes',
  version: '1.2.0',
  artifacts: [ARTIFACT],
  file: ARTIFACT.file,
  url: ARTIFACT.url,
  size: ARTIFACT.size,
  sha256: ARTIFACT.sha256,
};

describe('Artifact', () => {
  it('keeps the target, the file and both hashes', () => {
    expect(Artifact.parse(ARTIFACT)).toEqual(ARTIFACT);
  });

  it('refuses a build with no contentHash, which is what says a module moved', () => {
    const { contentHash: _dropped, ...without } = ARTIFACT;

    expect(() => Artifact.parse(without)).toThrow();
  });

  it('reads a universal build, whose target is null rather than missing', () => {
    expect(Artifact.parse({ ...ARTIFACT, target: null }).target).toBeNull();
    expect(() => Artifact.parse({ ...ARTIFACT, target: undefined })).toThrow();
  });
});

describe('Entry', () => {
  it('carries the manifest, the artifacts and the fields a schema-1 reader looks at', () => {
    expect(Entry.parse(ENTRY)).toEqual(ENTRY);
  });

  it('refuses a module that lists no builds', () => {
    const { artifacts: _dropped, ...without } = ENTRY;

    expect(() => Entry.parse(without)).toThrow();
  });
});

describe('Catalog', () => {
  it('reads a catalog that lists nothing as an empty one', () => {
    expect(Catalog.parse({ schema: 1 }).modules).toEqual([]);
  });

  it('reads a published catalog whole', () => {
    const parsed = Catalog.parse({
      schema: 1,
      generatedAt: '2026-01-01T00:00:00Z',
      modules: [ENTRY],
    });

    expect(parsed.modules[0]?.artifacts).toEqual([ARTIFACT]);
  });
});
