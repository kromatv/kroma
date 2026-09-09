# Anonymous statistics

KROMA has no idea how many servers are running. Every release ships blind: there
is no way to tell whether a version is still out there before dropping support
for it, no way to tell which modules are worth maintaining, and no answer to
"how many people use this".

This is the answer, and it is **on until you turn it off**.

## The short version

Admin → General → Privacy → *Anonymous usage statistics*. While it is on, the
server posts one payload a day to `stats.kroma.tv` and the numbers appear on
[kroma.tv/stats](https://kroma.tv/stats). Switch it off and it stops at once.

**Three switches, nested.** The first is the whole feature. Under it sit *what
this server runs* and *how much of it there is*, either of which can be dropped
on its own while the server still counts itself. A block that is off is **absent
from the payload**, not sent empty, so "no modules enabled" stays
distinguishable from "not telling you", and the published page says how many
servers a breakdown is actually over.

The basis is legitimate interests rather than consent, because a default-on
switch is not consent and calling it that would be a claim the code contradicts.
The balancing test behind that, and the right to object, are in
[`anonymous-stats-gdpr.md`](anonymous-stats-gdpr.md).

**The apps send nothing.** A television, a phone or a browser talks to your
server and to nothing else, exactly as before. The heartbeat is the server's,
and only the server's.

## What is sent

One JSON body, once a day. This is all of it:

```json
{
  "schema": 3,
  "id": "9f2c…",
  "version": "1.4.2",
  "commit": "cafed00d",
  "target": "aarch64-apple-darwin",
  "install": "docker",
  "locales": ["de-de", "fr-ch"],
  "modules": ["tv.kroma.torrents"],
  "clients": { "tv": 2, "mobile": 1, "desktop": 3 },
  "users": 4,
  "titles": 1240
}
```

**Base**, and the only part that is always there:

| Field | What it is |
|---|---|
| `schema` | The payload's shape. The collector is taught a new one rather than swapped onto it, so a server that has not updated keeps counting. |
| `id` | 32 random bytes this server minted for itself on the first start after this shipped. Not derived from any hardware, not the `instanceId` on `/api/health`, and never joined to an address. |
| `version`, `commit` | Which build is running, so a version can be retired once nobody runs it. |
| `target` | The build triple. The collector keeps only the operating system half of it. |
| `install` | `docker`, `synology`, `binary` or `unknown`, from `KROMA_INSTALL`. The Docker images and the Synology package set their own; nothing sets `binary`, so an operator running the built server directly sets it by hand or is counted as `unknown`. |

**What this server runs**, absent unless that switch is on:

| Field | What it is |
|---|---|
| `locales` | The languages the devices here asked for, as a set. This is the one field that says which languages KROMA should be translated into next: a reader on a German phone shows up as German even though KROMA has no German. |
| `modules` | Installed, enabled modules that came from the official catalog. A module installed from anywhere else is never named. |

**How much of it there is**, absent unless that switch is on:

| Field | What it is |
|---|---|
| `clients` | Devices that used this server in the last 7 days, by kind, each capped at 50. |
| `users`, `titles` | How many accounts this server has, and how many films and shows are in its library. Numbers only: no account and no title is named, and neither number is ever published against one install. |

A server still on the previous shape keeps counting. It sized itself in bands,
and a band is not read back as a number, so it has no size at the collector
until it updates.

## What is never sent

Your server's name. Its hostname, address, port or URL. Any IP (the collector
reads a two-letter country code at Cloudflare's edge and the address is dropped
with the request). Any title, file path, or anything about what you watch. Any
user name, email or avatar. The id of a module you installed from a third-party
registry.

## Checking rather than trusting

Admin → Jobs → *Anonymous statistics* → Run now. The run log prints the exact
bytes that left the box, and prints `anonymous statistics are off; nothing was
sent` when the toggle is off. The code is
`server/crates/kroma-engine/src/services/stats/`.

The job never fails. A collector that is down, or that will not take this
server's payload, is written into the run log and retried the next day: neither
is something an operator can act on, and a job that fails is a notification
about a feature that was meant to stay out of the way.

## Turning it off, and erasing what was sent

The toggle in Admin → General → Privacy. The server stops sending immediately.
Its row drops out of the published numbers 30 days after its last report, and is
deleted from the collector 90 days after it. A backup carries that switch, so a
restore does not undo it; it does not carry the identifier, because that names
one machine at the collector and two servers must not report as one.

To delete the row now rather than wait, quote the identifier from Admin →
General → Privacy:

```bash
curl -X POST https://stats.kroma.tv/v1/forget \
  -H 'content-type: application/json' \
  -d '{"id":"<the identifier from your admin page>"}'
```

Holding the identifier is the whole authorisation, on the same rule a ping runs
under, and it reaches exactly one row.

**Switch it off first.** Erasing the row while the server is still reporting only
buys a day: the next payload writes the row again, and because that row is new it
stops counting for another seven days. Off, then erase, is the order that means
what it says.

The legal side of all this, the basis, the processors, the retention and the rest
of the rights, is [`anonymous-stats-gdpr.md`](anonymous-stats-gdpr.md).

## How the published number is counted

- A server counts once it has been reporting for **7 days**, so a fleet of fake
  ids has to be maintained for a week before it moves anything.
- It stops counting **30 days** after its last report.
- A breakdown (a version, a country, a language, a module) is published only
  where at least **5** servers share it, so a lone install is never singled out.
- Newcomers that arrive in the same minute wearing an identical payload are
  flagged and left out.
- A breakdown that only some servers report is published beside the number that
  reported it, because a chart over half the fleet and a chart over all of it
  are not the same chart.

None of that is proof. KROMA is free software anyone can read and change, so no
server can prove it is real, and no scheme in a public binary can make it. The
rules above make faking cost something and make a fleet visible; read the
published number as a floor, not a census.

## Reading the numbers yourself

`GET https://stats.kroma.tv/v1/stats` is the published aggregate, CORS-open and
cached an hour. It is the same document [kroma.tv/stats](https://kroma.tv/stats)
renders, so any chart on that page can be checked against it or replaced with
your own. A nightly job commits a copy to the `stats-data` branch of the
repository, which is both the history of how the numbers moved and a copy of
them that does not live at Cloudflare.

## The collector

`packages/stats-relay/` is the Cloudflare Worker behind `stats.kroma.tv`. It
holds no secret, because a ping carries nothing worth stealing and there is
nobody to authenticate: the id in a payload is the whole authorisation, and it
authorises writing one row. `GET /v1/stats` answers aggregates and has no route
that returns a row.
