import { type Catalog, catalogsByLocale, sourcesByNamespace } from '@kroma/i18n';

// The Vite half; `catalogs.ts` beside it is Metro's. Written out in full and
// cast in place: Vite finds `import.meta.glob(...)` by matching the literal
// text, and this package keeps `vite/client` types out.
interface GlobHost {
  glob(pattern: string, options: { eager: true; import: 'default' }): Record<string, Catalog>;
  glob(pattern: string, options: { import: 'default' }): Record<string, () => Promise<Catalog>>;
}

// Only the language names ship up front: the locale set reads `lang.<code>`
// before a single screen renders. Every other namespace arrives with the chunk
// that names its keys (see `@kroma/core/vite`), or through `lazy` on a miss.
export const catalogs = catalogsByLocale(
  (import.meta as unknown as GlobHost).glob('./*/lang.json', { eager: true, import: 'default' }),
);

export const lazy = sourcesByNamespace(
  (import.meta as unknown as GlobHost).glob('./*/*.json', { import: 'default' }),
);
