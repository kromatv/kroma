import { fileURLToPath } from 'node:url';
import { type CatalogsOptions, catalogs } from '@kroma/i18n/vite';
import type { Plugin } from 'vite';
import { DEFAULT_LOCALE_CODE } from '../src/locales/default-locale.ts';

/** KROMA's message catalogs: one folder per locale, one file per namespace. */
export const CORE_LOCALES = fileURLToPath(new URL('../src/locales/', import.meta.url));

/** The catalog folder, wired into a Vite build: types kept in step in
 *  `src/locales/messages.d.ts`, and each namespace travelling with the code
 *  that names its keys, fetched in the rendered locale alone. `kroma()` loads
 *  it for every shell; Metro registers the folder itself and reads the types
 *  `bun run i18n:types` wrote. */
export function kromaCatalogs(options: Pick<CatalogsOptions, 'eager'> = {}): Plugin {
  return catalogs({ dir: CORE_LOCALES, defaultLocale: DEFAULT_LOCALE_CODE, ...options });
}
