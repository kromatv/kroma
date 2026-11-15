import { writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Plugin, searchForWorkspaceRoot } from 'vite';
import { type CatalogPath, parseCatalogPath } from '../src/layout.ts';
import { LABEL_NAMESPACE } from '../src/locales.ts';
import type { Catalog } from '../src/types.ts';
import {
  catalogPath,
  completeLocales,
  keysByFile,
  keysOf,
  localeNames,
  readCatalog,
  scanCatalogs,
  writeCatalogTypes,
} from './folder.ts';
import { PROJECT_FILE, readProject } from './project.ts';
import { keysNamedIn, type Usage } from './scan.ts';
import { type BuildUsage, overBoot, renderUsage, usageByChunk } from './usage.ts';

const ANNOUNCE = fileURLToPath(new URL('../src/announce.ts', import.meta.url));
const ENGINE = resolve(fileURLToPath(new URL('..', import.meta.url)));
const VIRTUAL = 'virtual:kroma-catalog/';
const NAMES = 'virtual:kroma-locale-names';
const RESOLVED_NAMES = '\0kroma-locale-names';
const RESOLVED = '\0kroma-catalog:';
const SOURCE = /\.[cm]?[jt]sx?$/;

export interface CatalogsOptions {
  /** The catalog directory: one folder per locale, one file per namespace, and
   *  the `i18n.json` that names the source language. */
  dir: string;
  /** Bundle every locale's catalog with the code instead of fetching the
   *  rendered locale's on demand. For a test runner, where nothing should
   *  suspend; a shell leaves it off. */
  eager?: boolean;
  /** Where a build writes which messages each chunk names, as JSON: the way to
   *  see why a chunk fetches a catalog file, and how much of it it reads. */
  report?: string;
  /** The most messages the client build may fetch before its first screen. A
   *  build past it fails, naming each file and the imports that led to it. */
  boot?: number;
  /** Called under the dev server after a catalog file is saved, added or
   *  removed, once the types are current: where a project keeps whatever else
   *  it derives from the catalogs in step. */
  onSave?: () => void;
}

function within(root: string, file: string): boolean {
  return file.startsWith(root + sep);
}

const UNQUOTABLE = /["'`\\\r\n\u2028\u2029]/;

/** A path as a specifier in generated source. Forward slashes, so Windows
 *  reads like everywhere else, and nothing that could close the quote: a
 *  directory named with one is refused rather than written into a module. */
export function specifier(path: string): string {
  const forward = path.split(sep).join('/');
  if (UNQUOTABLE.test(forward)) throw new Error(`catalog path cannot be imported: ${path}`);
  return `"${forward}"`;
}

/** The module that hands a catalog file to the engine: a loader per locale,
 *  so only the rendered locale is fetched, or the catalogs themselves when
 *  eager. `complete` goes with them, so a locale missing a message of the file
 *  is fetched together with what it falls back to. */
export function renderCatalogModule(
  root: string,
  file: string,
  files: readonly CatalogPath[],
  eager: boolean,
  complete: readonly string[] = [],
): string {
  const own = files.filter((candidate) => candidate.file === file);
  const path = (candidate: CatalogPath) => specifier(catalogPath(root, candidate));
  const lines = [`import { announceCatalogs } from ${specifier(ANNOUNCE)};`];
  const entries = own.map((candidate, at) => {
    if (!eager) {
      return `${JSON.stringify(candidate.locale)}: () => import(${path(candidate)}).then((m) => m.default)`;
    }
    lines.push(`import catalog${at} from ${path(candidate)};`);
    return `${JSON.stringify(candidate.locale)}: catalog${at}`;
  });
  lines.push(
    `announceCatalogs(${JSON.stringify(file)}, { ${entries.join(', ')} }, ${JSON.stringify(complete)});`,
  );
  if (!eager) lines.push(...savedListener(file));
  return `${lines.join('\n')}\n`;
}

/** The event the dev server sends when a catalog file is saved, carrying the
 *  file as it now reads. */
export const SAVED_EVENT = 'kroma:catalog';

// Under the dev server a saved catalog is handed to the engine as it now
// reads, so the page shows the new text without a reload. `import.meta.hot` is
// undefined in a build, which drops the block.
function savedListener(file: string): string[] {
  const name = JSON.stringify(file);
  return [
    'if (import.meta.hot) {',
    `  import.meta.hot.on(${JSON.stringify(SAVED_EVENT)}, (saved) => {`,
    `    if (saved.file === ${name}) announceCatalogs(${name}, { [saved.locale]: saved.catalog });`,
    '  });',
    '}',
  ];
}

/**
 * Catalogs discovered from a folder, wired two ways.
 *
 * Types: `<dir>/messages.d.ts` is rewritten when the config resolves and, under
 * the dev server, whenever a catalog file appears or disappears or a file of
 * the source language is saved. It augments the registry, so a message is
 * known to the type checker, with its variables, the moment it is written.
 *
 * Code: every source module whose string literals name a key gets an import of
 * the catalog file holding it appended, so the file travels in the chunk graph
 * of the code that reads it. The imported module hands the engine one loader
 * per locale; the engine fetches the rendered locale's the moment the chunk
 * evaluates, and `useT` waits for it. Nothing is fetched for a language nobody
 * is reading, and nothing at runtime for a key the source names. A locale that
 * has not translated the whole file is fetched with its fallback.
 */
export function catalogs({ dir, eager = false, onSave, report, boot }: CatalogsOptions): Plugin {
  const root = resolve(dir);
  let source = '';
  let files: CatalogPath[] = [];
  let keys = new Map<string, string[]>();
  const usage = new Map<string, Usage>();
  const reports: Record<string, BuildUsage> = {};
  const measured = report !== undefined || boot !== undefined;
  const rescan = () => {
    source = readProject(root).source;
    files = scanCatalogs(root);
    keys = keysByFile(root, source, files);
    writeCatalogTypes(root, files);
  };
  const catalogAt = (file: string) =>
    parseCatalogPath(
      file
        .slice(root.length + 1)
        .split(sep)
        .join('/'),
    );
  const isCatalog = (file: string) => within(root, file) && file.endsWith('.json');
  const isProject = (file: string) => file === join(root, PROJECT_FILE);
  const isSource = (id: string) => {
    const [file = ''] = id.split('?');
    if (id.startsWith('\0') || !SOURCE.test(file) || file.endsWith('.d.ts')) return false;
    if (file.includes(`${sep}node_modules${sep}`)) return false;
    return !within(root, file) && !within(ENGINE, file);
  };

  return {
    name: 'kroma:catalogs',
    // After the router's code splitter: a route file is cut into an eagerly
    // imported reference and a lazy component, and the literals live in the
    // component. Appending before the cut would put every route's catalogs in
    // the entry.
    enforce: 'post',
    configResolved() {
      rescan();
    },
    configureServer(server) {
      server.watcher.add(root);
      const stale = (file: string) => {
        const ids =
          file === LABEL_NAMESPACE ? [RESOLVED + file, RESOLVED_NAMES] : [RESOLVED + file];
        for (const id of ids) {
          const served = server.moduleGraph?.getModuleById(id);
          if (served) server.moduleGraph.invalidateModule(served);
        }
      };
      const onMoved = (file: string) => {
        if (!isCatalog(file)) return;
        rescan();
        const at = catalogAt(file);
        if (at) stale(at.file);
        onSave?.();
      };
      server.watcher.on('add', onMoved);
      server.watcher.on('unlink', onMoved);
      server.watcher.on('change', (file: string) => {
        if (isProject(file)) return rescan();
        const at = isCatalog(file) ? catalogAt(file) : null;
        if (!at) return;
        stale(at.file);
        if (at.locale === source) {
          keys.set(at.file, keysOf(root, at));
          writeCatalogTypes(root, files);
        }
        onSave?.();
      });
    },
    // A saved catalog would reload the page: nothing that imports it accepts
    // a hot update. The file is sent as it now reads instead, and the module
    // carrying it hands it to the engine. A file that does not parse, saved
    // halfway through an edit, is left to Vite.
    handleHotUpdate({ file, server }) {
      const at = isCatalog(file) ? catalogAt(file) : null;
      if (!at) return undefined;
      let catalog: Catalog;
      try {
        catalog = readCatalog(root, at);
      } catch {
        return undefined;
      }
      server.ws.send({
        type: 'custom',
        event: SAVED_EVENT,
        data: { file: at.file, locale: at.locale, catalog },
      });
      return [];
    },
    generateBundle(_options, bundle) {
      if (!measured) return;
      const base = searchForWorkspaceRoot(this.environment.config.root);
      const built = usageByChunk(bundle, usage, keys, {
        importers: (id) => this.getModuleInfo(id)?.importers ?? [],
        isEntry: (id) => this.getModuleInfo(id)?.isEntry === true,
        label: (id) => relative(base, id),
      });
      reports[this.environment.name] = built;
      if (report) writeFileSync(report, renderUsage(reports));
      const over =
        boot !== undefined && this.environment.name === 'client'
          ? overBoot(built.boot, boot)
          : null;
      if (over) this.error(over);
    },
    resolveId(id) {
      if (id === NAMES) return RESOLVED_NAMES;
      return id.startsWith(VIRTUAL) ? RESOLVED + id.slice(VIRTUAL.length) : undefined;
    },
    load(id) {
      if (id === RESOLVED_NAMES) {
        return `export default ${JSON.stringify(localeNames(root, files))};\n`;
      }
      if (!id.startsWith(RESOLVED)) return undefined;
      const file = id.slice(RESOLVED.length);
      if (!keys.has(file)) return undefined;
      return renderCatalogModule(
        root,
        file,
        files,
        eager,
        completeLocales(root, file, files, source),
      );
    },
    transform(code, id) {
      if (!isSource(id)) return undefined;
      const named = keysNamedIn(code, keys);
      if (named.size === 0) return undefined;
      if (measured) usage.set(id, named);
      const imports = [...named.keys()]
        .sort((a, b) => a.localeCompare(b))
        .map((file) => `import ${JSON.stringify(VIRTUAL + file)};`);
      // Appended, never inserted: no line the upstream map knows about moves, so
      // that map still describes the result and nothing has to be regenerated.
      return { code: `${code}\n${imports.join('\n')}\n`, map: null };
    },
  };
}
