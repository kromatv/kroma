import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { catalogs, TYPES_FILE } from './index.ts';

const dirs: string[] = [];

function folder(files: Record<string, object>): string {
  const dir = mkdtempSync(join(tmpdir(), 'kroma-catalogs-'));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, JSON.stringify(content));
  }
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const TWO = {
  'i18n.json': { source: 'fr' },
  'en/about.json': { 'about.title': 'About' },
  'fr/about.json': { 'about.title': 'À propos' },
  'en/admin.json': { 'admin.title': 'Console' },
  'fr/admin.json': { 'admin.title': 'Console' },
};

interface Watcher {
  add(path: string): void;
  on(event: string, listener: (file: string) => void): void;
}

interface Hooks {
  configResolved: (this: unknown) => void;
  configureServer: (this: unknown, server: { watcher: Watcher }) => void;
  resolveId: (this: unknown, id: string) => string | undefined;
  load: (this: unknown, id: string) => string | undefined;
  transform: (this: unknown, code: string, id: string) => { code: string } | undefined;
  generateBundle: (this: Build, options: unknown, bundle: Record<string, object>) => void;
  handleHotUpdate: (
    this: unknown,
    context: { file: string; server: { ws: { send(payload: unknown): void } } },
  ) => unknown[] | undefined;
}

interface Build {
  environment: { name: string; config: { root: string } };
  getModuleInfo: (id: string) => { importers: string[]; isEntry: boolean } | null;
  error: (message: string) => never;
}

function build(name: string): Build {
  return {
    environment: { name, config: { root: '/app' } },
    getModuleInfo: () => null,
    error: (message) => {
      throw new Error(message);
    },
  };
}

const ENTRY = {
  'entry.js': { type: 'chunk', isEntry: true, imports: [], moduleIds: ['/app/src/page.tsx'] },
};

function plugin(dir: string, eager = false): Hooks {
  return catalogs({ dir, eager }) as unknown as Hooks;
}

// A watcher that hands back the listeners the plugin registered on it, so a
// test can save a file the way the dev server would.
function watched(hooks: Hooks): {
  watching: string[];
  fire: (event: string, file: string) => void;
} {
  const listeners = new Map<string, ((file: string) => void)[]>();
  const watching: string[] = [];
  hooks.configureServer.call(null, {
    watcher: {
      add: (path) => watching.push(path),
      on: (event, listener) => {
        listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      },
    },
  });
  return {
    watching,
    fire: (event, file) => {
      for (const listener of listeners.get(event) ?? []) listener(file);
    },
  };
}

describe('the plugin', () => {
  it('writes the types when a build starts', () => {
    const dir = folder(TWO);

    plugin(dir).configResolved.call(null);

    expect(existsSync(join(dir, TYPES_FILE))).toBe(true);
  });

  it('serves a namespace module with one loader per locale', () => {
    const dir = folder(TWO);
    const hooks = plugin(dir);
    hooks.configResolved.call(null);

    const id = hooks.resolveId.call(null, 'virtual:kroma-catalog/admin');
    const code = hooks.load.call(null, id ?? '');

    expect(code).toContain(
      `"en": () => import(${JSON.stringify(join(dir, 'en/admin.json'))}).then((m) => m.default)`,
    );
    expect(code).toContain('announceCatalogs("admin", {');
    expect(code).toContain('}, ["en","fr"]);');
    expect(code).not.toContain('import catalog0');
    expect(hooks.load.call(null, '\0kroma-catalog:nope')).toBeUndefined();
  });

  it('bundles every locale into the namespace module when eager', () => {
    const dir = folder(TWO);
    const hooks = plugin(dir, true);
    hooks.configResolved.call(null);

    const code = hooks.load.call(null, '\0kroma-catalog:admin');

    expect(code).toContain(`import catalog0 from ${JSON.stringify(join(dir, 'en/admin.json'))};`);
    expect(code).toContain(
      'announceCatalogs("admin", { "en": catalog0, "fr": catalog1 }, ["en","fr"]);',
    );
  });

  it('appends an import of each named namespace to a source module and leaves the rest alone', () => {
    const dir = folder(TWO);
    const hooks = plugin(dir);
    hooks.configResolved.call(null);
    const source = "export const label = t('admin.title');";

    const out = hooks.transform.call(null, source, '/app/src/page.tsx');

    expect(out?.code).toBe(`${source}\nimport "virtual:kroma-catalog/admin";\n`);
    expect(
      hooks.transform.call(null, "const x = 'admin.nope';", '/app/src/other.ts'),
    ).toBeUndefined();
    expect(hooks.transform.call(null, source, '/app/node_modules/x/index.js')).toBeUndefined();
    expect(hooks.transform.call(null, source, join(dir, 'x.ts'))).toBeUndefined();
  });

  it('announces nothing from the sources of the engine itself', () => {
    const dir = folder(TWO);
    const hooks = plugin(dir);
    hooks.configResolved.call(null);
    const engine = fileURLToPath(new URL('../src/define.ts', import.meta.url));

    const out = hooks.transform.call(null, "const example = 'admin.title';", engine);

    expect(out).toBeUndefined();
  });

  it('writes what each build fetches before its first screen when asked for a report', () => {
    const dir = folder(TWO);
    const report = join(dir, 'usage.json');
    const hooks = catalogs({ dir, report }) as unknown as Hooks;
    hooks.configResolved.call(null);
    hooks.transform.call(null, "t('admin.title')", '/app/src/page.tsx');

    hooks.generateBundle.call(build('client'), {}, ENTRY);
    hooks.generateBundle.call(build('ssr'), {}, {});

    const written = JSON.parse(readFileSync(report, 'utf8'));
    expect(written.client.boot).toMatchObject({ messages: 1, named: 1 });
    expect(written.client.chunks['entry.js'].files.admin.from).toEqual({ 'src/page.tsx': 1 });
    expect(written.ssr.boot).toMatchObject({ messages: 0 });
  });

  it('fails a client build that fetches more than it may before its first screen', () => {
    const dir = folder(TWO);
    const hooks = catalogs({ dir, boot: 0 }) as unknown as Hooks;
    hooks.configResolved.call(null);
    hooks.transform.call(null, "t('admin.title')", '/app/src/page.tsx');

    const client = () => hooks.generateBundle.call(build('client'), {}, ENTRY);
    const server = () => hooks.generateBundle.call(build('ssr'), {}, ENTRY);

    expect(client).toThrow('Messages fetched before the first screen: 1. This build allows 0.');
    expect(server).not.toThrow();
  });

  it('watches the folder, and reads a namespace again when its source-language file is saved', () => {
    const dir = folder(TWO);
    const hooks = plugin(dir);
    hooks.configResolved.call(null);
    const { watching, fire } = watched(hooks);

    writeFileSync(
      join(dir, 'fr/admin.json'),
      JSON.stringify({ 'admin.title': 'x', 'admin.new': 'y' }),
    );
    writeFileSync(
      join(dir, 'en/admin.json'),
      JSON.stringify({ 'admin.title': 'x', 'admin.only': 'z' }),
    );
    fire('change', join(dir, 'fr/admin.json'));
    fire('change', join(dir, 'en/admin.json'));
    fire('change', join(dir, 'notes.md'));

    expect(watching).toEqual([dir]);
    const out = hooks.transform.call(null, "t('admin.new'); t('admin.only')", '/app/src/page.tsx');
    expect(out?.code).toContain('import "virtual:kroma-catalog/admin";');
    // The source language decides what a literal names: `admin.only` exists in
    // English alone, so it must not be what pulled the namespace in.
    expect(hooks.transform.call(null, "t('admin.only')", '/app/src/other.tsx')).toBeUndefined();
    expect(readFileSync(join(dir, TYPES_FILE), 'utf8')).toContain("'admin.new': {};");
  });

  it('serves a file of a split namespace under its own path', () => {
    const dir = folder({
      'i18n.json': { source: 'fr' },
      'fr/admin/users.json': { 'admin.invite': 'Inviter' },
      'en/admin/users.json': { 'admin.invite': 'Invite' },
    });
    const hooks = plugin(dir);
    hooks.configResolved.call(null);

    const out = hooks.transform.call(null, "t('admin.invite')", '/app/src/page.tsx');
    const code = hooks.load.call(null, '\0kroma-catalog:admin/users');

    expect(out?.code).toContain('import "virtual:kroma-catalog/admin/users";');
    expect(code).toContain(`import(${JSON.stringify(join(dir, 'fr/admin/users.json'))})`);
    expect(code).toContain('announceCatalogs("admin/users", {');
  });

  it('fetches a locale that lacks a message together with what it falls back to', () => {
    const dir = folder({
      ...TWO,
      'fr/admin.json': { 'admin.title': 'Console', 'admin.users': 'Comptes' },
    });
    const hooks = plugin(dir);
    hooks.configResolved.call(null);

    const code = hooks.load.call(null, '\0kroma-catalog:admin');

    expect(code).toContain('}, ["fr"]);');
  });

  it('tells the project after a catalog is saved, and not for any other file', () => {
    const dir = folder(TWO);
    let saves = 0;
    const hooks = catalogs({ dir, onSave: () => (saves += 1) }) as unknown as Hooks;
    hooks.configResolved.call(null);
    const { fire } = watched(hooks);

    fire('change', join(dir, 'en/admin.json'));
    fire('change', join(dir, 'fr/admin.json'));
    fire('change', join(dir, 'notes.md'));

    expect(saves).toBe(2);
  });

  it('sends a saved catalog to the page as it now reads, and asks for no reload', () => {
    const dir = folder(TWO);
    const hooks = plugin(dir);
    hooks.configResolved.call(null);
    const sent: unknown[] = [];
    const server = { ws: { send: (payload: unknown) => sent.push(payload) } };
    writeFileSync(join(dir, 'en/admin.json'), JSON.stringify({ 'admin.title': 'Settings' }));

    const updated = hooks.handleHotUpdate.call(null, { file: join(dir, 'en/admin.json'), server });

    expect(updated).toEqual([]);
    expect(sent).toEqual([
      {
        type: 'custom',
        event: 'kroma:catalog',
        data: { file: 'admin', locale: 'en', catalog: { 'admin.title': 'Settings' } },
      },
    ]);
  });

  it('leaves a file that is not a catalog, or does not parse, to the dev server', () => {
    const dir = folder(TWO);
    const hooks = plugin(dir);
    hooks.configResolved.call(null);
    const server = { ws: { send: () => undefined } };
    writeFileSync(join(dir, 'en/admin.json'), '{ "admin.title": ');

    const halfSaved = hooks.handleHotUpdate.call(null, {
      file: join(dir, 'en/admin.json'),
      server,
    });
    const policy = hooks.handleHotUpdate.call(null, { file: join(dir, 'i18n.json'), server });

    expect([halfSaved, policy]).toEqual([undefined, undefined]);
  });

  it('listens for a saved catalog in the module it serves, and not when eager', () => {
    const dir = folder(TWO);
    const lazy = plugin(dir);
    const eager = plugin(dir, true);
    lazy.configResolved.call(null);
    eager.configResolved.call(null);

    const served = lazy.load.call(null, '\0kroma-catalog:admin') ?? '';

    expect(served).toContain('import.meta.hot.on("kroma:catalog"');
    expect(served).toContain('if (saved.file === "admin") announceCatalogs("admin"');
    expect(eager.load.call(null, '\0kroma-catalog:admin')).not.toContain('import.meta.hot');
  });

  it('serves each language its own name, and its code where it has not named itself', () => {
    const dir = folder({
      'i18n.json': { source: 'fr' },
      'fr/lang.json': { 'lang.fr': 'Français', 'lang.de': 'Allemand' },
      'de/lang.json': { 'lang.de': 'Deutsch' },
      'it/nav.json': { 'nav.home': 'Inizio' },
    });
    const hooks = plugin(dir);
    hooks.configResolved.call(null);

    const id = hooks.resolveId.call(null, 'virtual:kroma-locale-names') ?? '';
    const served = hooks.load.call(null, id) ?? '';

    expect(JSON.parse(served.replace('export default ', '').replace(/;\s*$/, ''))).toEqual({
      fr: 'Français',
      de: 'Deutsch',
      it: 'it',
    });
  });

  it('rescans when a namespace appears and when one is deleted', () => {
    const dir = folder(TWO);
    const hooks = plugin(dir);
    hooks.configResolved.call(null);
    const { fire } = watched(hooks);

    writeFileSync(join(dir, 'fr/nav.json'), JSON.stringify({ 'nav.home': 'Accueil' }));
    writeFileSync(join(dir, 'en/nav.json'), JSON.stringify({ 'nav.home': 'Home' }));
    fire('add', join(dir, 'fr/nav.json'));
    const known = hooks.transform.call(null, "t('nav.home')", '/app/src/page.tsx');

    rmSync(join(dir, 'fr/nav.json'));
    rmSync(join(dir, 'en/nav.json'));
    fire('unlink', join(dir, 'fr/nav.json'));

    expect(known?.code).toContain('import "virtual:kroma-catalog/nav";');
    expect(hooks.transform.call(null, "t('nav.home')", '/app/src/page.tsx')).toBeUndefined();
    expect(readFileSync(join(dir, TYPES_FILE), 'utf8')).not.toContain('nav.home');
  });
});
