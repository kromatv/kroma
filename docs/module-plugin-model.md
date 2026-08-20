# The module system

How a module extends KROMA, how a module extends another module, and why the
core knows none of it.

[`modules-as-kmod.md`](modules-as-kmod.md) covers packaging, spawning,
supervision and release. That layer works. This document is the contract layer,
which did not: the core compiled every module's vocabulary, and a module type
nobody had written yet had nowhere to declare itself.

## What a module has to be able to do

These are the acceptance tests for the whole design. A module can:

1. Add HTTP routes, user-facing UI and admin UI.
2. Own its data, and reach a declared slice of the core's.
3. Read and write settings, declare and run scheduled jobs, send notifications,
   publish events AND react to them, act as the signed-in user under the
   permissions it declares.
4. Call another module without naming it, without linking it, and without either
   one being installed when the other was built.
5. **Define an extension point of its own, and be extended by modules that did
   not exist when it shipped.** The download manager defines
   `tv.kroma.torrents/client`; qBittorrent and Transmission answer it. Neither
   the core nor the download manager was edited to add the second one.
6. Ship, version and release on its own tag, with no core release.

And the constraint that shapes everything: **the core knows the mechanism and
never the meaning.** It routes calls between modules whose purpose it cannot
name.

## The kernel

Five primitives. None of them mentions a domain.

| Primitive | What the core does | Where it lives |
| --- | --- | --- |
| Lifecycle | install, enable, spawn, supervise, health, uninstall | `kroma-module-supervisor` |
| Declaration | read each manifest's defines / contributes / consumes | `kroma-module-manifest` |
| Resolution | point name to the live contributions answering it | `Supervisor::contributions` |
| Transport | an authenticated JSON call to one contribution | `kroma-module-host` |
| Host capabilities | settings, storage, events, jobs, notifications, session | `/api/_host/*` |

Everything a module does with another module is resolution plus transport.
Everything a module does to the server is a host capability. There is no third
thing, and no place for a trait describing what a module is for.

## The extension point

A point is a named, versioned place where behaviour can be plugged in. Its name
is namespaced by the module that defines it, so ownership is legible and two
authors cannot collide:

```
tv.kroma.torrents/client
tv.kroma.indexer/engine
```

The handful the CORE calls are bare — `acquisition`, `transcriber`, `embedder` —
because the core has no manifest to define one in and nothing else may define
one. A bare name is the core's; a name with a `/` belongs to the module before
it.

Three manifest verbs, and every module may use all three:

```jsonc
// tv.kroma.torrents — defines a point, and answers it itself
"definesPoints": [
  { "name": "client",
    "methods": ["test", "add", "status", "pause", "resume", "reannounce", "remove"] }
],
"contributes": [
  { "point": "tv.kroma.torrents/client", "id": "rqbit" }
],
"consumes": [
  { "point": "tv.kroma.indexer/torrent-fetch" },
  { "point": "tv.kroma.vpn/proxy", "optional": true }
]
```

```jsonc
// tv.kroma.engine.qbittorrent — answers someone else's point
"contributes": [
  { "point": "tv.kroma.torrents/client",
    "id": "qbittorrent", "label": "qBittorrent", "fields": [ /* its own config */ ] }
]
```

`version` defaults to 1 on both sides, so it is written only when a point moves
past its first major.

This replaced three overlapping declarations that all said the same thing.
`provides` was the capability advertisement the admin UI read, `ports` was the
RPC advertisement resolution read, and `requires` was a capability KIND with no
owner. One fact, written three ways: an engine advertised `download-client`
under two of them and the third was the same fact a third time.

### Why this is recursive, and why that is the whole trick

The core resolves `tv.kroma.torrents/client` by matching a string against
installed manifests and answering with endpoints. It does not know that
the string means torrents, or downloads, or anything. So a module defining a
point is not a special case of the core defining one: **it is the only case, and
the core is just a module that happens to ship in the binary.**

The old model could not do this. `DownloadClientHost::register_engine` took a
`fn(&mut DownloadClientRegistry)`, so an engine plugged a factory into the
manager's process by function pointer. That requires one address space, which is
why qBittorrent and Transmission do not work as sidecars today. Inverting it
fixes the break and removes the registry: an engine serves the methods, and the
manager calls whichever endpoints resolution hands it.

### How many answers a point has

A point that takes one answer is contributed without an `id`; one that takes
several has an `id` per contribution, and that is the whole declaration — there
is no separate cardinality field to keep in step with it. A consumer either takes
what resolution hands it or names the instance it wants:

- **All of them.** Acquisition searches every indexer the
  `tv.kroma.indexer/search` contribution reports and merges.
- **The one the operator picked.** A download goes to the client chosen in
  settings, keyed by point name. That choice is the operator's, so it lives in a
  core setting and never in a consumer's code.

Resolution therefore returns a list, always. `Supervisor::port_endpoint`
returning the first manifest that matched was silently wrong the moment two
modules answered the same name, which is already true of
`tv.kroma.torrents/client` (three answers) and `tv.kroma.indexer/engine` (two).

### Versions

A point declares a major. A contribution declares the major it was built
against. The supervisor finds the definer from the point's own name and skips a
contribution that answers another major, saying so on that module's own log
rather than failing a request an hour later. Within a major, evolution is additive only:
a new field must default, because the two ends were built at different times from
different sources and the operator installed whichever pair they installed.

## The rule that keeps the core ignorant

The core does define a few points, because a host with no hooks cannot be
extended in any way that touches it. The test for whether a hook belongs to the
core is one question:

> Can you name it without naming a module or a vendor?

`tmdb_api_key` fails badly. `whisper` fails: it is a model's name, so only one
implementation could ever answer it. `embedder` and `transcriber` pass — the
search pipeline genuinely needs embeddings and the subtitle service genuinely
needs transcription, and neither word names who provides it. `pipeline-stage`
passes. `metadata-provider` passes. `search-ranker` passes.

An earlier draft of this rule failed `embedder` and `transcriber` too, on the
grounds that they exist because a vector module and a whisper module exist. That
was too strong, and worth recording as a correction rather than quietly fixing:
the core's outbound calls are allowed to name a CAPABILITY it needs. What they may
not name is a vendor, a model or a module. By that reading `Whisper` was the only
real offender, and `HostCtx::tmdb_api_key()` is now `secret(name)`.

### The core names them, and declares nothing

Naming a capability is as far as it goes: there is no trait a module implements.
`kroma-engine/src/ports.rs` used to hold `Embedder` and `Transcriber` — two
traits, in the core, describing what a module does — and it is gone. What the
engine has instead is one generic type:

```rust
// kroma-engine/src/point.rs
pub struct Point { /* a name, and how it resolves */ }
impl Point {
    pub fn call<B: Serialize, T: DeserializeOwned>(&self, method: &str, body: &B) -> Option<T>;
}
```

`state.embedder` is a `Point`, and `services/embeddings.rs` is how the core's own
search uses it: four free functions over JSON, which nothing outside the crate
implements. Subtitle generation takes the transcription step as a closure the
composition root supplies, so the engine holds no type for who transcribes. A
module answering either point implements nothing this repo declares.

`None` is the whole absence story: no module, an unreachable one, or an answer
this build cannot read all read the same to the caller, and the feature degrades —
no recommendations, or a generation that fails with a reason. `NoopEmbedder`, the
in-process stand-in that used to exist for this, is gone with the trait.

So the core's hook set is small, closed, about the core's own concerns, and
type-free. Everything else is a point some module defined, and the core has no
opinion about any of it.

## The wire

```
POST http://127.0.0.1:<port>/_port/<point>/<method>
Authorization: Bearer <per-process host token>
{ ...request json... }
->  { "Ok": ...json... } | { "Err": "message" }
```

Each side declares its own structs for the JSON it reads or writes. There is no
shared type, and that is deliberate: the two ends ship on separate tags at
separate versions and the operator installs them independently, so a shared Rust
type proves the ends agreed *at build time in this repo* and says nothing about
the pair actually running. The old contract crates admitted it in their own doc
comments while carrying 4000 lines of hand-written client, trait and route
boilerplate over `call()` and `contributions()`, which are ten lines and already
generic.

The path carries the point's FULL name, which is the same string the caller
resolved with (`call_point` builds it), so nothing has to hold a point name and
an unrelated URL prefix and keep the two in step.

What holds the wire together instead:

- Unknown fields are ignored, missing fields default. Tolerance is the contract.
- Each side pins the JSON it sends or expects in a test, so a rename fails
  locally rather than in someone's install.
- A point's method list lives in the definer's manifest, so the store can warn
  when a consumer wants a method the installed provider does not serve.

One consequence worth stating: with JSON on the wire and no crate to link, a
module does not have to be Rust. It has to read the runtime env, speak
`/api/_host/*`, and serve `/_port/*`. That was theoretically true before and
practically false.

## Points are not libraries

Shared *computation* is not an extension point and must not become one. The
release-name parser scores every release of every search; a localhost round trip
per release is slower than the code it replaced. Same for the naming engine.

The rule: **a point method is a coarse operation. If you would call it in a
loop, it is a library.** A library is an ordinary versioned crate that its
consumers link, exactly like serde, and it has no manifest, no point and no
endpoint. `kroma-scene` and the naming engine are libraries. They were listed
under `ports/` and should not have been.

## What the host offers a module

Shipped and generic: settings read/write, its own SQLite file plus a declared and
authorizer-enforced slice of the core database, event publish, notifications,
session lookup and permission checks, i18n with the module's own catalogue first,
admin routes reverse-proxied under `/api/module/<id>/*`, a frontend remote.

Four gaps stand between that and "a module can do whatever we want":

- **A module cannot define a permission.** `Permission` is a closed enum whose
  `parse` DROPS an unrecognised stored string, so opening it would turn every
  value previously dropped from a user's row into a live permission on existing
  data. That is an auth change on stored records, not a refactor, and it is the
  one gap here still worth a deliberate decision. `manifest.permissions` used to
  advertise it: no module ever populated the field and nothing read it, so it is
  removed rather than left lying.
- **`tmdb_api_key()` named a vendor** in a general contract. Closed: `HostCtx`
  now has `secret(name)`, the callback API answers `/_host/secret?name=` and
  `/_host/metadata-language`, and the core's three callers ask for `"tmdb"`. The
  contract no longer grows a method per provider, and a host that does not know a
  name answers `None` rather than a different secret.

Two of the four gaps this list used to name were wrong, and checking them is what
found it. **Jobs already work**: the runtime registers a module's `jobs()` with
the core scheduler over `/api/_host/register-job`, and the core fires them by
POSTing `/_job/run/{key}`, so they appear in the admin job list like an in-core
one. And **events are two-way now** — see below.

## Extending a module's frontend

The backend recursion above has no frontend half yet. A module ships a Module
Federation remote and can add routes and admin pages, but it cannot declare a
slot another module fills, so qBittorrent's settings panel cannot appear inside
the download manager's page without the download manager importing it.

The shape that matches the backend: a frontend point is a named slot, declared by
the module that renders it, filled by `contributes` entries whose remote exports
a component. The registry already resolves remotes by module id; what is missing
is the slot name and the lookup. Not built.

## Trust, stated honestly

A module is a native process running as the same user. The storage grant is a
privilege *declaration*, enforced per connection by SQLite's authorizer, and it
is real for anything going through the SDK. It is not a sandbox: the process
could open the file itself. What the model buys is that reach is declared where
an operator reads it before installing, and that the official registry is pinned
and every artifact sha256-verified. For a third-party registry, that is the whole
of the protection, and the consent screen should say so in those words.

## Not solved here

**Cross-module workflows have no transaction.** Acquisition grabs, torrents
records, the import runs. Three processes, no rollback. Today this is implicit;
it needs idempotency keys on the grab and a reconciliation job, or an explicit
statement that the ledger is eventually consistent and how it heals.

**Startup order.** A consumer already has to handle "nothing answers this point"
on every call, which is the right shape. Telling the OPERATOR is done: both module
list endpoints report `unmet`, the points a module consumes that no enabled module
answers, and the admin row draws an "Inert" chip naming them. Before that,
disabling the last download engine left acquisition running, answering nothing,
and reporting itself healthy.

## What changed, and what has not

Phases 1 through 5 have landed. Each was green on `cargo clippy --workspace`,
`cargo test --workspace`, `bun run modules:clippy` and `bun run modules:test`.

1. **Resolution, done.** `HostCtx::contributions(point) -> Vec<Contribution>`
   replaced `port_endpoint`, which answered with the FIRST manifest that matched
   and was therefore wrong the moment two modules answered one name. A
   contribution carries the instance it registered under, so a consumer can fan
   out over every indexer or pick the download client the operator chose.
   `point_resolver` re-resolves per call; `/api/_host/contributions` is the
   callback.
2. **The contract layer, deleted.** `kroma-module-sdk/src/ports/` is gone: 4000
   lines of trait, client, route builder and resolver, inside the core workspace,
   describing what six modules were for. Each module declares the structs it
   reads, calls a peer by point name, and serves its own `/_port/<point>/<method>`
   routes. The naming engine and the release parser became libraries under
   `modules/lib/`, because a function called once per imported file or once per
   scored release is not an extension point.
3. **The core stops naming modules.** `server/Cargo.toml` deps no crate under
   `modules/`. `api/requests/acquisition.rs` forwards opaque JSON to whatever
   answers `acquisition`; `boot/embedder.rs` and `boot/transcriber.rs` resolve by
   point name. `kroma-whisper` and `kroma-vector` left the binary
   along with `semantic-embeddings` and the four `whisper-*` features, which had
   been compiling candle into the server for code no file under `src/` reaches.
4. **The engines inverted, and the recursion is real.** The download module
   defines `tv.kroma.torrents/client` and answers it in-process for the embedded
   librqbit engine. qBittorrent and Transmission are their own sidecars answering
   the same point under their own kind, each with its own binary, its own routes
   and its own structs; the download module deps neither, and resolves whichever answers
   the kind a client row names.

   This one fixed a bug rather than only a shape. `register_engine` took a
   `fn(&mut DownloadClientRegistry)` and `DownloadClientCtx` carried the embedded
   handle as an `Arc<dyn Any>`, so an engine had to share the download module's
   address space, and both `.kmod`s shipped with NO binary at all: the supervisor
   could never have spawned them. They were installable in name only. Inverting it
   deleted the registry, the ctx and the host trait, and now `bun run modules plan`
   emits a binary for each.

   The engine is stateless about which client it serves: an operator may have two
   qBittorrents, so the row's URL and credentials travel with every call rather
   than being held by the sidecar. `RemoteEngine` pins its endpoint for the one
   call it is built for, because the monitor builds one per active download every
   five seconds and re-resolving per method would double the callbacks to learn the
   same answer twice.

Three things the deletion bought that were not the point but are worth naming.
An indexer's `api_key`, base URL and settings JSON stopped crossing a process
boundary to consumers that read none of them. Eight fields of engine bookkeeping
stopped crossing to the import pass. And the first consumer-side wire test failed
immediately, because a struct was not `#[serde(default)]` and a leaner provider
payload would have broken every external search: a shared type had been hiding
that, since the two modules release on separate tags.

5. **Events are two-way.** A module declares topics on its `ServerModule` and
   handles them in `on_event`; the runtime registers them at boot and serves
   `/_event/{topic}`, and the core reads its own bus, matches each event's `type`
   against what modules asked for, and POSTs it to each subscriber. Before this a
   module could publish onto the bus and never hear it, so it could be called BY
   another module but never react to one.

   Push rather than a stream a module holds open, for the same reason jobs are
   push: the supervisor already knows every module's port, a restarted module
   needs no reconnection, and there is no connection to leak. The costs are
   stated where an author will read them — opt in per topic because the bus
   carries playback progress, delivery is best-effort so anything that must not
   be missed belongs in a job, and an event addressed to one user is not
   delivered to a module because a module is not a user.

   The core still learns nothing about what a topic means. It matches a string it
   was handed against a string a module asked for.

Two things an engine sidecar does not do yet, both because no engine reads them:
`only_files` (file selection is the embedded engine's) and a pre-fetched
`torrent_bytes` (an external client takes a URL). Adding either is a new key,
which is additive; `list_files` answers "unsupported" without a round trip,
because no external client exposes a list-only add.

6. **The manifest says it once.** `definesPoints` / `contributes` / `consumes`
   replaced `provides` / `ports` / `requires` across the Rust manifest,
   `packages/registry`'s zod schema, the admin UI and twelve `module.json` files.
   Every point a module defines is namespaced by its id, so resolution reads one
   declaration and a major mismatch is caught against the definer's own number.

   The schema stays at **2**. Nothing is deployed, so there is no bundle in the
   wild spelling these fields the old way, and a version whose only purpose is to
   describe a state that never shipped is a version to maintain for nothing. What
   guards an old server reading a new bundle is `engines.server`: every module
   floors at `>=0.1.39`, and the twelve move to 0.3.0 together with their
   dependency ranges, because the point names changed and a 0.2.x peer resolves
   nothing.

   The indexer's Torznab point went with it. `torznab` was a protocol name at the
   top level; it is now a contribution to `tv.kroma.indexer/engine` under the kind
   an indexer row stores, so a module answering a protocol nobody here has heard
   of is reached with nothing changed on the indexer's side. A `prowlarr` row pins
   that.

7. **The core's two traits are gone.** `kroma-engine/src/ports.rs` declared
   `Embedder` and `Transcriber`; the engine now holds a generic `Point` and calls
   JSON on it (see [the rule](#the-core-names-them-and-declares-nothing) above).
   A module answering `embedder` or `transcriber` implements nothing declared
   here, which is what makes a capability nobody has thought of — a video encoder,
   say — no different from these two: a point name, a payload, and no core edit.

What has NOT landed:

8. **Module-declared permissions** (see above — it needs a decision about stored
   auth data, not a refactor) and **frontend slots** are untouched. The point graph
   in Admin has since landed.

## How we know it worked

A module type nobody here has thought of ships without a core release, and a
module can be extended by one that did not exist when it shipped. The second half
is now true out of process: a `.kmod` contributing `tv.kroma.torrents/client`
under a new id is picked up by the download module at runtime, and neither the
core nor the download module is edited to accept it.

Mechanically, today: `server/Cargo.toml` deps no crate under `modules/`; no crate
under `server/` names a module's domain in a type, trait or function; the three
point names the core holds — `acquisition`, `transcriber`, `embedder` — are bare
capability names in its own route table and composition root. The remaining
`tv.kroma.*` and point-name hits under `server/` are test fixtures and prose.
