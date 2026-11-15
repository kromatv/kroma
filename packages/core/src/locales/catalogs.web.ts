import { type Catalog, sourcesByFile } from '@kromatv/i18n';
import localeNames from 'virtual:kroma-locale-names';

// The Vite half; `catalogs.ts` beside it is Metro's. Written out in full and
// cast in place: Vite finds `import.meta.glob(...)` by matching the literal
// text, and this package keeps `vite/client` types out.
interface GlobHost {
  glob(pattern: string, options: { import: 'default' }): Record<string, () => Promise<Catalog>>;
}

// No catalog ships up front. What the locale set needs before a single screen
// renders is each language's name for itself, one string per language, which
// the catalogs plugin reads off the folders (see `@kromatv/core/vite`). Every
// catalog file arrives with the chunk that names its keys, or through `lazy` on
// a miss. The glob is recursive, since a namespace may be split into a folder
// of files.
export const catalogs: Record<string, Catalog> = {};

export const names: Readonly<Record<string, string>> | undefined = localeNames;

export const deferred: Record<string, () => Catalog> = {};

export const lazy = sourcesByFile(
  (import.meta as unknown as GlobHost).glob('./*/**/*.json', { import: 'default' }),
);
