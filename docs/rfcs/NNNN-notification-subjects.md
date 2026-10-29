# RFC NNNN: notifications that name their subject, fold their repeats, and resolve

- Status: **DRAFT**
- PR: #NNNN
- Epic: #422
- Affects: no spec chapter covers notifications yet, so acceptance comes with a new one
  (`docs/spec/accounts/notifications.md`); the `notifications` table, `NotificationSpec` in
  `kroma-module-wire`, the module host's `notify` callback, `@kromatv/client/notifications`,
  the web and mobile inboxes, the push transports. Areas `area/server`, `area/web`,
  `area/mobile`, `area/modules`, `area/sdk`

## Summary

A notification row stops being a pre-built card and starts recording what happened and
what it is about. Each row names its **subject** (`request d966…`, `job library.scan`), its
**actor**, and a small typed **data** object, and the reader's route, buttons and wording
are worked out when the row is read, not when it was written. Repeats of one thing fold
into one row with a count, on the server and on the lock screen. A producer can say "this
already happened" (a dedupe key) and "this no longer needs anyone" (resolve by subject).
The inbox learns `seen` and `archived` next to `read`, every push attempt leaves a record,
and a module declares its notification types in `module.json` instead of sending raw text.
This is the model GitHub, Knock, Novu and Stream converge on, cut to a household and SQLite.

## Motivation

One admin inbox, on one real server, on 2026-10-28:

**A link to a page that no longer exists.** "Nouvelle demande" opens `/admin/requests`,
which shows "Module indisponible". RFC 287 folded the request queue into
`/admin/monitoring?tab=requests` and removed the route; `requests/notify.rs` still writes
the old path, and every row already stored carries it forever. The web client already keeps
a table of renamed paths (`notification-link.ts`) for the previous rename. This is the
second time a route change has stranded stored rows, and it will not be the last.

**The same failure, sixteen times.** "Tâche en échec · 16 fois" is sixteen rows and sixteen
pushes. The fold the user sees happens in the browser, by comparing `event + title + body`
text (`notificationRepeatKey`). The phone gets no fold at all: `apns-collapse-id` is set to
the row id, which is random on every emission, so a repeat never replaces anything.

**"Prêt à regarder", four times, for one show.** `PartiallyAvailable` and `Available` both
send `notifications.request.available`, and every status change sends it again. A show
that flips between the two as episodes air and arrive tells its requester the same sentence
again each time.

**Approve and Deny on a request that is already decided.** The buttons are stored with the
row. Once another admin approves, every other admin's row still offers both, and pressing
one fails.

**A link that was right too early.** "Coyote vs. Acme est maintenant dans votre
bibliothèque" opens `/requests`, not the film. `request_link` looks the title up when the
notification is written. When the import marked the request available, the film was not yet
in the catalogue under its TMDB id, so the lookup missed and the fallback is stored for good.

**Nothing to answer "why didn't my phone ring?"** A push failure increments
`push_subscriptions.failures`, goes to the log, and is not kept anywhere else. Neither the admin nor the user can see
whether a notification was pushed, to which device, or why it was not.

**A module cannot speak in the user's language.** A module's notification is
`NotificationEvent::Custom` with its title and body passed as literal params, because the
server-side renderer only loads the core catalogs. Every reader gets the module's one
wording, whatever their language.

Behind all of these: the row stores the card (`title_key`, `params` as strings, `link`,
`actions`) instead of the facts the card was made from, so nothing can be recomputed.

## How larger systems model this

| System | What a notification is | What this RFC takes from it |
|---|---|---|
| [GitHub notifications](https://docs.github.com/en/rest/activity/notifications) | A thread per subject (`subject.type`, `subject.url`), with `reason`, `unread`, `updated_at`; new activity moves the thread back to the top | The subject, and folding by subject |
| [Knock](https://docs.knock.app) | A message per recipient per channel, with delivery statuses and engagement states (`seen`, `read`, `interacted`, `archived`); batch by key; cancel by key | The four engagement states, the delivery record, resolve by key |
| [Novu](https://docs.novu.co) | A triggered workflow with a `transactionId`; in-app messages with read, seen and archived | The dedupe key |
| [Stream activity feeds](https://getstream.io/activity-feeds/) | `actor`, `verb`, `object`; a notification feed aggregates by a key and counts activities and actors | Count and actors on a folded row |
| [APNs](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns), [FCM](https://firebase.google.com/docs/cloud-messaging/concept-options#collapsible_and_non-collapsible_messages), [Web Push](https://developer.mozilla.org/en-US/docs/Web/API/Notification/tag) | `apns-collapse-id`, `collapse_key` and `tag` replace an earlier notification with the same key | The group key, sent as the collapse key |

What none of them is used for: workflow engines with delay and branch steps, multi-tenant
routing, a message queue between producer and delivery. KROMA writes one row per recipient
synchronously, which is right for a household, and its one batching step (the media digest)
already exists.

## Proposal

### A row records facts

New columns on `notifications`, all nullable or defaulted, so the change is additive:

| Column | Holds | Example |
|---|---|---|
| `subject_kind` | What the notification is about | `request`, `movie`, `show`, `episode`, `report`, `job`, `download`, `tv.kroma.torrents/torrent` |
| `subject_id` | Its id | `d9661cad24d8a30c` |
| `actor_id` | The user who caused it, `NULL` for the system | the requester's id |
| `data` | A JSON object typed per event, at most 4 KiB | `{"job":"library.scan","runId":"…"}` |
| `group_key` | Which row a repeat folds into | `system.job.failed:job:library.scan` |
| `dedupe_key` | Drops an emission that already happened | `request.available:d966…:available` |
| `count` | Emissions folded into this row | `16` |
| `actor_ids` | The latest distinct actors, at most 5 | `["u1","u2"]` |
| `updated_at` | The latest emission; the inbox sorts by it | |
| `seen_at`, `archived_at`, `interacted_at`, `resolved_at` | Engagement and resolution | |

`title_key`, `body_key`, `params`, `link` and `actions` stay. They are what a row written
before this RFC has, and what a free-form notification (the admin console's hand-written
send, a module that names no subject) still uses.

### The reader's route comes from the subject

The wire `Notification` gains `subject: { kind, id }` and `actor: { id, name, avatarUrl }`.
A client maps the subject to its own screen, and the event where one kind has two
audiences: on the web, `request.submitted` opens `/admin/requests/$id` and
`request.approved` opens `/requests`; on the phone a `movie` opens `/item/:id`; a client
with no screen for it shows the row as a message. A kind it does not know falls back to
`link`.

The server keeps sending `link`, computed at read time from the subject through one table
in the renderer, for clients built before this change and for push payloads. A route rename
is then one edit to that table, and every stored row follows it. A requester's `request`
subject renders to the title's page once the title is in the catalogue and to the requests
page until then, which is the Coyote case.

`actor` is read from the user table at render time, so a renamed user or a new avatar shows
on old rows.

### Repeats fold on the server

`NotificationSpec` gains an optional `group_key`. When a producer leaves it empty, it
defaults to `event` plus the subject; with no subject, no folding happens.

Emitting to a user who already has a non-archived row with the same `group_key` updates that
row instead of inserting: `count + 1`, the new params, data and actor, `updated_at = now`,
`read_at` and `seen_at` cleared, so it moves back to the top as unread. An archived row is
left alone and a new row starts.

The push for a folded row carries `group_key` (hashed to 64 bytes) as `apns-collapse-id`,
FCM `collapse_key` and the Web Push `tag`, so the device replaces the earlier banner. A
group pushes at most once per hour; emissions in between update the inbox row silently.
`groupNotificationRepeats` and `notificationRepeatKey` in `@kromatv/core` are deleted once
the server folds.

### A producer can say "already sent"

`NotificationSpec` gains an optional `dedupe_key`. An emission whose key matches a row the
recipient still holds is dropped for that recipient. The request ledger uses
`request.available:<id>:<status>`, so each real transition is told once and a flap is not
told again.

### A producer can say "no longer needs anyone"

A new `notify::resolve(subject, event)` sets `resolved_at` on every matching row, for every
recipient, in one statement. A resolved row renders with no actions and an optional resolved
line ("Approuvée par Max"). Approving or denying a request resolves its `request.submitted`
rows; closing a report resolves its `report.submitted` rows; a job that succeeds resolves its
failure group. The module host API gains the same call.

### The inbox has four states

| State | Set when | Used for |
|---|---|---|
| `seen` | The user opens the panel | The badge counts unseen rows |
| `read` | The user opens the row, or marks it | The row's highlight |
| `interacted` | The user presses one of its actions | Admin statistics, later |
| `archived` | The user dismisses it ("Done") | Leaves the default list, replaces delete |

The badge counts **unseen** rows: opening the panel clears it, whether or not each row is
then opened, and a row still shows read or unread on its own. Counting unread (GitHub, and
KROMA today) was the alternative; it keeps a number on the bell until every row has been
opened one by one, which on a household server is a number nobody ever clears.

Retention keeps 200 rows per user and prunes archived rows first, then the oldest read
ones. An unread row is never pruned for being old.

### Every push attempt leaves a record

A `notification_deliveries` table holds one row per attempt: notification id, subscription
id, transport, status (`sent`, `failed`, `skipped_muted`, `throttled`, `gone`), the transport's
error, and when. It keeps 30 days. The account settings page shows a user their own devices'
last deliveries; the admin console shows everyone's.

### A module declares its notification types

`module.json` gains a `notifications` list. Each entry names a type in the module's own
namespace (`tv.kroma.torrents/download.stalled`), its category, whether it pushes by default,
and the title and body keys in the module's `locales/{en,fr}.json`. The server loads those
catalogs into the renderer, so a module notification renders in the reader's language like a
core one. The host's `notify` callback refuses a type the calling module did not declare.
`NotificationEvent::Custom` stays for modules built before this change.

### Preferences go per type

The delivery matrix gains rows per type next to the per-category rows. A type with no row
of its own follows its category, so nothing changes for a user who never opens the setting.

### `data` is typed

Each core event names a `data` struct in `kroma-domain` and a matching zod schema in
`@kromatv/client/notifications`, discriminated by `event`. An unknown event's `data` is
ignored by the client, not parsed loosely. A module's `data` is bounded to 4 KiB before
parsing at the host boundary, like any other cross-process body.

## Rollout

Each step ships alone and fixes something on its own. #432 fixes today's dead link first,
without waiting for any of them.

1. Subject, actor and data, and routes from the subject (#423). Fixes the dead link and the
   too-early link.
2. Server-side folding and the push collapse key (#424). Fixes the sixteen rows and the
   stacked banners.
3. The dedupe key (#425). Fixes the four "Prêt à regarder".
4. Resolve by subject (#426). Fixes the stale Approve and Deny.
5. Seen and archived (#427).
6. The delivery record (#428).
7. Module-declared types, with their catalogs in the renderer (#429).
8. Per-type preferences (#430).

The spec chapter is #431.

## What this costs

- **Render does more work.** Reading the inbox looks up actors and subjects per page, about
  two indexed queries for 50 rows. Push rendering does the same once per delivery.
- **The renderer knows every subject kind.** One table maps kinds to links and resolves a
  `request` to its title. That table is the one place a route rename now has to be made, and
  it has to stay in step with the web routes, which a test can check against
  `routeTree.gen.ts`.
- **A wire promise to modules.** `group_key`, `dedupe_key`, `subject` and `resolve` become
  part of the module host API and of `@kromatv/sdk`, and are kept indefinitely.
- **`module.json` grows a section** the Store, `kroma check` and the manifest validator have
  to read.
- **Folding changes what an admin sees.** A job that fails every five minutes reads as one row
  and pushes once an hour, not once per failure. Someone who relied on every push loses that.

## Compatibility

- **Stored rows** keep their `link`, `actions` and keys and render exactly as today. They have
  no subject, so they never fold and never resolve. The client keeps its renamed-path table
  for them, with `/admin/requests` added.
- **Older web and mobile clients** ignore the new fields and keep using `link`, which the
  server still sends.
- **Older mobile apps on the lock screen** keep reading `link` from the push payload.
- **Installed modules** keep sending `Custom` specs; every new field has a serde default.
- **The database** takes one migration step adding columns and an index on
  `(user_id, group_key)`. No table rebuild.

## Alternatives

- **Do nothing.** Every route rename strands stored rows, repeat failures keep pushing once
  each, and a decided request keeps its buttons. The client-side fold keeps hiding the
  problem in the browser and not on the phone.
- **Rewrite stored links on each rename.** Cheaper for this one bug, and the migration has to
  be written again at every rename. It fixes none of the other symptoms.
- **Split events from inbox rows** (`notification_events` once, `notifications` per user), as
  Knock and Stream do. It saves writing `data` once per recipient and gives an admin history
  of what was sent. At household scale the saving is a few kilobytes, and resolve and the
  delivery record work on the single table. Deferred until an admin history view is wanted.
- **Adopt a hosted service** (Knock, Novu Cloud, Courier). KROMA is self-hosted with no
  account to sign up for, so a third-party dependency for the inbox is ruled out.
- **Group by text, as the client does now, on the server.** Two different jobs whose names
  translate the same would merge, and a module would have no way to say what is a repeat.

## Unresolved

Three points are left open, each with the value it ships with unless the maintainer says
otherwise in review. The spec chapter carries them as DRAFT requirements.

- The push throttle window for a folded group. One hour is a starting point.
- Whether a resolved row should also withdraw its push from the lock screen. APNs and FCM can
  replace a banner with a silent update, which costs a second push per resolve. Until it is
  decided, a resolve leaves a banner already delivered alone.
- Which subject kinds the TV client routes. It shows no inbox today, so it routes none.
