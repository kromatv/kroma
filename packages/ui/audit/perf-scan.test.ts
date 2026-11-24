import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanText, scanTrees } from './perf-scan';
import { babelAt } from './source-scan';

const BABEL = babelAt([join(process.cwd(), 'packages/bundler/package.json')]);

const rules = async (code: string) => (await scanText(BABEL, code)).map((f) => f.rule);

describe('the source perf scan', () => {
  it('reports an animation the native driver was turned off for nothing', async () => {
    const found = await rules(`
      const eased = { duration: 200, useNativeDriver: false };
      Animated.timing(fade, { toValue: 1, ...eased }).start();
    `);

    expect(found).toEqual(['js-driven-animation']);
  });

  it('tells a layout animation apart, since the native driver could not have taken it', async () => {
    const found = await scanText(
      BABEL,
      `
      const eased = { duration: 200, useNativeDriver: false };
      Animated.timing(motion.width, { toValue: 10, ...eased }).start();
      const view = <Animated.View style={{ width: motion.width }} />;
    `,
    );

    expect(found.map((f) => f.rule)).toEqual(['layout-animation']);
    expect(found[0]?.note).toContain('width');
  });

  it('leaves an animation the native driver runs', async () => {
    const found = await rules(`
      Animated.timing(scale, { toValue: 1.08, useNativeDriver: true }).start();
    `);

    expect(found).toEqual([]);
  });

  it('reports a native driver asked for in a tree that renders through the web', async () => {
    const found = await scanText(
      BABEL,
      'Animated.timing(slide, { toValue: 1, useNativeDriver: true }).start();',
      'sheet.tsx',
      true,
    );

    expect(found.map((f) => f.rule)).toEqual(['js-fallback-animation']);
  });

  it('leaves a native driver in a file that has already answered for the web', async () => {
    const found = await scanText(
      BABEL,
      'function slide() { if (WEB) return css; Animated.timing(v, { toValue: 1, useNativeDriver: true }).start(); }',
      'sheet.tsx',
      true,
    );

    expect(found).toEqual([]);
  });

  it('reports a useMemo that hands back its own dependency', async () => {
    const found = await rules('const value = useMemo(() => onFocus, [onFocus]);');

    expect(found).toEqual(['identity-memo']);
  });

  it('leaves a useMemo that builds something from its dependency', async () => {
    const found = await rules('const value = useMemo(() => () => onFocus(at), [onFocus, at]);');

    expect(found).toEqual([]);
  });

  it('reports a context value built during render', async () => {
    const found = await rules(
      'const A = () => <Ctx.Provider value={{ go }}>{kids}</Ctx.Provider>;',
    );

    expect(found).toEqual(['unstable-provider']);
  });

  it('leaves a context value held still across renders', async () => {
    const found = await rules('const A = () => <Ctx.Provider value={held}>{kids}</Ctx.Provider>;');

    expect(found).toEqual([]);
  });

  it('reports a context value built during render on a context written as its own provider', async () => {
    const found = await rules(
      'const Ctx = createContext(null); const A = () => <Ctx value={{ go }}>{kids}</Ctx>;',
    );

    expect(found).toEqual(['unstable-provider']);
  });

  it('reports a context value built during render on a part context', async () => {
    const found = await rules(
      "const [Part, usePart] = partContext('A.Root'); const A = () => <Part value={() => go()}>{kids}</Part>;",
    );

    expect(found).toEqual(['unstable-provider']);
  });

  it('reports a context value built during render on an imported context the kit names as one', async () => {
    const found = await rules(
      "import { RowContext } from './row-context'; const A = () => <RowContext value={[go]}>{kids}</RowContext>;",
    );

    expect(found).toEqual(['unstable-provider']);
  });

  it('reports a context declared below a type, under a name that does not say it is one', async () => {
    const found = await rules(
      'interface Row { at: number; go: () => void }\nconst Held = createContext<Row | null>(null);\nconst A = () => <Held value={{ at, go }}>{kids}</Held>;',
    );

    expect(found).toEqual(['unstable-provider']);
  });

  it('leaves a context written as its own provider whose value is held still', async () => {
    const found = await rules(
      'const Ctx = createContext(null); const A = () => <Ctx value={held}>{kids}</Ctx>;',
    );

    expect(found).toEqual([]);
  });

  it('leaves an ordinary component given a value built during render', async () => {
    const found = await rules(
      'const A = () => <><Slider value={[low, high]} /><TextField value={{ text }} /></>;',
    );

    expect(found).toEqual([]);
  });

  it('reports a context created in another file of the tree under any name', async () => {
    const root = mkdtempSync(join(tmpdir(), 'perf-scan-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/report.ts'), 'export const Report = createContext(null);');
    writeFileSync(
      join(root, 'src/view.tsx'),
      "import { Report } from './report';\nconst A = () => <Report value={() => go()}>{kids}</Report>;",
    );

    const found = await scanTrees(BABEL, root, ['src']);
    rmSync(root, { recursive: true, force: true });

    expect(found.map((f) => `${f.rule} ${f.file}`)).toEqual(['unstable-provider src/view.tsx']);
  });
});
