import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanText } from './perf-scan';
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
});
