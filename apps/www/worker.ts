import serverEntry from '@tanstack/react-start/server-entry';
import { paraglideMiddleware } from './src/paraglide/server.js';
import {
  artifactFor,
  type Canary,
  type CanaryBuild,
  isTargetId,
  readLimit,
  readRunId,
  toBuild,
} from './src/server/canary/canary.ts';
import {
  artifactsOf,
  type Env as CanaryEnv,
  latestRuns,
  signedUrl,
  versionAt,
} from './src/server/canary/github.ts';

type Env = CanaryEnv;

// Everything that is not the API is a page. In production Cloudflare answers
// those from the prerendered assets before this script wakes, so this runs in
// `vite dev` and for a miss.
// Through paraglide's middleware, which resolves the locale and holds it for
// the request. The ORIGINAL request goes to the handler, not the middleware's
// delocalized one: TanStack Router delocalizes on its own, and handing it the
// rewritten URL makes both ends rewrite and every /fr page 307 to itself.
const renderPage = (request: Request): Promise<Response> =>
  paraglideMiddleware(request, () => serverEntry.fetch(request));

type ExecCtx = { waitUntil(p: Promise<unknown>): void };

const BASE = '/api/canary';

function trimTrailingSlashes(pathname: string): string {
  let end = pathname.length;
  while (end > 0 && pathname[end - 1] === '/') end--;
  return pathname.slice(0, end);
}

// The channel changes only when main does, so a short edge cache absorbs a burst
// of readers on one fan-out rather than repeating it per visitor.
const cacheKey = (limit: number) => `https://kroma-site.cache/canary/${limit}`;
const CACHE_SECONDS = 300;

const edgeCache = (): Cache | undefined =>
  (globalThis as { caches?: { default?: Cache } }).caches?.default;

const json = (data: unknown, status = 200, seconds = 0) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': seconds > 0 ? `public, max-age=${seconds}` : 'no-store',
    },
  });

async function index(env: Env, origin: string, limit: number, ctx: ExecCtx): Promise<Response> {
  const cache = edgeCache();
  const key = cacheKey(limit);
  const hit = await cache?.match(key);
  if (hit) return hit;

  const runs = await latestRuns(env, limit);
  const resolved = await Promise.all(
    runs.map(async (run) =>
      toBuild(
        run,
        (await artifactsOf(env, run.id)) ?? [],
        await versionAt(env, run.head_sha),
        origin,
      ),
    ),
  );

  const builds = resolved.filter((b): b is CanaryBuild => b !== null);
  const res = json(
    { generatedAt: new Date().toISOString(), builds } satisfies Canary,
    200,
    CACHE_SECONDS,
  );
  if (cache) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

// Resolved fresh on every hit rather than read from the cached index: the URL
// GitHub answers with expires in minutes, so a cached redirect is a dead link.
async function download(env: Env, runId: number, target: string): Promise<Response> {
  if (!isTargetId(target)) return json({ error: 'unknown platform' }, 404);

  const artifacts = await artifactsOf(env, runId);
  if (!artifacts) return json({ error: 'unknown build' }, 404);

  const artifact = artifactFor(artifacts, target);
  if (!artifact) return json({ error: 'this build carries no file for that platform' }, 404);

  const location = await signedUrl(env, artifact.id);
  if (!location) return json({ error: 'GitHub declined the download' }, 502);
  return Response.redirect(location, 302);
}

/**
 * The canary channel, served from the site's own origin.
 *
 * Only `/api/*` reaches this script (`run_worker_first` in wrangler.jsonc);
 * every page is a prerendered asset Cloudflare serves without running anything.
 * It exists because a run artifact is the one document a public repository
 * still refuses to serve anonymously, so the token has to live somewhere.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecCtx): Promise<Response> {
    const url = new URL(request.url);
    const path = (trimTrailingSlashes(url.pathname) || '/').slice(BASE.length) || '/';

    if (!url.pathname.startsWith(BASE)) return renderPage(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: 'method not allowed' }, 405);
    }

    try {
      if (path === '/' || path === '/index.json') {
        return await index(
          env,
          `${url.origin}${BASE}`,
          readLimit(url.searchParams.get('limit')),
          ctx,
        );
      }

      const pinned = /^\/dl\/(\d+)\/([a-z]+)$/.exec(path);
      if (pinned?.[1] && pinned[2]) {
        const runId = readRunId(pinned[1]);
        if (!runId) return json({ error: 'unknown build' }, 404);
        return await download(env, runId, pinned[2]);
      }

      const newest = /^\/dl\/([a-z]+)$/.exec(path);
      if (newest?.[1]) {
        const [run] = await latestRuns(env, 1);
        if (!run) return json({ error: 'no build available' }, 503);
        return await download(env, run.id, newest[1]);
      }
    } catch (err) {
      console.error('canary failed', err);
      return json({ error: 'canary unavailable' }, 503);
    }
    return json({ error: 'not found' }, 404);
  },
};
