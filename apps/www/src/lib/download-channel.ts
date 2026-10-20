import type { ChannelBuild } from '#site/lib/channels';
import type { SiteDownload, SiteRelease } from '#site/lib/releases';

/** Which builds `/download` hands over: the newest release, or the newest of main. */
export type DownloadChannel = 'stable' | 'canary';

const CANARY_NOTES = 'https://github.com/kromatv/kroma/releases/tag/canary';

/** The channel a `?channel=` query asks for; anything but `canary` is stable. */
export const channelFromSearch = (search: string): DownloadChannel =>
  new URLSearchParams(search).get('channel') === 'canary' ? 'canary' : 'stable';

/**
 * The canary channel as one release: for every platform, the file of the newest
 * build that carries one. A push that touched only the desktop rebuilds only the
 * desktop, so the newest build alone would leave the server and the televisions
 * without a file. Null when CI published nothing outside a release.
 */
export function canaryRelease(builds: readonly ChannelBuild[]): SiteRelease | null {
  const newest = builds[0];
  if (!newest) return null;
  const seen = new Set<SiteDownload['target']>();
  const downloads: SiteDownload[] = [];
  for (const build of builds) {
    const fresh = build.downloads.filter((d) => !seen.has(d.target));
    for (const d of fresh) downloads.push(d);
    for (const d of build.downloads) seen.add(d.target);
  }
  return {
    version: newest.version ?? 'canary',
    tag: 'canary',
    publishedAt: newest.builtAt,
    notesUrl: CANARY_NOTES,
    downloads,
  };
}
