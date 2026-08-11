import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Plugin, UserConfig } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { type KromaSiteOptions, kromaSite } from './site';

const startOptions = vi.hoisted(() => [] as unknown[]);

vi.mock('@tanstack/react-start/plugin/vite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-start/plugin/vite')>();
  return {
    ...actual,
    tanstackStart: (options: Parameters<typeof actual.tanstackStart>[0]) => {
      startOptions.push(options);
      return actual.tanstackStart(options);
    },
  };
});

const EN = fileURLToPath(new URL('../../core/src/locales/en.json', import.meta.url));

function siteRoot(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'kroma-site-'));
  for (const [path, source] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(full.slice(0, full.lastIndexOf('/')), { recursive: true });
    writeFileSync(full, source);
  }
  return root;
}

const config = (root: string, options?: KromaSiteOptions): UserConfig =>
  kromaSite(pathToFileURL(join(root, 'vite.config.ts')).href, options);

const plugins = (c: UserConfig): Plugin[] => (c.plugins as Plugin[]).flat(9).filter(Boolean);

const names = (c: UserConfig): string[] => plugins(c).map((p) => p.name);

const aliases = (c: UserConfig) =>
  c.resolve?.alias as { find: string | RegExp; replacement: string }[];

const find = (c: UserConfig, spec: string) => aliases(c).find((a) => a.find === spec)?.replacement;

function subset(c: UserConfig): Record<string, string> {
  const load = plugins(c).find((p) => p.name === 'kroma:message-subset')?.load;
  if (typeof load !== 'function') throw new Error('the site must subset the catalogs');
  return JSON.parse((load.call(null as never, EN, undefined) as string) ?? '{}');
}

describe('kromaSite', () => {
  it('is the message subset, the design system, TanStack Start and React, in that order', () => {
    const listed = names(config(siteRoot()));

    const kit = ['kroma-scan', 'kroma-ui', 'kroma-tokens'];

    expect(listed[0]).toBe('kroma:message-subset');
    expect(listed.slice(1, 1 + kit.length)).toEqual(kit);
    expect(listed.findIndex((n) => n.startsWith('tanstack'))).toBe(1 + kit.length);
    expect(listed.at(-1)).toMatch(/^vite:react/);
  });

  it('stands in for the workerd-only builtin, in dev alone, with a module that throws', () => {
    const shim = plugins(config(siteRoot())).find((p) => p.name === 'kroma:workerd-builtins-dev');
    if (!shim) throw new Error('the site must shim cloudflare:workers for dev');
    const resolve = shim.resolveId as (id: string) => string | undefined;
    const load = shim.load as (id: string) => string | undefined;

    // Only in `vite dev` - the deployed worker keeps the real builtin.
    expect(shim.apply).toBe('serve');
    const resolved = resolve.call(null as never, 'cloudflare:workers');
    expect(resolved).toBe('\0cloudflare:workers');
    expect(resolve.call(null as never, 'node:fs')).toBeUndefined();
    // Throwing is what puts workerContext() on its off-workerd fallback, so dev
    // still reads process.env instead of silently seeing an empty env.
    expect(load.call(null as never, resolved as string)).toContain('throw new Error');
    expect(load.call(null as never, 'cloudflare:workers')).toBeUndefined();
  });

  it('roots the site at the directory of the config file it was handed', () => {
    const root = siteRoot();
    expect(find(config(root), '#site')).toBe(join(root, 'src'));
  });

  it('keeps the kit and its react-native-web deps out of the server externals', () => {
    const noExternal = config(siteRoot()).ssr?.noExternal;

    expect(noExternal).toContain('@kroma/ui');
    expect(noExternal).toContain('@kroma/core');
    expect(noExternal).toContain('react-native-web');
  });

  it('gives react-native-web the global it reads on a browser', () => {
    expect(config(siteRoot()).define).toEqual({ global: 'globalThis' });
  });

  it('carries the site own aliases alongside the react-native redirect', () => {
    const c = config(siteRoot(), { alias: { '#content': '/somewhere/content' } });

    expect(find(c, '#content')).toBe('/somewhere/content');
    expect(aliases(c).some((a) => String(a.find) === '/^react-native$/')).toBe(true);
  });

  it('appends the site own plugins after everything shared', () => {
    const own = { name: 'the-site-own' } as Plugin;
    expect(names(config(siteRoot(), { plugins: [own] })).at(-1)).toBe('the-site-own');
  });

  it('keeps only the messages the site source can name', () => {
    const kitOnly = subset(config(siteRoot()));
    const catalog = JSON.parse(readFileSync(EN, 'utf8')) as Record<string, string>;
    const unreached = Object.keys(catalog).find((k) => !(k in kitOnly));
    if (!unreached) throw new Error('the design system reaches every message');

    const scanned = subset(config(siteRoot({ 'src/page.tsx': `t(${JSON.stringify(unreached)})` })));

    expect(scanned[unreached]).toBe(catalog[unreached]);
    expect(Object.keys(scanned).length).toBeLessThan(Object.keys(catalog).length);
  });

  it('ships every message when the site builds its keys at runtime', () => {
    expect(names(config(siteRoot(), { appMessages: true }))).not.toContain('kroma:message-subset');
  });

  it('asks TanStack to crawl the links only when the site prerenders', () => {
    startOptions.length = 0;
    config(siteRoot());
    config(siteRoot(), { prerender: true });

    expect(startOptions).toEqual([{}, { prerender: { enabled: true, crawlLinks: true } }]);
  });
});
