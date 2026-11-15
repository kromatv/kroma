import type { Catalog } from './types.ts';

/**
 * Where a catalog file sits: `./<locale>/<namespace>.json`, or one of the
 * files a namespace is split into, `./<locale>/<namespace>/<part>.json`, as
 * deep as the folder goes. The namespace is what every key of the file starts
 * with; how it is split is up to whoever writes the source language.
 */
export interface CatalogPath {
  readonly locale: string;
  readonly namespace: string;
  /** The file under its locale, without the extension: `nav`, `admin/users`.
   *  It is what a catalog is fetched and announced by. */
  readonly file: string;
}

const FILE = /^([^/]+)\/((?:[^/]+\/)*[^/]+)\.json$/;

export function parseCatalogPath(path: string): CatalogPath | null {
  const match = FILE.exec(path.startsWith('./') ? path.slice(2) : path);
  const locale = match?.[1];
  const file = match?.[2];
  if (!locale || !file) return null;
  return { locale, namespace: namespaceOfFile(file), file };
}

/** The namespace a catalog file holds: the first segment of its path. */
export function namespaceOfFile(file: string): string {
  const cut = file.indexOf('/');
  return cut === -1 ? file : file.slice(0, cut);
}

/** Merge the files of a glob into one catalog per locale, as `defineI18n`
 *  takes them. Keys are the glob's paths, values the parsed files. */
export function catalogsByLocale(
  files: Readonly<Record<string, Catalog>>,
): Record<string, Catalog> {
  const merged: Record<string, Record<string, string>> = {};
  for (const [path, catalog] of Object.entries(files)) {
    const at = parseCatalogPath(path);
    if (!at) {
      continue;
    }
    const own = merged[at.locale] ?? {};
    Object.assign(own, catalog);
    merged[at.locale] = own;
  }
  return merged;
}

type Loader = () => Promise<Catalog>;

/** The loaders of a glob regrouped by catalog file, then by locale, as
 *  `defineI18n` takes its `lazy` catalogs: each locale is fetched on its own. */
export function sourcesByFile(
  loaders: Readonly<Record<string, Loader>>,
): Record<string, Record<string, Loader>> {
  const out: Record<string, Record<string, Loader>> = {};
  for (const [path, load] of Object.entries(loaders)) {
    const at = parseCatalogPath(path);
    if (!at) continue;
    const own = out[at.file] ?? {};
    own[at.locale] = load;
    out[at.file] = own;
  }
  return out;
}

/** The namespace a key belongs to: everything before its first dot. */
export function namespaceOf(key: string): string {
  return key.slice(0, key.indexOf('.'));
}
