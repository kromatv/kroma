import type { Plugin } from 'vite';
import { resolveConfig } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { kromaI18nDevtools } from './index.ts';

const PROVIDER = '/repo/packages/i18n/src/react/provider.tsx';

function inject(plugin: Plugin, id: string, options?: { ssr: boolean }): string | null {
  if (typeof plugin.transform !== 'function') throw new Error('the plugin lost its transform');
  const result = plugin.transform.call({} as never, 'export const x = 1;', id, options);
  if (result === null || result === undefined || typeof result === 'string') return null;
  return 'code' in result ? (result.code ?? null) : null;
}

function transform(id: string, options?: { ssr: boolean }): string | null {
  return inject(kromaI18nDevtools(), id, options);
}

async function withoutPanel(): Promise<Plugin> {
  vi.doMock('node:module', () => ({
    createRequire: () => ({
      resolve: () => {
        throw new Error('Cannot find module');
      },
    }),
  }));
  vi.doMock('node:fs', () => ({ existsSync: () => false }));
  vi.resetModules();

  const { kromaI18nDevtools: uninstalled } = await import('./index.ts');
  return uninstalled();
}

async function pluginNames(command: 'build' | 'serve'): Promise<string[]> {
  const config = await resolveConfig(
    { configFile: false, plugins: [kromaI18nDevtools()] },
    command,
  );
  return config.plugins.map((plugin) => plugin.name);
}

async function aliases(plugin: Plugin): Promise<Record<string, string>> {
  if (typeof plugin.config !== 'function') throw new Error('the plugin lost its config');
  const config = await plugin.config.call(
    {} as never,
    {},
    { command: 'serve', mode: 'development' },
  );
  const alias = config?.resolve?.alias;
  return alias === undefined || Array.isArray(alias) ? {} : alias;
}

afterEach(() => {
  vi.doUnmock('node:fs');
  vi.doUnmock('node:module');
  vi.resetModules();
});

describe('kromaI18nDevtools', () => {
  it('mounts the dev tools from the provider, which every shell renders', () => {
    expect(transform(PROVIDER)).toContain('@kroma/i18n-devtools');
  });

  it('disposes on a hot reload rather than binding the shortcut twice', () => {
    expect(transform(PROVIDER)).toContain('import.meta.hot.dispose');
  });

  it('leaves every other module alone', () => {
    expect(transform('/repo/packages/i18n/src/react/context.ts')).toBeNull();
    expect(transform('/repo/clients/web/src/routes/__root.tsx')).toBeNull();
  });

  it('reaches the provider through the query a dev server appends', () => {
    expect(transform(`${PROVIDER}?t=1735689600000`)).toContain('@kroma/i18n-devtools');
  });

  it('leaves the server pass alone, so a prerender renders the real copy', () => {
    expect(transform(PROVIDER, { ssr: true })).toBeNull();
  });

  it('is dropped by Vite itself on a production build', async () => {
    expect(await pluginNames('serve')).toContain('kroma-i18n-devtools');

    expect(await pluginNames('build')).not.toContain('kroma-i18n-devtools');
  });

  it('resolves the panel itself, since the module it injects into cannot', async () => {
    expect(await aliases(kromaI18nDevtools())).toHaveProperty('@kroma/i18n-devtools');
  });

  it('adds no alias where the panel is not installed beside the shell', async () => {
    expect(await aliases(await withoutPanel())).toEqual({});
  });

  it('injects nothing without the panel, so a shell that lacks it still starts', async () => {
    expect(inject(await withoutPanel(), PROVIDER)).toBeNull();
  });
});
