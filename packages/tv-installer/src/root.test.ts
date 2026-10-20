import { randomInt } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findRoot } from './root';

const bases: string[] = [];

function tree(...segments: string[]): { base: string; directory: string } {
  const base = mkdtempSync(join(tmpdir(), 'kroma-root-'));
  bases.push(base);
  const directory = join(base, ...segments);
  mkdirSync(directory, { recursive: true });
  return { base, directory };
}

const manifest = (directory: string, contents: string) =>
  writeFileSync(join(directory, 'package.json'), contents);

const checkout = () => tree('packages', `tv-installer-${randomInt(1000, 9999)}`, 'src');

afterAll(() => {
  for (const base of bases) rmSync(base, { recursive: true, force: true });
});

describe('root', () => {
  it('is the checkout the run was started inside', () => {
    const { base, directory } = checkout();
    manifest(base, JSON.stringify({ name: 'kroma' }));

    expect(findRoot(directory)).toBe(base);
  });

  it('walks past a workspace that is not the checkout itself', () => {
    const { base, directory } = checkout();
    manifest(base, JSON.stringify({ name: 'kroma' }));
    manifest(directory, JSON.stringify({ name: '@kromatv/tv-installer' }));

    expect(findRoot(directory)).toBe(base);
  });

  it('walks past a package.json nothing can parse', () => {
    const { base, directory } = checkout();
    manifest(base, JSON.stringify({ name: 'kroma' }));
    manifest(directory, '{ this is not JSON');

    expect(findRoot(directory)).toBe(base);
  });

  it('walks past a package.json that names no package', () => {
    const { base, directory } = checkout();
    manifest(base, JSON.stringify({ name: 'kroma' }));
    manifest(directory, JSON.stringify({ version: '0.0.0' }));

    expect(findRoot(directory)).toBe(base);
  });

  it('falls back to the checkout its own source sits in when started elsewhere', () => {
    const { directory } = tree('outside', 'any', 'checkout');

    const found = findRoot(directory);

    expect(existsSync(join(found, 'packages', 'tv-installer', 'src', 'root.ts'))).toBe(true);
  });

  it('gives up before walking twenty-five levels up to a checkout', () => {
    const levels = Array.from({ length: 25 }, (_, level) => `level-${level}`);
    const { base, directory } = tree(...levels);
    manifest(base, JSON.stringify({ name: 'kroma' }));

    expect(findRoot(directory)).not.toBe(base);
  });
});
