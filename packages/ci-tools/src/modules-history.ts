import {
  type ArtifactRef,
  type DescribedModule,
  Manifest,
  type VersionHistory,
} from '@kromatv/registry';
import { z } from 'zod';

export const Release = z.object({
  tag_name: z.string(),
  draft: z.boolean().default(false),
  assets: z
    .array(
      z.object({
        name: z.string(),
        size: z.number().int().nonnegative(),
        browser_download_url: z.string(),
        digest: z.string().nullish(),
      }),
    )
    .default([]),
});
export type Release = z.infer<typeof Release>;

/** One `<module-id>@<version>` release, with the bundles GitHub vouches for. */
export interface ModuleRelease {
  id: string;
  version: string;
  tag: string;
  artifacts: ArtifactRef[];
}

const TAG = /^([a-z0-9]+(?:\.[a-z0-9-]+)+)@(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/;
const HEX_DIGEST = /^sha256:([0-9a-f]{64})$/i;

function targetOf(file: string, id: string): string | null {
  const stem = file.slice(0, -'.kmod'.length);
  return stem === id ? null : stem.slice(id.length).replace(/^-/, '') || null;
}

function artifactsOf(release: Release, id: string): ArtifactRef[] {
  return release.assets.flatMap((asset) => {
    const sha256 = asset.name.endsWith('.kmod') ? asset.digest?.match(HEX_DIGEST)?.[1] : null;
    if (!sha256) return [];
    return [
      {
        target: targetOf(asset.name, id),
        url: asset.browser_download_url,
        size: asset.size,
        sha256,
      },
    ];
  });
}

/** The module releases `history` does not describe yet. A release with no bundle
 *  GitHub vouches for has nothing to describe and is left out. */
export function missingReleases(
  releases: readonly Release[],
  history: VersionHistory | null,
): ModuleRelease[] {
  return releases.flatMap((release) => {
    const match = release.draft ? null : TAG.exec(release.tag_name);
    if (!match?.[1] || !match[2]) return [];
    const [, id, version] = match;
    if (history?.modules[id]?.[version]) return [];
    const artifacts = artifactsOf(release, id);
    return artifacts.length > 0 ? [{ id, version, tag: release.tag_name, artifacts }] : [];
  });
}

/** Where a release's manifest sits in the repository at its tag. */
export function manifestPath(id: string): string {
  return `modules/${id}/module.json`;
}

/**
 * A release as the history records it, from the manifest its tag packed. Null
 * when that manifest is not one this registry reads, or names another module:
 * the version then stays undescribed, which the Store treats as incompatible.
 */
export function describeRelease(release: ModuleRelease, manifest: unknown): DescribedModule | null {
  const parsed = Manifest.safeParse(manifest);
  if (!parsed.success) return null;
  if (parsed.data.id !== release.id || parsed.data.version !== release.version) return null;
  return { ...parsed.data, artifacts: release.artifacts };
}
