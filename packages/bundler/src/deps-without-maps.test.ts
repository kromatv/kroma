import { describe, expect, it } from 'vitest';
import { depsWithoutMaps } from './deps-without-maps';

interface Hooks {
  apply: string;
  configResolved: (this: unknown, config: { cacheDir: string }) => void;
  transform: (
    this: unknown,
    code: string,
    id: string,
  ) => { code: string; map: { mappings: string } } | undefined;
}

function hooks(cacheDir = '/app/node_modules/.vite'): Hooks {
  const plugin = depsWithoutMaps() as unknown as Hooks;
  plugin.configResolved.call(null, { cacheDir });
  return plugin;
}

describe('depsWithoutMaps', () => {
  it('hands back a pre-bundled dependency unchanged, with an empty map', () => {
    const out = hooks().transform.call(
      null,
      'export const z = 1;',
      '/app/node_modules/.vite/deps/zod.js',
    );

    expect(out).toEqual({ code: 'export const z = 1;', map: { mappings: '' } });
  });

  it('follows the configured cache directory', () => {
    const out = hooks('/tmp/cache').transform.call(null, 'x', '/tmp/cache/deps/zod.js');

    expect(out?.map).toEqual({ mappings: '' });
    expect(
      hooks('/tmp/cache').transform.call(null, 'x', '/app/node_modules/.vite/deps/zod.js'),
    ).toBeUndefined();
  });

  it('leaves every other module to its own map, and runs for the dev server only', () => {
    expect(hooks().transform.call(null, 'x', '/app/src/main.tsx')).toBeUndefined();
    expect(hooks().transform.call(null, 'x', '/app/node_modules/zod/index.js')).toBeUndefined();
    expect(hooks().apply).toBe('serve');
  });
});
