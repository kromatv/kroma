import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { iconPass } from '../bundler/index.ts';
import { alphaPass } from './alpha-scan.ts';
import { kromaUI } from './index.ts';
import { KNOWN_COLOR_NAMES, SOURCE_ROOTS } from './tokens.ts';

const REPO = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

function cwd(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'kroma-ui-vite-'));
  for (const [name, source] of Object.entries(files)) writeFileSync(join(dir, name), source);
  vi.spyOn(process, 'cwd').mockReturnValue(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('kromaUI', () => {
  it('is the scan, the icon subset, the tokens, the font preload and the compiler, in order', () => {
    expect(kromaUI().map((p) => p.name)).toEqual([
      'kroma-scan',
      'kroma-ui',
      'kroma-tokens',
      'kroma-font-preload',
      'kroma-atomic',
    ]);
  });

  it('leaves the compiler out when asked', () => {
    expect(kromaUI({ atomic: false }).map((p) => p.name)).not.toContain('kroma-atomic');
  });

  it('answers both collectors from one walk, and only on a build', () => {
    const scan = kromaUI().find((plugin) => plugin.name === 'kroma-scan');
    if (!scan || !('apply' in scan)) throw new Error('kromaUI() lost its scan');
    expect(scan.apply).toBe('build');
    expect(alphaPass(SOURCE_ROOTS, KNOWN_COLOR_NAMES)).not.toBeNull();

    scan.buildStart();

    // Null on both sides is the walk each would otherwise have made itself.
    expect(alphaPass(SOURCE_ROOTS, KNOWN_COLOR_NAMES)).toBeNull();
    expect(iconPass(REPO)).toBeNull();
  }, 30_000);

  it('discovers the workspace root, so a shell config passes nothing', () => {
    expect(() => kromaUI()).not.toThrow();
  });

  it('builds against the root it is handed instead of discovering one', () => {
    expect(() => kromaUI({ repoRoot: '/no/such/workspace' })).toThrow(
      /not found under \/no\/such\/workspace/,
    );
  });

  it('skips the icon scan entirely when every glyph is wanted', () => {
    const plugins = kromaUI({ icons: 'full', repoRoot: '/no/such/workspace' });
    const scan = plugins.find((plugin) => plugin.name === 'kroma-scan');
    if (!scan || !('apply' in scan)) throw new Error('kromaUI() lost its scan');

    // Reaching Tabler from a root that has none is what the subset would do
    // here, and the walk carries no icon collector to do it.
    expect(() => scan.buildStart()).not.toThrow();
    expect(() => iconPass('/no/such/workspace')).toThrow();
  });

  it('walks past a package.json that is not the workspace root', () => {
    const dir = cwd({ 'package.json': '{ "name": "a-package-inside-nothing" }' });

    expect(() => kromaUI()).toThrow(`no workspace root above ${dir}`);
  });
});
