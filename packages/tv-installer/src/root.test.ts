import { randomInt } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

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

async function rootStartedIn(cwd: string): Promise<string> {
  vi.spyOn(process, 'cwd').mockReturnValue(cwd);
  vi.resetModules();
  return (await import('./root')).root;
}

afterEach(() => vi.restoreAllMocks());

afterAll(() => {
  for (const base of bases) rmSync(base, { recursive: true, force: true });
});

describe('root', () => {
  it('is the checkout the run was started inside', async () => {
    const { base, directory } = checkout();
    manifest(base, JSON.stringify({ name: 'kroma' }));

    expect(await rootStartedIn(directory)).toBe(base);
  });

  it('walks past a workspace that is not the checkout itself', async () => {
    const { base, directory } = checkout();
    manifest(base, JSON.stringify({ name: 'kroma' }));
    manifest(directory, JSON.stringify({ name: '@kroma/tv-installer' }));

    expect(await rootStartedIn(directory)).toBe(base);
  });

  it('walks past a package.json nothing can parse', async () => {
    const { base, directory } = checkout();
    manifest(base, JSON.stringify({ name: 'kroma' }));
    manifest(directory, '{ this is not JSON');

    expect(await rootStartedIn(directory)).toBe(base);
  });

  it('walks past a package.json that names no package', async () => {
    const { base, directory } = checkout();
    manifest(base, JSON.stringify({ name: 'kroma' }));
    manifest(directory, JSON.stringify({ version: '0.0.0' }));

    expect(await rootStartedIn(directory)).toBe(base);
  });

  it('falls back to the checkout its own source sits in when started elsewhere', async () => {
    const { directory } = tree('outside', 'any', 'checkout');

    const found = await rootStartedIn(directory);

    expect(existsSync(join(found, 'packages', 'tv-installer', 'src', 'root.ts'))).toBe(true);
  });

  it('gives up before walking twenty-five levels up to a checkout', async () => {
    const levels = Array.from({ length: 25 }, (_, level) => `level-${level}`);
    const { base, directory } = tree(...levels);
    manifest(base, JSON.stringify({ name: 'kroma' }));

    expect(await rootStartedIn(directory)).not.toBe(base);
  });
});
