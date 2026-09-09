# Surfaces

Status: **AGREED**. Sections carry their own status below.

KROMA runs on a television, a phone, a browser, a desktop and a NAS. This file says what
every surface must do, what each may do differently, and what a surface is explicitly
allowed *not* to do, so a missing feature is a decision on record rather than a gap.

It owns the *surface* view: which surfaces exist, what they promise, and which class of
media each can direct-play. It does not own the codec decision. Given a file, a client and
a network, what gets sent is [`playback/`](../playback/)'s job, and what a stream *is* comes
from [`media/`](../media/). This file reads those as facts and states the consequence per
surface. The shared component kit that makes the surfaces look alike is architecture, not
spec. See [`packages/ui`](../../../packages/ui).

## The surfaces

Status: **SHIPPED**

**SURF-1** (SHIPPED) - Every client KROMA ships is one of the surfaces named here, and each
surface names the shell that implements it. A client that is not in this table is a
prototype, and adding or retiring a surface is a change to this section.

| Surface | Shell | Notes |
|---|---|---|
| Web | `clients/web` | The reference implementation |
| Samsung TV | `clients/tizen` | 10-foot UI, remote-only input |
| LG TV | `clients/webos` | 10-foot UI, remote-only input |
| Other TV | `clients/tv-web`, `clients/tv-native` | Apple TV / Android TV native; generic web fallback |
| Mobile | `clients/mobile` | Offline downloads |
| Desktop | `clients/desktop` | Auto-update |
| NAS | `clients/synology` | Packaging, not a client |

## The baseline

Status: **AGREED**

There is one baseline, and it is the whole definition of the word *KROMA* on a surface.
Every first-class surface does all six rungs; a best-effort surface that drops one says so
here rather than failing silently.

**SURF-2** (AGREED) - A build that cannot do all six rungs below is a preview, not a
surface, and the capability matrix records exactly which rung it is missing.

- **SURF-3** (SHIPPED) - **Sign in or pair.** A surface reaches a server and becomes an
  account on it. Where there is a keyboard this is address plus credentials; on a television
  it is the pairing handshake ([`discovery/`](../discovery/),
  [`docs/tv-pairing.md`](../../tv-pairing.md)).
- **SURF-4** (SHIPPED) - **Browse the library.** A surface moves through the titles the
  account may see, by section and by search.
- **SURF-5** (SHIPPED) - **View a title.** A surface shows a title's artwork, its metadata,
  its editions and its available fidelities.
- **SURF-6** (SHIPPED) - **Start playback.** A surface plays the title, taking whatever rung
  the device needs ([`playback/`](../playback/)).
- **SURF-7** (SHIPPED) - **Resume.** A surface reopens an in-progress title at the
  server-held position, per user and per version.
- **SURF-8** (SHIPPED) - **Sign out.** A surface ends the session and drops the server from
  the device, revocably.

**SURF-9** (AGREED) - Everything past the six rungs is a *may*, not a *must*. A surface that
lacks one of them records the absence in the capability matrix, so "not on TV yet" is
answered by naming the rung rather than by argument.

## First-class and best-effort

Status: **AGREED**

Surfaces are tiered, and the tier is a commitment, not a description of current polish. Web
is where the baseline is *defined*, so web is first-class by construction and cannot regress
below it.

**SURF-10** (SHIPPED) - Web is the reference implementation. Where two surfaces disagree on
a behaviour, web's is the correct one, unless the other surface's input model forbids
copying it.

**SURF-11** (AGREED) - A feature is not shipped until web has it.

- **SURF-12** (SHIPPED) - **First-class.** Web, mobile, desktop and the native television
  shells carry the whole baseline and ship on the release train.
- **SURF-13** (AGREED) - A baseline regression on a first-class surface blocks the release.
- **SURF-14** (AGREED) - A first-class surface may diverge from web where its input model
  demands it, and may never drop a baseline rung.
- **SURF-15** (SHIPPED) - **Best-effort.** The sandboxed television shells, Samsung and LG,
  and the generic web fallback for other televisions carry the baseline but are held to their
  platform's ceiling rather than to web's.
- **SURF-16** (AGREED) - A capability a best-effort surface's platform cannot express, such
  as LAN discovery on Samsung or a codec the panel's decoder lacks, is a recorded absence
  here rather than a defect, and such a surface may ship behind the release train.
- **SURF-17** (SHIPPED) - **The NAS package is not a surface.** It puts the *server* on a
  Synology box. Its users reach KROMA through one of the surfaces above; it has no UI of its
  own and no baseline to meet. It appears here so the reader stops looking for one.

## Capability matrix

Status: **AGREED**

**SURF-18** (AGREED) - The matrix below is the record of what each surface must, may and may
not do beyond the baseline. A surface that fails a cell is a defect; a cell saying a surface
does not do something is a decision on record.

| Capability | Web | Mobile | Desktop | TV native | TV sandboxed (Tizen/webOS) |
|---|---|---|---|---|---|
| Baseline (six above) | must | must | must | must | must |
| Input model | pointer | touch | pointer | remote | remote |
| Discover a server on the LAN | no | browses | no | publishes | Tizen no / webOS publishes |
| Pair a television *to* this surface | n/a | yes (scanner) | n/a | is the TV | is the TV |
| Offline downloads | no | yes | no | no | no |
| Direct-play ceiling | browser codecs | device generation | browser codecs | panel generation | panel generation |

"Discover" and "pair" are the surface's *reach*. The per-shell truth, meaning who publishes,
who browses and why Samsung cannot, is [`discovery/`](../discovery/)'s, grounded in
[`docs/tv-pairing.md`](../../tv-pairing.md). This table names the outcome; that file names
the mechanism.

### Direct-play by device generation

Status: **AGREED**

Whether a file direct-plays is decided per session by [`playback/`](../playback/) against a
device profile. The *class* of media a surface can decode is a surface fact, and it is the
device's generation, not the surface's brand, that sets it.

- **SURF-19** (SHIPPED) - **Browser-backed surfaces**, web and the sandboxed television
  shells, direct-play what the host browser's media stack exposes and cannot exceed it:
  reliably H.264, and on a current engine HEVC, VP9 and AV1 where hardware-backed, inheriting
  that engine's HDR and channel-layout limits exactly.
- **SURF-20** (SHIPPED) - **Native surfaces**, mobile, desktop and the native television
  shells, direct-play to the *device's* own decoder. KROMA reads the generation from the
  device profile and never assumes a newer one than it measures.
- **SURF-21** (AGREED) - When a television's older decoder cannot play a file a modern phone
  can, and transcode is capped or disabled, the television says so plainly and names a surface
  that does play it ([`playback/`](../playback/)).
- **SURF-22** (AGREED) - KROMA never papers over a generation gap by silently transcoding for
  a surface that could direct-play, and never claims a panel decodes a codec its generation
  predates.

The first-class media truth, which codecs, containers and HDR variants exist, is
[`media/`](../media/); this section only says which surface can take it unmodified.

## Input models

Status: **AGREED**

The input model is the one thing a surface may *not* copy from web, because copying it would
break the surface. Three models, and each rewrites the UI rather than only the event
handling.

- **SURF-23** (SHIPPED) - **Pointer**, on web and desktop, is the reference model: dense
  layouts, hover affordances, a visible cursor, right-click and keyboard shortcuts. Every
  other model is a deliberate departure from it.
- **SURF-24** (SHIPPED) - **Touch**, on mobile, means targets sized for a thumb, gestures for
  scrub and dismiss, no hover state to depend on, and layouts that reflow to a held phone.
  Anything that only works with a cursor is redesigned, not shrunk.
- **SURF-25** (SHIPPED) - **Remote, 10-foot**, on every television, is a directional focus
  ring rather than a cursor: everything reachable by up, down, left, right and OK, legible
  across a room, and no interaction that assumes text entry the remote cannot supply.
- **SURF-26** (SHIPPED) - A television signs in through the pairing handshake precisely
  because a television keyboard is unusable ([`discovery/`](../discovery/)).
- **SURF-27** (AGREED) - A television build that ships a pointer-shaped screen has not met
  the baseline's *view* and *browse* rungs, however complete it looks on a monitor.
- **SURF-28** (AGREED) - A surface serving more than one model, such as a tablet with a
  pointer attached, adapts to the *active* input rather than to the hardware badge.

## Offline

Status: **AGREED**

**SURF-29** (SHIPPED) - **Only mobile is offline.** Web, desktop and every television hold no
library on the device and do nothing without a reachable server.

That is a decision, not a gap. A browser tab and a shared living-room television are the
wrong places to accrue gigabytes of a personal library, and the storage, eviction and
reconciliation cost is not worth paying five times.

- **SURF-30** (SHIPPED) - A download is a progressive file, the raw original when the device
  direct-plays it and otherwise a server-side remux to a single fMP4, and it plays with no
  server connection.
- **SURF-31** (SHIPPED) - Downloads survive backgrounding and app kills, and are re-adopted
  on the next launch.
- **SURF-32** (SHIPPED) - Progress reports that could not be sent queue on the device and
  flush under the furthest-position rule once the server is reachable
  ([`playback/`](../playback/)).

### OS-managed download rows

Status: **DESIGN, NOT IMPLEMENTED**

**SURF-33** (DESIGN, NOT IMPLEMENTED) - Per-title rows in the OS storage manager, deletable
by the system with the app closed, are deferred as a unit.

Netflix-style rows in iOS Settings ▸ iPhone Storage did **not** ship. What shipped instead
is the background-transfer pipeline above, transfers that outlive the app, which is the half
users feel. The OS rows need system-managed HLS assets (`AVAssetDownloadTask`, a finite VOD
playlist, tokenised segment URLs, delete-reconciliation on every launch): a
server-plus-native-plus-player project, iOS-only, with no Android equivalent to match. It is
deferred as a unit rather than half-built. The full record, and what it would take, is in
[`../architecture/mobile-offline-system-storage.md`](../../architecture/mobile-offline-system-storage.md).

## Packaging and updates

Status: **AGREED**

Each surface ships and updates the way its host expects. Deploy mechanics are
[`admin/`](../admin/)'s; here is the product-level shape.

**SURF-34** (AGREED) - A surface stays current without asking a person to babysit it.

- **SURF-35** (SHIPPED) - **Web.** The server serves the web surface itself. There is no
  separate install and no version skew: updating the server updates the web surface, and a
  browser always loads the version its server ships.
- **SURF-36** (SHIPPED) - **Desktop.** The app checks for, fetches and applies updates in the
  background, and a person is never asked to reinstall to stay current.
- **SURF-37** (AGREED) - **Mobile.** The app updates on the store's cadence, so a server
  tolerates a range of shipped app versions because a person's phone updates on its own
  schedule.
- **SURF-38** (AGREED) - **Televisions.** Each television updates through its own platform's
  channel. KROMA never self-updates a television; the platform does, on its terms.
- **SURF-39** (SHIPPED) - **NAS.** The Synology package installs and updates through Package
  Center. It ships the *server*, so everything it serves follows the web rule above.

## Deprecation

Status: **AGREED**

**SURF-40** (AGREED) - A surface is dropped when its host platform can no longer meet the
baseline, such as a browser generation KROMA can no longer target, a television OS the vendor
has abandoned, or a mobile OS below the floor the app can build against. Deprecation is
announced, never silent.

- **SURF-41** (AGREED) - **Notice first.** A surface entering deprecation tells its users *in
  the surface* before it stops working: what is ending, when, and which surface to move to. A
  person is never met with a dead app and no explanation.
- **SURF-42** (AGREED) - **Sessions survive the app.** A deprecated surface's sessions are
  ordinary sessions. They keep working until the surface is retired and revoke from the device
  list like any other ([`accounts/`](../accounts/)). Retiring a surface does not strand an
  account.
- **SURF-43** (AGREED) - **The library outlives any surface.** Nothing about a person's
  library, watch state or account is tied to a surface, since it is the server's, so moving to
  another surface loses only the retired app, never the account behind it. Every surface is a
  replaceable window onto the same server.
