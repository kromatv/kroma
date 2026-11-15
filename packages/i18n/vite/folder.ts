import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderCatalogTypes } from '../src/catalog-types.ts';
import { type CatalogPath, parseCatalogPath } from '../src/layout.ts';
import { LABEL_NAMESPACE, labelKey } from '../src/locales.ts';
import { baseKeys } from '../src/messages.ts';
import type { Catalog } from '../src/types.ts';
import { readProject } from './project.ts';

/** The declaration the plugin keeps beside the catalogs, gitignored. Named
 *  after the messages rather than a source file, so no editor pairs it with
 *  `catalogs.ts` as that module's own declaration. */
export const TYPES_FILE = 'messages.d.ts';

function walk(dir: string, prefix: string, found: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) walk(join(dir, entry.name), path, found);
    else found.push(path);
  }
}

/** Every catalog file under `dir`: `<locale>/<namespace>.json`, and the files
 *  a namespace is split into under `<locale>/<namespace>/`. Files at the top
 *  level, the types and the project file among them, are not catalogs. */
export function scanCatalogs(dir: string): CatalogPath[] {
  const files: CatalogPath[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const found: string[] = [];
    walk(join(dir, entry.name), entry.name, found);
    for (const path of found.sort((x, y) => (x < y ? -1 : 1))) {
      const at = parseCatalogPath(path);
      if (at) files.push(at);
    }
  }
  return files;
}

/** How a catalog directory keeps its locales: a `folder` each, or one `flat`
 *  `<locale>.json` each. A directory that holds no folder is flat, one that
 *  does not exist yet included. */
export function catalogLayout(dir: string): 'folder' | 'flat' {
  if (!existsSync(dir)) return 'flat';
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.some((entry) => entry.isDirectory()) ? 'folder' : 'flat';
}

/** Where a catalog file is on disk. */
export function catalogPath(dir: string, file: CatalogPath): string {
  return join(dir, file.locale, ...`${file.file}.json`.split('/'));
}

/** One catalog file, as the flat map it holds. */
export function readCatalog(dir: string, file: CatalogPath): Catalog {
  const parsed: unknown = JSON.parse(readFileSync(catalogPath(dir, file), 'utf8'));
  return (parsed ?? {}) as Catalog;
}

export function keysOf(dir: string, file: CatalogPath): string[] {
  return Object.keys(readCatalog(dir, file));
}

/** The keys of every catalog file, read from one locale. */
export function keysByFile(
  dir: string,
  locale: string,
  files: readonly CatalogPath[] = scanCatalogs(dir),
): Map<string, string[]> {
  const keys = new Map<string, string[]>();
  for (const file of files) {
    if (file.locale === locale) keys.set(file.file, keysOf(dir, file));
  }
  return keys;
}

/** One locale's whole catalog, every file merged. */
export function readLocale(
  dir: string,
  locale: string,
  files: readonly CatalogPath[] = scanCatalogs(dir),
): Catalog {
  const merged: Record<string, string> = {};
  for (const file of files) {
    if (file.locale === locale) Object.assign(merged, readCatalog(dir, file));
  }
  return merged;
}

/** Render the declaration for `dir` and write it only when its text moved. */
export function writeCatalogTypes(
  dir: string,
  files: readonly CatalogPath[] = scanCatalogs(dir),
): { path: string; changed: boolean } {
  const path = join(dir, TYPES_FILE);
  const { source } = readProject(dir);
  const locales = [...new Set(files.map((file) => file.locale))];
  if (!locales.includes(source)) {
    throw new Error(`no catalog folder for the source locale "${source}"`);
  }
  const next = renderCatalogTypes({ locales, source: readLocale(dir, source, files) });
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (current === next) return { path, changed: false };
  writeFileSync(path, next);
  return { path, changed: true };
}

/** Each language's name for itself, by locale: the `lang.<code>` message of
 *  its own `lang` file. It is all an app needs of a language before a screen
 *  renders, so it is all that ships up front. A language that has not named
 *  itself yet goes by its code. */
export function localeNames(root: string, files: readonly CatalogPath[]): Record<string, string> {
  const names: Record<string, string> = {};
  for (const locale of new Set(files.map((file) => file.locale))) names[locale] = locale;
  for (const file of files) {
    if (file.file !== LABEL_NAMESPACE) continue;
    const own = readCatalog(root, file)[labelKey(file.locale)];
    if (own) names[file.locale] = own;
  }
  return names;
}

/** The locales whose `file` answers every message the source language
 *  declares there: the ones the engine fetches without a fallback. */
export function completeLocales(
  root: string,
  file: string,
  files: readonly CatalogPath[],
  source: string,
): string[] {
  const own = files.filter((candidate) => candidate.file === file);
  const reference = own.find((candidate) => candidate.locale === source);
  if (!reference) return [];
  const messages = [...baseKeys(readCatalog(root, reference))];
  return own
    .filter((candidate) => {
      if (candidate.locale === source) return true;
      const keys = new Set(keysOf(root, candidate));
      return messages.every((key) => keys.has(key));
    })
    .map((candidate) => candidate.locale);
}
