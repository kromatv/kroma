import { fileOf } from '@kromatv/i18n-tools';
import type { Located } from './sets.ts';

const QUOTE = /\$t\(\s*([\w.-]+)\s*\)/g;

/**
 * Why `text` may not be written under `form`, for what it quotes with
 * `$t(key)`, or `null` where every quote holds. A quoted key has to be a
 * message of the set's source language, and one kept in the catalog file
 * `form` is kept in: a file is fetched on its own, so a message that quotes
 * another file renders the quote as written. A set that keeps one file per
 * locale has no second file to quote.
 */
export function quoteRefusal({ set, source }: Located, form: string, text: string): string | null {
  for (const [, quoted = ''] of text.matchAll(QUOTE)) {
    if (!Object.hasOwn(source.catalog, quoted)) {
      return `${form} quotes ${quoted}, which is no message of ${set.name}`;
    }
    if (set.layout === 'folder' && fileOf(set, source, quoted) !== fileOf(set, source, form)) {
      return `${form} quotes ${quoted}, which is kept in another file: a message only quotes its own`;
    }
  }
  return null;
}
