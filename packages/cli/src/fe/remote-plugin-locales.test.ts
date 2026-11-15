import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { kromaRemote } from './remote-plugin';

interface ManifestHooks {
  transform: (code: string, id: string) => { code: string; map: null } | null;
}

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function injected(files: Record<string, object>): string {
  const dir = mkdtempSync(join(tmpdir(), 'kroma-remote-locales-'));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), JSON.stringify(content));
  }
  const entry = join(dir, 'ui', 'src', 'module.tsx');
  const [manifest] = kromaRemote({
    entry,
    manifestPath: join(dir, 'module.json'),
    localesDir: join(dir, 'locales'),
  });
  const hooks = manifest as unknown as ManifestHooks;
  return hooks.transform("export default defineModule({ id: 'x' });\n", entry)?.code ?? '';
}

describe('the catalogs the manifest plugin hands the entry', () => {
  it('are a glob over one file per language, spelled as it always was', () => {
    const code = injected({ 'locales/en.json': { a: 'A' }, 'locales/fr.lock': {} });

    expect(code).toBe(
      "import __kromaManifest from '../../module.json';\nexport default defineModule({ manifest: __kromaManifest, locales: import.meta.glob('../../locales/*.json', { eager: true, import: 'default' }), id: 'x' });\n",
    );
  });

  it('are one merged catalog per language where the module keeps a folder each', () => {
    const code = injected({
      'locales/en/settings/advanced.json': { 'settings.port': 'Port' },
      'locales/en/nav.json': { 'nav.title': 'Notes' },
      'locales/fr/nav.json': { 'nav.title': 'Notes' },
    });

    expect(code).toContain(
      'locales: {"en":{"nav.title":"Notes","settings.port":"Port"},"fr":{"nav.title":"Notes"}}, id: \'x\' });',
    );
    expect(code).not.toContain('import.meta.glob');
  });

  it('leave out the lock of a folder and the notes beside the folders', () => {
    const code = injected({
      'locales/en/nav.json': { 'nav.title': 'Notes' },
      'locales/en/i18n.lock': { version: 1, messages: {} },
      'locales/notes.json': { '*': 'A note.' },
    });

    expect(code).toContain('locales: {"en":{"nav.title":"Notes"}}, id:');
  });

  it('carry a message that spells a replacement pattern as it is written', () => {
    const code = injected({ 'locales/en/nav.json': { 'nav.price': "$& for $1, $$ and $'" } });

    expect(code).toContain(`{"nav.price":"$& for $1, $$ and $'"}`);
  });
});
