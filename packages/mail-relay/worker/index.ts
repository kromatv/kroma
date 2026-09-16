// KROMA mail relay: a Cloudflare Worker at mail.kroma.tv. A self-hosted server is public
// code, so nothing it holds can authenticate it, and an open mailer under kroma.tv would be
// everyone's spam cannon. So the MAILBOX authorises: the relay sends one fixed consent
// request, and only a click on it mints the sealed grant every later message must spend.
// Routes: POST /v1/enrol, GET+POST /confirm/:blob, POST /v1/send, GET /health.

import { zValidator } from '@hono/zod-validator';
import { Hono, type MiddlewareHandler } from 'hono';
import {
  GRANT_TTL_SECS,
  openGrant,
  openPending,
  PENDING_TTL_SECS,
  sealGrant,
  sealPending,
} from './consent';
import { refuseContent } from './content';
import { deliver, type EmailSender, failure, printable } from './deliver';
import { addressKey, type Counters, takeDaily } from './limits';
import { EnrolRequest, firstIssue, SendRequest } from './schemas';
import { confirmPage, consentEmail, invalidPage } from './templates';

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

const MAX_ENROL_BYTES = 8 * 1024;
const MAX_SEND_BYTES = 96 * 1024;

const ENROL_PER_ADDRESS_DAY = 3;
const SEND_PER_ADDRESS_DAY = 50;
const SEND_PER_DAY = 2000;

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

app.use('/v1/enrol', bounded(MAX_ENROL_BYTES));
app.use('/v1/send', bounded(MAX_SEND_BYTES));

const validate = <T extends typeof EnrolRequest | typeof SendRequest>(schema: T) =>
  zValidator('json', schema, (result, c) => {
    if (!result.success) return c.json({ error: firstIssue(result.error) }, 400);
    return undefined;
  });

const callerKey = (header: string | undefined) => header ?? 'unknown';

app.get('/health', (c) => c.json({ ok: true, email: Boolean(c.env.EMAIL) }));

// `POST /v1/enrol` - a server asks the relay to ask a mailbox. Unauthenticated
// by necessity, so this is the one route that can make the relay write to a
// stranger: the template is fixed, the server's only words are its name, and
// the mailbox's daily budget is small.
app.post('/v1/enrol', validate(EnrolRequest), async (c) => {
  const { success } = await c.env.ENROL_IP.limit({
    key: callerKey(c.req.header('cf-connecting-ip')),
  });
  if (!success) return c.json({ error: 'too many consent requests' }, 429);
  if (!c.env.EMAIL) return c.json({ error: 'email is not configured on this relay' }, 503);

  const { address, origin, serverName, locale, token } = c.req.valid('json');
  const now = nowSecs();
  const mailbox = await addressKey(c.env.LIMIT_SECRET, address);
  if (!(await takeDaily(c.env.COUNTERS, `enrol:${mailbox}`, ENROL_PER_ADDRESS_DAY, now))) {
    return c.json({ error: 'this address was asked recently' }, 429);
  }
  if (!(await takeDaily(c.env.COUNTERS, 'send', SEND_PER_DAY, now))) {
    return c.json({ error: 'the relay is over its daily budget' }, 429);
  }

  const blob = await sealPending(c.env.GRANT_SECRET, {
    a: address,
    o: origin,
    n: serverName,
    l: locale,
    t: token,
    e: now + PENDING_TTL_SECS,
  });
  const message = consentEmail(locale, {
    name: serverName,
    host: new URL(origin).host,
    url: `${c.env.PUBLIC_URL}/confirm/${blob}`,
  });
  try {
    await deliver(c.env.EMAIL, c.env, address, message);
  } catch (e) {
    const { status, error } = failure(e);
    return c.json({ error }, status);
  }
  return c.body(null, 204);
});

app.get('/confirm/:blob', async (c) => {
  const pending = await openPending(c.env.GRANT_SECRET, c.req.param('blob'), nowSecs());
  if (!pending) return c.html(invalidPage('en'), 404);
  return c.html(
    confirmPage(pending.l, {
      name: pending.n,
      host: new URL(pending.o).host,
      address: pending.a,
      action: c.req.path,
    }),
  );
});

// The click. The grant travels back in the browser, so a server on a LAN the
// relay cannot reach still receives it.
app.post('/confirm/:blob', async (c) => {
  const now = nowSecs();
  const pending = await openPending(c.env.GRANT_SECRET, c.req.param('blob'), now);
  if (!pending) return c.html(invalidPage('en'), 404);
  const grant = await sealGrant(c.env.GRANT_SECRET, {
    a: pending.a,
    o: pending.o,
    e: now + GRANT_TTL_SECS,
  });
  const target = new URL(`${pending.o}/verify-email`);
  target.searchParams.set('token', pending.t);
  target.searchParams.set('grant', grant);
  return c.redirect(target.toString(), 303);
});

// `POST /v1/send` - a server spends a grant. The grant names the mailbox and
// the server; the request may name neither, and every link in it must lead
// back to that server.
app.post('/v1/send', validate(SendRequest), async (c) => {
  const { success } = await c.env.SEND_IP.limit({
    key: callerKey(c.req.header('cf-connecting-ip')),
  });
  if (!success) return c.json({ error: 'too many sends' }, 429);

  const now = nowSecs();
  const { grant, subject, text, html } = c.req.valid('json');
  const opened = await openGrant(c.env.GRANT_SECRET, grant, now);
  if (!opened) return c.json({ error: 'invalid grant' }, 401);
  if (!c.env.EMAIL) return c.json({ error: 'email is not configured on this relay' }, 503);

  const mailbox = await addressKey(c.env.LIMIT_SECRET, opened.a);
  const minute = await c.env.SEND_ADDR.limit({ key: mailbox });
  if (!minute.success) return c.json({ error: 'too many messages for this address' }, 429);
  if (!(await takeDaily(c.env.COUNTERS, `send:${mailbox}`, SEND_PER_ADDRESS_DAY, now))) {
    return c.json({ error: 'too many messages for this address today' }, 429);
  }
  if (!(await takeDaily(c.env.COUNTERS, 'send', SEND_PER_DAY, now))) {
    return c.json({ error: 'the relay is over its daily budget' }, 429);
  }

  const refusal = refuseContent(opened.o, text, html);
  if (refusal) return c.json({ error: refusal }, 422);

  try {
    await deliver(c.env.EMAIL, c.env, opened.a, { subject, text, html });
  } catch (e) {
    const { status, error } = failure(e);
    return c.json({ error }, status);
  }
  const renewed = await sealGrant(c.env.GRANT_SECRET, { ...opened, e: now + GRANT_TTL_SECS });
  return c.json({ delivered: true, grant: renewed });
});

export default app;
