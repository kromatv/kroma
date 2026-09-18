// KROMA mail relay: a Cloudflare Worker at mail.kroma.tv. It carries, checks and authorises;
// it writes nothing. A self-hosted server is public code, so nothing it holds can
// authenticate it and an open mailer under kroma.tv would be everyone's spam cannon. So a
// server registers an identity bound to its origin, signs every call, and a person with a
// mailbox activates it: until then the only message it may send is that question, to that
// mailbox. Once active it sends like it would over SMTP, to any mailbox that has not opted
// out, and every message carries the relay's own opt-out link. Routes: POST /v1/register,
// POST /v1/activate, POST /v1/send, GET+POST /confirm/:blob, GET+POST /block/:blob, GET /health.

import { zValidator } from '@hono/zod-validator';
import { Hono, type MiddlewareHandler } from 'hono';
import {
  activationBlob,
  activationUrl,
  blockUrl,
  Marks,
  openBlock,
  openPending,
  PENDING_TTL_SECS,
  sealBlock,
  sealPending,
} from './activation';
import { optOutPage } from './block-page';
import { provesOrigin } from './challenge';
import { type Allowed, exactly, onOrigin, refuseContent } from './content';
import { deliver, type EmailSender, failure, printable } from './deliver';
import { INSTANCE_TTL_SECS, importPublicKey, openSigned, sealInstance } from './identity';
import { banned, budgetKey, type Counters, takeDaily } from './limits';
import {
  ActivatePayload,
  firstIssue,
  PAYLOAD_WINDOW_SECS,
  RegisterRequest,
  SendPayload,
  SignedRequest,
} from './schemas';

export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  GRANT_SECRET: string;
  LIMIT_SECRET: string;
  FROM_ADDRESS: string;
  FROM_NAME: string;
  PUBLIC_URL: string;
  EMAIL?: EmailSender;
  COUNTERS: Counters;
  ENROL_IP: RateLimit;
  SEND_IP: RateLimit;
  SEND_ADDR: RateLimit;
}

const MAX_SMALL_BYTES = 8 * 1024;
const MAX_SEND_BYTES = 256 * 1024;

const ACTIVATE_PER_ADDRESS_DAY = 3;
const ACTIVATE_PER_ORIGIN_DAY = 5;
const SEND_PER_ADDRESS_DAY = 50;
const SEND_PER_ORIGIN_DAY = 200;
// Two budgets, because the two kinds of message cost differently to fake: a
// question can be sent by anyone who registered an origin, a delivery only by
// a server a person activated. Questions must never starve deliveries.
const SEND_PER_DAY = 2000;
const ASK_PER_DAY = 500;

const nowSecs = () => Math.floor(Date.now() / 1000);

const app = new Hono<{ Bindings: Env }>();

app.onError((err, c) => {
  console.error(JSON.stringify({ event: 'relay.unhandled', message: printable(String(err)) }));
  return c.json({ error: 'internal error' }, 500);
});

app.notFound((c) => c.json({ error: 'not found' }, 404));

// Refused off the declared length, before anything reads the body. A body
// with no declared length (chunked) would have to be buffered to be measured,
// which is exactly the work a flood wants done, so it is not accepted at all.
const bounded =
  (max: number): MiddlewareHandler<{ Bindings: Env }> =>
  async (c, next) => {
    if (c.req.method === 'GET' || c.req.method === 'HEAD') return next();
    const declared = c.req.header('content-length');
    const length = Number(declared);
    let refused: Response | null = null;
    if (declared === undefined) {
      refused = c.json({ error: 'content-length required' }, 411);
    } else if (!Number.isInteger(length) || length < 0 || length > max) {
      refused = c.json({ error: 'body too large' }, 413);
    }
    if (refused) {
      await c.req.raw.body?.cancel().catch(() => undefined);
      return refused;
    }
    await next();
  };

app.use('/v1/register', bounded(MAX_SMALL_BYTES));
app.use('/v1/activate', bounded(MAX_SMALL_BYTES));
app.use('/v1/send', bounded(MAX_SEND_BYTES));

const validate = <T extends typeof RegisterRequest | typeof SignedRequest>(schema: T) =>
  zValidator('json', schema, (result, c) => {
    if (!result.success) return c.json({ error: firstIssue(result.error) }, 400);
    return undefined;
  });

const callerKey = (header: string | undefined) => header ?? 'unknown';
const marksOf = (env: Env) => new Marks(env.COUNTERS, env.LIMIT_SECRET);

app.get('/health', (c) => c.json({ ok: true, email: Boolean(c.env.EMAIL) }));

// `POST /v1/register` - a server presents its origin and its key. The one
// unauthenticated call: a public origin must prove it holds the key, and the
// answer is a sealed instance the server signs everything else with.
app.post('/v1/register', validate(RegisterRequest), async (c) => {
  const { success } = await c.env.ENROL_IP.limit({
    key: callerKey(c.req.header('cf-connecting-ip')),
  });
  if (!success) return c.json({ error: 'too many registrations' }, 429);

  const { origin, publicKey } = c.req.valid('json');
  if (!(await importPublicKey(publicKey))) {
    return c.json({ error: 'publicKey: not a P-256 point' }, 400);
  }
  if (await banned(c.env.COUNTERS, await budgetKey(c.env.LIMIT_SECRET, origin))) {
    return c.json({ error: 'this origin is shut out' }, 403);
  }
  if (!(await provesOrigin(origin, publicKey))) {
    return c.json({ error: 'the origin did not answer the challenge with this key' }, 403);
  }
  const expiresAt = nowSecs() + INSTANCE_TTL_SECS;
  const instance = await sealInstance(c.env.GRANT_SECRET, {
    o: origin,
    k: publicKey,
    e: expiresAt,
  });
  return c.json({ instance, expiresAt: expiresAt * 1000 });
});

// Every authenticated call: the instance's key must vouch for the payload,
// and the origin must not be shut out.
async function authenticated(env: Env, request: SignedRequest, now: number) {
  const signed = await openSigned(env.GRANT_SECRET, request, now);
  if (!signed) return { error: 'invalid instance or signature', status: 401 as const };
  const originKey = await budgetKey(env.LIMIT_SECRET, signed.instance.o);
  if (await banned(env.COUNTERS, originKey)) {
    return { error: 'this origin is shut out', status: 403 as const };
  }
  return { ...signed, originKey };
}

const stale = (ts: number, now: number) => Math.abs(now - ts) > PAYLOAD_WINDOW_SECS;

// `POST /v1/activate` - an instance asks for the link its owner's mailbox may
// click. Minting is what the budgets are spent on, so a flood of questions is
// stopped before any message exists. The caller's address rides in the link,
// so the page that asks can show which machine is behind the origin.
app.post('/v1/activate', validate(SignedRequest), async (c) => {
  const { success } = await c.env.ENROL_IP.limit({
    key: callerKey(c.req.header('cf-connecting-ip')),
  });
  if (!success) return c.json({ error: 'too many activation requests' }, 429);

  const now = nowSecs();
  const auth = await authenticated(c.env, c.req.valid('json'), now);
  if ('status' in auth) return c.json({ error: auth.error }, auth.status);
  const parsed = ActivatePayload.safeParse(auth.payload);
  if (!parsed.success) return c.json({ error: firstIssue(parsed.error) }, 400);
  const { to, token, ts } = parsed.data;
  if (stale(ts, now)) return c.json({ error: 'ts: not from about now' }, 400);

  const mailbox = await budgetKey(c.env.LIMIT_SECRET, to);
  if (!(await takeDaily(c.env.COUNTERS, `ask:${mailbox}`, ACTIVATE_PER_ADDRESS_DAY, now))) {
    return c.json({ error: 'this address was asked recently' }, 429);
  }
  if (!(await takeDaily(c.env.COUNTERS, `ask:${auth.originKey}`, ACTIVATE_PER_ORIGIN_DAY, now))) {
    return c.json({ error: 'this origin asked enough for today' }, 429);
  }
  const expiresAt = now + PENDING_TTL_SECS;
  const blob = await sealPending(c.env.GRANT_SECRET, {
    a: to,
    o: auth.instance.o,
    t: token,
    i: c.req.header('cf-connecting-ip') ?? '',
    e: expiresAt,
  });
  return c.json({ url: activationUrl(c.env.PUBLIC_URL, blob), expiresAt: expiresAt * 1000 });
});

// A message from a server nobody activated may only be the question itself,
// to the mailbox it was minted for: every link in it that one live link.
async function activationLinkFor(
  env: Env,
  origin: string,
  to: string,
  text: string,
  html: string,
  now: number,
): Promise<Allowed | null> {
  const link = /https?:\/\/[^\s"'<>()]+/.exec(`${text}\n${html}`)?.[0] ?? '';
  const blob = activationBlob(env.PUBLIC_URL, link);
  if (!blob) return null;
  const pending = await openPending(env.GRANT_SECRET, blob, now);
  if (pending?.o !== origin || pending.a !== to) return null;
  return exactly(link);
}

// What stops one more message to `to`, or `null`: the mailbox's minute and
// day, the origin's day, then the relay's day, on the budget this kind of
// message draws on.
async function overBudget(
  env: Env,
  to: string,
  originKey: string,
  active: boolean,
  now: number,
): Promise<string | null> {
  const mailbox = await budgetKey(env.LIMIT_SECRET, to);
  const minute = await env.SEND_ADDR.limit({ key: mailbox });
  if (!minute.success) return 'too many messages for this address';
  if (!(await takeDaily(env.COUNTERS, `send:${mailbox}`, SEND_PER_ADDRESS_DAY, now))) {
    return 'too many messages for this address today';
  }
  if (active && !(await takeDaily(env.COUNTERS, `send:${originKey}`, SEND_PER_ORIGIN_DAY, now))) {
    return 'this origin sent enough for today';
  }
  const [budget, cap] = active ? ['send', SEND_PER_DAY] : ['ask', ASK_PER_DAY];
  if (!(await takeDaily(env.COUNTERS, budget, cap, now))) {
    return 'the relay is over its daily budget';
  }
  return null;
}

// `POST /v1/send` - an instance sends one message it wrote, to one mailbox.
// An active server's links may lead back to its origin, and the mailbox must
// not have opted out; a server nobody activated may only send the question,
// and its only link the relay's own.
app.post('/v1/send', validate(SignedRequest), async (c) => {
  const { success } = await c.env.SEND_IP.limit({
    key: callerKey(c.req.header('cf-connecting-ip')),
  });
  if (!success) return c.json({ error: 'too many sends' }, 429);

  const now = nowSecs();
  const auth = await authenticated(c.env, c.req.valid('json'), now);
  if ('status' in auth) return c.json({ error: auth.error }, auth.status);
  const parsed = SendPayload.safeParse(auth.payload);
  if (!parsed.success) return c.json({ error: firstIssue(parsed.error) }, 400);
  const message = parsed.data;
  if (stale(message.ts, now)) return c.json({ error: 'ts: not from about now' }, 400);
  if (!c.env.EMAIL) return c.json({ error: 'email is not configured on this relay' }, 503);

  const origin = auth.instance.o;
  const marks = marksOf(c.env);
  const active = await marks.active(origin);
  const allowed = active
    ? onOrigin(origin)
    : await activationLinkFor(c.env, origin, message.to, message.text, message.html, now);
  if (!allowed) return c.json({ error: 'activation required' }, 403);
  if (active && (await marks.blocked(origin, message.to))) {
    return c.json({ error: 'address opted out' }, 410);
  }

  const spent = await overBudget(c.env, message.to, auth.originKey, active, now);
  if (spent) return c.json({ error: spent }, 429);

  const refusal = refuseContent(allowed, message.text, message.html);
  if (refusal) return c.json({ error: refusal }, 422);

  const optOut = active
    ? blockUrl(c.env.PUBLIC_URL, await sealBlock(c.env.GRANT_SECRET, message.to, origin, now))
    : undefined;
  try {
    await deliver(c.env.EMAIL, c.env, message.to, origin, message, optOut);
  } catch (e) {
    const { status, error } = failure(e);
    if (status === 410) await marks.block(origin, message.to);
    return c.json({ error }, status);
  }
  if (active) await marks.refresh(origin);
  return c.json({ delivered: true });
});

// The link in an activation message. The question itself is asked on the
// server's own page, so the relay only sends the browser there with what it
// needs: the token, the blob to post back, and the address the server called
// from, for the page to show beside the host.
app.get('/confirm/:blob', async (c) => {
  const blob = c.req.param('blob');
  const pending = await openPending(c.env.GRANT_SECRET, blob, nowSecs());
  if (!pending) return c.json({ error: 'this link is no longer valid' }, 404);
  const target = new URL(`${pending.o}/verify-email`);
  target.searchParams.set('token', pending.t);
  target.searchParams.set('activate', blob);
  if (pending.i) target.searchParams.set('ip', pending.i);
  return c.redirect(target.toString(), 303);
});

// The click: the server is active from here on, and the browser goes back to
// it to finish the verification the mailbox came for.
app.post('/confirm/:blob', async (c) => {
  const now = nowSecs();
  const pending = await openPending(c.env.GRANT_SECRET, c.req.param('blob'), now);
  if (!pending) return c.json({ error: 'this link is no longer valid' }, 404);
  await marksOf(c.env).activate(pending.o, pending.a);
  const target = new URL(`${pending.o}/verify-email`);
  target.searchParams.set('token', pending.t);
  return c.redirect(target.toString(), 303);
});

// The opt-out link every delivered message carries: a page with one button,
// and the click that stops this server's mail to this mailbox. The mailbox
// that activated the server takes the activation with it.
app.get('/block/:blob', async (c) => {
  const block = await openBlock(c.env.GRANT_SECRET, c.req.param('blob'), nowSecs());
  if (!block) return c.json({ error: 'this link is no longer valid' }, 404);
  return c.html(optOutPage(new URL(block.o).host, false));
});

app.post('/block/:blob', async (c) => {
  const block = await openBlock(c.env.GRANT_SECRET, c.req.param('blob'), nowSecs());
  if (!block) return c.json({ error: 'this link is no longer valid' }, 404);
  const marks = marksOf(c.env);
  await marks.block(block.o, block.a);
  await marks.deactivateBy(block.o, block.a);
  return c.html(optOutPage(new URL(block.o).host, true));
});

export default app;
