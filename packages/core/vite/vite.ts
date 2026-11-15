import { fileURLToPath } from 'node:url';
import { type CatalogsOptions, catalogs } from '@kromatv/i18n/vite';
import { syncSet, workspace } from '@kromatv/i18n-tools';
import type { Plugin } from 'vite';

/** KROMA's message catalogs: one folder per language, and `i18n.json`. */
export const CORE_LOCALES = fileURLToPath(new URL('../src/locales/', import.meta.url));

// A catalog saved by hand is not valid JSON at every keystroke, and a lock
// that could not be written now is written by the next save or by
// `bun run i18n sync`, which the tests insist on.
function syncLocks(): void {
  try {
    const [core] = workspace();
    if (core) {
      syncSet(core);
    }
  } catch {
    return;
  }
}

/** The catalog folder, wired into a Vite build: types kept in step in
 *  `src/locales/messages.d.ts`, and each catalog file travelling with the code
 *  that names its keys, fetched in the rendered locale alone. Under the dev
 *  server a saved catalog also brings every language's files and lock in line,
 *  as `bun run i18n sync` does. `kroma()` loads it for every shell; Metro
 *  registers the folder itself and reads the types `bun run i18n types` wrote. */
export function kromaCatalogs(options: Pick<CatalogsOptions, 'eager' | 'boot'> = {}): Plugin {
  return catalogs({
    dir: CORE_LOCALES,
    onSave: syncLocks,
    report: process.env.KROMA_I18N_REPORT || undefined,
    ...options,
  });
}
