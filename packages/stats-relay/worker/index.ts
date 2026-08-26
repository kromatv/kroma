// KROMA statistics collector: a Cloudflare Worker at stats.kroma.tv. It answers
// one question, "how many KROMA servers are running, and how many devices do
// they serve", from the heartbeat each install sends once a day while its
// operator has anonymous statistics switched on. Nothing here is sent by an
// app: a KROMA client talks to its own server and to nothing else.
//
// Routes:
//   POST /v1/ping   { schema, id, version, ... }  -> { ok }
//   GET  /v1/stats                                -> the published aggregate
//   GET  /health                                  -> is the database reachable
//
// The id in a ping is an opaque token the install minted for itself. It is the
// whole authorisation, it authorises writing one row, and it is never joined to
// an address: the country below is read from Cloudflare's edge and the address
// is dropped with the request.

import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { configFrom, verify } from './access';
import { aggregate, settling } from './aggregate';
import { burstIds, dayOf } from './integrity';
import { Forget, firstIssue, Ping } from './schemas';
import { type D1Database, d1Store, type Store } from './store';

export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  STATS_DB: D1Database;
  PING_LIMIT: RateLimit;
  NEW_ID_LIMIT: RateLimit;
  // Cloudflare Access, for `/v1/admin/*`. Public facts, not credentials: the
  // assertion is signed with a key only Cloudflare holds, so this Worker still
  // ships no secret. All three unset means the route stays shut.
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_EMAILS?: string;
}

// A ping is a fixed shape with two short lists in it; anything larger is not
// one of ours.
const MAX_REQUEST_BYTES = 4 * 1024;

// Raw rows outlive the published window by this much, then go.
const RETAIN_DAYS = 90;

const DAY = 86_400;

// Long enough that the page is cheap, short enough that a new install sees
// itself the day after it settles.
const STATS_MAX_AGE = 3600;

type Vars = { store: Store; now: number };

async function keyOf(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Never cached, never shared across origins, and never served over anything but
// the HTTPS the custom domain enforces.
const PRIVATE_HEADERS = {
  'cache-control': 'no-store, private',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'referrer-policy': 'no-referrer',
  vary: 'Cf-Access-Jwt-Assertion, Cookie',
} as const;

// Access presents its assertion as a header on a service call and as a cookie in
// a browser session. Both are the same token.
function assertion(request: Request): string | undefined {
  const header = request.headers.get('cf-access-jwt-assertion');
  if (header) return header;
  const cookie = request.headers.get('cookie') ?? '';
  return /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie)?.[1];
}

function country(header: string | undefined): string | null {
  const code = header?.trim().toUpperCase() ?? '';
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

/**
 * The routes, over whichever store the caller supplies. Production hands in the
 * D1 one; a test hands in an in-memory one, so every route is exercised for
 * real rather than through a mock of the database.
 */
export function createApp(storeFor: (env: Env) => Store) {
  const app = new Hono<{ Bindings: Env; Variables: Vars }>();

  app.onError((err, c) => {
    console.error(JSON.stringify({ event: 'stats.unhandled', message: String(err) }));
    return c.json({ error: 'internal error' }, 500);
  });

  app.notFound((c) => c.json({ error: 'not found' }, 404));

  app.use('*', async (c, next) => {
    c.set('store', storeFor(c.env));
    c.set('now', Math.floor(Date.now() / 1000));
    await next();
  });

  // Refuse an oversized body before anything reads it: a schema cannot reject
  // bytes it has not parsed, and buffering an unbounded body to discover it was
  // junk is exactly the work an attacker would like the collector to do.
  // A declared length is checked first because it is free, but a caller can
  // simply not declare one, so the body is also read through a ceiling before
  // anything parses it.
  app.use('/v1/*', async (c, next) => {
    const declared = Number(c.req.header('content-length') ?? '0');
    if (declared > MAX_REQUEST_BYTES) return c.json({ error: 'body too large' }, 413);
    if (c.req.method === 'POST') {
      const body = await c.req.raw.clone().arrayBuffer();
      if (body.byteLength > MAX_REQUEST_BYTES) {
        return c.json({ error: 'body too large' }, 413);
      }
    }
    await next();
  });

  app.get('/health', async (c) => {
    await c.get('store').daily();
    return c.json({ ok: true });
  });

  app.post(
    '/v1/ping',
    zValidator('json', Ping, (result, c) => {
      if (!result.success) return c.json({ error: firstIssue(result.error) }, 400);
      return undefined;
    }),
    async (c) => {
      const ping = c.req.valid('json');
      const store = c.get('store');

      // Keyed on the install rather than the address, so one server behind a
      // shared address cannot be silenced by another, and so a retry is cheap
      // while a flood is not.
      const { success } = await c.env.PING_LIMIT.limit({ key: await keyOf(ping.id) });
      if (!success) return c.json({ error: 'too many pings for this install' }, 429);

      // A second limiter, on the source, for the one thing that actually costs:
      // creating rows. An install that already has a row never reaches it.
      if (!(await store.has(ping.id))) {
        const source = c.req.header('cf-connecting-ip') ?? 'unknown';
        const fresh = await c.env.NEW_ID_LIMIT.limit({ key: await keyOf(source) });
        if (!fresh.success) return c.json({ error: 'too many new installs from here' }, 429);
      }

      await store.upsert(ping, country(c.req.header('cf-ipcountry')), c.get('now'));
      return c.json({ ok: true });
    },
  );

  // An install erasing itself. Answered the same way whether the row was there
  // or not, so this cannot be asked twice to learn whether an id exists.
  app.post(
    '/v1/forget',
    zValidator('json', Forget, (result, c) => {
      if (!result.success) return c.json({ error: firstIssue(result.error) }, 400);
      return undefined;
    }),
    async (c) => {
      const { id } = c.req.valid('json');
      const { success } = await c.env.PING_LIMIT.limit({ key: await keyOf(id) });
      if (!success) return c.json({ error: 'too many requests for this install' }, 429);

      await c.get('store').forget(id);
      return c.json({ ok: true });
    },
  );

  // Everything an administrator may see beyond the public page: the same
  // aggregate with no floor applied, plus what the nightly sweep set aside.
  // Deliberately still not rows. Per-install data is read from D1 against the
  // Cloudflare account, which is a different door with a different key.
  app.get('/v1/admin/stats', async (c) => {
    const config = configFrom(c.env);
    if (!config) {
      return c.json(
        { error: 'no administrator is configured for this collector' },
        503,
        PRIVATE_HEADERS,
      );
    }
    const verdict = await verify(assertion(c.req.raw), config, Date.now());
    if (!verdict.ok) {
      console.error(JSON.stringify({ event: 'stats.access_denied', reason: verdict.reason }));
      return c.json({ error: verdict.reason }, verdict.status, PRIVATE_HEADERS);
    }

    const store = c.get('store');
    const now = c.get('now');
    const [rows, history] = await Promise.all([store.all(), store.daily()]);
    return c.json(
      {
        ...aggregate(rows, history, now, 0),
        stored: rows.length,
        flagged: rows.filter((row) => row.flagged).length,
        settling: rows.filter((row) => settling(row, now)).length,
        viewer: verdict.email,
      },
      200,
      PRIVATE_HEADERS,
    );
  });

  app.get('/v1/stats', async (c) => {
    const store = c.get('store');
    const [rows, history] = await Promise.all([store.all(), store.daily()]);
    return c.json(aggregate(rows, history, c.get('now')), 200, {
      'access-control-allow-origin': '*',
      'cache-control': `public, max-age=${STATS_MAX_AGE}`,
    });
  });

  return app;
}

/**
 * The nightly sweep: flag whatever arrived as an identical crowd, write the
 * day's published numbers down so they survive pruning, then forget the rows
 * nobody has heard from in a season.
 */
export async function sweep(store: Store, now: number): Promise<void> {
  await store.flag(burstIds(await store.all()));
  const counts = aggregate(await store.all(), [], now);
  await store.record(dayOf(now), counts.instances, counts.clients.total);
  await store.prune(now - RETAIN_DAYS * DAY);
}

const app = createApp((env) => d1Store(env.STATS_DB));

export default {
  fetch: app.fetch,
  async scheduled(_event: unknown, env: Env): Promise<void> {
    await sweep(d1Store(env.STATS_DB), Math.floor(Date.now() / 1000));
  },
};
