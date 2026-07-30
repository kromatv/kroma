/**
 * The plugin's job is the lifecycle — bundle inside `dev` and `build`, once,
 * for the client environment only — so that is what is pinned here. The options
 * are pinned too because a test elsewhere compiles the worker with them, and
 * that only means anything if they are the options the build ships.
 */
import { describe, expect, it } from 'vitest';
import { standaloneOptions, standaloneScript } from './standalone-script';

const OPTS = { entry: '/repo/src/sw.ts', outfile: '/repo/public/sw.js' };

describe('the options', () => {
  it('produce one self-contained, minified IIFE', () => {
    const o = standaloneOptions(OPTS);
    expect(o).toMatchObject({ bundle: true, format: 'iife', minify: true, sourcemap: false });
    expect(o.entryPoints).toEqual(['/repo/src/sw.ts']);
    expect(o.outfile).toBe('/repo/public/sw.js');
  });

  it('lets a caller override any of them, including the defaults', () => {
    // Tizen's service wants CJS on a neutral platform at an older target; that
    // has to fit through without the wrapper growing an option for each.
    const o = standaloneOptions({
      ...OPTS,
      esbuild: { format: 'cjs', platform: 'neutral', target: 'chrome76', minify: false },
    });
    expect(o).toMatchObject({ format: 'cjs', platform: 'neutral', target: 'chrome76' });
    expect(o.minify).toBe(false);
    expect(o.bundle).toBe(true);
  });
});

describe('the plugin', () => {
  it('is named after its output, so a build log says which script it is', () => {
    expect(standaloneScript(OPTS).name).toBe('kroma:standalone-script:sw.js');
  });

  it('names a windows-separated output just as well', () => {
    expect(standaloneScript({ ...OPTS, outfile: 'C:\\repo\\public\\sw.js' }).name).toBe(
      'kroma:standalone-script:sw.js',
    );
  });

  it('runs for the client environment only', () => {
    // `buildStart` fires once per Vite environment; without this the worker is
    // bundled again for the SSR pass. Only `name` is read, so a stand-in with
    // just that is enough to state the rule.
    const applyTo = standaloneScript(OPTS).applyToEnvironment;
    if (typeof applyTo !== 'function') throw new Error('the plugin must scope itself');
    const env = (name: string) => ({ name }) as unknown as Parameters<typeof applyTo>[0];
    expect(applyTo(env('client'))).toBe(true);
    expect(applyTo(env('ssr'))).toBe(false);
  });

  it('bundles at buildStart, which covers both dev and build', () => {
    const plugin = standaloneScript(OPTS);
    expect(plugin.buildStart).toBeTypeOf('function');
    expect(plugin.configureServer).toBeTypeOf('function');
  });
});
