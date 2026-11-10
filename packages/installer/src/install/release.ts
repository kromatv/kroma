import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { site } from '@kromatv/site-meta';
import { z } from 'zod';
import { fetchJson } from '../discovery/http';
import type { LogLine } from '../shared/run';
import { download } from './download';

export type Channel = 'stable' | 'canary';

const REPOSITORY = new URL(site.repo).pathname.slice(1);
const RELEASES = `https://api.github.com/repos/${REPOSITORY}/releases`;
const LISTING: Record<Channel, string> = {
  stable: `${RELEASES}/latest`,
  canary: `${RELEASES}/tags/canary`,
};
const LISTING_TIMEOUT_MS = 30_000;
const MAX_LISTING_BYTES = 8 * 1024 * 1024;
const SHA256 = /^sha256:([0-9a-f]{64})$/;

const Release = z.object({
  assets: z.array(
    z.object({
      name: z.string().min(1).max(255),
      size: z.number().int().nonnegative(),
      digest: z.string().nullish(),
      browser_download_url: z.url(),
      updated_at: z.iso.datetime(),
    }),
  ),
});

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
  sha256: string | null;
  updatedMs: number;
}

/**
 * What a channel's release carries on GitHub: the latest release for stable,
 * the rolling prerelease for canary. Read anonymously, which GitHub answers
 * sixty times an hour for one address.
 */
export async function releaseAssets(channel: Channel): Promise<ReleaseAsset[]> {
  const release = await fetchJson(LISTING[channel], Release, {
    timeoutMs: LISTING_TIMEOUT_MS,
    maxBytes: MAX_LISTING_BYTES,
  });
  if (!release) {
    throw new Error(
      `GitHub did not list the ${channel} release. It answers 60 anonymous requests an hour for one address: check the network, or try again later`,
    );
  }
  return release.assets.map((asset) => ({
    name: asset.name,
    url: asset.browser_download_url,
    size: asset.size,
    sha256: SHA256.exec(asset.digest ?? '')?.[1] ?? null,
    updatedMs: Date.parse(asset.updated_at),
  }));
}

/**
 * The asset as a file in `directory`, downloaded unless the file already there
 * has its digest. The directory is emptied first, so it holds the one package
 * and not every build the channel ever served.
 */
export async function fetchAsset(
  asset: ReleaseAsset,
  directory: string,
  log: LogLine,
): Promise<string> {
  if (!asset.sha256) throw new Error(`${asset.name} lists no digest to check a download against`);

  const path = join(directory, asset.name);
  if ((await sha256Of(path)) === asset.sha256) return path;

  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  log(`downloading ${asset.name}`);
  await download(asset.url, path, log, { sha256: asset.sha256, size: asset.size });
  return path;
}

async function sha256Of(path: string): Promise<string | null> {
  const hash = createHash('sha256');
  try {
    for await (const chunk of createReadStream(path)) hash.update(chunk as Uint8Array);
  } catch {
    return null;
  }
  return hash.digest('hex');
}
