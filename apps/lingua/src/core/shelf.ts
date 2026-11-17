import { type Messages, parseCatalog, renderCatalog } from './catalog';
import { pathOf, placeOf } from './config';
import { type Lock, parseLock, renderLock } from './lock';

/** One i18n project's files by repository path, under its folder `root`: what a branch holds, or a commit in the making. */
export interface Shelf {
  readonly root: string;
  readonly files: Map<string, string>;
}

/** A shelf holding `files`, each a repository path and its text. */
export function shelfOf(
  root: string,
  files: readonly { readonly path: string; readonly body: string }[],
): Shelf {
  return { root, files: new Map(files.map((file) => [file.path, file.body])) };
}

/** Every locale folder the shelf holds a file in, sorted. */
export function localesOn(shelf: Shelf): string[] {
  const locales = new Set<string>();
  for (const path of shelf.files.keys()) {
    const place = placeOf(shelf.root, path);
    if (place?.locale) {
      locales.add(place.locale);
    }
  }
  return [...locales].sort((a, b) => a.localeCompare(b));
}

function catalogsOf(shelf: Shelf, locale: string): [string, string][] {
  return [...shelf.files].flatMap(([path, text]): [string, string][] => {
    const place = placeOf(shelf.root, path);
    return place?.kind === 'catalog' && place.locale === locale ? [[place.file, text]] : [];
  });
}

/** A locale's catalogs by file, in i18n-tools' order; a file that is not a flat catalog is left out. */
export function localeFiles(shelf: Shelf, locale: string): Map<string, Messages> {
  const files = catalogsOf(shelf, locale)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(([file, text]): [string, Messages][] => {
      const messages = parseCatalog(text)?.messages;
      return messages ? [[file, messages]] : [];
    });
  return new Map(files);
}

/** The text of the project's own file, `i18n.json` or `notes.json`. */
export function projectFile(shelf: Shelf, kind: 'policy' | 'notes'): string | undefined {
  return shelf.files.get(pathOf(shelf.root, { kind, locale: '', file: '' }));
}

/** A locale's lock, empty where it has none. */
export function lockOn(shelf: Shelf, locale: string): Lock {
  return parseLock(shelf.files.get(pathOf(shelf.root, { kind: 'lock', locale, file: '' })));
}

/** Write a locale's lock, unless it holds nothing. */
export function writeLock(shelf: Shelf, locale: string, lock: Lock): void {
  if (lock.size > 0) {
    shelf.files.set(pathOf(shelf.root, { kind: 'lock', locale, file: '' }), renderLock(lock));
  }
}

/** Where a catalog is written, and the source language whose file gives a new one its pointer. */
export interface CatalogAt {
  readonly locale: string;
  readonly file: string;
  readonly source: string;
}

/** Write one catalog file, keeping the `$schema` pointer it has, or the source file's for a new one. */
export function writeCatalog(shelf: Shelf, at: CatalogAt, messages: Readonly<Messages>): void {
  const path = pathOf(shelf.root, { kind: 'catalog', locale: at.locale, file: at.file });
  const pointerAt = (locale: string) => {
    const text = shelf.files.get(pathOf(shelf.root, { kind: 'catalog', locale, file: at.file }));
    return text === undefined ? undefined : parseCatalog(text)?.pointer;
  };
  shelf.files.set(path, renderCatalog(messages, pointerAt(at.locale) ?? pointerAt(at.source)));
}
