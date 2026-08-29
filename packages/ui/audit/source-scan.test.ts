import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { babelAt, NoCompiler, sourceFiles } from './source-scan';

function tree(): string {
  const root = mkdtempSync(join(tmpdir(), 'kroma-source-scan-'));
  mkdirSync(join(root, 'nested'), { recursive: true });
  for (const name of ['a.tsx', 'b.ts', 'c.css', 'd.test.tsx', 'e.story.tsx', 'f.fixtures.ts']) {
    writeFileSync(join(root, name), '');
  }
  writeFileSync(join(root, 'nested', 'g.tsx'), '');
  return root;
}

const namesIn = (root: string, options?: Parameters<typeof sourceFiles>[1]) =>
  [...sourceFiles(root, options)].map((at) => at.slice(root.length + 1)).sort();

describe('the source walk', () => {
  it('reads TypeScript and TSX from every directory below the one it is given', () => {
    const found = namesIn(tree());

    expect(found).toEqual(['a.tsx', 'b.ts', join('nested', 'g.tsx')]);
  });

  it('skips what never ships', () => {
    const found = namesIn(tree());

    expect(found).not.toContain('d.test.tsx');
    expect(found).not.toContain('e.story.tsx');
    expect(found).not.toContain('f.fixtures.ts');
  });

  it('takes the extensions and the exclusion from its caller', () => {
    const found = namesIn(tree(), { ext: ['.tsx'], skip: /nothing/ });

    expect(found).toEqual(['a.tsx', 'd.test.tsx', 'e.story.tsx', join('nested', 'g.tsx')]);
  });
});

describe('reaching the React Compiler', () => {
  it('resolves it from a package that depends on it', () => {
    const at = babelAt([join(process.cwd(), 'packages/bundler/package.json')]);

    expect(at.compiler).toContain('babel-plugin-react-compiler');
    expect(typeof at.core.transformAsync).toBe('function');
  });

  it('walks the candidates in order and takes the first that resolves', () => {
    const at = babelAt([
      join(process.cwd(), 'no/such/package.json'),
      join(process.cwd(), 'packages/bundler/package.json'),
    ]);

    expect(at.compiler).toContain('babel-plugin-react-compiler');
  });

  it('says which paths it tried when none of them has the compiler', () => {
    const tried = () => babelAt([join(process.cwd(), 'no/such/package.json')]);

    expect(tried).toThrow(NoCompiler);
    expect(tried).toThrow(/no\/such\/package\.json/);
  });
});
