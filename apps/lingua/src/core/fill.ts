import type { Messages } from './catalog';
import { localeFiles, type Shelf, writeCatalog } from './shelf';
import { baseOf, fileOf, inSourceOrder, type Source } from './source';

/** Translations to write into one locale: a key, a plural variant included, and its text. */
export interface Filling {
  readonly locale: string;
  readonly entries: Readonly<Messages>;
}

/** Write translations into the files the source keeps their keys in, as i18n-tools' `fill` does. Returns the keys written. */
export function fill(shelf: Shelf, source: Source, filling: Filling): string[] {
  const files = localeFiles(shelf, filling.locale);
  const touched = new Set<string>();
  const written: string[] = [];
  for (const [key, text] of Object.entries(filling.entries)) {
    if (text === '' || baseOf(source, key) === null) {
      continue;
    }
    const file = fileOf(source, key);
    files.set(file, { ...files.get(file), [key]: text });
    touched.add(file);
    written.push(key);
  }
  for (const file of touched) {
    const at = { locale: filling.locale, file, source: source.locale };
    writeCatalog(shelf, at, inSourceOrder(files.get(file) ?? {}, source));
  }
  return written;
}

/** `catalog` with `key` added where a file kept in key order would have it. */
export function inserted(catalog: Readonly<Messages>, key: string, text: string): Messages {
  const entries = Object.entries(catalog);
  const at = entries.findIndex(([other]) => other > key);
  entries.splice(at === -1 ? entries.length : at, 0, [key, text]);
  return Object.fromEntries(entries);
}
