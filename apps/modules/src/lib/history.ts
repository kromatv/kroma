import { z } from 'zod';
import { DEFAULT_REPO, type Env, edgeCache, githubHeaders } from '#site/lib/source';

// One page of releases covers a long stretch of module history: a module only
// cuts a release when its own bytes change.
const CACHE_KEY = 'https://kroma-modules.cache/history-index';
const CACHE_TTL = 21600;

const Release = z.object({
  tag_name: z.string(),
  published_at: z.string().nullish(),
  assets: z
    .array(z.object({ name: z.string(), browser_download_url: z.string(), size: z.number() }))
    .default([])
    .catch([]),
});

export const VersionRow = z.object({
  version: z.string(),
  /** The release tag holding this version's bundles: `<module-id>@<version>`. */
  tag: z.string(),
  publishedAt: z.string().nullable(),
  url: z.string().nullable(),
  size: z.number().nullable(),
});
export type VersionRow = z.infer<typeof VersionRow>;

const Index = z.record(z.string(), z.array(VersionRow));
type Index = z.infer<typeof Index>;

/**
 * Every module version ever released, keyed by module id.
 *
 * The history used to be reconstructed by opening the `modules.json` of each
 * recent KROMA release and recording which version it carried - the only source
 * available while modules rode the server's release train. Now each module
 * version IS a release (`<module-id>@<version>`), so the tag list is the history:
 * exact, one entry per version, and no catalog downloads at all.
 */
export function foldReleases(releases: z.infer<typeof Release>[]): Index {
  const index: Index = {};
  for (const release of releases) {
    const at = release.tag_name.lastIndexOf('@');
    if (at <= 0) continue; // a server release, or the rolling catalog one
    const id = release.tag_name.slice(0, at);
    const version = release.tag_name.slice(at + 1);
    if (!version) continue;
    // Any bundle will do for a download link; they differ only by target, and
    // the page's own artifact table is where a visitor picks one.
    const asset = release.assets.find((a) => a.name.endsWith('.kmod')) ?? null;
    const rows = index[id] ?? [];
    rows.push({
      version,
      tag: release.tag_name,
      publishedAt: release.published_at ?? null,
      url: asset?.browser_download_url ?? null,
      size: asset?.size ?? null,
    });
    index[id] = rows;
  }
  return index;
}

async function buildIndex(env: Env): Promise<Index> {
  const repo = env.GITHUB_REPO || DEFAULT_REPO;
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, {
    headers: { ...githubHeaders(env), accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`releases ${res.status}`);
  const parsed = z.array(Release).safeParse(await res.json());
  // GitHub lists releases newest first, which is the order the page wants.
  return parsed.success ? foldReleases(parsed.data) : {};
}

/**
 * Every released version of `id`, newest first. Empty when GitHub cannot be
 * reached.
 */
export async function moduleHistory(
  env: Env,
  waitUntil: (p: Promise<unknown>) => void,
  id: string,
): Promise<VersionRow[]> {
  const cache = edgeCache();
  const hit = await cache?.match(CACHE_KEY);
  if (hit) {
    const cached = Index.safeParse(await hit.json().catch(() => null));
    if (cached.success) return cached.data[id] ?? [];
  }
  try {
    const index = await buildIndex(env);
    if (cache && Object.keys(index).length > 0) {
      waitUntil(
        cache.put(
          CACHE_KEY,
          new Response(JSON.stringify(index), {
            headers: {
              'content-type': 'application/json',
              'cache-control': `max-age=${CACHE_TTL}`,
            },
          }),
        ),
      );
    }
    return index[id] ?? [];
  } catch (err) {
    console.error('history load failed', err);
    return [];
  }
}
