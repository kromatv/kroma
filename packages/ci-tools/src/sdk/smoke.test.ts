import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { tarballIn, wireToTarball } from './smoke';

vi.mock('bun', () => ({ $: () => {} }));

const STAGED = mkdtempSync(join(tmpdir(), 'kroma-sdk-staged-'));
const EMPTY = mkdtempSync(join(tmpdir(), 'kroma-sdk-empty-'));

writeFileSync(join(STAGED, 'kromatv-sdk-0.1.40.tgz'), '');
writeFileSync(join(STAGED, 'package.json'), '{}');

afterAll(() => {
  rmSync(STAGED, { recursive: true, force: true });
  rmSync(EMPTY, { recursive: true, force: true });
});

describe('tarballIn', () => {
  it('picks the SDK tarball out of whatever else staging left behind', () => {
    expect(tarballIn(STAGED)).toBe(join(STAGED, 'kromatv-sdk-0.1.40.tgz'));
  });

  it('says to stage first when there is no tarball to smoke', () => {
    expect(() => tarballIn(EMPTY)).toThrow(/no @kromatv\/sdk tarball in .*run `sdk stage` first/);
  });
});

describe('wireToTarball', () => {
  it('points the SDK at the staged file in both tables and leaves the rest alone', () => {
    const manifest = JSON.stringify({
      name: 'tv.kroma.smoke',
      dependencies: { '@kromatv/sdk': '^0.1.0', zod: '^4' },
      devDependencies: { '@kromatv/sdk': '^0.1.0', typescript: '^7' },
    });

    const pkg = JSON.parse(wireToTarball(manifest, '/staged/kromatv-sdk-0.1.40.tgz'));

    expect(pkg.dependencies).toEqual({
      '@kromatv/sdk': 'file:/staged/kromatv-sdk-0.1.40.tgz',
      zod: '^4',
    });
    expect(pkg.devDependencies).toEqual({
      '@kromatv/sdk': 'file:/staged/kromatv-sdk-0.1.40.tgz',
      typescript: '^7',
    });
    expect(pkg.name).toBe('tv.kroma.smoke');
  });

  it('rewrites nothing when the manifest never names the SDK', () => {
    const manifest = JSON.stringify({ dependencies: { zod: '^4' } });

    const pkg = JSON.parse(wireToTarball(manifest, '/staged/kromatv-sdk-0.1.40.tgz'));

    expect(pkg.dependencies).toEqual({ zod: '^4' });
  });
});
