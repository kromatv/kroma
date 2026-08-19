export type Env = {
  GITHUB_REPO?: string;
  GITHUB_TOKEN?: string;
};

export const DEFAULT_REPO = 'maxscharwath/kroma';

const CACHE_FRESH = 'https://kroma-modules.cache/catalog-fresh';
const CACHE_STALE = 'https://kroma-modules.cache/catalog-stale';

export const UNAVAILABLE = JSON.stringify({
  schema: 2,
  modules: [],
  error: 'catalog unavailable',
});

export const edgeCache = (): Cache | undefined =>
  (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;

export function githubHeaders(env: Env | undefined): Record<string, string> {
  const out: Record<string, string> = { 'user-agent': 'kroma-module-registry' };
  if (env?.GITHUB_TOKEN) out.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return out;
}

export function jsonResponse(body: string, maxAge: number, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${maxAge}`,
      'access-control-allow-origin': '*',
    },
  });
}

// The rolling release that holds nothing but the merged catalog. It used to be
// `releases/latest/download/modules.json`, which tied the catalog to the SERVER
// release: modules could only be published when a version shipped, and `latest`
// described "the modules built alongside the newest server" rather than the
// newest of each module. Modules now release on their own `<id>@<version>` tags
// and modules.yml merges them into this one asset.
const CATALOG_TAG = 'modules';

async function fetchUpstream(env: Env | undefined): Promise<string> {
  const repo = env?.GITHUB_REPO || DEFAULT_REPO;
  const res = await fetch(
    `https://github.com/${repo}/releases/download/${CATALOG_TAG}/modules.json`,
    { headers: githubHeaders(env), redirect: 'follow' },
  );
  if (!res.ok) throw new Error(`modules.json ${res.status}`);
  return res.text();
}

/** The catalog body, or `null` when neither upstream nor the stale edge copy can
 *  produce one. The failure detail goes to the log, never to the caller. */
export async function loadCatalog(
  env: Env | undefined,
  waitUntil: (p: Promise<unknown>) => void,
): Promise<string | null> {
  const cache = edgeCache();
  const hit = await cache?.match(CACHE_FRESH);
  if (hit) return hit.text();
  try {
    const body = await fetchUpstream(env);
    if (cache) {
      waitUntil(cache.put(CACHE_FRESH, jsonResponse(body, 300)));
      waitUntil(cache.put(CACHE_STALE, jsonResponse(body, 604800)));
    }
    return body;
  } catch (err) {
    const stale = await cache?.match(CACHE_STALE);
    if (stale) return stale.text();
    console.error('catalog load failed', err);
    return null;
  }
}
