import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluate.ts';
import { ModuleLoader, parseModule, resolveModule, scopeOf, Unstatic } from './module-scope.ts';

const REPO = join(mkdtempSync(join(tmpdir(), 'kroma-atomic-')), 'repo');

mkdirSync(join(REPO, 'packages/ui/src/lib'), { recursive: true });
writeFileSync(
  join(REPO, 'packages/ui/src/lib/metrics.ts'),
  'export const CONTROL = { sm: { py: 6 } } as const;',
);
writeFileSync(
  join(REPO, 'packages/ui/src/lib/metrics.web.ts'),
  'export const CONTROL = { sm: { py: 8 } };',
);
writeFileSync(
  join(REPO, 'packages/ui/src/lib/index.ts'),
  "export * from './metrics';\nexport { GAP as SPACE } from './gap';",
);
writeFileSync(join(REPO, 'packages/ui/src/lib/gap.ts'), 'const GAP = 4 * 2;\nexport { GAP };');

const loader = new ModuleLoader({ repoRoot: REPO });

function probe(source: string, file = join(REPO, 'packages/ui/src/probe.ts')): unknown {
  const program = parseModule(`${source}\nexport const probe = PROBE;`, file);
  const scope = scopeOf(program, file);
  const init = scope.consts.get('probe');
  if (!init) throw new Error('no probe');
  return evaluate(init, scope, loader);
}

describe('evaluate', () => {
  it('reads literals, arithmetic, templates and a spread of a local constant', () => {
    const value = probe(`
      const GAP = 9;
      const BASE = { row: true, gap: GAP } as const;
      const PROBE = { ...BASE, px: -GAP * 2, name: \`x-\${GAP}\`, half: GAP / 2 };
    `);

    expect(value).toEqual({ row: true, gap: 9, px: -18, name: 'x-9', half: 4.5 });
  });

  it('reads a member of a constant, through satisfies and Object.freeze', () => {
    const value = probe(`
      const T = Object.freeze({ sm: { py: 6 } } satisfies Record<string, { py: number }>);
      const PROBE = { py: T.sm.py, pick: T['sm'].py ?? 0, on: true && 'yes' };
    `);

    expect(value).toEqual({ py: 6, pick: 6, on: 'yes' });
  });

  it('follows an import through the workspace, the web twin winning', () => {
    const value = probe(`
      import { CONTROL } from '#ui/lib/metrics';
      const PROBE = { py: CONTROL.sm.py };
    `);

    expect(value).toEqual({ py: 8 });
  });

  it('follows a re-export, renamed, and an export star', () => {
    const value = probe(`
      import { CONTROL, SPACE } from '#ui/lib';
      const PROBE = [CONTROL.sm.py, SPACE];
    `);

    expect(value).toEqual([8, 8]);
  });

  it('names what it cannot read', () => {
    expect(() => probe('const PROBE = { p: paddingOf(4) };')).toThrow(Unstatic);
    expect(() => probe('const PROBE = { p: paddingOf(4) };')).toThrow(/a call to paddingOf/);
    expect(() => probe('const PROBE = { p: outside };')).toThrow(/the binding outside/);
    expect(() => probe("import { x } from 'somewhere';\nconst PROBE = { x };")).toThrow(
      /x from somewhere/,
    );
    expect(() => probe("import { nope } from '#ui/lib';\nconst PROBE = { nope };")).toThrow(
      /does not export nope/,
    );
    expect(() => probe('let v = 1;\nconst PROBE = { v };')).toThrow(/the binding v/);
  });

  it('ignores type-only imports and exports when reading bindings', () => {
    const file = join(REPO, 'packages/ui/src/types.ts');
    const scope = scopeOf(
      parseModule(
        "import type { A } from './a';\nexport type { B } from './b';\nexport const C = 1;",
        file,
      ),
      file,
    );

    expect([...scope.imports.keys()]).toEqual([]);
    expect([...scope.exports.keys()]).toEqual(['C']);
  });
});

describe('resolveModule', () => {
  it('lands the kit aliases and relative paths on disk, with the extension found', () => {
    const from = join(REPO, 'packages/ui/src/probe.ts');

    expect(resolveModule('#ui/lib/gap', from, { repoRoot: REPO })).toBe(
      join(REPO, 'packages/ui/src/lib/gap.ts'),
    );
    expect(resolveModule('./lib', from, { repoRoot: REPO })).toBe(
      join(REPO, 'packages/ui/src/lib/index.ts'),
    );
    expect(resolveModule('react', from, { repoRoot: REPO })).toBeNull();
    expect(resolveModule('./missing', from, { repoRoot: REPO })).toBeNull();
  });

  it('does every arithmetic and unary operator a metric may be written with', () => {
    expect(probe('const PROBE = [1 + 2, 7 - 2, 3 * 4, 8 / 2, 9 % 4, 2 ** 3, -4, +4, !0];')).toEqual(
      [3, 5, 12, 4, 1, 8, -4, 4, true],
    );
    expect(
      probe("const PROBE = [0 || 5, 1 && 6, null ?? 7, 1 ? 'y' : 'n', 0 ? 'y' : 'n'];"),
    ).toEqual([5, 6, 7, 'y', 'n']);
  });

  it('names the operator it cannot do', () => {
    expect(() => probe('const PROBE = 1 < 2;')).toThrow(/the operator </);
    expect(() => probe("const PROBE = -'x';")).toThrow(/the operator -/);
    expect(() => probe("const PROBE = +'x';")).toThrow(/the operator \+/);
  });

  it('reads holes, spreads and joins of an array, and refuses a spread of anything else', () => {
    expect(probe('const A = [1, 2]; const PROBE = [0, , ...A];')).toEqual([0, null, 1, 2]);
    expect(probe("const A = ['a', 'b']; const PROBE = [A.join(), A.join('-')];")).toEqual([
      'a,b',
      'a-b',
    ]);
    expect(() => probe('const A = 1; const PROBE = [...A];')).toThrow(/a spread of a non-array/);
    expect(() => probe('const A = 1; const PROBE = { ...A };')).toThrow(/a spread of a non-object/);
  });

  it('refuses what is not a value: an accessor, a member of a number, a call, a function', () => {
    expect(() => probe('const PROBE = { get x() { return 1; } };')).toThrow(/a Property member/);
    expect(() => probe('const A = 1; const PROBE = A.x;')).toThrow(/a member of number/);
    expect(() => probe('const A = { b: {} }; const PROBE = A.b.c();')).toThrow(/a call to A\.b\.c/);
    expect(() => probe("const A = {}; const PROBE = A['x']();")).toThrow(
      /a call to MemberExpression/,
    );
    expect(() => probe('const PROBE = () => 1;')).toThrow(/a ArrowFunctionExpression/);
    expect(probe("const PROBE = { 'a-b': 1 };")).toEqual({ 'a-b': 1 });
  });

  it('follows a default import as far as the module goes', () => {
    expect(() => probe("import M from './lib/metrics';\nconst PROBE = M;")).toThrow(Unstatic);
  });

  it('gives up on a re-export chain deeper than a module graph should be', () => {
    for (let i = 0; i < 8; i++) {
      writeFileSync(
        join(REPO, `packages/ui/src/lib/chain${i}.ts`),
        i < 7 ? `export * from './chain${i + 1}';` : 'export const DEEP = 1;',
      );
    }
    expect(() => probe("import { DEEP } from './lib/chain0';\nconst PROBE = DEEP;")).toThrow(
      Unstatic,
    );
  });
});
