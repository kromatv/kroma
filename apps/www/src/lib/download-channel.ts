import { site } from '@kromatv/site-meta';
import { type ChannelBuild, ROLLING_TAG } from '#site/lib/channels';
import type { SiteDownload, SiteRelease } from '#site/lib/releases';

/** Which builds `/download` hands over: the newest release, or the newest of main. */
export type DownloadChannel = 'stable' | 'canary';

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
  const ordered = [...builds].sort((a, b) => Date.parse(b.builtAt) - Date.parse(a.builtAt));
  const newest = ordered[0];
  if (!newest) return null;
  const seen = new Set<SiteDownload['target']>();
  const downloads: SiteDownload[] = [];
  const files = ordered
    .flatMap((build) =>
      build.downloads.map((file) => ({ file, at: Date.parse(file.builtAt ?? build.builtAt) })),
    )
    .sort((a, b) => b.at - a.at)
    .map(({ file }) => file);
  for (const file of files) {
    if (seen.has(file.target)) continue;
    seen.add(file.target);
    downloads.push(file);
  }
  return {
    version: newest.version ?? 'canary',
    tag: ROLLING_TAG.canary,
    publishedAt: newest.builtAt,
    notesUrl: site.links.releases,
    downloads,
  };
}
