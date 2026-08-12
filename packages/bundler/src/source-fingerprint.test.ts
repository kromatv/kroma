import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scanSources, statLine } from './source-fingerprint';

let root = '';

function tree(): string {
  root = mkdtempSync(join(tmpdir(), 'kroma-fingerprint-'));
  mkdirSync(join(root, 'atoms'), { recursive: true });
  writeFileSync(join(root, 'index.ts'), 'export {};');
  writeFileSync(join(root, 'atoms', 'chip.tsx'), 'export const Chip = () => null;');
  writeFileSync(join(root, 'atoms', 'chip.css'), '.chip {}');
  writeFileSync(join(root, 'atoms', 'button.tsx'), 'export const Button = () => null;');
  return root;
}

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = '';
});

describe('statLine', () => {
  it('names a file by its size and the moment it was last written', async () => {
    const at = tree();
    const path = join(at, 'index.ts');
    const first = await statLine(path);
    expect(first.startsWith(`${path}:`)).toBe(true);
    utimesSync(path, new Date(0), new Date(0));
    expect(await statLine(path)).not.toBe(first);
  });

  it('says a file is absent, which is a fingerprint of its own', async () => {
    const path = join(tree(), 'never-written.ts');
    expect(await statLine(path)).toBe(`${path}:absent`);
  });
});

describe('scanSources', () => {
  it('takes the TypeScript the filter accepts, in one order whatever the walk gave', async () => {
    const at = tree();
    expect(await scanSources(at, () => true)).toEqual([
      join(at, 'atoms', 'button.tsx'),
      join(at, 'atoms', 'chip.tsx'),
      join(at, 'index.ts'),
    ]);
  });

  it('leaves out what the filter refuses', async () => {
    const at = tree();
    const found = await scanSources(at, (path) => path.endsWith('.tsx'));
    expect(found).toEqual([join(at, 'atoms', 'button.tsx'), join(at, 'atoms', 'chip.tsx')]);
  });
});
