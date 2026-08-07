// KROMA module registry (modules.kroma.tv): a Hono worker serving the
// `modules.json` catalog, read live from the latest GitHub Release and
// edge-cached, plus the React site built to ../dist (Worker static assets).
// The site's index.html carries a `__CATALOG__` placeholder the worker fills
// at the edge, so the page paints without a second request, and a
// `<link rel="kroma-modules">` tag, so the bare origin works as a registry
// URL in Admin -> Modules.
import { Hono } from 'hono';
import { KROMA_MARK_SVG } from './brand';
import { DEFAULT_REPO } from './config';

export type Env = {
  GITHUB_REPO?: string;
  GITHUB_TOKEN?: string;
  ASSETS?: { fetch(request: Request): Promise<Response> };
};

const CACHE_FRESH = 'https://kroma-modules.cache/catalog-fresh';
const CACHE_STALE = 'https://kroma-modules.cache/catalog-stale';
const UNAVAILABLE = JSON.stringify({ schema: 2, modules: [], error: 'catalog unavailable' });

const edgeCache = (): Cache | undefined =>
  (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;

async function fetchUpstream(env: Env): Promise<string> {
  const repo = env.GITHUB_REPO || DEFAULT_REPO;
  const headers: Record<string, string> = { 'user-agent': 'kroma-module-registry' };
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  const res = await fetch(`https://github.com/${repo}/releases/latest/download/modules.json`, {
    headers,
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`modules.json ${res.status}`);
  return res.text();
}

/** The catalog body, or `null` when neither upstream nor the stale edge copy
 * can produce one. The failure detail goes to the log, never to the caller:
 * on a public endpoint, `String(err)` would hand out the upstream URL. */
async function loadCatalog(
  env: Env,
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

function jsonResponse(body: string, maxAge: number): Response {
  return new Response(body, {
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${maxAge}`,
      'access-control-allow-origin': '*',
    },
  });
}

// A catalog string is about to land inside a <script> tag: `</script>` (or a
// sneaky `<!--`) in third-party module text must not break out of it.
const inline = (json: string) => json.replaceAll('<', String.raw`\u003c`);

async function landing(
  origin: string,
  catalog: string,
  asset: Response | undefined,
): Promise<Response> {
  // No built site (mid-deploy, tests without a stub): a minimal page that
  // still points tooling and people at the catalog.
  const html = asset?.ok
    ? (await asset.text()).replace('"__CATALOG__"', inline(catalog))
    : `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>KROMA Modules</title>
<link rel="kroma-modules" href="${origin}/modules.json" /></head>
<body><p>KROMA module registry. Catalog: <a href="${origin}/modules.json">modules.json</a></p></body></html>`;
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}

// Non-strict routing so `/modules.json/` still matches `/modules.json`.
const app = new Hono<{ Bindings: Env }>({ strict: false });

app.get('/ping', (c) => c.text('pong'));

// Answered without a catalog load, or the JSON catch-all below would serve
// the whole modules.json for /favicon.ico with a 200. Short cache, so a brand
// change is not pinned at the edge for a day.
app.on('GET', ['/favicon.svg', '/favicon.ico'], (c) =>
  c.body(KROMA_MARK_SVG, 200, {
    'content-type': 'image/svg+xml',
    'cache-control': 'public, max-age=3600',
  }),
);

app.on('GET', ['/modules.json', '/all.json'], async (c) => {
  const catalog = await loadCatalog(c.env, (p) => c.executionCtx.waitUntil(p));
  return catalog ? jsonResponse(catalog, 300) : jsonResponse(UNAVAILABLE, 60);
});

// Everything else: hashed site assets pass through; a browser gets the page
// with the catalog injected; any other client gets the catalog itself (the
// bare origin is a valid registry URL).
app.all('*', async (c) => {
  const url = new URL(c.req.url);
  if (url.pathname !== '/') {
    const asset = await c.env.ASSETS?.fetch(c.req.raw);
    if (asset && asset.status !== 404) return asset;
  }
  const wantsHtml = c.req.method === 'GET' && (c.req.header('accept') ?? '').includes('text/html');
  const loading = loadCatalog(c.env, (p) => c.executionCtx.waitUntil(p));
  if (wantsHtml) {
    // The page template and the catalog it embeds load concurrently.
    const [catalog, asset] = await Promise.all([
      loading,
      c.env.ASSETS?.fetch(new Request(`${url.origin}/index.html`)),
    ]);
    return landing(url.origin, catalog ?? UNAVAILABLE, asset);
  }
  const catalog = await loading;
  return catalog ? jsonResponse(catalog, 300) : jsonResponse(UNAVAILABLE, 60);
});

export default app;
