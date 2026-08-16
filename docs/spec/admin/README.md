# Admin

Status: **AGREED** overall, with the update mechanism still **DRAFT** where a delivery
choice stays open. Every section carries its own status; the file-level label is the floor.

Running a KROMA server. The audience is one person with a NAS, not an operations team.
That framing decides everything below: expose little, default sanely, and never add a knob
without a reason a single hobbyist would recognise. Admin is the surface the owner touches
a handful of times a year — at install, when adding a source, when something breaks — and
should ask nothing of them the rest of the time.

## First-run

Status: **AGREED**

First-run does the least that gets to a playing title, and defers the rest to a running
server the owner can explore at leisure. The minimum path, in exact order:

1. **Open the server.** The owner reaches the web surface on their own network. No account
   exists yet, so the server presents the owner-creation step and nothing else.
2. **Create the owner.** One account: a name and a credential. This account is the owner
   from the moment it exists — there is no separate "make me admin" step, and roles are
   [`accounts.md`](../accounts/README.md), not asked here.
3. **Add one source.** Point the server at one directory of movies or shows and tag its
   content kind. The initial scan starts immediately as a background job with visible
   progress, [`library.md`](../library/README.md); the catalogue fills as it goes.
4. **Play.** As soon as the first title matches, it is playable. First-run is over — the
   owner did not wait for the whole scan to finish.

Everything else is deferred to the running server: more sources, more users, module
installs, metadata providers, schedules, backups. First-run asks three things — who owns
this, where is the media, and nothing more — because a first-time operator should reach a
playing title before they are asked to make a single reversible decision. Deferred choices
all have sane defaults, so a server that only ever completes first-run is a complete,
correct server.

## Settings philosophy

Status: **AGREED**

Expose little. Every setting is a support burden, a migration liability and a way for one
person to break their own server at 1am, so the default posture is *no setting*. A knob
earns its place only when a real hobbyist has a real reason to turn it and no default can
serve both sides of that reason.

What is exposed: **sources** and their scan schedules ([`library.md`](../library/README.md));
**users** and invitations (below); **metadata provider** credentials where a provider needs
a key; **modules** and their configuration ([`modules.md`](../modules/README.md)); **server identity**
(a display name for the server on the network); and the **backup** controls (below).

What is deliberately not exposed: transcoding ladders, cache sizes and eviction policy,
thread and worker counts, database tuning, port and bind internals, log verbosity as a
routine control. These are chosen by the server from the host it finds itself on. The owner
of a NAS should not be tuning a transcode preset; if a default is wrong often enough to need
a knob, the default is the bug, and the fix is a better default, not a setting. A setting
that only exists because we could not decide is a decision deferred onto the user.

## Runtime versus deploy

Status: **AGREED**

The position: **favour runtime configuration.** For a single operator, "change it in the UI
and it takes effect" beats "edit a file and restart" every time, and the server carries its
own configuration in its own store so that a setting survives a reinstall (below) without the
owner reconstructing a config file by hand.

Deploy-time is reserved for the few things that genuinely cannot change safely while the
server runs: where the server's own data lives, what address and port it binds, and the
identity of the persistent store itself. These are the parameters a restart is *for*. They
are set once by whatever packaged KROMA for the host — [`surfaces.md`](../surfaces/README.md) — and
are not surfaced as settings, because changing them is a redeploy, not a preference.

## Users

Status: **AGREED**

The owner manages who else may use the server. Three actions, kept deliberately small:

- **Invite.** The owner creates an invitation the new user redeems to set their own
  credential; the owner never sets or sees another user's password. Whether an invite is a
  link or a code is [`surfaces.md`](../surfaces/README.md); that a user sets their own secret is the
  product rule.
- **Remove.** The owner removes a user. This revokes that user's sessions and devices and
  destroys their account per [`accounts.md`](../accounts/README.md), but touches no media and does not
  affect anyone else's watch state.
- **Reset.** The owner triggers a credential reset for a user who is locked out; the user
  re-establishes their own secret. The owner resets access, never impersonates.

Roles, per-user library visibility, session lifetime and what survives an account deletion
are all [`accounts.md`](../accounts/README.md). This section is only the admin verbs.

### Lockout recovery

Status: **AGREED**

The owner can lock themselves out — forgotten credential, revoked last session, a botched
change. Because the operator physically owns the machine, recovery lives **on the host, not
on the network**: a local recovery path, runnable by whoever has access to the box the
server runs on, that re-establishes owner access (reset the owner credential, or mint a
one-time recovery entry). It requires host access precisely so that it is not a remote
attack surface — possession of the machine is the authentication. It never reads existing
credentials, only replaces them, and it is the one and only backdoor. There is no
cloud "forgot password"; a self-hosted server has no vendor to appeal to, so the machine's
owner is the root of trust.

## Jobs

Status: **AGREED**

Background work — scans, metadata refreshes, transcodes, module tasks — is visible, honest
and interruptible. The owner should never wonder whether the server is doing something.

- **Visibility.** Every running and queued job is listed with what it is, what it is working
  on and its progress; scans and refreshes are [`library.md`](../library/README.md), module jobs are
  [`modules.md`](../modules/README.md). A finished job leaves a short trace (succeeded, failed, or
  cancelled) so a failure is not silent.
- **Cancellation.** Any job the owner started, the owner can cancel. Cancellation is safe:
  a cancelled scan leaves the catalogue consistent with what it had already matched, a
  cancelled transcode discards its partial output, and nothing a cancel touches corrupts
  the library on disk — scans are read-only ([`library.md`](../library/README.md)) and transcodes
  write only to regenerable cache.
- **Scheduling.** The little scheduling that exists is per-source scan cadence
  ([`library.md`](../library/README.md)) and the metadata staleness sweep. These have sane defaults
  and rarely need touching. The server also declines to pile work on itself: heavy jobs are
  bounded so a large library does not saturate a NAS, and this bound is chosen, not
  configured.

## Diagnostics

Status: **AGREED**

When something is wrong, the owner needs to see it and hand it to someone who can fix it.

- **Health.** A single view answers "is the server well?" — are sources reachable, are
  modules running or crashed ([`modules.md`](../modules/README.md)), is there room on disk, is the
  metadata provider reachable. Green is the normal state; anything else names the specific
  thing that is wrong and, where possible, the action that fixes it.
- **Logs.** The server keeps a rolling log the owner can read and export. Routine operation
  logs at a level a human can skim; verbosity is raised only around an active investigation,
  not left high as a standing setting.
- **The bug report.** There is one action — "Export diagnostics" — that gathers exactly what
  a maintainer needs and nothing that identifies the person: server and module versions, the
  recent log, the health snapshot, source and job state. It excludes credentials, media
  paths' contents, watch history and anything else personal. What to hand over in a bug
  report is therefore a single click, not a scavenger hunt, and it is safe to attach to a
  public issue.

## Backup and restore

Status: **AGREED**

The guarantee: **a reinstall loses nothing irreplaceable.** The owner should be able to lose
the server entirely, stand up a new one, restore one backup, and be where they were — same
accounts, same history, same settings — without re-teaching it anything.

What a backup **must** contain, because it cannot be regenerated:

- **Accounts** — owner and users, their bindings and access ([`accounts.md`](../accounts/README.md)).
- **Watch state** — history, resume positions, ratings, and the manual-match bindings the
  library keeps against files ([`library.md`](../library/README.md)). This is the irreplaceable heart:
  history that outlives the bytes it describes must outlive the server too.
- **Settings** — sources, schedules, provider credentials, server identity.
- **Module data** — each installed module's own persisted state ([`modules.md`](../modules/README.md)),
  so a restore brings modules back as they were, not as blank installs.

What a backup **must not** contain, because including it is waste, not safety:

- **Media files.** KROMA never owns the bytes ([`library.md`](../library/README.md)); the library is
  the owner's, backed up by the owner however they back up a NAS. A KROMA backup is small.
- **Regenerable caches and artwork.** Fetched metadata, generated images and transcode
  output all rebuild themselves from the sources and providers after a restore. A backup
  that included them would be enormous and no safer.

Restore is the inverse and is the same path lockout recovery can lean on: point a fresh
server at a backup and it becomes the old server, then re-scans sources to rebuild the
caches it deliberately did not carry. The restored server re-matches files to the identities
the backup remembers, so watch history reattaches to media the moment it is scanned back in.

## Updates

Status: **DRAFT** — delivery mechanism provisional

A server learns it is out of date by checking for a newer release and saying so, quietly, in
Admin — a passive notice, never an automatic action. The owner decides when. Nothing on a
self-hosted media server should update itself under the family mid-film.

The risk an update carries, and how KROMA bounds it:

- **Server updates** may change the persistent store. The rule: an update migrates forward
  automatically and a backup is the safety net, so the owner is nudged to have a current
  backup before a server update, and a failed migration leaves the previous version
  restorable rather than a half-migrated store.
- **Module updates** are independent of the server and carry their own compatibility
  promise ([`modules.md`](../modules/README.md)); a module update never requires a server update and a
  server update never silently updates modules.
- **Active playback is not a reason an update is blocked, and an update is not a reason
  playback stops** — but because a server update means a restart, the owner is told an update
  will interrupt streams and chooses the moment. Updates are the one deliberate exception to
  the live-change guarantee below.

Open, with a recommendation: how the update actually arrives differs per host — a NAS
package, a desktop auto-updater, a container image — and that delivery is
[`surfaces.md`](../surfaces/README.md). Recommended answer — the product rule ("passive notice, owner
chooses, backup first, migrate-forward-or-restore") is fixed here and identical everywhere;
only the delivery vehicle varies by surface. This split is provisional pending review.

## Changing settings while media plays

Status: **AGREED**

The guarantee: **a settings change never interrupts active playback.** The owner can add a
source, invite a user, kick off a scan, edit a schedule or change the server's display name
while the household is mid-film, and no stream drops. Playback in flight is served from state
already resolved; admin edits change what happens *next*, not what is on screen *now*.

The exceptions are few, honest, and all involve a restart the owner initiates:

- **Server updates** restart the server and therefore interrupt streams — the owner is
  warned and picks the moment (above).
- **Deploy-time parameters** (bind address, store location) cannot change without a restart,
  which is why they are not runtime settings at all (above).
- **Removing a user or revoking a device** intentionally ends *that* person's sessions
  immediately ([`accounts.md`](../accounts/README.md)); it is a security action, not a preference, and
  interrupting the revoked stream is the point. Everyone else plays on.

Everything reachable as an ordinary runtime setting is safe to change at any time, including
while media is playing. If a change is not safe to make live, it is not a runtime setting.

## Not in scope

- **Roles, sessions, device binding and account deletion** are [`accounts.md`](../accounts/README.md).
- **Module lifecycle, the Store and sidecar failure** are [`modules.md`](../modules/README.md).
- **Scan and refresh behaviour** is [`library.md`](../library/README.md); Admin only starts, shows and
  cancels those jobs.
- **Per-platform packaging and the update delivery vehicle** are [`surfaces.md`](../surfaces/README.md).
