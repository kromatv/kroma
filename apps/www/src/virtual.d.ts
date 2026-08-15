declare module 'virtual:kroma-modules' {
  import type { SiteCatalog } from '#site/lib/modules';

  /** The official module catalog, baked in at build time by `vite/modules.ts`. */
  export const catalog: SiteCatalog;
}
