import {
  archSupported,
  type Catalog,
  cmpDsmVersion,
  DEFAULT_REPO,
  dsmVersion,
  type Entry,
  type Env,
  entryVersion,
  loadCatalog,
  toDsmPackage,
} from '#site/lib/catalog';

export type ExecCtx = { waitUntil(p: Promise<unknown>): void };

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  });

async function dsmParams(request: Request, url: URL): Promise<URLSearchParams> {
  if (request.method === 'POST') {
    try {
      return new URLSearchParams(await request.text());
    } catch {
      return new URLSearchParams();
    }
  }
  return url.searchParams;
}

function dsmPackages(catalog: Catalog, params: URLSearchParams, origin: string) {
  const arch = params.get('arch');
  if (!archSupported(arch)) return { packages: [] };
  const major = Number.parseInt(params.get('major') ?? '', 10);
  if (!Number.isNaN(major) && major < 7) return { packages: [] };

  const beta = params.get('package_update_channel') === 'beta';
  const stable = catalog.entries.find((e) => e.channel === 'stable');
  const nightly = catalog.entries.find((e) => e.channel === 'nightly');

  // On a tie stable wins: its .spk is the released one.
  let pick: Entry | undefined = stable;
  if (
    beta &&
    nightly &&
    (!stable ||
      cmpDsmVersion(dsmVersion(entryVersion(nightly)), dsmVersion(entryVersion(stable))) > 0)
  ) {
    pick = nightly;
  }
  return { packages: pick ? [toDsmPackage(pick, origin, catalog.repo)] : [] };
}

// The cache key is the SOURCE url, not the request, so no client query param busts it.
async function icon(repo: string, ctx: ExecCtx, fresh: boolean): Promise<Response> {
  const src = `https://raw.githubusercontent.com/${repo}/main/clients/synology/spk/PACKAGE_ICON_256.PNG`;
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const hit = fresh ? undefined : await cache?.match(src);
  if (hit) return hit;
  const res = await fetch(fresh ? `${src}?cb=${Date.now()}` : src, {
    cf: { cacheTtl: fresh ? 0 : 300 },
  } as RequestInit);
  if (!res.ok) return new Response('icon unavailable', { status: 404 });
  const out = new Response(res.body, {
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' },
  });
  if (cache) ctx.waitUntil(cache.put(src, out.clone()));
  return out;
}

/**
 * Everything that is not a page: DSM's Package Center feed, the JSON mirrors,
 * the icon and the favicon. Returns `null` when the request should fall through
 * to the rendered site.
 */
export async function machineResponse(
  request: Request,
  env: Env,
  ctx: ExecCtx,
): Promise<Response | null> {
  const url = new URL(request.url);
  const origin = url.origin;
  const path = url.pathname.replace(/(^|[^/])\/+$/, '$1') || '/';

  if (path === '/ping') return new Response('pong');
  if (path === '/icon.png') {
    return icon(env.GITHUB_REPO || DEFAULT_REPO, ctx, url.searchParams.has('fresh'));
  }
  // `/favicon.svg` is a static asset, which the platform answers before this
  // worker runs. `.ico` is only ever requested by a client that ignored the
  // `<link rel="icon">` in the page, so point it at the real file rather than
  // keeping a second copy of the mark inlined here to serve under a name that
  // is not its format.
  if (path === '/favicon.ico') {
    return Response.redirect(new URL('/favicon.svg', url), 301);
  }

  const isFeed = path === '/catalog.json' || path === '/nightly.json' || path === '/all.json';
  if (path !== '/' && !isFeed) return null;

  // DSM's add-source probe sends a browser-like Accept with no arch/unique params,
  // and answering it with HTML makes DSM parse the page as JSON and fail silently.
  const wantsHtml =
    request.method === 'GET' &&
    (request.headers.get('accept') ?? '').includes('text/html') &&
    !url.searchParams.has('arch') &&
    !url.searchParams.has('unique');
  if (path === '/' && wantsHtml) return Response.redirect(`${origin}/browse`, 302);

  let catalog: Catalog;
  try {
    catalog = await loadCatalog(env, (p) => ctx.waitUntil(p));
  } catch (err) {
    console.error('catalog load failed', err);
    return json({ packages: [], error: 'catalog unavailable' }, 503);
  }

  switch (path) {
    case '/catalog.json': {
      const stable = catalog.entries.find((e) => e.channel === 'stable');
      return json({ packages: stable ? [toDsmPackage(stable, origin, catalog.repo)] : [] });
    }
    case '/nightly.json': {
      const nightly = catalog.entries.find((e) => e.channel === 'nightly');
      return json({ packages: nightly ? [toDsmPackage(nightly, origin, catalog.repo)] : [] });
    }
    case '/all.json':
      return json({
        fetchedAt: catalog.fetchedAt,
        repo: catalog.repo,
        packages: catalog.entries.map((e) => ({
          channel: e.channel,
          version: entryVersion(e),
          published: e.publishedAt,
          size: e.info?.size ?? e.spkSize,
          md5: e.info?.md5,
          link: e.spkUrl,
          release: e.releaseUrl,
        })),
      });
    default:
      return json(dsmPackages(catalog, await dsmParams(request, url), origin));
  }
}
