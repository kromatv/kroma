import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { kromaUI } from './index.ts';

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
  it('is the icon subset and the token expansion, in that order', () => {
    expect(kromaUI().map((p) => p.name)).toEqual(['kroma-ui', 'kroma-tokens']);
  });

  it('discovers the workspace root, so a shell config passes nothing', () => {
    expect(() => kromaUI()).not.toThrow();
  });

  it('builds against the root it is handed instead of discovering one', () => {
    expect(() => kromaUI({ repoRoot: '/no/such/workspace' })).toThrow(
      /not found under \/no\/such\/workspace/,
    );
  });

  it('skips the icon scan entirely when every glyph is wanted', () => {
    expect(() => kromaUI({ icons: 'full', repoRoot: '/no/such/workspace' })).not.toThrow();
  });

  it('walks past a package.json that is not the workspace root', () => {
    const dir = cwd({ 'package.json': '{ "name": "a-package-inside-nothing" }' });

    expect(() => kromaUI()).toThrow(`no workspace root above ${dir}`);
  });
});
