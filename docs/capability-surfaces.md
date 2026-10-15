# A capability a module answers, drawn by every client

Watching a film while it downloads is the first feature whose whole server side
belongs to a module and whose whole interface belongs to the clients. This is
the rule it follows, and why the split falls there and not elsewhere.

## The decision

**The server side lives in one module. The interface lives in the shared client
packages. Neither half is in both places.**

The core keeps mechanism only: the point registry, the module reverse proxy, and
one generic route that says which mount answers a capability. It holds no
route and no setting for the feature itself, and it still names no module. The
one shape it knows is a watch item, a file named by its mount, its download and
its index, which a heartbeat and a cast carry where a catalogue item would go:
the core bounds it and relays it without reading it (see
[the watch doc](watch-while-downloading.md#the-heartbeat-the-next-episode-and-a-cast)).

## Why not the other two shapes

**Everything in the core** is where this started: `server/src/api/watchable*`,
two settings keys, a second HLS input path, and a loopback that read a module's
bytes back through the core's own proxy. It worked, and it put a torrent's
lifecycle in the crate that must not know what a torrent is. Every acquisition
idea after this one would have landed in the same place.

**Everything in the module, interface included**, is what the frontend loader
suggests until you read the shells. A module's `fe/` is an ES-module bundle
fetched at runtime and evaluated by the browser. Metro resolves at bundle time
and Hermes has no dynamic `import()` of a URL; the bundle's own prologue calls
`document.createElement`; `packages/tv/src/app/router.tsx` is a literal-keyed
screen registry and the phone is file-routed, both closed at compile time; the
Tizen and webOS legacy tiers are built at `es2015` for engines with no ESM at
all. A module's screen therefore reaches the web and nothing else, and the
product would have a feature that exists on a laptop and not on a television.

## The shape

```
module            everything a torrent is: search, pick, download, cache,
                  bytes, probe, transcode, its own settings, its own credential
core              points · reverse proxy · GET /api/capabilities
client packages   one domain in @kromatv/client, the screens in @kromatv/ui,
                  the rules in @kromatv/core, mounted by each shell
```

A client asks the core what this server can do, gets a mount back, and speaks
the capability's own vocabulary to it. It never learns which module answered,
and the core never learns what the module does with it.

### The capability listing

```
GET /api/capabilities            (session, nothing else)
{"capabilities": {
  "watchable": {
    "mount": "/api/module/tv.kroma.torrents",
    "sources": [{
      "mount": "/api/module/tv.kroma.torrents",
      "label": "Torrents",
      "icon": "magnet",
      "figures": [
        {"key": "downloaded", "label": "Téléchargé", "kind": "percent"},
        {"key": "speed",      "label": "Vitesse",    "kind": "rate"},
        {"key": "sources",    "label": "Pairs",      "kind": "ratio"}
      ],
      "map": {"label": "Morceaux reçus"},
      "actions": [{"key": "cancel", "label": "Annuler"}]
    }]
  }
}}
```

The names are the bare points the core already holds. The mounts come from the
running registry, so an operator who installs a different module that
contributes the same point changes the answer and nothing else. A capability
nothing answers is absent from the map, which is what a client reads as "do not
offer it".

**A capability the viewer may not use is absent the same way.** Each name in the
listing is paired with one `Permission`, and an account without it is answered a
map without that name. Gating the listing is what makes the right cost the
clients nothing: all three shells already draw nothing for a capability that is
not there. The name is the capability's, never a module's: `watchable.play` says
what a viewer may do, and would still say it if a Usenet module were the one
answering. Enforcing it twice is deliberate, because the core's proxy has no
session gate in front of a mount, so the module checks the same right against the
`User` the host hands it and refuses with a `403` (see
[what a module owes a capability](#what-a-module-owes-a-capability)).

A new right is granted once, and only to the accounts already holding one of
equal power, so an upgrade takes nothing away from anyone who could use the
feature yesterday and hands it to nobody who could not. `watchable.play` goes to
`requests.auto` (a download nobody approves is what the right is) and to whoever
runs the server; every other member waits for an admin to tick it. The mark is
written when the grant lands, so an operator who then unticks it keeps it
unticked, and a grant the database refused is retried on the next start
(`kroma_engine::services::rights`).

`mount` at the top level names the lowest-id module answering, which is what a
client written before `sources` existed reads.

This is the same rule the point seam already follows: the core holds the name,
never the meaning.

### A module brings its own interface, as data

A capability may have several sources at once, and they are not the same thing:
a swarm counts peers, a Usenet server counts nothing of the sort, and a debrid
link has one figure and no map. So the shape a client draws is not written into
the client. Each contributing module declares it, and one screen draws every
source it is handed.

| field | what it is |
| --- | --- |
| `label` | what this source calls itself |
| `icon` | one word from the store's icon vocabulary, never a URL |
| `figures` | the numbers it reports, in the order it wants them read |
| `map` | what it calls its slice map, absent when it reports none |
| `actions` | what a client may offer beyond playing |

A figure's `key` is what the source's own payload spells it with and is never
shown; its `label` is. The slice map has no `key`: a source that declares one
answers `slices`, one percentage per slice, and `arriving`, the 0-based indexes
into `slices` of the slices it is fetching right now (see
[the arrival map](watch-while-downloading.md#the-arrival-map-and-what-arriving-means)).
A client that reads neither draws the figures alone. `kind` is closed, because a client can only draw what it
was built to draw: `percent` (a fraction of one), `rate` (bytes per second),
`ratio` (two counts), `count`, `text`. A kind outside that set reaches nobody,
so the list grows in the clients first and in a module second.

**The core collects this with a point method, not out of the manifest.** Every
word in it is the module's own in the VIEWER's language, and a sidecar's catalog
is embedded in its binary: the manifest is one static file and the core has no
way to resolve a key against locales it never unpacked. So the core calls
`POST /_port/<capability>/describe` on each contribution with the viewer's
locale, adds the mount it reached, and forwards the rest without reading it. It
gains no word for what a figure means, and a source it has no name for arrives
intact.

Two consequences worth stating plainly. A module that answers nothing to
`describe` is left out of `sources` rather than forwarded as a bare mount: the
capability is still there, with the mount a client written before `sources`
reads, and a module still booting takes nothing down with it. And the call is on
a three second leash rather than the loopback's usual half minute, covering the
body as well as the head, because a client asks for this listing before it can
draw anything and a wedged sidecar would otherwise hold the thread.

The list is ordered by the module answering, not by the order the modules
directory happened to be read in, so `mount` names the same source on every call.

The SDK carries the declaration (`kroma_module_sdk::capability`), so a module
outside this repository writes it against the published package:

```rust
capability::routes(WATCHABLE, |locale| {
    let t = strings::for_locale(locale);
    capability::Source::new(t.t("watch.label", &[]), "magnet")
        .figure("speed", t.t("watch.speed", &[]), FigureKind::Rate)
        .slice_map(t.t("watch.slices", &[]))
        .action("cancel", t.t("watch.cancel", &[]))
})
```

### What a module owes a capability

Its routes under its own mount, its own credential for anything a `<video>`
element fetches (a bearer cannot be attached to a media element, and the core's
media ticket is core-only by policy), and the payload shapes the capability
declares. The module localizes its own refusals: a sidecar has no core catalog.

It also owes the capability's own permission check on every route that takes a
bearer, against the `User` the host resolved, because the proxy in front of the
mount checks nothing. A module names the right through the SDK's `Permission`,
which it may read and may not extend.

What it does **not** owe is a second transcoder. `kroma-media` is ffprobe, the
ffmpeg budget, the HLS engine and the per-request program over it, in a crate
with no database and no catalog, reached through `kroma-module-sdk/transcode`.
An input is a path or a URL, a program is named by whoever asked for it, and the
engine is **told** the directory it may write its sessions in: the core passes
`<data>/hls`, a module passes `<data>/modules/<its id>/hls` (the directory it was
unpacked into, beside its own `module.sqlite`), and neither wipes the other's
live sessions. `Credential` is the query every URI of a program carries,
so a module stamps its own credential where the core stamps a media ticket.

### What the clients owe it

One domain in `@kromatv/client` whose zod schemas are the wire types, the rules
in `@kromatv/core`, and screens in `@kromatv/ui` at the level they earn, so the
web, the televisions and the phone draw the same thing from the same source.
A shell contributes a route and nothing else.

## What this costs, honestly

**A module contributes data, not code, and a screen nobody declared cannot be
drawn.** A source says what it is called, which numbers it reports and which
actions it offers, and that is the whole vocabulary. A module wanting a control
the clients have no widget for, a chart, a per-file table, a picker, gets
nothing: the shells are compiled binaries and the only way to add a shape is to
add it to `@kromatv/ui` and ship the clients. What this buys is that a source
nobody here has thought of draws correctly on a television the day it is
installed, as long as it fits the vocabulary. What it does not buy is a module
inventing the vocabulary.

The same limit applied before this change, with one figure fewer: the clients
hard-coded `peers` and `pieces` and a Usenet module had to lie about what it
was. Now it declares what it is and stays honest, inside a fixed set of shapes.

**A rail of what is arriving shows one source, and it is the one in use.** Every
client reads the listing through the source it is speaking to, so with two
sources and no pick yet there is nothing to list. Spanning them needs two things
the clients do not have: one `GET {mount}/watch` per source folded into one rail,
and a mount carried beside the download id everywhere a download is named, since
the id is unique only inside the module that minted it. That is a route change on
three shells (`/watch/stream/$downloadId` on the web, `/watch/[downloadId]` on
the phone, the `watch` nav params on the television) and no server change at all:
the capability listing already names every mount, and each answers its own
downloads.

Two processes transcoding means two ffmpeg budgets. The core's gate is a
process-wide semaphore, so a module's passes are not counted against it. Until
the host lends a slot, a module caps itself from the same setting the core
reads.
