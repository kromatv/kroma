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
| `POST /v1/forget` | Deletes the row an identifier names. The identifier is the authorisation. |
| `GET /v1/stats` | The published aggregate, CORS-open and cached an hour. This is the public data file: `kroma.tv/stats` renders it and nothing else, and a nightly job commits a copy to the `stats-data` branch. |
| `GET /v1/admin/stats` | The same aggregate with no floor, plus the sweep's counts. Behind Cloudflare Access. |
| `GET /health` | Whether the database is reachable. |

A nightly cron flags fleets, records the day's numbers so they survive pruning,
and deletes rows nobody has heard from in 90 days.

## Why the public routes have no authentication

The sender is public source and self-hosted, so any credential shipped in it
would be published with it. The id in a payload is the whole authorisation, and
it authorises writing exactly one row. The rate limiters are about cost, not
authorisation: one on the install and one on the source address, which bounds
the only expensive thing a caller can do, which is create rows. Cloudflare's
limiter takes a 10- or 60-second window and nothing longer, so neither is a
daily budget: what actually bounds a fake fleet is the seven-day settling window
and the nightly burst sweep, both described in the document above.

## Adding a payload shape

`SUPPORTED_SCHEMAS` in `worker/schemas.ts` is a list, and a new shape is **added
to it rather than swapping the old one out**. A KROMA server updates when its
operator decides to, which for a self-hosted box is often months; a collector
that only accepts the newest shape silently drops every install that has not got
there yet, and those installs are the ones a count of long-lived servers most
needs. Retire a shape when the servers sending it have aged out of the window
anyway, not when a newer one ships.

A server whose payload is refused logs it and retries the next day. It does not
fail its job, because a rejection is never something the operator can act on.

## Deploying

By hand, like the push relay. The database is created once:

```bash
cd worker
bunx wrangler d1 create kroma-stats          # paste the id into wrangler.jsonc
```

Then, from anywhere in the repository:

```bash
bun run --filter '@kromatv/stats-relay' migrate
bun run --filter '@kromatv/stats-relay' deploy
```

**Apply the migrations before deploying**, not after: a Worker whose schema the
database has not caught up with writes rows it cannot write, and a constraint
that fails at insert time reaches a server as a 500, which it reads as the
collector being briefly unwell and retries daily forever.

Schema changes are numbered files under `worker/migrations/`, applied in order
and recorded in D1 so applying twice is a no-op. There is no `schema.sql`: a
file of `CREATE TABLE IF NOT EXISTS` can create a database and can never alter
one, so it silently does nothing to the database it wrote.

## Running it locally

```bash
cd worker
bunx wrangler d1 migrations apply kroma-stats --local
bunx wrangler dev
```

Then point a debug build of the server at it with
`KROMA_STATS_URL=http://127.0.0.1:8787` and run the `stats.report` job from
Admin → Jobs. A release build ignores that variable: the address is a constant
for the same reason the push relay's is, so no operator can be redirected to a
collector that is not this one.

## The administrator's view

`GET /v1/admin/stats` answers the same aggregate with **no floor applied**, so a
version or a country a single install has is visible, plus how many rows are
stored, how many the nightly sweep flagged, and how many are still settling. It
deliberately does not return rows: per-install data is read from D1, which is a
different door with a different key.

It is behind **Cloudflare Access**, chosen over a bearer token for one reason
worth stating: Access signs a short-lived assertion with a key only Cloudflare
holds, so what this Worker configures is a team domain, an audience tag and an
email list. All three are public facts. The collector still ships no secret, and
there is still nothing here to leak.

The Worker verifies the assertion itself rather than trusting the edge to have
done it. An Access policy protects a hostname, and this Worker also answers on
its `workers.dev` address, which no policy covers. Unset configuration means 503,
never open.

Setting it up, once:

1. Zero Trust → Settings → Custom Pages, note the team domain
   (`<team>.cloudflareaccess.com`). Create the team first if there is none.
2. Zero Trust → Access → Applications → Add a self-hosted application on
   `stats.kroma.tv`, path `/v1/admin`.
3. Give it a policy allowing the emails that should get in, with whatever second
   factor the identity provider offers.
4. Store the three settings, which live in `wrangler secret` rather than in the
   config file: an allow-list committed to a public repository publishes which
   identity has to be phished, and a value in `vars` is reset by the next deploy.

   ```bash
   bunx wrangler secret put ACCESS_TEAM_DOMAIN   # <team>.cloudflareaccess.com
   bunx wrangler secret put ACCESS_AUD           # the application's AUD tag
   bunx wrangler secret put ADMIN_EMAILS         # comma separated
   ```

Then open `https://stats.kroma.tv/v1/admin/stats` in a browser and Access will
ask who you are. For a script, `cloudflared access token --app
https://stats.kroma.tv/v1/admin` mints one to send as
`Cf-Access-Jwt-Assertion`.

## Reading rows

Rows are read straight from D1, authenticated by the Cloudflare account rather
than by anything shipped here.

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
