# @kromatv/stats-relay

The Cloudflare Worker at `stats.kroma.tv`. It counts running KROMA installs from
the heartbeat each one sends while its operator has anonymous statistics on, and
serves the aggregate behind [kroma.tv/stats](https://kroma.tv/stats).

What a server sends, what it never sends, and how the published number is
counted are all in [`docs/anonymous-stats.md`](../../docs/anonymous-stats.md).
That document is the contract; this one is how to run the thing.

## Routes

| Route | Answers |
|---|---|
| `POST /v1/ping` | One install's daily payload. Unauthenticated on purpose. |
| `GET /v1/stats` | The published aggregate, CORS-open and cached an hour. |
| `GET /health` | Whether the database is reachable. |

A nightly cron flags fleets, records the day's numbers so they survive pruning,
and deletes rows nobody has heard from in 90 days.

## Why there is no authentication

The sender is public source and self-hosted, so any credential shipped in it
would be published with it. The id in a payload is the whole authorisation, and
it authorises writing exactly one row. The rate limiters are about cost, not
authorisation: one on the install and one on the source address, which bounds
the only expensive thing a caller can do, which is create rows. Cloudflare's
limiter takes a 10- or 60-second window and nothing longer, so neither is a
daily budget: what actually bounds a fake fleet is the seven-day settling window
and the nightly burst sweep, both described in the document above.

## Deploying

By hand, like the push relay. The database is created once:

```bash
cd worker
bunx wrangler d1 create kroma-stats          # paste the id into wrangler.jsonc
bunx wrangler d1 execute kroma-stats --remote --file schema.sql
bunx wrangler deploy
```

Re-running `schema.sql` is safe: every statement in it is `IF NOT EXISTS`.

## Running it locally

```bash
cd worker
bunx wrangler d1 execute kroma-stats --local --file schema.sql
bunx wrangler dev
```

Then point a debug build of the server at it with
`KROMA_STATS_URL=http://127.0.0.1:8787` and run the `stats.report` job from
Admin → Jobs. A release build ignores that variable: the address is a constant
for the same reason the push relay's is, so no operator can be redirected to a
collector that is not this one.

## Looking at the data

There is no private dashboard, and deliberately no authenticated route: the
Worker holds no secret, and `GET /v1/stats` is the only read it offers, floored
so a breakdown fewer than five servers share never leaves. Anything beyond that
is read straight from D1, authenticated by the Cloudflare account rather than by
anything shipped here.

```bash
# The unfloored picture, which the public endpoint will not give you.
bunx wrangler d1 execute kroma-stats --remote --command \
  "SELECT version, COUNT(*) n FROM instances WHERE flagged = 0 GROUP BY version ORDER BY n DESC"

# Which languages to translate into next, weighted by installs rather than devices.
bunx wrangler d1 execute kroma-stats --remote --command \
  "SELECT json_each.value tag, COUNT(*) n FROM instances, json_each(instances.locales) \
   WHERE flagged = 0 GROUP BY tag ORDER BY n DESC"

# What the nightly sweep set aside, and why it is worth glancing at.
bunx wrangler d1 execute kroma-stats --remote --command \
  "SELECT first_seen, version, target, COUNT(*) n FROM instances WHERE flagged = 1 \
   GROUP BY first_seen / 60, version, target ORDER BY n DESC"
```

The same tables are browsable in the Cloudflare dashboard under Storage & Databases
→ D1 → kroma-stats. Both paths see rows, so both are the operator's own access to
data an operator is the controller for; neither is reachable from the internet.

## Tests

`bun run test packages/stats-relay`. Every SQL statement sits behind the `Store`
interface in `worker/store.ts`, so the routes and the counting rules are
exercised against an in-memory store rather than a mock of D1.
