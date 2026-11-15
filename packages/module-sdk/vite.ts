// The folder layout is the contract: `<id>/module.json` and the catalogs under
// `<id>/locales/` are injected into the `defineModule({ ... })` call in
// `<id>/ui/src/index.tsx`. One `locales/<code>.json` per language is a glob;
// one `locales/<code>/` folder per language is merged here, a catalog per code.

import { dirname, join } from 'node:path';
import { catalogsByLocale } from '@kromatv/i18n/layout';
import { catalogLayout, readCatalog, scanCatalogs } from '@kromatv/i18n/vite';
import type { Plugin } from 'vite';

// `<id>/ui/src/index.tsx` (compiled-in) or `module.tsx` (Module Federation).
const MODULE_ENTRY = /[\\/]ui[\\/]src[\\/](?:index|module)\.tsx?$/;

// The explicit `defineModule(manifest, { ... })` form deliberately does not
// match, leaving an escape hatch for tests and non-plugin builds.
const OPTIONS_ONLY_CALL = /\bdefineModule\s*\(\s*\{/;

const FLAT_CATALOGS =
  "import.meta.glob('../../locales/*.json', { eager: true, import: 'default' })";

interface Injected {
  readonly expression: string;
  /** The files the expression was read from, for a build to watch. A glob
   *  watches its own. */
  readonly read: string[];
}

function withoutPointer(catalog: Readonly<Record<string, string>>): Record<string, string> {
  const { $schema: _pointer, ...messages } = catalog;
  return messages;
}

function catalogsOf(entry: string): Injected {
  const dir = join(dirname(entry), '..', '..', 'locales');
  if (catalogLayout(dir) === 'flat') return { expression: FLAT_CATALOGS, read: [] };
  const found = scanCatalogs(dir);
  const files = found.map(
    (file) => [`${file.locale}/${file.file}.json`, withoutPointer(readCatalog(dir, file))] as const,
  );
  return {
    expression: JSON.stringify(catalogsByLocale(Object.fromEntries(files))),
    read: found.map((file) => join(dir, file.locale, ...`${file.file}.json`.split('/'))),
  };
}

/** Add to the Vite config of anything that bundles module UIs. Relative paths
 *  resolve from the entry file, so each module gets its own manifest/locales. */
export function kromaModule(): Plugin {
  return {
    name: 'kroma-module',
    // Before Vite's own `import.meta.glob` transform, so core expands the
    // injected glob.
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?', 1)[0] ?? id;
      if (!MODULE_ENTRY.test(file) || !OPTIONS_ONLY_CALL.test(code)) return null;
      const { expression: locales, read } = catalogsOf(file);
      for (const catalog of read) this.addWatchFile(catalog);
      const injected = `import __kromaManifest from '../../module.json';\n${code}`.replace(
        OPTIONS_ONLY_CALL,
        () => `defineModule({ manifest: __kromaManifest, locales: ${locales},`,
      );
      return { code: injected, map: null };
    },
  };
}
