import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { foldAlphas, scanAlphas } from './alpha-scan';

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
  mkdirSync(join(root, '.expo'), { recursive: true });
  writeFileSync(join(root, '.expo', 'e.ts'), `const x = 'accent/33';`);
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
    expect(found.has('accent/33')).toBe(false);
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

describe('foldAlphas', () => {
  const said = (source: string) => () => source;

  it('stays out of a scan that has not happened, since there is nothing to widen', async () => {
    const fresh = new Set(['accent']);
    expect(await foldAlphas([root], fresh, join(root, 'a.tsx'), said(`'accent/45'`))).toBe(false);
  });

  it('takes a step a file names for the first time, without walking again', async () => {
    scanAlphas([root], KNOWN);

    expect(await foldAlphas([root], KNOWN, join(root, 'new.tsx'), said(`'accent/45'`))).toBe(true);
    expect(scanAlphas([root], KNOWN).has('accent/45')).toBe(true);
  });

  it('answers false for a step the stylesheet already carries', async () => {
    expect(await foldAlphas([root], KNOWN, join(root, 'a.tsx'), said(`'accent/12'`))).toBe(false);
  });

  it('reads only what the walk itself reads, so dev cannot drift from the build', async () => {
    const outside = [
      join(root, 'a.test.ts'),
      join(root, 'a.stories.tsx'),
      join(root, 'node_modules', 'd.ts'),
      join(root, '.expo', 'e.ts'),
      join(root, 'notes.md'),
      join(root, '..', 'elsewhere.ts'),
    ];

    for (const file of outside) {
      expect(await foldAlphas([root], KNOWN, file, said(`'accent/46'`))).toBe(false);
    }
    expect(scanAlphas([root], KNOWN).has('accent/46')).toBe(false);
  });
});
