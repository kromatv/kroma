import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { renderCatalogTypes } from '../src/catalog-types.ts';
import { type CatalogPath, namespaceOf, parseCatalogPath } from '../src/layout.ts';

/** The declaration the plugin keeps beside the catalogs, gitignored. Named
 *  after the messages rather than a source file, so no editor pairs it with
 *  `catalogs.ts` as that module's own declaration. */
export const TYPES_FILE = 'messages.d.ts';

const ANNOUNCE = fileURLToPath(new URL('../src/announce.ts', import.meta.url));
const VIRTUAL = 'virtual:kroma-catalog/';
const RESOLVED = '\0kroma-catalog:';
const SOURCE = /\.[cm]?[jt]sx?$/;
const KEY_LITERAL = /['"`]([A-Za-z][A-Za-z0-9]*\.[A-Za-z0-9_.-]*)/g;

/** Every `<locale>/<namespace>.json` under `dir`. Files at the top level, the
 *  types among them, are not catalogs. */
export function scanCatalogs(dir: string): CatalogPath[] {
  const files: CatalogPath[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const file of readdirSync(join(dir, entry.name))) {
      const at = parseCatalogPath(`${entry.name}/${file}`);
      if (at) files.push(at);
    }
  }
  return files;
}

function keysOf(dir: string, file: CatalogPath): string[] {
  const parsed: unknown = JSON.parse(
    readFileSync(join(dir, file.locale, `${file.namespace}.json`), 'utf8'),
  );
  return Object.keys(parsed ?? {});
}

/** The keys of every namespace, read from one locale's files. */
export function keysByNamespace(
  dir: string,
  locale: string,
  files: readonly CatalogPath[] = scanCatalogs(dir),
): Map<string, string[]> {
  const keys = new Map<string, string[]>();
  for (const file of files) {
    if (file.locale === locale) keys.set(file.namespace, keysOf(dir, file));
  }
  return keys;
}

export interface CatalogsOptions {
  /** The catalog directory: one folder per locale, one file per namespace. */
  dir: string;
  /** The locale whose files type the keys and decide what a literal names. */
  defaultLocale: string;
  /** Bundle every locale's catalog with the code instead of fetching the
   *  rendered locale's on demand. For a test runner, where nothing should
   *  suspend; a shell leaves it off. */
  eager?: boolean;
}

/** Render the declaration for `dir` and write it only when its text moved. */
export function writeCatalogTypes(
  dir: string,
  defaultLocale: string,
  files: readonly CatalogPath[] = scanCatalogs(dir),
): { path: string; changed: boolean } {
  const path = join(dir, TYPES_FILE);
  const next = renderCatalogTypes({ files, defaultLocale });
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (current === next) return { path, changed: false };
  writeFileSync(path, next);
  return { path, changed: true };
}

function within(root: string, file: string): boolean {
  return file.startsWith(root + sep);
}

function names(literal: string, keys: readonly string[]): boolean {
  if (literal.endsWith('.')) return keys.some((key) => key.startsWith(literal));
  return keys.some((key) => key === literal || key.startsWith(`${literal}.`));
}

/** The namespaces a module reads, judged by its string literals: `'admin.title'`
 *  names `admin` because that key exists, `` `pipeline.t.${stage}` `` names
 *  `pipeline` because keys start with `pipeline.t.`, and `'pipeline.stats'`
 *  names nothing when no such key exists. */
export function namespacesNamedIn(
  code: string,
  keys: ReadonlyMap<string, readonly string[]>,
): string[] {
  const found = new Set<string>();
  for (const match of code.matchAll(KEY_LITERAL)) {
    const literal = match[1] ?? '';
    const namespace = namespaceOf(literal);
    if (found.has(namespace)) continue;
    const own = keys.get(namespace);
    if (own && names(literal, own)) found.add(namespace);
  }
  return [...found].sort((a, b) => a.localeCompare(b));
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

/** The module that hands a namespace to the engine: a loader per locale, so
 *  only the rendered locale is fetched, or the catalogs themselves when eager. */
export function renderNamespaceModule(
  root: string,
  namespace: string,
  files: readonly CatalogPath[],
  eager: boolean,
): string {
  const own = files.filter((file) => file.namespace === namespace);
  const path = (file: CatalogPath) => specifier(join(root, file.locale, `${file.namespace}.json`));
  const lines = [`import { announceCatalogs } from ${specifier(ANNOUNCE)};`];
  const entries = own.map((file, at) => {
    if (!eager)
      return `${JSON.stringify(file.locale)}: () => import(${path(file)}).then((m) => m.default)`;
    lines.push(`import catalog${at} from ${path(file)};`);
    return `${JSON.stringify(file.locale)}: catalog${at}`;
  });
  lines.push(`announceCatalogs(${JSON.stringify(namespace)}, { ${entries.join(', ')} });`);
  return `${lines.join('\n')}\n`;
}

/**
 * Catalogs discovered from a folder, wired two ways.
 *
 * Types: `<dir>/messages.d.ts` is rewritten when the config resolves and, under
 * the dev server, whenever a catalog file appears or disappears. It augments
 * the registry, so a namespace is known to the type checker the moment its
 * file exists.
 *
 * Code: every source module whose string literals name a key gets an import of
 * that key's namespace appended, so the namespace travels in the chunk graph of
 * the code that reads it. The imported module hands the engine one loader per
 * locale; the engine fetches the rendered locale's the moment the chunk
 * evaluates, and `useT` waits for it. Nothing is fetched for a language nobody
 * is reading, and nothing at runtime for a key the source names.
 */
export function catalogs({ dir, defaultLocale, eager = false }: CatalogsOptions): Plugin {
  const root = resolve(dir);
  let files: CatalogPath[] = [];
  let keys = new Map<string, string[]>();
  const rescan = () => {
    files = scanCatalogs(root);
    keys = keysByNamespace(root, defaultLocale, files);
    writeCatalogTypes(root, defaultLocale, files);
  };
  const reread = (file: string) => {
    const at = parseCatalogPath(
      file
        .slice(root.length + 1)
        .split(sep)
        .join('/'),
    );
    if (at?.locale === defaultLocale) keys.set(at.namespace, keysOf(root, at));
  };
  const isCatalog = (file: string) => within(root, file) && file.endsWith('.json');
  const isSource = (id: string) => {
    const [file = ''] = id.split('?');
    if (id.startsWith('\0') || !SOURCE.test(file) || file.endsWith('.d.ts')) return false;
    return !file.includes(`${sep}node_modules${sep}`) && !within(root, file);
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
      const onMoved = (file: string) => {
        if (isCatalog(file)) rescan();
      };
      server.watcher.on('add', onMoved);
      server.watcher.on('unlink', onMoved);
      server.watcher.on('change', (file: string) => {
        if (isCatalog(file)) reread(file);
      });
    },
    resolveId(id) {
      return id.startsWith(VIRTUAL) ? RESOLVED + id.slice(VIRTUAL.length) : undefined;
    },
    load(id) {
      if (!id.startsWith(RESOLVED)) return undefined;
      const namespace = id.slice(RESOLVED.length);
      if (!keys.has(namespace)) return undefined;
      return renderNamespaceModule(root, namespace, files, eager);
    },
    transform(code, id) {
      if (!isSource(id)) return undefined;
      const named = namespacesNamedIn(code, keys);
      if (named.length === 0) return undefined;
      const imports = named.map((namespace) => `import ${JSON.stringify(VIRTUAL + namespace)};`);
      // Appended, never inserted: no line the upstream map knows about moves, so
      // that map still describes the result and nothing has to be regenerated.
      return { code: `${code}\n${imports.join('\n')}\n`, map: null };
    },
  };
}
