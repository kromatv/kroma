# RFC 153: Anonymous instance statistics

- Status: **DRAFT** | ACCEPTED | REJECTED | SUPERSEDED by NNNN
- PR: #153
- Affects: `PRIVACY.md`, `docs/anonymous-stats.md`, areas `area/server`, `area/docs`

## Summary

Add one opt-in setting to the server that, while it is on, posts a single
anonymous payload a day to a new Worker at `stats.kroma.tv`: a random identifier
the server minted for itself, its version and platform, how many devices used it
this week and in which languages, which official modules are enabled, and coarse
size bands. Publish the aggregate at kroma.tv/stats. Nothing is sent until an
operator switches it on, and no KROMA app ever contacts the collector.

## Motivation

Nobody knows how many KROMA servers are running. That is not an abstract gap:

- `webOS` still ships a legacy tier for Chromium 53 to 94 televisions, and there
  is no evidence for or against retiring it.
- Nine first-party modules are maintained. Two of them may have no users.
- A version can be dropped only by guessing whether anyone is still on it.
- "Which language should KROMA be translated into next" has no answer at all
  today, because the only language signal that exists is which of the two
  shipped locales an account picked.

That last one is why the payload carries what a device asked for in
`Accept-Language` rather than what KROMA answered with: a reader on a German
phone running the French UI is invisible under any other measure, and is exactly
the reader this is meant to find.

## Proposal

**Opt-in, off by default.** `anonStats` already exists in the settings defaults
at `false`, already translated in both catalogs, read by nothing. This fills that
slot and surfaces it under Admin → General → Privacy.

**The server reports, never the app.** A television, phone or browser talks to
its own server and to nothing else, which is what `PRIVACY.md` promises and what
the app stores' "Data Not Collected" labels claim. The server aggregates its own
devices from `access_tokens` and reports counts.

**One payload a day**, sent by a built-in job (`stats.report`) so it inherits
cron, run history, cancellation and an admin page. The run log prints the exact
bytes before they leave, and prints that nothing was sent when the toggle is off.
Checking the claim requires no trust and no packet capture.

**A separate identifier.** Not `instanceId`: that one is served to any anonymous
caller on `/api/health` and announced over DNS-SD, so reusing it would let anyone
who can reach a server look up its row. `statsId` is minted on first enable,
written through `set_internal` so no settings PATCH can choose it, and stable
from then on, because a rotating id makes "how many distinct servers"
unanswerable.

**A fixed address.** `stats.kroma.tv` is a compile-time constant, exactly as
`kroma_push::relay::RELAY_URL` is and for the same reason: letting an operator
point it at an arbitrary host would be a phishing route, not a feature. A debug
build honours `KROMA_STATS_URL` so the loop can be run locally.

The full field list, and the list of what is deliberately absent, is
[`docs/anonymous-stats.md`](../anonymous-stats.md). It is the contract, and a
new field is a change to it and to the schema number.

## What this costs

**A promise, rewritten.** `PRIVACY.md`, both legal pages and the home page said
"no telemetry" without qualification. They now say the apps collect nothing and
the server can be asked to be counted. That is a smaller promise than the one
made before, and the smaller promise is the one that will still be true.

**A service to keep running, indefinitely.** `stats.kroma.tv` joins
`push.kroma.tv`, `modules.kroma.tv` and `packages.kroma.tv` as something that
has to stay up, be paid for, and be answered for. It is the first thing in this
repository with a database binding.

**A number that will be wrong.** Opt-in means the published count is a floor and
nothing more. Anyone quoting it as adoption is quoting it wrongly, which is why
the page says so in its own copy rather than in a footnote.

**A field that cannot be un-shipped.** Once `locales` is published, dropping it
looks like hiding something. Every field here should be one worth defending in
five years.

## Compatibility

Nothing breaks. A server that never switches the toggle on behaves exactly as it
did, minus one row in an admin settings page. Older clients are unaffected: they
send no new header, and the `Accept-Language` the language field reads is one
every HTTP client has always sent. The new `access_tokens.language` column is an
idempotent `ALTER TABLE`, and a credential with no language recorded is simply
absent from the set.

## Alternatives

**Do nothing.** Keep shipping blind, keep the unqualified promise. This is a real
option and it costs only the four questions above staying unanswered. The reason
not to take it is that they are being answered anyway, by guessing.

**Opt-out, on by default.** The truest count, and the position hardest to defend
for GPL self-hosted software in the EU. Rejected.

**Ask on first admin login.** Better participation than a buried toggle. Rejected
for now because it puts a consent dialog in the first-run flow, which is the one
place a new operator should meet nothing but their library. Worth revisiting once
the toggle has been out long enough to see whether anyone finds it.

**Clients report directly.** Per-app numbers even from servers that opted out, at
the cost of making the apps data collectors and breaking the "the app talks to
your server and nothing else" line. Rejected; that line is worth more than the
resolution.

**Proof of work on the identifier.** A hash-difficulty target minted once would
make a fake fleet cost CPU-days instead of seconds. Deliberately not done: it is
the only measure here that creates real cost asymmetry, and it is also the only
one that needs explaining to every operator. Revisit if the number is ever worth
faking.

## Unresolved

- Whether the country code, which is derived at the edge rather than sent, earns
  its place. It is what makes a world map possible and it is one line to remove.
- Whether `stats.report` should also be what carries a future server update
  check. `autoUpdate` and `updateChannel` exist and are read by nothing; folding
  them into one outbound call would mean one connection instead of two, and would
  also couple a feature everyone wants to a feature that is optional. Decided
  when self-update is built.
- Whether the collector's deploy belongs in CI. It is deployed by hand today,
  like the push relay.
