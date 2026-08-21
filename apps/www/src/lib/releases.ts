import type { Asset, Release } from '#site/lib/release-feed';
import { classify, TARGETS, type TargetId } from '#site/lib/release-targets';

export interface SiteDownload {
  target: TargetId;
  name: string;
  url: string;
  bytes: number;
  /** 64 lowercase hex characters, or null when GitHub published no digest for the file. */
  sha256: string | null;
  /** When the file itself was uploaded, as GitHub timestamps it. */
  builtAt: string | null;
}

export interface SiteRelease {
  /** `0.1.38`, the version every client in this release reports. */
  version: string;
  tag: string;
  /** When the release was published, or null when it carries no usable date. */
  publishedAt: string | null;
  notesUrl: string;
  downloads: SiteDownload[];
}

// The product's own tag shape. A module ships on `<id>@<version>` and the two
// rolling channels on `canary` and `desktop-latest`, none of which this page
// offers, so a tag that is not `vX.Y.Z` is not a release of KROMA.
const PRODUCT_TAG = /^v(\d+\.\d+\.\d+)$/;

/**
 * A published release reduced to the files this site offers, or null when the
 * document is not one: a draft, a prerelease, or any tag but `vX.Y.Z`.
 *
 * At most one download per platform survives, and the survivor is the file
 * naming this release's own version, so a stray build left on the tag cannot
 * take a platform's button.
 */
export function toSiteRelease(raw: Release): SiteRelease | null {
  const version = PRODUCT_TAG.exec(raw.tag_name)?.[1];
  if (!version || raw.draft || raw.prerelease) return null;

  const rank = (name: string) => (name.includes(version) ? 0 : 1);
  const byVersionThenName = (a: { name: string }, b: { name: string }) =>
    rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);

  const downloads = new Map<TargetId, SiteDownload>();
  for (const asset of [...raw.assets].sort(byVersionThenName)) {
    const target = classify(asset.name);
    if (!target || downloads.has(target)) continue;
    downloads.set(target, toDownload(asset, target));
  }

  return {
    version,
    tag: raw.tag_name,
    publishedAt: toInstant(raw.published_at),
    notesUrl: raw.html_url,
    downloads: [...downloads.values()],
  };
}

/**
 * Every published release of the product, newest version first.
 *
 * Ordered by version rather than by date: a release re-published later must not
 * outrank a higher version, and a tag that is not the product's is not a release.
 */
export function toSiteReleases(feed: readonly Release[]): SiteRelease[] {
  return feed
    .map(toSiteRelease)
    .filter((r): r is SiteRelease => r !== null)
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** `0.1.9` before `0.1.38`, which a string comparison gets backwards. */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** The named platforms this release has a file for, in the order asked. */
export function downloadsFor(
  release: SiteRelease | null,
  targets: readonly TargetId[],
): SiteDownload[] {
  if (!release) return [];
  return targets.flatMap((target) => release.downloads.filter((d) => d.target === target));
}

// A stamp the page cannot read is worse than none: it would reach a `<time>`
// element as a dateTime nothing can parse. Anything but a real instant is null.
function toInstant(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/** Only the files installing on the named platform, or all of them for no name. */
export function onlyLabel(
  downloads: readonly SiteDownload[],
  label: string | null,
): SiteDownload[] {
  if (!label) return [...downloads];
  return downloads.filter((d) => TARGETS[d.target].label === label);
}

/** One asset as the page offers it, on whichever channel published it. */
export function toDownload(asset: Asset, target: TargetId): SiteDownload {
  return {
    target,
    name: asset.name,
    url: asset.browser_download_url,
    bytes: asset.size,
    sha256: sha256(asset.digest),
    builtAt: toInstant(asset.created_at),
  };
}

/** `52807435` as `50.4 MB`, the unit every store shows a download in. */
export function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// A digest the page cannot vouch for is worse than none: it would be copied into
// a `shasum -c` that fails for a reason nobody can see.
function sha256(digest: string | null | undefined): string | null {
  const hex = digest?.startsWith('sha256:') ? digest.slice(7).toLowerCase() : null;
  return hex && /^[0-9a-f]{64}$/.test(hex) ? hex : null;
}
