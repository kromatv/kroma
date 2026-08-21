import type { Release } from '#site/lib/release-feed';
import { classify } from '#site/lib/release-targets';
import { type SiteDownload, toDownload } from '#site/lib/releases';

/** The two rolling prereleases CI publishes to. Neither is a version of the product. */
export const ROLLING_TAG = { canary: 'canary', desktop: 'desktop-latest' } as const;

export interface ChannelBuild {
  /** `0.1.39`, read off the files themselves, or null when they name none. */
  version: string | null;
  /** When CI uploaded these files, taken from the last one to land. */
  builtAt: string;
  downloads: SiteDownload[];
}

// A rolling tag is a bag of assets, not a list of versions: the canary fleet,
// every per-push .spk and every per-push desktop installer land on the same two
// releases. What separates one build from the next is the version its files
// carry - two .spk uploads forty minutes apart are two pushes, not one build,
// and only the version says so.
//
// The window is for the one case a version cannot settle: a canary writes the
// dated version into every file but the .ipk, whose name carries the bare
// `0.1.39`. A bucket whose version is the stem of another's, uploaded around the
// same time, is the same build.
const RUN_WINDOW_MS = 45 * 60 * 1000;

// Every quantifier is bounded. Unanchored, an unbounded `\d+` before a literal
// makes the search super-linear on a long run of digits, and a version segment
// is never near these limits anyway.
const VERSION = /\d{1,10}\.\d{1,10}\.\d{1,10}(?:[-.][0-9A-Za-z][0-9A-Za-z.]{0,63})?/;
const EXTENSION = /\.[A-Za-z][A-Za-z0-9]*$/;

/** The version a file name carries, or null for a name that carries none. */
export function versionOf(assetName: string): string | null {
  const found = VERSION.exec(assetName.replace(EXTENSION, ''))?.[0];
  if (found === undefined) return null;
  // The suffix run takes any trailing dot with it. Trimmed here rather than in
  // the pattern, where the alternative backtracks.
  let end = found.length;
  while (end > 0 && found[end - 1] === '.') end--;
  return found.slice(0, end);
}

interface Bucket {
  version: string | null;
  at: number;
  downloads: SiteDownload[];
}

// `0.1.39` is the stem of `0.1.39-canary.20260821`, and `0.1.38.3488516` is not
// the stem of `0.1.38.3488548`: the boundary has to be a separator, or every
// version would be the stem of the next one that shares a prefix.
const isStemOf = (stem: string | null, version: string | null) =>
  stem !== null &&
  version !== null &&
  (version.startsWith(`${stem}-`) || version.startsWith(`${stem}.`));

function fold(buckets: Bucket[]): Bucket[] {
  // Longest version first, so a bucket is only ever folded into a more specific
  // one and a host is settled before anything asks to join it.
  const bySpecificity = [...buckets].sort(
    (a, b) => (b.version?.length ?? 0) - (a.version?.length ?? 0),
  );

  const kept: Bucket[] = [];
  for (const bucket of bySpecificity) {
    const host = kept.find(
      (other) =>
        isStemOf(bucket.version, other.version) && Math.abs(other.at - bucket.at) <= RUN_WINDOW_MS,
    );
    if (host) host.downloads.push(...bucket.downloads);
    else kept.push(bucket);
  }
  return kept;
}

/**
 * One rolling prerelease split back into the builds uploaded to it, newest first.
 *
 * An asset this site offers no platform for is dropped, and a run that left
 * nothing installable is not a build.
 */
export function toChannelBuilds(raw: Release | undefined): ChannelBuild[] {
  if (!raw) return [];

  const buckets = new Map<string, Bucket>();
  for (const asset of raw.assets) {
    const target = classify(asset.name);
    const at = Date.parse(asset.created_at ?? raw.published_at ?? '');
    if (!target || Number.isNaN(at)) continue;

    const version = versionOf(asset.name);
    // A file naming no version stands alone, keyed by when it arrived: there is
    // nothing else to tell it apart from the build before it.
    const key = version ?? `at:${at}`;
    const bucket = buckets.get(key) ?? { version, at, downloads: [] };
    bucket.at = Math.max(bucket.at, at);
    bucket.downloads.push(toDownload(asset, target));
    buckets.set(key, bucket);
  }

  return fold([...buckets.values()])
    .sort((a, b) => b.at - a.at)
    .map((bucket) => ({
      version: bucket.version,
      builtAt: new Date(bucket.at).toISOString(),
      downloads: [...bucket.downloads].sort((a, b) => a.target.localeCompare(b.target)),
    }));
}

/**
 * Every build CI has published that no version carries, newest first.
 *
 * Both rolling tags in one list: the fleet a push cut and the server package
 * and desktop installers it left behind are the same kind of thing, and the
 * version each one names is what tells them apart. Read from the same feed the
 * archive is built from, so the channel is part of the prerendered page and
 * costs neither a request nor a token.
 */
export function toCanaryBuilds(feed: readonly Release[]): ChannelBuild[] {
  const byTag = (tag: string) => feed.find((r) => r.tag_name === tag);

  return [
    ...toChannelBuilds(byTag(ROLLING_TAG.canary)),
    ...toChannelBuilds(byTag(ROLLING_TAG.desktop)),
  ].sort((a, b) => Date.parse(b.builtAt) - Date.parse(a.builtAt));
}
