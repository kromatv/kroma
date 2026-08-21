declare module 'virtual:kroma-modules' {
  import type { SiteCatalog } from '#site/lib/modules';

  /** The official module catalog, baked in at build time by `vite/modules.ts`. */
  export const catalog: SiteCatalog;
}

declare module 'virtual:kroma-releases' {
  import type { ChannelBuild } from '#site/lib/channels';
  import type { SiteRelease } from '#site/lib/releases';

  /** Every published release, newest version first, baked in at build time. */
  export const releases: SiteRelease[];

  /** The newest of them: what `/download`'s buttons hand over. */
  export const release: SiteRelease | null;

  /** Every build CI published that no release carries, newest first. */
  export const canary: ChannelBuild[];
}
