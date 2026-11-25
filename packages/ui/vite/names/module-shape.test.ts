import { describe, expect, it } from 'vitest';
import { shapeOf } from './module-shape.ts';

const FILE = '/kit/probe.tsx';

const declared = (code: string, name: string) => shapeOf(code, FILE).declared.get(name);

describe('a declaration', () => {
  it('is function-like for a function, an arrow, a function expression or a call', () => {
    for (const code of [
      'function Probe() {}',
      'const Probe = () => null;',
      'const Probe = function () {};',
      'const Probe = memo(Inner);',
    ]) {
      expect(declared(code, 'Probe')).toEqual({ kind: 'function' });
    }
  });

  it('is a namespace for an object of PascalCase keys, holding identifiers or not', () => {
    const code = "const PageHeader = { Root, Back: tag(Back, 'back') };";

    expect(declared(code, 'PageHeader')).toEqual({
      kind: 'namespace',
      parts: [
        { key: 'Root', value: 'Root' },
        { key: 'Back', value: null },
      ],
    });
  });

  it('is neither for a spread, a method, a computed or a lowercase key, or an empty object', () => {
    for (const body of ['...Parts', 'Root() {}', '[KEY]: Root', 'useProbe', '']) {
      expect(declared(`const Probe = { ${body} };`, 'Probe')).toEqual({ kind: 'other' });
    }
  });

  it('is neither for a let or a value that is not code', () => {
    for (const code of ['let Probe = () => null;', "const Probe = 'x';", 'const Probe = Other;']) {
      expect(declared(code, 'Probe')).toEqual({ kind: 'other' });
    }
  });
});

describe('the exports', () => {
  it('reads inline exports, export lists and re-exports, and skips types', () => {
    const code = [
      'export function A() {}',
      'const B = 1;',
      'export { B as C, type D };',
      "export { E as F } from './e';",
      "export type { G } from './g';",
      "export * from './all';",
      "export type * from './types';",
      "export * as N from './n';",
    ].join('\n');

    const shape = shapeOf(code, FILE);

    expect(Object.fromEntries(shape.exports)).toEqual({
      A: { local: 'A' },
      C: { local: 'B' },
      F: { source: './e', imported: 'E' },
    });
    expect(shape.exportAll).toEqual(['./all']);
  });

  it('reads the imports a local export may be bound to, and skips types', () => {
    const code = "import X, { A as L, type T } from './y';\nimport type { U } from './u';";

    expect(Object.fromEntries(shapeOf(code, FILE).imports)).toEqual({
      X: { source: './y', imported: 'default' },
      L: { source: './y', imported: 'A' },
    });
  });

  it('is empty for a module that does not parse', () => {
    expect(shapeOf('export const = ', FILE).exports.size).toBe(0);
  });
});
