import { readFileSync, writeFileSync } from 'node:fs';
import { namespaceOf, namespaceOfFile, variantOf } from '@kromatv/i18n/model';
import { baseOf, fill, inserted, syncSet } from './edit.ts';
import { readLock, writeLock } from './lock.ts';
import {
  type CatalogSet,
  isLocaleTag,
  localesOf,
  lockPath,
  readFiles,
  WHOLE,
  writeCatalog,
} from './set.ts';
import { fileOf, readSource, type Source } from './status.ts';

function sharedPrefix(a: string, b: string): number {
  let length = 0;
  while (length < a.length && a[length] === b[length]) {
    length += 1;
  }
  return length;
}

/**
 * The file a message that does not exist yet goes in: its base's for a plural
 * variant, else, where its namespace is split, the file whose keys look most
 * like it, so `admin.backupRetention` lands beside `admin.backupNow`.
 */
export function homeFor(set: CatalogSet, source: Source, key: string): string {
  if (set.layout === 'flat') {
    return WHOLE;
  }
  if (baseOf(key, source) !== null) {
    return fileOf(set, source, key);
  }
  let best = namespaceOf(key);
  let score = -1;
  for (const [known, file] of source.home) {
    if (namespaceOfFile(file) !== namespaceOf(key)) {
      continue;
    }
    const shared = sharedPrefix(known, key);
    if (shared > score) {
      score = shared;
      best = file;
    }
  }
  return best;
}

export interface Created {
  readonly file: string;
  readonly locales: string[];
}

/**
 * Write a new message: `texts` maps a locale to its text and has to include
 * the source language, which is where a message starts to exist. Refuses a key
 * that is already one.
 */
export function createMessage(
  set: CatalogSet,
  key: string,
  texts: Readonly<Record<string, string>>,
  file?: string,
): Created {
  const source = readSource(set);
  const written = texts[source.locale];
  if (!written) {
    throw new Error(`a message starts in ${source.locale}: give its text first`);
  }
  if (source.catalog[key] !== undefined) {
    throw new Error(`${key} already exists`);
  }
  const home = file ?? homeFor(set, source, key);
  if (set.layout === 'folder' && namespaceOfFile(home) !== namespaceOf(key)) {
    throw new Error(`${key} cannot live in ${home}.json: its namespace is ${namespaceOf(key)}`);
  }
  const catalog = readFiles(set, source.locale).get(home) ?? {};
  writeCatalog(set, source.locale, home, inserted(catalog, key, written));
  const locales = [source.locale];
  for (const [locale, text] of Object.entries(texts)) {
    if (locale === source.locale) {
      continue;
    }
    if (!isLocaleTag(locale)) {
      throw new Error(`"${locale}" is not a language tag`);
    }
    fill(set, locale, { [key]: text });
    locales.push(locale);
  }
  syncSet(set);
  return { file: home, locales };
}

// A message and its plural variants, as old key to new key.
function renames(source: Source, keys: Iterable<string>, from: string, to: string) {
  const bases = new Set([from]);
  const pairs = new Map<string, string>();
  for (const key of keys) {
    if (key === from || variantOf(key, bases)?.base === from) {
      pairs.set(key, `${to}${key.slice(from.length)}`);
    }
  }
  return source.bases.has(from) ? pairs : new Map<string, string>();
}

function renameIn(
  set: CatalogSet,
  source: Source,
  locale: string,
  rename: { from: string; to: string; home: string | null },
): boolean {
  const files = readFiles(set, locale);
  const touched = new Set<string>();
  const names = Array.from(files.keys());
  for (const file of names) {
    const keys = Object.keys(files.get(file) ?? {});
    for (const [old, renamed] of renames(source, keys, rename.from, rename.to)) {
      const origin = { ...files.get(file) };
      const text = origin[old] as string;
      delete origin[old];
      files.set(file, origin);
      const into = rename.home ?? file;
      files.set(into, inserted(files.get(into) ?? {}, renamed, text));
      touched.add(file).add(into);
    }
  }
  for (const file of touched) {
    writeCatalog(set, locale, file, files.get(file) ?? {});
  }
  return touched.size > 0;
}

/**
 * Rename a message in every language, its plural variants and its lock
 * entries with it, so no translation is lost and none turns outdated. Returns
 * the locales that had it.
 */
export function renameMessage(set: CatalogSet, from: string, to: string): string[] {
  const source = readSource(set);
  if (!source.bases.has(from)) {
    throw new Error(`${from} is no message`);
  }
  if (source.catalog[to] !== undefined) {
    throw new Error(`${to} already exists`);
  }
  const moves = namespaceOf(from) !== namespaceOf(to);
  const home = moves ? homeFor(set, source, to) : null;
  const touched = localesOf(set)
    .filter(isLocaleTag)
    .filter((locale) => renameIn(set, source, locale, { from, to, home }));
  for (const locale of touched) {
    if (locale === source.locale) {
      continue;
    }
    const lock = readLock(lockPath(set, locale));
    const entry = lock.get(from);
    if (!entry) {
      continue;
    }
    lock.delete(from);
    lock.set(to, entry);
    writeLock(lockPath(set, locale), lock);
  }
  syncSet(set);
  return touched;
}

/** Delete a message and its plural variants from every language. Returns the
 *  locales that had it. */
export function removeMessage(set: CatalogSet, key: string): string[] {
  const source = readSource(set);
  if (!source.bases.has(key)) {
    throw new Error(`${key} is no message`);
  }
  const touched: string[] = [];
  for (const locale of localesOf(set).filter(isLocaleTag)) {
    for (const [file, catalog] of readFiles(set, locale)) {
      const gone = [...renames(source, Object.keys(catalog), key, key).keys()];
      if (gone.length === 0) {
        continue;
      }
      for (const old of gone) {
        delete catalog[old];
      }
      writeCatalog(set, locale, file, catalog);
      if (!touched.includes(locale)) {
        touched.push(locale);
      }
    }
  }
  syncSet(set);
  return touched;
}

const QUOTES = ["'", '"', '`'];

/** Replace `from` with `to` wherever a file names it as a whole string
 *  literal. Returns the files that changed. */
export function rewriteLiterals(paths: readonly string[], from: string, to: string): string[] {
  const changed: string[] = [];
  for (const path of paths) {
    const text = readFileSync(path, 'utf8');
    if (!text.includes(from)) {
      continue;
    }
    let next = text;
    for (const quote of QUOTES) {
      next = next.split(`${quote}${from}${quote}`).join(`${quote}${to}${quote}`);
    }
    if (next === text) {
      continue;
    }
    writeFileSync(path, next);
    changed.push(path);
  }
  return changed;
}
