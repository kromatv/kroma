import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanText, scanTrees } from './memo-scan';
import { type Babel, babelAt } from './source-scan';

const BABEL = babelAt([join(process.cwd(), 'packages/bundler/package.json')]);

const COPY = `
  import { useCallback } from 'react';
  export function Copy({ value, label, copy }: { value: string; label: string; copy: (v: string) => void }) {
    const onPress = useCallback(() => copy(value), [copy, value]);
    return <Button onPress={onPress} label={label} />;
  }
`;

const ROWS = `
  import { useMemo } from 'react';
  import { rowsOf } from './rows';
  export function List({ items, picked }: { items: string[]; picked: string }) {
    const rows = useMemo(() => rowsOf(items), [items]);
    return <Frame picked={picked}>{rows.map((row) => <Row key={row.id} row={row} />)}</Frame>;
  }
`;

const THREE = `
  import { useMemo } from 'react';
  export function useThree(a: number, b: number, c: number) {
    const first = useMemo(() => ({ a }), [a]);
    const second = useMemo(() => ({ b }), [b]);
    const third = useMemo(() => ({ c }), [c]);
    return [first, second, third];
  }
`;

const verdicts = async (code: string, at: Babel = BABEL) =>
  Object.fromEntries((await scanText(at, code)).map((site) => [site.name, site.inert]));

function holding(still: (source: string) => boolean): Babel {
  return { ...BABEL, compile: (source) => ({ code: still(source) ? 'still' : 'moved' }) };
}

describe('the memo hook scan', () => {
  it('reads a callback the compiler caches the same way on its own as inert', async () => {
    const found = await scanText(BABEL, COPY, 'copy.tsx');

    expect(found).toEqual([
      { file: 'copy.tsx', line: 4, hook: 'useCallback', name: 'onPress', inert: true },
    ]);
  });

  it('reads a memo over a function the compiler cannot see into as changing the output', async () => {
    const found = await verdicts(ROWS);

    expect(found).toEqual({ rows: false });
  });

  it('unwraps a memo whose callback has a block body', async () => {
    const found = await scanText(
      BABEL,
      `
      import { useMemo } from 'react';
      export function useShape(size: number, scope: object) {
        const metrics = useMetrics(size);
        return useMemo(() => {
          const half = metrics.height / 2;
          return { half, radius: radiusOf(metrics, scope) };
        }, [metrics, scope]);
      }
    `,
      'shape.hook.ts',
    );

    expect(found).toMatchObject([{ hook: 'useMemo', name: null, inert: true }]);
  });

  it('counts a hook written inside another as the outer one alone', async () => {
    const found = await scanText(
      BABEL,
      `
      import { useCallback, useMemo } from 'react';
      export function Root({ a, gap }: { a: number; gap: number }) {
        const value = useMemo(() => ({ a, on: useCallback(() => a, [a]) }), [a]);
        return <Frame value={value} gap={gap} />;
      }
    `,
    );

    expect(found.map((site) => site.name)).toEqual(['value']);
  });

  it('finds nothing in a file that memoises nothing by hand', async () => {
    const found = await scanText(BABEL, 'export const Plain = ({ a }) => <Box a={a} />;');

    expect(found).toEqual([]);
  });

  it('frees the earlier of two hooks when either can go but not both', async () => {
    const at = holding(
      (source) => source.includes('first = useMemo') || source.includes('second = useMemo'),
    );

    const found = await verdicts(THREE, at);

    expect(found).toEqual({ first: true, second: false, third: true });
  });

  it('reads bottom to top when that frees more hooks', async () => {
    const at = holding(
      (source) =>
        source.includes('first = useMemo') ||
        (source.includes('second = useMemo') && source.includes('third = useMemo')),
    );

    const found = await verdicts(THREE, at);

    expect(found).toEqual({ first: false, second: true, third: true });
  });

  it('reads every source file under the trees it is handed, named from the root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'kroma-memo-scan-'));
    mkdirSync(join(root, 'kit', 'copy'), { recursive: true });
    writeFileSync(join(root, 'kit', 'copy', 'copy.tsx'), COPY);
    writeFileSync(join(root, 'kit', 'rows.tsx'), ROWS);
    writeFileSync(join(root, 'kit', 'copy', 'copy.test.tsx'), COPY);

    const found = await scanTrees(BABEL, root, ['kit']);

    expect(Object.fromEntries(found.map((site) => [site.file, site.inert]))).toEqual({
      [join('kit', 'copy', 'copy.tsx')]: true,
      [join('kit', 'rows.tsx')]: false,
    });
  });
});
