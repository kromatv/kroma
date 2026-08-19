// A module's version history, read from the GitHub Releases the pipeline cuts
// (`<id>@<version>`, one per module) rather than from the merged catalog, which
// only ever names the newest of each. The releases ARE the ground truth; the
// catalog is a projection of their current row.
//
// Every asset carries a `digest` GitHub computed itself, so integrity comes off
// the listing and the published `.sha256` sidecars never have to be fetched.

import { base64, type KnownVersions } from '@kroma/registry';
import { z } from 'zod';
import { DEFAULT_REPO, type Env, edgeCache, githubHeaders, jsonResponse } from '#site/lib/source';

// One page per request, and the listing is walked at most this many times: a
// registry's history must not turn one cold request into an unbounded crawl.
const MAX_PAGES = 3;
const PER_PAGE = 100;

const CACHE_HISTORY = 'https://kroma-modules.cache/release-history';
const HISTORY_TTL = 3600;

const Asset = z.object({
  name: z.string(),
  size: z.number().int().nonnegative(),
  browser_download_url: z.string(),
  digest: z.string().nullish(),
});

const Release = z.object({
  tag_name: z.string(),
  draft: z.boolean().default(false),
  assets: z.array(Asset).default([]),
});

const Releases = z.array(Release);

/** `<id>@<version>`, the tag a module's release is cut under. */
const TAG = /^([a-z0-9]+(?:\.[a-z0-9-]+)+)@(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/;

const HEX_DIGEST = /^sha256:([0-9a-f]{64})$/i;

// GitHub reports `sha256:<hex>`; the wire format wants SRI.
function integrityOf(digest: string | null | undefined): string | null {
  const hex = digest?.match(HEX_DIGEST)?.[1];
  if (!hex) return null;
  const bytes = hex.match(/../g)?.map((byte) => Number.parseInt(byte, 16)) ?? [];
  return `sha256-${base64(Uint8Array.from(bytes))}`;
}

// `<id>-<target>.kmod`, or `<id>.kmod` for a bundle with no native binary.
function targetOf(file: string, id: string): string | null {
  const stem = file.slice(0, -'.kmod'.length);
  return stem === id ? null : stem.slice(id.length).replace(/^-/, '') || null;
}

type History = Record<string, KnownVersions>;

function toHistory(releases: z.infer<typeof Releases>): History {
  const out: History = {};
  for (const release of releases) {
    const match = release.draft ? null : TAG.exec(release.tag_name);
    if (!match?.[1] || !match[2]) continue;
    const [, id, version] = match;
    const artifacts = release.assets.flatMap((asset) => {
      const integrity = asset.name.endsWith('.kmod') ? integrityOf(asset.digest) : null;
      // No digest, no entry: an artifact nothing vouches for may not be offered.
      if (!integrity) return [];
      return [
        {
          target: targetOf(asset.name, id),
          url: asset.browser_download_url,
          size: asset.size,
          integrity,
        },
      ];
    });
    if (artifacts.length === 0) continue;
    const versions = out[id]?.versions ?? {};
    versions[version] = { artifacts };
    out[id] = { versions };
  }
  return out;
}

async function fetchReleases(env: Env | undefined): Promise<History> {
  const repo = env?.GITHUB_REPO || DEFAULT_REPO;
  const releases: z.infer<typeof Releases> = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/releases?per_page=${PER_PAGE}&page=${page}`,
      { headers: { ...githubHeaders(env), accept: 'application/vnd.github+json' } },
    );
    if (!res.ok) throw new Error(`releases ${res.status}`);
    const parsed = Releases.parse(await res.json());
    releases.push(...parsed);
    if (parsed.length < PER_PAGE) break;
  }
  return toHistory(releases);
}

/** Every published version of every module, or `{}` when the listing cannot be
 *  read — history enriches a record, it never gates one. */
export async function releaseHistory(
  env: Env | undefined,
  waitUntil: (p: Promise<unknown>) => void,
): Promise<History> {
  const cache = edgeCache();
  const hit = await cache?.match(CACHE_HISTORY);
  if (hit) return (await hit.json()) as History;
  try {
    const history = await fetchReleases(env);
    if (cache) {
      waitUntil(cache.put(CACHE_HISTORY, jsonResponse(JSON.stringify(history), HISTORY_TTL)));
    }
    return history;
  } catch (err) {
    console.error('release history unavailable', err);
    return {};
  }
}
