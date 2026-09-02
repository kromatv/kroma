import type { Catalog } from './types';

/** Where a catalog file sits in a folder-per-locale layout:
 *  `./<locale>/<namespace>.json`. */
export interface CatalogPath {
  readonly locale: string;
  readonly namespace: string;
}

const FILE = /^([^/]+)\/([^/]+)\.json$/;

export function parseCatalogPath(path: string): CatalogPath | null {
  const match = FILE.exec(path.startsWith('./') ? path.slice(2) : path);
  const locale = match?.[1];
  const namespace = match?.[2];
  if (!locale || !namespace) return null;
  return { locale, namespace };
}

/** Merge the files of a glob into one catalog per locale, as `defineI18n`
 *  takes them. Keys are the glob's paths, values the parsed files. */
export function catalogsByLocale(
  files: Readonly<Record<string, Catalog>>,
): Record<string, Catalog> {
  const merged: Record<string, Record<string, string>> = {};
  for (const [path, catalog] of Object.entries(files)) {
    const at = parseCatalogPath(path);
    if (!at) continue;
    const own = merged[at.locale] ?? {};
    Object.assign(own, catalog);
    merged[at.locale] = own;
  }
  return merged;
}

type Loader = () => Promise<Catalog>;

/** The loaders of a glob regrouped by namespace, then by locale, as
 *  `defineI18n` takes its `lazy` namespaces: each locale is fetched on its own. */
export function sourcesByNamespace(
  loaders: Readonly<Record<string, Loader>>,
): Record<string, Record<string, Loader>> {
  const out: Record<string, Record<string, Loader>> = {};
  for (const [path, load] of Object.entries(loaders)) {
    const at = parseCatalogPath(path);
    if (!at) continue;
    const own = out[at.namespace] ?? {};
    own[at.locale] = load;
    out[at.namespace] = own;
  }
  return out;
}

/** The namespace a key belongs to: everything before its first dot. */
export function namespaceOf(key: string): string {
  return key.slice(0, key.indexOf('.'));
}
