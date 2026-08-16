# Surfaces

Status: **AGREED** — sections carry their own status below.

KROMA runs on a television, a phone, a browser, a desktop and a NAS. This file says what
every surface must do, what each may do differently, and what a surface is explicitly
allowed *not* to do — so a missing feature is a decision on record rather than a gap.

It owns the *surface* view: which surfaces exist, what they promise, and which class of
media each can direct-play. It does not own the codec decision — given a file, a client and
a network, what gets sent is [`playback.md`](../playback/README.md)'s job, and what a stream *is* comes
from [`media.md`](../media/README.md). This file reads those as facts and states the consequence per
surface. The shared component kit that makes the surfaces look alike is architecture, not
spec — see [`packages/ui`](../../../packages/ui).

## The surfaces

| Surface | Shell | Notes |
|---|---|---|
| Web | `clients/web` | The reference implementation |
| TV — Samsung | `clients/tizen` | 10-foot UI, remote-only input |
| TV — LG | `clients/webos` | 10-foot UI, remote-only input |
| TV — other | `clients/tv-web`, `clients/tv-native` | Apple TV / Android TV native; generic web fallback |
| Mobile | `clients/mobile` | Offline downloads |
| Desktop | `clients/desktop` | Auto-update |
| NAS | `clients/synology` | Packaging, not a client |

## The baseline

Status: **AGREED**

There is one baseline, and it is the whole definition of the word *KROMA* on a surface. A
build that runs but cannot do all six is a preview, not a surface, and the capability matrix
below records exactly which rung it is missing. Every first-class surface does all six; a
best-effort surface that drops one says so here rather than failing silently.

1. **Sign in / pair** — reach a server and become an account on it. On a surface with a
   keyboard this is address-plus-credentials; on a television it is the pairing handshake
   ([`discovery.md`](../discovery/README.md), [`docs/tv-pairing.md`](../../tv-pairing.md)).
2. **Browse the library** — move through titles the account may see, by section and by search.
3. **View a title** — its artwork, its metadata, its editions and available fidelities.
4. **Start playback** — play the title, taking whatever rung the device needs
   ([`playback.md`](../playback/README.md)).
5. **Resume** — reopen an in-progress title at the server-held position, per user, per version.
6. **Sign out** — end the session and drop the server from the surface, revocably.

Everything past these six is a *may*, not a *must*. "Not on TV yet" is measurable against
this list and nothing else: name the rung, and the gap is a line in the matrix rather than an
argument.

## First-class and best-effort

Status: **AGREED**

Surfaces are tiered, and the tier is a commitment, not a description of current polish.

**Web is the reference implementation.** A behaviour is correct when it matches web; a
feature is not shipped until web has it; a disagreement between surfaces is resolved in web's
favour unless the input model forbids it. Web is where the baseline is *defined*, so web is
first-class by construction and cannot regress below it.

- **First-class** — Web, Mobile, Desktop, and the native television shells (`tv-native`,
  Apple TV / Android TV). They carry the full baseline, ship on the release train, and a
  baseline regression on one of them blocks the release. Each is allowed to *diverge* where
  its input model demands (below), never to *drop* a baseline rung.
- **Best-effort** — the sandboxed television shells (`tizen`, `webos`) and the generic
  `tv-web` fallback. They carry the baseline but are held to the platform's ceiling, not to
  web's: a capability the platform cannot express (LAN discovery on Tizen; a codec the panel's
  decoder lacks) is a recorded absence here, not a defect. They ship when the platform allows
  and may lag the train.
- **NAS is not a surface.** `clients/synology` is packaging — it puts the *server* on a
  Synology box. Its users reach KROMA through one of the surfaces above; it has no UI of its
  own and no baseline to meet. It appears here so the reader stops looking for one.

## Capability matrix

Status: **AGREED**

What each surface must, may, and may not do, beyond the baseline all of them share.

| Capability | Web | Mobile | Desktop | TV native | TV sandboxed (Tizen/webOS) |
|---|---|---|---|---|---|
| Baseline (six above) | must | must | must | must | must |
| Input model | pointer | touch | pointer | remote | remote |
| Discover a server on the LAN | no | browses | no | publishes | Tizen no / webOS publishes |
| Pair a television *to* this surface | n/a | yes (scanner) | n/a | is the TV | is the TV |
| Offline downloads | no | yes | no | no | no |
| Direct-play ceiling | browser codecs | device generation | browser codecs | panel generation | panel generation |

"Discover" and "pair" are the surface's *reach*, and the per-shell truth — who publishes,
who browses, why Tizen cannot — is [`discovery.md`](../discovery/README.md)'s, grounded in
[`docs/tv-pairing.md`](../../tv-pairing.md). This table names the outcome; that file names the
mechanism.

### Direct-play by device generation

Status: **AGREED**

Whether a file direct-plays is decided per session by [`playback.md`](../playback/README.md) against a
device profile; the *class* of media a surface can decode is a surface fact, and it is the
device's generation, not the surface's brand, that sets it. The rule KROMA holds to:

- **Browser-backed surfaces** (Web, and the sandboxed television shells) direct-play what the
  host browser's media stack exposes — reliably H.264 and, on a current engine, HEVC, VP9 and
  AV1 where hardware-backed. They inherit the browser's ceiling exactly, including its HDR and
  channel-layout limits, and cannot exceed it.
- **Native surfaces** (Mobile, Desktop, `tv-native`) direct-play to the *device's* decoder,
  which is where generation bites: a current phone decodes 10-bit HEVC and Dolby Vision in
  hardware that a three-year-old panel of the same brand cannot. KROMA reads the generation
  from the profile and never assumes newer than it measures.
- **The honest consequence** is on record in [`playback.md`](../playback/README.md): when a television's
  older decoder cannot play a file a modern phone can, and transcode is capped or disabled, the
  television says so plainly and points at a surface that *does* play it. The matrix here is the
  input to that message; it is not a promise every surface plays everything.

KROMA does not paper over a generation gap by silently transcoding for a capable surface, and
it does not pretend a panel decodes a codec its generation predates. The first-class media
truth (which codecs, containers, HDR variants exist) is [`media.md`](../media/README.md); this section
only says which surface can take it unmodified.

## Input models

Status: **AGREED**

The input model is the one thing a surface may *not* copy from web, because copying it would
break the surface. Three models, and each rewrites the UI, not just the event handling.

- **Pointer** (Web, Desktop) — the reference model. Dense layouts, hover affordances, a
  visible cursor, right-click and keyboard shortcuts. This is what every other model is a
  deliberate departure *from*.
- **Touch** (Mobile) — targets sized for a thumb, gestures for scrub and dismiss, no hover
  state to depend on, and layouts that reflow to a held phone. Anything that only works with a
  cursor is redesigned, not shrunk.
- **Remote, 10-foot** (all televisions) — a directional focus ring, not a cursor: everything
  reachable by up/down/left/right and OK, legible across a room, and no interaction that
  assumes text entry the remote cannot supply. Sign-in is the pairing handshake precisely
  because a television keyboard is unusable ([`discovery.md`](../discovery/README.md)). A television
  build that ships a pointer-shaped screen has not met the baseline's *view* and *browse*
  rungs, however complete it looks on a monitor.

One product surface may serve more than one model — a hybrid tablet is touch-first with a
pointer attached — and the surface adapts to the *active* input rather than the hardware badge.

## Offline

Status: **AGREED**

**Only Mobile is offline.** Web, Desktop and every television are online surfaces: they hold
no library on the device and do nothing without a reachable server, and this is a decision,
not a gap — a browser tab and a shared-living-room television are the wrong places to accrue
gigabytes of a personal library, and the storage, eviction and reconciliation cost is not
worth paying five times.

On Mobile, offline means **downloads**: a title is fetched to the phone as a progressive
file — the raw original when the device direct-plays it, else a server-side remux to a single
fMP4 — and plays with no server connection. Downloads survive backgrounding and app kills and
are re-adopted on next launch, and so is the queue of unsent progress reports, which flushes
under the furthest-position rule when the server is reachable again
([`playback.md`](../playback/README.md),
[`../architecture/mobile-offline-system-storage.md`](../../architecture/mobile-offline-system-storage.md)).

### OS-managed download rows

Status: **DESIGN, NOT IMPLEMENTED**

Netflix-style per-title rows in the OS storage manager (iOS Settings ▸ iPhone Storage,
deletable by the system with the app closed) did **not** ship. What shipped instead is the
background-transfer pipeline above — transfers that outlive the app, which is the half users
feel. The OS rows need system-managed HLS assets (`AVAssetDownloadTask`, a finite VOD playlist,
tokenised segment URLs, delete-reconciliation on every launch): a server-plus-native-plus-player
project, iOS-only, with no Android equivalent to match. It is deferred as a unit rather than
half-built. The full record, and what it would take, is in
[`../architecture/mobile-offline-system-storage.md`](../../architecture/mobile-offline-system-storage.md).

## Packaging and updates

Status: **AGREED**

Each surface ships and updates the way its host expects; the product rule is only that a
surface stays current without asking a person to babysit it. Deploy mechanics are
[`admin.md`](../admin/README.md)'s; here is the product-level shape.

- **Web** — served by the server itself; the server embeds the web build. There is no separate
  install and no version skew: updating the server updates the web surface, and a browser
  always loads the version its server ships.
- **Desktop** — auto-updates. The app checks, fetches and applies updates in the background and
  a person is never asked to reinstall to stay current.
- **Mobile** — the app stores (App Store, Play Store). Update cadence is the store's, and a
  server must tolerate a range of shipped app versions because a person's phone updates on its
  own schedule.
- **Televisions** — each platform's own channel: Samsung and LG through their TV app stores,
  Apple TV and Android TV through theirs. KROMA does not self-update a television; the platform
  does, on its terms.
- **NAS** — a Synology `.spk` package installed and updated through Package Center. This ships
  the *server*, so the same "server embeds web" rule applies to everything it serves.

## Deprecation

Status: **AGREED**

A surface is dropped when its host platform can no longer meet the baseline — a browser
generation KROMA can no longer target, a television OS the vendor has abandoned, a mobile OS
below the floor the app can build against. Deprecation is announced, never silent.

- **Notice first.** A surface entering deprecation tells its users *in the surface* before it
  stops working: what is ending, when, and which surface to move to. A person is never met with
  a dead app and no explanation.
- **Sessions survive the app.** A deprecated surface's sessions are ordinary sessions; they
  keep working until the surface is retired and revoke like any other from the device list
  ([`accounts.md`](../accounts/README.md)). Retiring a surface does not strand an account.
- **The library outlives any surface.** Nothing about a person's library, watch state or
  account is tied to a surface — it is the server's — so moving to another surface loses only
  the retired app, never the account behind it. That is the point of stating the baseline once:
  every surface is a replaceable window onto the same server.
