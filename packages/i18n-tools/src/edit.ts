import { labelKey, namespaceOf, namespaceOfFile, stageOf, variantOf } from '@kromatv/i18n/model';
import { type Lock, writeLock } from './lock.ts';
import {
  type CatalogSet,
  isLocaleTag,
  type LocaleFiles,
  localesOf,
  lockPath,
  readFiles,
  startLocale,
  writeCatalog,
} from './set.ts';
import { fileOf, inspectLocale, readSource, type Source } from './status.ts';

function translations(set: CatalogSet, source: Source): string[] {
  return localesOf(set).filter((locale) => locale !== source.locale && isLocaleTag(locale));
}

/**
 * Put every key of `locale` in the file the source language keeps it in, so a
 * namespace split in the source is split the same way everywhere. A key the
 * source does not know stays where it is. Returns the files that moved.
 */
export function mirror(set: CatalogSet, source: Source, locale: string): string[] {
  if (set.layout === 'flat') return [];
  const files = readFiles(set, locale);
  const placed: LocaleFiles = new Map();
  let moved = false;
  for (const [file, catalog] of files) {
    for (const [key, text] of Object.entries(catalog)) {
      const home = source.bases.has(key) || baseOf(key, source) ? fileOf(set, source, key) : file;
      if (home !== file) moved = true;
      const into = placed.get(home) ?? {};
      into[key] = text;
      placed.set(home, into);
    }
  }
  if (!moved) return [];
  const touched = [...new Set([...files.keys(), ...placed.keys()])];
  return touched.filter((file) =>
    writeCatalog(set, locale, file, inSourceOrder(placed.get(file) ?? {}, source)),
  );
}

export interface Synced {
  /** Locales whose files were rearranged to mirror the source's split. */
  readonly mirrored: string[];
  /** Locales whose lock moved. */
  readonly locked: string[];
}

/** Bring every translation in line with the source: its keys in the files the
 *  source keeps them in, and its lock saying what the files now say. */
export function syncSet(set: CatalogSet): Synced {
  if (!localesOf(set).includes(set.project.source)) return { mirrored: [], locked: [] };
  const source = readSource(set);
  const locales = translations(set, source);
  const mirrored = locales.filter((locale) => mirror(set, source, locale).length > 0);
  const locked = locales.filter((locale) =>
    writeLock(lockPath(set, locale), inspectLocale(set, source, locale).nextLock),
  );
  return { mirrored, locked };
}

/**
 * Move every message whose key starts with `prefix` into `file`, in the source
 * language and then in every other. This is how a namespace that has grown too
 * long is split: `move(set, 'admin.backup', 'admin/backup')`. The file has to
 * belong to the namespace of the keys, since that is what they are loaded by.
 */
export function move(set: CatalogSet, prefix: string, file: string): string[] {
  if (set.layout === 'flat') throw new Error(`${set.name} keeps one file per language`);
  const source = readSource(set);
  const keys = [...source.home.keys()].filter((key) => key.startsWith(prefix));
  const foreign = keys.find((key) => namespaceOf(key) !== namespaceOfFile(file));
  if (foreign !== undefined) {
    throw new Error(
      `${foreign} cannot live in ${file}.json: its namespace is ${namespaceOf(foreign)}`,
    );
  }
  const moving = keys.filter((key) => source.home.get(key) !== file);
  if (moving.length === 0) return [];
  const files = readFiles(set, source.locale);
  const into = files.get(file) ?? {};
  for (const key of moving) {
    const from = files.get(source.home.get(key) as string) ?? {};
    into[key] = from[key] as string;
    delete from[key];
  }
  files.set(file, Object.fromEntries(Object.entries(into).sort(([a], [b]) => (a < b ? -1 : 1))));
  for (const [name, catalog] of files) writeCatalog(set, source.locale, name, catalog);
  syncSet(set);
  return moving;
}

/** The message of the source language `key` spells: itself, or the base it
 *  is a plural variant of. `null` for a key that is no message. */
export function baseOf(key: string, source: Source): string | null {
  if (source.bases.has(key)) return key;
  return variantOf(key, source.bases)?.base ?? null;
}

// A translation follows the order its source is written in, so a diff between
// two languages lines up. A variant only the translation has sits by its base.
function inSourceOrder(catalog: Record<string, string>, source: Source): Record<string, string> {
  const rank = new Map(Object.keys(source.catalog).map((key, at) => [key, at]));
  const place = (key: string): [number, number] => {
    const own = rank.get(key);
    if (own !== undefined) return [own, 0];
    const base = baseOf(key, source) ?? key;
    return [rank.get(base) ?? rank.get(`${base}_other`) ?? rank.size, 1];
  };
  const keys = Object.keys(catalog).sort((a, b) => {
    const [at, after] = place(a);
    const [other, otherAfter] = place(b);
    return at - other || after - otherAfter || (a < b ? -1 : 1);
  });
  return Object.fromEntries(keys.map((key) => [key, catalog[key] as string]));
}

export interface Filled {
  readonly written: string[];
  /** Keys that are no message of the source language, left out. */
  readonly rejected: string[];
}

/**
 * Write translations into the files they belong in: `entries` maps a key, a
 * plural variant included, to its text. A key the source language does not
 * know is refused rather than written, and an empty text removes the key.
 */
export function fill(
  set: CatalogSet,
  locale: string,
  entries: Readonly<Record<string, string>>,
): Filled {
  const source = readSource(set);
  const files = readFiles(set, locale);
  const touched = new Set<string>();
  const written: string[] = [];
  const rejected: string[] = [];
  for (const [key, text] of Object.entries(entries)) {
    if (baseOf(key, source) === null) {
      rejected.push(key);
      continue;
    }
    const file = fileOf(set, source, key);
    const catalog = files.get(file) ?? {};
    files.set(file, catalog);
    if (text === '') delete catalog[key];
    else catalog[key] = text;
    touched.add(file);
    written.push(key);
  }
  for (const file of touched) {
    writeCatalog(set, locale, file, inSourceOrder(files.get(file) ?? {}, source));
  }
  return { written, rejected };
}

/** Remove every key the source language has no message for. Returns them. */
export function prune(set: CatalogSet, locale: string): string[] {
  const { strays } = inspectLocale(set, readSource(set), locale);
  const gone = new Set(strays);
  if (gone.size === 0) return [];
  for (const [file, catalog] of readFiles(set, locale)) {
    const kept = Object.fromEntries(Object.entries(catalog).filter(([key]) => !gone.has(key)));
    writeCatalog(set, locale, file, kept);
  }
  return [...strays];
}

/** Record that `keys` of `locale` were written by a machine, so the report
 *  keeps them apart until someone has read them. Call it after a sync. */
export function markMachine(set: CatalogSet, locale: string, keys: readonly string[]): void {
  const source = readSource(set);
  const lock: Lock = new Map(inspectLocale(set, source, locale).nextLock);
  for (const key of keys) {
    const message = baseOf(key, source);
    const entry = message === null ? undefined : lock.get(message);
    if (message !== null && entry) lock.set(message, { ...entry, machine: true });
  }
  writeLock(lockPath(set, locale), lock);
}

function nameOf(language: string, inLocale: string): string | null {
  try {
    const name = new Intl.DisplayNames([inLocale], { type: 'language' }).of(language);
    if (!name || name === language) return null;
    return name.charAt(0).toLocaleUpperCase(inLocale) + name.slice(1);
  } catch {
    return null;
  }
}

export interface Added {
  readonly locale: string;
  readonly name: string;
  /** The locales that gained a name for the new language. */
  readonly named: string[];
}

/**
 * Start a language: its folder, holding the one message every language has to
 * carry, its own name. The source language and every stable one gain their
 * name for it too, so the picker can list it and their promise still holds.
 * It starts as a draft, which the policy file does not have to say. A set
 * that names no language, a module's, gets an empty catalog to fill.
 */
export function addLocale(set: CatalogSet, locale: string, name?: string): Added {
  if (!isLocaleTag(locale)) throw new Error(`"${locale}" is not a language tag, like de or pt-BR`);
  if (localesOf(set).includes(locale)) throw new Error(`${locale} already exists in ${set.name}`);
  if (readSource(set).catalog[labelKey(set.project.source)] === undefined) {
    startLocale(set, locale);
    return { locale, name: name ?? nameOf(locale, locale) ?? locale, named: [] };
  }
  const endonym = name ?? nameOf(locale, locale) ?? locale;
  const key = labelKey(locale);
  const file = fileOf(set, readSource(set), key);
  const source = set.project.source;
  const spelled = (other: string) => readFiles(set, other).get(file)?.[key] !== undefined;
  if (!spelled(source)) {
    const catalog = readFiles(set, source).get(file) ?? {};
    writeCatalog(set, source, file, inserted(catalog, key, nameOf(locale, source) ?? endonym));
  }
  writeCatalog(set, locale, file, { [key]: endonym });
  const named: string[] = [];
  for (const other of localesOf(set)) {
    if (other === locale || other === source || spelled(other)) continue;
    if (stageOf(set.project, other) !== 'stable') continue;
    fill(set, other, { [key]: nameOf(locale, other) ?? endonym });
    named.push(other);
  }
  return { locale, name: endonym, named };
}

/** `catalog` with `key` added where a file kept in key order would have it. */
export function inserted(
  catalog: Readonly<Record<string, string>>,
  key: string,
  text: string,
): Record<string, string> {
  const entries = Object.entries(catalog);
  const at = entries.findIndex(([other]) => other > key);
  entries.splice(at === -1 ? entries.length : at, 0, [key, text]);
  return Object.fromEntries(entries);
}
