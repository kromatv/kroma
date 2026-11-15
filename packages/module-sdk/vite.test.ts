import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { kromaModule } from './vite';

type TransformResult = { code: string; map: null } | null;

const watched: string[] = [];

function transform(id: string, code: string): TransformResult {
  const hook = kromaModule().transform;
  const handler = typeof hook === 'function' ? hook : hook?.handler;
  const build = { addWatchFile: (file: string) => watched.push(file) };
  return (handler as (code: string, id: string) => TransformResult).call(build, code, id);
}

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function moduleWith(files: Record<string, object>): string {
  const dir = mkdtempSync(join(tmpdir(), 'kroma-module-vite-'));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), JSON.stringify(content));
  }
  return join(dir, 'ui', 'src', 'index.tsx');
}

const ENTRY = '/repo/modules/tv.kroma.notes/ui/src/index.tsx';
const SOURCE = "import { defineModule } from '@kromatv/module-sdk';\ndefineModule({ id: 'x' });\n";

describe('kromaModule', () => {
  it('runs before Vite expands import.meta.glob, or the injected glob stays a call', () => {
    const plugin = kromaModule();
    expect(plugin.name).toBe('kroma-module');
    expect(plugin.enforce).toBe('pre');
  });

  it('injects the manifest and the locale glob into a module entry', () => {
    const out = transform(ENTRY, SOURCE);
    expect(out?.code).toContain("import __kromaManifest from '../../module.json';");
    expect(out?.code).toContain('manifest: __kromaManifest');
    expect(out?.code).toContain("import.meta.glob('../../locales/*.json'");
    expect(out?.code).toContain("id: 'x'");
    expect(out?.map).toBeNull();
  });

  it('spells the glob over one file per language as it always did', () => {
    const entry = moduleWith({ 'locales/en.json': { a: 'A' }, 'locales/fr.lock': {} });

    const out = transform(entry, "defineModule({ id: 'x' });\n");

    expect(out?.code).toBe(
      "import __kromaManifest from '../../module.json';\ndefineModule({ manifest: __kromaManifest, locales: import.meta.glob('../../locales/*.json', { eager: true, import: 'default' }), id: 'x' });\n",
    );
  });

  it('merges a folder per language into one catalog per language, with no glob left', () => {
    const entry = moduleWith({
      'locales/en/nav.json': { 'nav.title': 'Notes' },
      'locales/en/settings/advanced.json': { 'settings.price': "$& and $'" },
      'locales/en/i18n.lock': { version: 1, messages: {} },
      'locales/notes.json': { '*': 'A note.' },
    });

    const out = transform(entry, "defineModule({ id: 'x' });\n");

    expect(out?.code).toContain(
      `locales: {"en":{"nav.title":"Notes","settings.price":"$& and $'"}}, id: 'x' });`,
    );
    expect(out?.code).not.toContain('import.meta.glob');
  });

  it('watches the files of a folder module and leaves their schema pointer out', () => {
    watched.length = 0;
    const entry = moduleWith({
      'locales/en/nav.json': { $schema: './catalog.schema.json', 'nav.title': 'Notes' },
    });

    const out = transform(entry, "defineModule({ id: 'x' });\n");

    expect(watched).toEqual([join(dirname(entry), '..', '..', 'locales', 'en', 'nav.json')]);
    expect(out?.code).toContain('locales: {"en":{"nav.title":"Notes"}},');
  });

  it('takes the module-federation entry and the .ts spelling too', () => {
    for (const id of [
      '/repo/modules/x/ui/src/module.tsx',
      '/repo/modules/x/ui/src/index.ts',
      'C:\\repo\\modules\\x\\ui\\src\\index.tsx',
    ]) {
      expect(transform(id, SOURCE)).not.toBeNull();
    }
  });

  it('reads the path out of an id carrying a Vite query', () => {
    expect(transform(`${ENTRY}?v=abc123`, SOURCE)).not.toBeNull();
  });

  it('leaves every other file alone', () => {
    for (const id of [
      '/repo/modules/x/ui/src/panel.tsx',
      '/repo/modules/x/src/index.tsx',
      '/repo/modules/x/ui/index.tsx',
    ]) {
      expect(transform(id, SOURCE)).toBeNull();
    }
  });

  it('leaves the explicit defineModule(manifest, { ... }) form untouched', () => {
    expect(transform(ENTRY, 'defineModule(manifest, { id: "x" });')).toBeNull();
    expect(transform(ENTRY, 'export const nothing = 1;')).toBeNull();
  });
});
