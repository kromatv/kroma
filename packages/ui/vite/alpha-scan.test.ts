import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scanAlphas } from './alpha-scan';

const KNOWN = new Set(['accent', 'text', 'tint', 'bg']);

let root = '';

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'kroma-alpha-scan-'));
  mkdirSync(join(root, 'nested'), { recursive: true });
  mkdirSync(join(root, 'node_modules'), { recursive: true });

  writeFileSync(
    join(root, 'a.tsx'),
    `const s = sv({ base: { bg: 'accent/12', color: "text/85" } });`,
  );
  writeFileSync(join(root, 'nested', 'b.ts'), `const wash = { borderColor: 'tint/2.5' };`);
  writeFileSync(join(root, 'nested', 'c.md'), `bg: 'accent/99'`);
  writeFileSync(join(root, 'a.test.ts'), `expect(color('bg/50')).toBe('x');`);
  writeFileSync(join(root, 'a.stories.tsx'), `<Box bg="bg/60" />`);
  writeFileSync(join(root, 'node_modules', 'd.ts'), `const x = 'accent/77';`);
  writeFileSync(join(root, 'noise.ts'), `fetch('kroma/api'); const r = 'rgb(255 0 0 / 50%)';`);
  symlinkSync(join(root, 'gone.ts'), join(root, 'dangling.ts'));
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('scanAlphas', () => {
  it('finds every alpha step the source writes, at any depth', () => {
    expect(scanAlphas([root], KNOWN)).toEqual(new Set(['accent/12', 'text/85', 'tint/2.5']));
  });

  it('reads only TypeScript that ships, so a fixture cannot inflate the stylesheet', () => {
    const found = scanAlphas([root], KNOWN);
    expect(found.has('bg/50')).toBe(false);
    expect(found.has('bg/60')).toBe(false);
    expect(found.has('accent/99')).toBe(false);
    expect(found.has('accent/77')).toBe(false);
  });

  it('ignores a slash that is not an alpha suffix', () => {
    expect(scanAlphas([root], new Set(['kroma', 'rgb']))).toEqual(new Set());
  });

  it('answers empty for a root that does not exist rather than throwing', () => {
    expect(scanAlphas([join(root, 'nope')], KNOWN)).toEqual(new Set());
  });

  it('walks past a source file it cannot read, rather than failing the build', () => {
    expect(scanAlphas([root], new Set([...KNOWN, 'surface1']))).toEqual(
      new Set(['accent/12', 'text/85', 'tint/2.5']),
    );
  });
});
