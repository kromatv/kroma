// KROMA push relay — a Cloudflare Worker at push.kroma.tv. Apple and Google only accept
// credentials they issued to the account that owns the KROMA app, so an operator's self-hosted
// server can never push under `tv.kroma.mobile` itself - only this relay, which holds those
// credentials, can. Since the server's source is public, there is no shared secret to
// authenticate it with. Instead the relay issues per-device capabilities (see `grant.ts`): the
// app trades its own push token for a sealed grant, hands it to whichever server the reader
// signed into, and that grant can notify exactly that one device. Routes: POST /v1/grant {
// transport, token } -> { grant, expiresAt } POST /v1/push { grant, notification } -> {
// delivered } | 410 gone GET /health -> which transports are armed

import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import * as apns from './apns';
import * as fcm from './fcm';
import { deviceKey, GRANT_TTL_SECS, open, seal } from './grant';
import type { Delivery } from './schemas';
import { firstIssue, GrantRequest, PushRequest } from './schemas';

/** The rate-limit binding's shape. Declared locally rather than pulled from
 * `@cloudflare/workers-types`, which this repo does not install — same approach
 * as the module registry's `ExecCtx`. */
export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  GRANT_SECRET: string;
  APNS_KEY_P8?: string;
  APNS_KEY_ID?: string;
  APNS_TEAM_ID?: string;
  FCM_SERVICE_ACCOUNT?: string;
  APNS_TOPIC: string;
  MINT_LIMIT: RateLimit;
  PUSH_LIMIT: RateLimit;
}

// Bodies are tiny and fixed-shape; anything larger is not one of ours.
const MAX_REQUEST_BYTES = 8 * 1024;

const app = new Hono<{ Bindings: Env }>();

// Every route answers JSON, including its failures, so a server never has to
// guess whether a non-2xx body is a message or a stack trace.
app.onError((err, c) => {
  console.error(JSON.stringify({ event: 'relay.unhandled', message: String(err) }));
  return c.json({ error: 'internal error' }, 500);
});

app.notFound((c) => c.json({ error: 'not found' }, 404));

// Refuse an oversized body before anything reads it: not zod's job and not
// Hono's, since a schema cannot reject bytes it has not parsed, and buffering
// an unbounded body to discover it was junk is exactly the work an attacker
// would like the relay to do. Runs before `zValidator`.
app.use('/v1/*', async (c, next) => {
  const declared = Number(c.req.header('content-length') ?? '0');
  if (declared > MAX_REQUEST_BYTES) return c.json({ error: 'body too large' }, 413);
  await next();
});

// Shared shape for a zod rejection: name the field, never echo the payload.
const validate = <T extends typeof GrantRequest | typeof PushRequest>(schema: T) =>
  zValidator('json', schema, (result, c) => {
    if (!result.success) return c.json({ error: firstIssue(result.error) }, 400);
    return undefined;
  });

function appleConfig(env: Env): apns.AppleConfig | null {
  if (!env.APNS_KEY_P8 || !env.APNS_KEY_ID || !env.APNS_TEAM_ID) return null;
  return {
    p8: env.APNS_KEY_P8,
    keyId: env.APNS_KEY_ID,
    teamId: env.APNS_TEAM_ID,
    topic: env.APNS_TOPIC,
  };
}

app.get('/health', (c) =>
  c.json({
    ok: true,
    apns: Boolean(appleConfig(c.env)),
    fcm: Boolean(c.env.FCM_SERVICE_ACCOUNT),
  }),
);

// `POST /v1/grant` - the app trades its device token for a capability.
//
// Deliberately unauthenticated, because there is nobody to authenticate: the
// app is public code and any credential in it would be public too. The token
// IS the proof - a grant can only be minted for a device whose push token the
// caller already holds, and holding it already means being able to receive
// that device's notifications. The rate limit is therefore about cost, not
// authorisation.
app.post('/v1/grant', validate(GrantRequest), async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const { success } = await c.env.MINT_LIMIT.limit({ key: ip });
  if (!success) return c.json({ error: 'too many grant requests' }, 429);

  const { transport, token } = c.req.valid('json');
  const expiresAt = Math.floor(Date.now() / 1000) + GRANT_TTL_SECS;
  const grant = await seal(c.env.GRANT_SECRET, { t: transport, d: token, e: expiresAt });
  return c.json({ grant, expiresAt: expiresAt * 1000 });
});

// `POST /v1/push` - a server spends a grant. The grant is the whole
// authorisation: opening it proves the relay minted it, and what comes out
// names the one device it may reach. A caller cannot widen that, read it, or
// forge another.
app.post('/v1/push', validate(PushRequest), async (c) => {
  const nowSecs = Math.floor(Date.now() / 1000);
  const { grant, notification } = c.req.valid('json');

  const payload = await open(c.env.GRANT_SECRET, grant, nowSecs);
  // One answer for forged, corrupt and expired alike: a caller learns only that
  // this grant is not usable, never which of those it was.
  if (!payload) return c.json({ error: 'invalid grant' }, 401);

  // Keyed on the device rather than the grant or the caller, so re-minting
  // cannot buy a fresh budget and two servers pushing to the same phone share
  // one. This is what bounds a compromised server: it can be noisy to its own
  // users, briefly, and to nobody else.
  const { success } = await c.env.PUSH_LIMIT.limit({ key: await deviceKey(payload.d) });
  if (!success) return c.json({ error: 'too many notifications for this device' }, 429);

  let delivery: Delivery;
  try {
    if (payload.t === 'apns') {
      const config = appleConfig(c.env);
      if (!config) return c.json({ error: 'apple push is not configured on this relay' }, 503);
      delivery = await apns.send(config, payload.d, notification, nowSecs);
    } else {
      if (!c.env.FCM_SERVICE_ACCOUNT) {
        return c.json({ error: 'google push is not configured on this relay' }, 503);
      }
      const account = fcm.parseServiceAccount(c.env.FCM_SERVICE_ACCOUNT);
      delivery = await fcm.send(account, payload.d, notification, nowSecs);
    }
  } catch (e) {
    // An upstream wobble must read as a retryable 502, never as a dead device:
    // the difference is whether the reader keeps their registration.
    console.error(
      JSON.stringify({ event: 'relay.upstream_error', transport: payload.t, message: String(e) }),
    );
    return c.json({ error: 'upstream push service failed' }, 502);
  }

  if (delivery.ok) return c.json({ delivered: true });
  // 410 is the one status a server acts on: it evicts the subscription. Anything
  // else is transient and must not cost the reader their registration.
  if (delivery.gone) return c.json({ delivered: false, gone: true }, 410);
  console.error(
    JSON.stringify({
      event: 'relay.rejected',
      transport: payload.t,
      status: delivery.status,
      reason: delivery.reason,
    }),
  );
  return c.json({ error: `push service returned ${delivery.status}` }, 502);
});

export default app;
