import { resolve } from 'node:path';
import type { Plugin, UserConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import { kroma } from './kroma';

// The compiler pass is an async plugin, so the array also holds a promise:
// Vite awaits it, and a name-based assertion has to step over it.
const flat = (plugins: unknown[]): Plugin[] =>
  (plugins.flat(Number.POSITIVE_INFINITY) as Plugin[]).filter((plugin) => plugin?.name);
const names = (plugins: unknown[]): string[] => flat(plugins).map((plugin) => plugin.name);
const pending = (plugins: unknown[]): unknown[] =>
  (plugins.flat(Number.POSITIVE_INFINITY) as Plugin[]).filter(
    (plugin) => plugin instanceof Promise,
  );

function shellConfig(plugins: unknown[], user: UserConfig = {}): UserConfig {
  const shell = flat(plugins).find((plugin) => plugin.name === 'kroma:shell');
  const config = shell?.config as (this: unknown, user: UserConfig, env: unknown) => UserConfig;
  return config.call(null, user, { command: 'serve', mode: 'development' });
}

describe('kroma', () => {
  it('lines up the shared config, the dev helpers, the catalogs, the kit, the dev tools and React', () => {
    const listed = names(kroma());

    expect(listed.slice(0, 4)).toEqual([
      'kroma:shell',
      'kroma:deps-without-maps',
      'kroma-build-info',
      'kroma:catalogs',
    ]);
    expect(listed.filter((name) => name.startsWith('kroma-')).length).toBeGreaterThan(1);
    expect(listed.indexOf('kroma-i18n-devtools')).toBeLessThan(
      listed.findIndex((name) => name.startsWith('vite:react')),
    );
    expect(listed.some((name) => name.startsWith('vite:react'))).toBe(true);
  });

  it('compiles every component with the React compiler, with no way to opt out', async () => {
    const [compiler] = pending(kroma());

    expect(await compiler).toMatchObject({ name: expect.stringContaining('babel') });
  });

  it('compiles MDX only when asked, and places TanStack Start before React when given', () => {
    const plain = names(kroma());
    const start = names(kroma({ start: {} }));

    expect(names(kroma({ mdx: true }))).toHaveLength(plain.length + 1);
    expect(start.findIndex((name) => name.startsWith('tanstack'))).toBeLessThan(
      start.findIndex((name) => name.startsWith('vite:react')),
    );
    expect(start).toContain('kroma:exit-after-build');
  });

  it('resolves a shell alias against the config root and carries the shared config', () => {
    const config = shellConfig(kroma({ alias: { '#web': './src' } }), { root: '/app/web' });
    const alias = config.resolve?.alias as Array<{ find: string | RegExp; replacement: string }>;

    expect(alias.find((entry) => entry.find === '#web')?.replacement).toBe(resolve('/app/web/src'));
    expect(config.define).toMatchObject({ global: 'globalThis' });
    expect(config.define?.__KROMA_VERSION__).toBeTypeOf('string');
    expect(config.ssr?.noExternal).toContain('@kroma/ui');
    expect(config.optimizeDeps?.include).toContain('react-native-web');
  });
});
