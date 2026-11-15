import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Catalog, Project } from '@kromatv/i18n/model';
import { LOCALE_TAG, PROJECT_FILE } from '@kromatv/i18n/vite';
import { z } from 'zod';

/** `folder` keeps one folder per locale, holding a file per namespace,
 *  `<locale>/<namespace>.json`, or a folder of files where a namespace is
 *  split, `<locale>/<namespace>/<part>.json`. `flat` keeps one file per
 *  locale, `<locale>.json`, which is how a module ships its messages. */
export type Layout = 'folder' | 'flat';

/** One body of messages with a source language of its own: the app's, or a
 *  module's. */
export interface CatalogSet {
  readonly name: string;
  readonly dir: string;
  readonly layout: Layout;
  readonly project: Project;
  /** Where a module keeps the declaration of its keys, and the package that
   *  declaration augments. A set that has one is a module's. The app's has
   *  none: it keeps its own beside its locales and its `i18n.json`. */
  readonly types?: { readonly path: string; readonly target: string };
}

/** Where a set's files are and how they are laid out: all a read takes. */
export type Shelf = Pick<CatalogSet, 'dir' | 'layout'>;

/** Whether the set keeps its policy in an `i18n.json` beside its locales, as
 *  the app's does. A module's is handed to it, and it has no such file. */
export function keepsPolicy(set: Shelf): boolean {
  return existsSync(join(set.dir, PROJECT_FILE));
}

/** A locale's messages as they sit on disk, by file: the path under the
 *  locale in a `folder` set (`nav`, `admin/users`), and the one file of a
 *  `flat` set under {@link WHOLE}. */
export type LocaleFiles = Map<string, Record<string, string>>;

export const WHOLE = '';

const CatalogFile = z.record(z.string(), z.string());

function parse(path: string): Record<string, string> {
  try {
    const { $schema: _pointer, ...messages } = CatalogFile.parse(
      JSON.parse(readFileSync(path, 'utf8')),
    );
    return messages;
  } catch (error) {
    throw new Error(`${path} is not a flat map of strings`, { cause: error });
  }
}

const EXTENSION = '.json';

function stems(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.isDirectory()) return stems(join(dir, entry.name), `${prefix}${entry.name}/`);
      if (!entry.name.endsWith(EXTENSION)) return [];
      return [`${prefix}${entry.name.slice(0, -EXTENSION.length)}`];
    })
    .sort((a, b) => (a < b ? -1 : 1));
}

/** Every locale the set has on disk, whatever it is named. */
export function localesOf(set: Shelf): string[] {
  if (!existsSync(set.dir)) return [];
  if (set.layout === 'flat') return stems(set.dir).filter((stem) => !stem.includes('/'));
  return readdirSync(set.dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export function isLocaleTag(name: string): boolean {
  return LOCALE_TAG.test(name);
}

export function catalogPath(set: Shelf, locale: string, file: string): string {
  return set.layout === 'flat'
    ? join(set.dir, `${locale}${EXTENSION}`)
    : join(set.dir, locale, ...`${file}${EXTENSION}`.split('/'));
}

/** Where a locale's file is, as a reader of a report would name it. */
export function catalogName(set: CatalogSet, locale: string, file: string): string {
  return set.layout === 'flat' ? `${locale}${EXTENSION}` : `${locale}/${file}${EXTENSION}`;
}

/** The translation state of `locale`. In its folder, so a language is one
 *  folder and nothing else; beside the file where a locale is one file. Never
 *  a `.json`, so no glob over the catalogs reads it as one. */
export function lockPath(set: CatalogSet, locale: string): string {
  return set.layout === 'flat'
    ? join(set.dir, `${locale}.lock`)
    : join(set.dir, locale, 'i18n.lock');
}

/** The lock, as a reader of a report would name it. */
export function lockName(set: CatalogSet, locale: string): string {
  return set.layout === 'flat' ? `${locale}.lock` : `${locale}/i18n.lock`;
}

export function readFiles(set: Shelf, locale: string): LocaleFiles {
  const files: LocaleFiles = new Map();
  if (set.layout === 'flat') {
    const path = catalogPath(set, locale, WHOLE);
    if (existsSync(path)) files.set(WHOLE, parse(path));
    return files;
  }
  const dir = join(set.dir, locale);
  if (!existsSync(dir)) return files;
  for (const file of stems(dir)) files.set(file, parse(catalogPath(set, locale, file)));
  return files;
}

export function merged(files: LocaleFiles): Catalog {
  const all: Record<string, string> = {};
  for (const catalog of files.values()) Object.assign(all, catalog);
  return all;
}

/** Every locale's messages as one catalog each, its files merged in the
 *  order {@link readFiles} gives them. This is what a module's bundle carries,
 *  whichever layout its source keeps. */
export function readCatalogs(set: Shelf): Record<string, Catalog> {
  return Object.fromEntries(
    localesOf(set).map((locale) => [locale, merged(readFiles(set, locale))]),
  );
}

const SCHEMA = '$schema';

// An editor's pointer at the format of the file. It is not a message, and it
// outlives a rewrite: a file keeps the one it has, and a new one takes its
// source language's.
function pointerOf(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return CatalogFile.parse(JSON.parse(readFileSync(path, 'utf8')))[SCHEMA];
  } catch {
    return undefined;
  }
}

export function renderCatalog(catalog: Readonly<Record<string, string>>, pointer?: string): string {
  const content = pointer === undefined ? catalog : { [SCHEMA]: pointer, ...catalog };
  return `${JSON.stringify(content, null, 2)}\n`;
}

/** Write one catalog file, or remove it once it holds nothing. Left alone
 *  when its text would not move. */
export function writeCatalog(
  set: CatalogSet,
  locale: string,
  file: string,
  catalog: Readonly<Record<string, string>>,
): boolean {
  const path = catalogPath(set, locale, file);
  const present = existsSync(path);
  if (Object.keys(catalog).length === 0 && set.layout === 'folder') {
    if (present) rmSync(path);
    if (present && readdirSync(dirname(path)).length === 0)
      rmSync(dirname(path), { recursive: true });
    return present;
  }
  const pointer = pointerOf(path) ?? pointerOf(catalogPath(set, set.project.source, file));
  const next = renderCatalog(catalog, pointer);
  if (present && readFileSync(path, 'utf8') === next) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next);
  return true;
}

/**
 * Start `locale` with one empty catalog to fill, and return its path: the one
 * file of a `flat` set, and in a `folder` set the first file the source
 * language has, because git keeps no folder that holds nothing.
 */
export function startLocale(set: CatalogSet, locale: string): string {
  const [file] = set.layout === 'flat' ? [WHOLE] : readFiles(set, set.project.source).keys();
  if (file === undefined) {
    throw new Error(`${set.name} has no ${set.project.source} message to translate yet`);
  }
  const path = catalogPath(set, locale, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderCatalog({}, pointerOf(catalogPath(set, set.project.source, file))));
  return path;
}
