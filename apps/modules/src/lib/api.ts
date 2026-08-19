// Everything a MACHINE asks this site for: the RFC 110 documents, the schemas
// that describe them, the legacy catalog a server predating the contract reads,
// the module icons, and the favicon. Anything not routed here falls through to
// the rendered page.

import { trimTrailingSlashes } from '@kroma/registry';
import { workerContext } from '@kroma/site-kit/worker-env';
import { type Context, Hono } from 'hono';
import { iconResponse } from '#site/lib/icon';
import {
  descriptorResponse,
  indexResponse,
  moduleResponse,
  schemaResponse,
} from '#site/lib/registry';
import { type Env, jsonResponse, loadCatalog, UNAVAILABLE } from '#site/lib/source';

export type ExecCtx = { waitUntil(p: Promise<unknown>): void };

type Ctx = { Bindings: { env: Env; ctx: ExecCtx } };

// Hono answers 404 for a path it does not route, which here means "this is a
// page, not a document". The marker separates that from a route's OWN 404 (a
// module the registry does not carry), which must reach the caller.
const FALL_THROUGH = 'x-kroma-fall-through';

const app = new Hono<Ctx>();

// The background hook and the origin, in the shape the loaders take.
const later = (c: Context<Ctx>) => (p: Promise<unknown>) => c.env.ctx.waitUntil(p);
const origin = (c: Context<Ctx>) => new URL(c.req.url).origin;

app.get('/ping', (c) => c.text('pong'));

// `/favicon.svg` is a static asset, which the platform answers before this worker
// runs. `.ico` is only ever requested by a client that ignored the
// `<link rel="icon">` in the page, so point it at the real file rather than
// keeping a second copy of the mark inlined here under a name that is not its
// format.
app.get('/favicon.ico', (c) => c.redirect(new URL('/favicon.svg', c.req.url).toString(), 301));

app.get('/icon/:id/:file', async (c) => {
  const { id, file } = c.req.param();
  const served = await iconResponse(`/icon/${id}/${file}`, c.env.env, later(c));
  return served ?? c.notFound();
});

app.get('/registry.json', (c) => descriptorResponse(c.env.env, later(c), origin(c)));

app.get('/index.json', (c) => indexResponse(c.env.env, later(c)));

app.get('/m/:id{[^/]+[.]json}', (c) => {
  const id = c.req.param('id').replace(/\.json$/, '');
  return moduleResponse(decodeURIComponent(id), c.env.env, later(c));
});

// `/schemas/<version>/<name>.json` is what a `$id` pins; `/schemas/<name>.json`
// is the unversioned alias, always the current one.
const schema = (c: Context<Ctx>, name: string, version: number | undefined) =>
  schemaResponse(name.replace(/\.json$/, ''), version, origin(c)) ?? c.notFound();

app.get('/schemas/:version{[0-9]+}/:name{[^/]+[.]json}', (c) =>
  schema(c, c.req.param('name'), Number(c.req.param('version'))),
);

app.get('/schemas/:name{[^/]+[.]json}', (c) => schema(c, c.req.param('name'), undefined));

// The legacy catalog, still served so a server predating the contract keeps
// working. The bare origin answers it too: a current server pointed at a root
// appends `/registry.json` itself and never asks for `/`, so moving this would
// serve nobody and would break the ones still reading the old shape here.
const catalog = async (c: Context<Ctx>) => {
  const body = await loadCatalog(c.env.env, later(c));
  return body ? jsonResponse(body, 300) : jsonResponse(UNAVAILABLE, 60);
};
app.get('/modules.json', catalog);
app.get('/all.json', catalog);
app.get('/', (c) => {
  const wantsHtml = (c.req.header('accept') ?? '').includes('text/html');
  return wantsHtml ? c.notFound() : catalog(c);
});

app.notFound(() => new Response(null, { status: 404, headers: { [FALL_THROUGH]: '1' } }));

/**
 * The machine answer for a request, or `null` when it should fall through to the
 * rendered site.
 */
export async function machineResponse(
  request: Request,
  env: Env | undefined,
  ctx: ExecCtx,
): Promise<Response | null> {
  // `vite dev` calls the server entry with no bindings at all.
  const resolved = env ?? ((await workerContext()).env as Env);
  const res = await app.fetch(withoutTrailingSlash(request), { env: resolved, ctx });
  return res.headers.has(FALL_THROUGH) ? null : res;
}

// `/modules.json/` is the same document as `/modules.json`. Answered rather than
// redirected: these are read by installers, not browsers.
function withoutTrailingSlash(request: Request): Request {
  const url = new URL(request.url);
  const trimmed = trimTrailingSlashes(url.pathname) || '/';
  if (trimmed === url.pathname) return request;
  url.pathname = trimmed;
  return new Request(url, request);
}
