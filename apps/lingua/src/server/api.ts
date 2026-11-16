import { type Context, Hono } from 'hono';
import type { z } from 'zod';
import { authorizeUrl, userFromCode } from '#site/github/oauth';
import type { Store, User } from '#site/store/store';
import { ConfirmInput, saveConfirms } from './confirms';
import { EditInput, saveEdit } from './edits';
import { credentials, type Env, storeFor } from './env';
import { messagePage } from './go';
import { LocaleInput, startLanguage } from './locales';
import { ProposalInput, sendProposal } from './proposals';
import { resolveViewer } from './request';
import { closeSession, cookie, openSession, randomToken, readCookie } from './session';
import { SETUP_CODE, setupDonePage, setupPage } from './setup';
import { handleDelivery, verifySignature } from './webhook';

/** The slice of the Worker's execution context Lingua uses. */
export interface ExecCtx {
  waitUntil(promise: Promise<unknown>): void;
}

type Ctx = { Bindings: { env: Env; ctx: ExecCtx } };

const FALL_THROUGH = 'x-lingua-fall-through';
const OAUTH = 'lingua_oauth';
const MAX_BODY = 64 * 1024;
const MAX_WEBHOOK = 4 * 1024 * 1024;

const now = () => Math.floor(Date.now() / 1000);
const origin = (c: Context<Ctx>) => new URL(c.req.url).origin;

function sameOrigin(c: Context<Ctx>): boolean {
  const from = c.req.header('origin');
  return from ? from === origin(c) : c.req.header('sec-fetch-site') === 'same-origin';
}

function safeReturn(to: string | undefined): string {
  return to?.startsWith('/') && !to.startsWith('//') && !to.startsWith('/\\') ? to : '/';
}

async function boundedBody(c: Context<Ctx>, limit: number): Promise<string | null> {
  if (Number(c.req.header('content-length') ?? 0) > limit) return null;
  const text = await c.req.text();
  return text.length > limit ? null : text;
}

async function jsonInput<S extends z.ZodType>(c: Context<Ctx>, schema: S): Promise<z.infer<S> | null> {
  const text = await boundedBody(c, MAX_BODY);
  if (text === null) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function contributor(c: Context<Ctx>, refusal: string): Promise<{ store: Store; viewer: User } | Response> {
  if (!sameOrigin(c)) return c.json({ error: 'Forbidden' }, 403);
  const store = await storeFor(c.env.env);
  const viewer = await resolveViewer(c.env.env, store, c.req.header('cookie'), now());
  return viewer ? { store, viewer } : c.json({ error: refusal }, 401);
}

const app = new Hono<Ctx>();

app.get('/health', (c) => c.json({ ok: true, github: credentials(c.env.env) !== null }));

app.get('/setup', (c) => (credentials(c.env.env) ? c.text('Lingua is already set up.', 404) : setupPage(origin(c))));
app.get('/setup/done', async (c) => {
  if (credentials(c.env.env)) return c.text('Lingua is already set up.', 404);
  const code = c.req.query('code') ?? null;
  if (code && SETUP_CODE.test(code)) await (await storeFor(c.env.env)).holdSetupCode(code, now());
  return setupDonePage(code);
});

app.get('/auth/login', (c) => {
  const github = credentials(c.env.env);
  if (!github) return c.text('Sign-in is not configured on this deployment yet.', 503);
  const state = randomToken();
  c.header('Set-Cookie', cookie(OAUTH, `${state} ${safeReturn(c.req.query('to'))}`, 600));
  return c.redirect(authorizeUrl(github, `${origin(c)}/auth/callback`, state));
});

app.get('/auth/callback', async (c) => {
  const github = credentials(c.env.env);
  const [state, to] = (readCookie(c.req.header('cookie'), OAUTH) ?? '').split(' ');
  const code = c.req.query('code');
  if (!github || !code || !state || c.req.query('state') !== state) return c.text('This sign-in link expired. Try again.', 400);
  const store = await storeFor(c.env.env);
  const user = await userFromCode(github, { code, redirectUri: `${origin(c)}/auth/callback` }).catch((error: unknown) => {
    console.error('lingua: sign-in failed', error);
    return null;
  });
  if (!user) return c.text('GitHub did not confirm the sign-in. Try again.', 400);
  c.header('Set-Cookie', await openSession(store, user, now()), { append: true });
  c.header('Set-Cookie', cookie(OAUTH, '', 0), { append: true });
  return c.redirect(safeReturn(to));
});

app.post('/auth/logout', async (c) => {
  if (!sameOrigin(c)) return c.text('Forbidden', 403);
  const store = await storeFor(c.env.env);
  c.header('Set-Cookie', await closeSession(store, c.req.header('cookie')));
  return c.redirect('/', 303);
});

app.put('/api/edits', async (c) => {
  const signedIn = await contributor(c, 'Sign in with GitHub to edit');
  if (signedIn instanceof Response) return signedIn;
  const input = await jsonInput(c, EditInput);
  if (!input) return c.json({ error: 'Malformed request' }, 400);
  const result = await saveEdit(signedIn.store, signedIn.viewer, input, now());
  return result.status === 200
    ? c.json({ draft: result.draft, issues: result.issues })
    : c.json({ error: result.error, issues: result.issues ?? [] }, result.status);
});

app.post('/api/confirm', async (c) => {
  const signedIn = await contributor(c, 'Sign in with GitHub to confirm a translation');
  if (signedIn instanceof Response) return signedIn;
  const input = await jsonInput(c, ConfirmInput);
  if (!input) return c.json({ error: 'Malformed request' }, 400);
  const result = await saveConfirms(signedIn.store, signedIn.viewer, input, now());
  return result.status === 200 ? c.json({ confirmed: result.confirmed }) : c.json({ error: result.error }, result.status);
});

app.post('/api/locales', async (c) => {
  const signedIn = await contributor(c, 'Sign in with GitHub to start a language');
  if (signedIn instanceof Response) return signedIn;
  const input = await jsonInput(c, LocaleInput);
  if (!input) return c.json({ error: 'Malformed request' }, 400);
  const result = await startLanguage(signedIn.store, signedIn.viewer, input, now());
  return result.status === 200 ? c.json({ locale: result.locale, name: result.name }) : c.json({ error: result.error }, result.status);
});

app.post('/api/proposals', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'Forbidden' }, 403);
  const github = credentials(c.env.env);
  if (!github) return c.json({ error: 'This deployment is not connected to GitHub yet' }, 503);
  const store = await storeFor(c.env.env);
  const viewer = await resolveViewer(c.env.env, store, c.req.header('cookie'), now());
  if (!viewer) return c.json({ error: 'Sign in with GitHub to send changes' }, 401);
  const input = await jsonInput(c, ProposalInput);
  if (!input) return c.json({ error: 'Malformed request' }, 400);
  const result = await sendProposal(store, github, viewer, input, origin(c), now());
  return result.status === 200 ? c.json(result.body) : c.json({ error: result.error }, result.status);
});

app.post('/webhook', async (c) => {
  const github = credentials(c.env.env);
  if (!github) return c.text('Not configured', 503);
  const body = await boundedBody(c, MAX_WEBHOOK);
  if (body === null) return c.text('Too large', 413);
  if (!(await verifySignature(github.webhookSecret, body, c.req.header('x-hub-signature-256') ?? null))) {
    return c.text('Bad signature', 401);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return c.text('Malformed payload', 400);
  }
  const store = await storeFor(c.env.env);
  const delivery = { event: c.req.header('x-github-event') ?? '', payload };
  c.env.ctx.waitUntil(
    handleDelivery({ app: github, store, now: now() }, delivery).catch((error: unknown) => console.error('lingua: webhook failed', error)),
  );
  return c.text('Accepted', 202);
});

app.get('/go/:owner/:repo/:locale/:key', async (c) => {
  const store = await storeFor(c.env.env);
  const viewer = await resolveViewer(c.env.env, store, c.req.header('cookie'), now());
  return c.redirect(await messagePage(store, viewer, c.req.param()), 302);
});

app.notFound((c) => c.text('', 404, { [FALL_THROUGH]: '1' }));

/** Answer a request Lingua routes itself (sign-in, edits, confirms, languages, proposals, links, webhook, setup), or null for a page. */
export async function api(request: Request, env: Env, ctx: ExecCtx): Promise<Response | null> {
  const response = await app.fetch(request, { env, ctx });
  return response.headers.has(FALL_THROUGH) ? null : response;
}
