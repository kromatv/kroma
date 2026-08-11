import { z } from 'zod';
import { Catalog } from '#site/catalog';
import { downloads } from '#site/lib/artifacts';
import { DEFAULT_REPO, type Env, edgeCache, githubHeaders } from '#site/lib/source';

const RELEASES = 25;
const CATALOG_ASSET = 'modules.json';
const CACHE_KEY = 'https://kroma-modules.cache/history-index';
const CACHE_TTL = 21600;

const Release = z.object({
  tag_name: z.string(),
  published_at: z.string().nullish(),
  assets: z
    .array(z.object({ name: z.string(), browser_download_url: z.string() }))
    .default([])
    .catch([]),
});

export const VersionRow = z.object({
  version: z.string(),
  /** The oldest release still shipping this version, and the newest. */
  first: z.string(),
  firstAt: z.string().nullable(),
  last: z.string(),
  url: z.string().nullable(),
  size: z.number().nullable(),
});
export type VersionRow = z.infer<typeof VersionRow>;

const Index = z.record(z.string(), z.array(VersionRow));
type Index = z.infer<typeof Index>;

type Asset = z.infer<typeof Release>['assets'][number];
type Published = { release: z.infer<typeof Release>; asset: Asset };

async function releases(env: Env): Promise<Published[]> {
  const repo = env.GITHUB_REPO || DEFAULT_REPO;
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`, {
    headers: { ...githubHeaders(env), accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`releases ${res.status}`);
  const parsed = z.array(Release).safeParse(await res.json());
  if (!parsed.success) return [];
  return parsed.data
    .flatMap((release) => {
      const asset = release.assets.find((a) => a.name === CATALOG_ASSET);
      return asset ? [{ release, asset }] : [];
    })
    .slice(0, RELEASES);
}

async function catalogOf(env: Env, asset: Asset): Promise<Catalog | null> {
  const res = await fetch(asset.browser_download_url, { headers: githubHeaders(env) });
  if (!res.ok) return null;
  const parsed = Catalog.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}

// Releases arrive newest first, so a row already open is extended backwards.
function fold(index: Index, release: z.infer<typeof Release>, catalog: Catalog): void {
  for (const entry of catalog.modules) {
    if (!entry.version) continue;
    const rows = index[entry.id] ?? [];
    const open = rows.at(-1);
    if (open?.version === entry.version) {
      open.first = release.tag_name;
      open.firstAt = release.published_at ?? null;
      continue;
    }
    const file = downloads(entry)[0] ?? null;
    rows.push({
      version: entry.version,
      first: release.tag_name,
      firstAt: release.published_at ?? null,
      last: release.tag_name,
      url: file?.url ?? null,
      size: file?.size ?? null,
    });
    index[entry.id] = rows;
  }
}

async function buildIndex(env: Env): Promise<Index> {
  const list = await releases(env);
  const catalogs = await Promise.all(list.map(({ asset }) => catalogOf(env, asset)));
  const index: Index = {};
  for (const [at, { release }] of list.entries()) {
    const catalog = catalogs[at];
    if (catalog) fold(index, release, catalog);
  }
  return index;
}

/**
 * Which version of `id` every recent KROMA release shipped, newest first, read
 * back from the `modules.json` each release publishes. Empty when GitHub cannot
 * be reached.
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
