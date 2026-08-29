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
  if (!Array.isArray(alias)) return alias ?? {};
  const found: Record<string, string> = {};
  for (const { find, replacement } of alias as Array<{ find: unknown; replacement: string }>) {
    if (typeof find === 'string') found[find] = replacement;
  }
  return found;
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

interface Asked {
  event: string;
  data: Record<string, unknown>;
}

function serving(
  over: {
    allow?: string[];
    transform?: unknown;
    known?: string[];
    importers?: string[];
    refusing?: string[];
    plugin?: Plugin;
  } = {},
) {
  const handlers = new Map<string, (data: unknown, client: unknown) => void>();
  const said: Asked[] = [];
  const warned: string[] = [];
  const watching = new Map<string, () => void>();
  const reloaded: string[] = [];
  const client = {
    send: (event: string, data: Record<string, unknown>) => said.push({ event, data }),
  };
  const server = {
    environments: {
      client: {
        hot: {
          on: (event: string, run: (data: unknown, c: unknown) => void) => handlers.set(event, run),
          send: (payload: { updates?: Array<{ path: string }> }) => {
            for (const u of payload.updates ?? []) reloaded.push(u.path);
          },
        },
        transformRequest: () => Promise.resolve(over.transform ?? null),
        moduleGraph: {
          invalidateModule: () => {},
          getModuleById: (id: string) =>
            (over.known ?? []).includes(id)
              ? {
                  id,
                  url: id,
                  importers: new Set(
                    (over.importers ?? []).map((at) => ({
                      id: at,
                      url: at,
                      isSelfAccepting: !(over.refusing ?? []).includes(at),
                    })),
                  ),
                }
              : undefined,
        },
      },
    },
    config: {
      root: '/repo/clients/web',
      logger: { warn: (line: string) => warned.push(line) },
      server: { fs: { allow: over.allow ?? ['/repo'] } },
    },
    watcher: { on: (event: string, run: () => void) => watching.set(event, run) },
  };
  const plugin = over.plugin ?? kromaI18nDevtools();
  (plugin.configureServer as (s: unknown) => void).call({} as never, server);
  const injectInto = (id: string) => inject(plugin, id);
  const ask = async (event: string, data: object) => {
    handlers.get(event)?.(data, client);
    await Promise.resolve();
    await Promise.resolve();
  };
  return { ask, said, warned, watching, handlers, reloaded, injectInto };
}

describe('what the panel may ask the dev server', () => {
  it('answers which editors this machine has', async () => {
    const at = serving();

    await at.ask('kroma:i18n:editors', { at: 1 });

    expect(at.said[0]?.event).toBe('kroma:i18n:editors');
    expect(at.said[0]?.data).toMatchObject({ at: 1 });
    expect(Array.isArray(at.said[0]?.data.editors)).toBe(true);
  });

  it('answers where a served line was written, and says nothing without a map', async () => {
    const at = serving();

    await at.ask('kroma:i18n:where', { at: 2, url: '/src/who.tsx', line: 9, column: 1 });

    expect(at.said[0]).toMatchObject({ event: 'kroma:i18n:where', data: { at: 2, line: null } });
  });

  it('refuses to open a file outside the trees it serves', async () => {
    const at = serving({ allow: ['/repo/clients/web'] });

    await at.ask('kroma:i18n:open', { at: 3, file: '/etc/passwd:1:1', editor: '' });

    expect(at.said[0]).toMatchObject({ data: { at: 3, opened: false } });
    expect(at.warned[0]).toContain('refused to open');
  });

  it('refuses a file that is nowhere at all', async () => {
    const at = serving();

    await at.ask('kroma:i18n:open', { at: 4, file: '/repo/nope.tsx:1:1' });

    expect(at.said[0]).toMatchObject({ data: { opened: false } });
  });

  it('forgets what it traced when a file changes', () => {
    const at = serving();

    expect(at.watching.has('change')).toBe(true);
    expect(() => at.watching.get('change')?.()).not.toThrow();
  });
});

const MESSAGES = '/repo/apps/www/src/paraglide/messages.js';
const NAMESPACE =
  "export * from './messages/_index.js'\nexport * as m from './messages/_index.js'\n";

function paraglidePlugin(): Plugin {
  return kromaI18nDevtools({ adapter: 'paraglide' });
}

function wired(code: string): string | null {
  const plugin = paraglidePlugin();
  if (typeof plugin.transform !== 'function') throw new Error('the plugin lost its transform');
  const result = plugin.transform.call({} as never, code, MESSAGES, undefined);
  if (result === null || result === undefined || typeof result === 'string') return null;
  return 'code' in result ? (result.code ?? null) : null;
}

describe('the module an engine renders every message through', () => {
  it('routes the namespace an app auto-imports through the adapter', () => {
    const code = wired(NAMESPACE) ?? '';

    expect(code).toContain('export const m = __kromaI18nParaglide({');
    expect(code).not.toContain("export * as m from './messages/_index.js'");
  });

  it('reaches the runtime and the messages beside it, by the path the file names', () => {
    const code = wired(NAMESPACE) ?? '';

    expect(code).toContain("import * as __kromaI18nRuntime from './runtime.js';");
    expect(code).toContain("import * as __kromaI18nMessages from './messages/_index.js';");
  });

  it('leaves the named exports alone, which resolve past the wrapper anyway', () => {
    expect(wired(NAMESPACE)).toContain("export * from './messages/_index.js'");
  });

  it('leaves a module that exports no such namespace as it found it', () => {
    const code = wired('export const hello = () => "Hi";\n') ?? '';

    expect(code).toContain('export const hello = () => "Hi";');
    expect(code).not.toContain('__kromaI18nParaglide');
  });

  it('still puts the tools in, an engine it cannot wrap being one it can still switch', () => {
    expect(wired('export const hello = () => "Hi";\n')).toContain('__kromaI18nDevtools');
  });
});

describe('what the panel needs to render at all', () => {
  it('brings the react-native pipeline the kit is authored against', async () => {
    const plugin = kromaI18nDevtools();
    if (typeof plugin.config !== 'function') throw new Error('the plugin lost its config');

    const config = await plugin.config.call(
      {} as never,
      {},
      {
        command: 'serve',
        mode: 'development',
      },
    );

    expect(config?.optimizeDeps?.include).toContain('react-native-web');
    expect(config?.define).toMatchObject({ global: 'globalThis' });
  });

  it('redirects react-native at the web build, for a host that never asked for one', async () => {
    const found = await aliases(kromaI18nDevtools());

    expect(Object.keys(found)).toContain('@kroma/i18n-devtools');
  });

  it('asks for none of it where the panel is not installed beside the shell', async () => {
    const plugin = await withoutPanel();
    if (typeof plugin.config !== 'function') throw new Error('the plugin lost its config');

    const config = await plugin.config.call(
      {} as never,
      {},
      {
        command: 'serve',
        mode: 'development',
      },
    );

    expect(config).toEqual({});
  });
});

describe('asking the dev server for a fresh render', () => {
  it('re-runs what renders the messages, not the module they come from', async () => {
    const at = serving({ known: [PROVIDER], importers: ['/repo/clients/web/src/app.tsx'] });
    at.injectInto(PROVIDER);

    await at.ask('kroma:i18n:refresh', {});

    expect(at.reloaded).toEqual(['/repo/clients/web/src/app.tsx']);
  });

  it('re-runs every one of them', async () => {
    const at = serving({ known: [PROVIDER], importers: ['/a.tsx', '/b.tsx'] });
    at.injectInto(PROVIDER);

    await at.ask('kroma:i18n:refresh', {});

    expect(at.reloaded).toEqual(['/a.tsx', '/b.tsx']);
  });

  it('leaves alone an importer React Refresh cannot re-render in place', async () => {
    const at = serving({ known: [PROVIDER], importers: ['/route.tsx'], refusing: ['/route.tsx'] });
    at.injectInto(PROVIDER);

    await at.ask('kroma:i18n:refresh', {});

    expect(at.reloaded).toEqual([]);
  });

  it('does nothing before the tools have gone into anything', async () => {
    const at = serving({ known: [PROVIDER] });

    await at.ask('kroma:i18n:refresh', {});

    expect(at.reloaded).toEqual([]);
  });

  it('does nothing for a module the server no longer holds', async () => {
    const at = serving({ known: [], importers: ['/a.tsx'] });
    at.injectInto(PROVIDER);

    await at.ask('kroma:i18n:refresh', {});

    expect(at.reloaded).toEqual([]);
  });
});

describe('an editor that will not open', () => {
  it('says which one and why, rather than failing quietly', async () => {
    const at = serving({ plugin: await pluginWhoseEditorFails('no such editor') });

    await at.ask('kroma:i18n:open', { at: 1, file: '/repo/clients/web/src/app.tsx:1:1' });

    expect(at.warned.join(' ')).toContain('could not open zed');
  });

  it('names no reason where the launcher gives none', async () => {
    const at = serving({ plugin: await pluginWhoseEditorFails(undefined) });

    await at.ask('kroma:i18n:open', { at: 1, file: '/repo/clients/web/src/app.tsx:1:1' });

    expect(at.warned.join(' ')).toContain('no editor found');
  });
});

type Onerror = (name: string, error?: string) => void;

// The launcher is the last thing `open` reaches, so the file has to look real
// enough to get there.
async function pluginWhoseEditorFails(error: string | undefined): Promise<Plugin> {
  vi.doMock('node:fs', () => ({ existsSync: () => true, readFileSync: () => '{}' }));
  vi.doMock('launch-editor', () => ({
    default: (_file: string, _editor: string | undefined, onError: Onerror) => {
      onError('zed', error);
    },
  }));
  vi.resetModules();
  const { kromaI18nDevtools: withBadEditor } = await import('./index.ts');
  return withBadEditor();
}

describe('which engine an app translates through', () => {
  async function speaking(manifest: object): Promise<Plugin> {
    vi.doMock('node:fs', () => ({
      existsSync: () => true,
      readFileSync: () => JSON.stringify(manifest),
    }));
    vi.resetModules();
    const { kromaI18nDevtools: reading } = await import('./index.ts');
    return reading();
  }

  it('reads paraglide off what the app depends on', async () => {
    const plugin = await speaking({ dependencies: { '@inlang/paraglide-js': '^2' } });

    expect(inject(plugin, '/app/src/paraglide/messages.js')).toContain('paraglide');
  });

  it('reads it out of devDependencies just the same', async () => {
    const plugin = await speaking({ devDependencies: { '@kroma/i18n': 'workspace:*' } });

    expect(inject(plugin, PROVIDER)).toContain('@kroma/i18n-devtools/kroma');
  });

  it('falls back to the engine this repository ships where nothing says', async () => {
    const plugin = await speaking({ dependencies: { react: '^19' } });

    expect(inject(plugin, PROVIDER)).toContain('@kroma/i18n-devtools/kroma');
  });

  it('stays out of the way where the adapter is not installed beside the panel', async () => {
    vi.doMock('node:fs', () => ({
      existsSync: (at: string) => !String(at).includes('engine/'),
      readFileSync: () => '{}',
    }));
    vi.resetModules();
    const { kromaI18nDevtools: withoutAdapter } = await import('./index.ts');

    expect(inject(withoutAdapter(), PROVIDER)).toBeNull();
  });
});

describe('finding the panel to inject', () => {
  it('falls back to the copy beside this plugin where the shell cannot resolve it', async () => {
    vi.doMock('node:module', () => ({
      createRequire: () => ({
        resolve: () => {
          throw new Error('Cannot find module');
        },
      }),
    }));
    vi.doMock('node:fs', () => ({ existsSync: () => true, readFileSync: () => '{}' }));
    vi.resetModules();
    const { kromaI18nDevtools: beside } = await import('./index.ts');

    expect(inject(beside(), PROVIDER)).toContain('@kroma/i18n-devtools');
  });
});
