import { groupMessages, type Message, namespaceOf, variantOf } from '@kromatv/i18n/model';
import type { Messages } from './catalog';

/** One locale's catalogs by file under its folder (`nav`, `admin/backup`), in the order i18n-tools reads them. */
export type LocaleFiles = ReadonlyMap<string, Messages>;

/** The source language of a project: every message, and the file each of its keys is written in. */
export interface Source {
  readonly locale: string;
  readonly files: LocaleFiles;
  readonly catalog: Messages;
  readonly messages: ReadonlyMap<string, Message>;
  readonly bases: Set<string>;
  readonly home: ReadonlyMap<string, string>;
}

/** Every file of a locale as one catalog, later files winning a key two of them hold. */
export function merged(files: LocaleFiles): Messages {
  const all: Messages = {};
  for (const catalog of files.values()) {
    Object.assign(all, catalog);
  }
  return all;
}

/** Read the source language out of its files. */
export function sourceOf(locale: string, files: LocaleFiles): Source {
  const catalog = merged(files);
  const { messages } = groupMessages(catalog);
  const home = new Map<string, string>();
  for (const [file, own] of files) {
    for (const key of Object.keys(own)) {
      home.set(key, file);
    }
  }
  return { locale, files, catalog, messages, bases: new Set(messages.keys()), home };
}

/** The message of the source `key` spells: itself, or the base it is a plural variant of. Null for no message. */
export function baseOf(source: Source, key: string): string | null {
  if (source.bases.has(key)) {
    return key;
  }
  return variantOf(key, source.bases)?.base ?? null;
}

/** The file a key belongs in: where the source writes it or its base, else the file named after its namespace. */
export function fileOf(source: Source, key: string): string {
  const written = source.home.get(key);
  if (written !== undefined) {
    return written;
  }
  const base = variantOf(key, source.bases)?.base ?? key;
  return source.home.get(base) ?? source.home.get(`${base}_other`) ?? namespaceOf(key);
}

/** `catalog` in the order the source writes its keys, a variant only the translation has right after its base. */
export function inSourceOrder(catalog: Readonly<Messages>, source: Source): Messages {
  const rank = new Map(Object.keys(source.catalog).map((key, at) => [key, at]));
  const place = (key: string): [number, number] => {
    const own = rank.get(key);
    if (own !== undefined) {
      return [own, 0];
    }
    const base = baseOf(source, key) ?? key;
    return [rank.get(base) ?? rank.get(`${base}_other`) ?? rank.size, 1];
  };
  const keys = Object.keys(catalog).sort((a, b) => {
    const [at, after] = place(a);
    const [other, otherAfter] = place(b);
    return at - other || after - otherAfter || (a < b ? -1 : 1);
  });
  return Object.fromEntries(keys.map((key) => [key, catalog[key] ?? '']));
}
