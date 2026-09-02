import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { catalogsByLocale } from '@kroma/i18n';

const CATALOGS = fileURLToPath(new URL('../../core/src/locales/', import.meta.url));

function catalog(locale: string): Map<string, unknown> {
  const files: Record<string, Record<string, string>> = {};
  for (const file of readdirSync(`${CATALOGS}${locale}`)) {
    if (!file.endsWith('.json')) continue;
    files[`${locale}/${file}`] = JSON.parse(readFileSync(`${CATALOGS}${locale}/${file}`, 'utf8'));
  }
  return new Map(Object.entries(catalogsByLocale(files)[locale] ?? {}));
}

export function locales(): string[] {
  return readdirSync(CATALOGS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * What the app calls `key` in `locale`, read from the catalog the app itself
 * ships. Throws on a key the catalog no longer has, so a renamed message fails
 * the run instead of quietly never matching anything on screen.
 */
export function message(locale: string, key: string): string {
  const text = catalog(locale).get(key);
  if (typeof text !== 'string') throw new Error(`${locale}: no message "${key}"`);
  return text;
}
