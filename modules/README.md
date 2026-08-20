# Modules

KROMA's core is playback + catalog. Everything else (downloads, indexers,
acquisition, VPN, transcription, embeddings, discovery, remote access) is a
module: a separate program with a reverse-DNS id (`tv.kroma.torrents`) that
the server installs, spawns and reverse-proxies.

Modules are NOT compiled into the server. `roster.yaml` is empty on purpose:
this is the zero-module base build. A module reaches users as a `.kmod` bundle
installed from Admin → Modules, either from a registry or by upload.

## Layout

Every module is one directory here, and it is its own cargo workspace: it
builds standalone, with its own `Cargo.lock`, outside the server tree:

```
modules/<id>/
  module.json      manifest: id, version, engines, dependencies, points, config
  server/          the Rust backend: a [[bin]] makes it a spawned sidecar
  ui/              the React frontend (a KromaModule: pages, nav, settings)
  locales/         en.json, fr.json, this module's own catalog
  icon.svg
  README.md
```

`modules/<name>.module.md` single-file sources live here too, alongside the
directories they expand into.

## Build one

Each command works from the module's own directory, because nothing above it is
consulted:

```bash
cd modules/tv.kroma.remote/server
cargo build            # or check / test / clippy, a normal standalone crate
```

To produce the installable bundle, from the repo root:

```bash
bun run modules:pack modules/tv.kroma.remote   # -> dist/modules/<id>.kmod (+ .sha256)
bun run modules:pack                           # every module
```

`modules:pack` compiles the `[[bin]]` with the `release-kmod` profile (release +
`panic = "abort"`: a sidecar aborts and the supervisor respawns it, which drops
the unwinding tables for ~11% smaller binaries), builds the `ui/` remote if there
is one, and packs `module.json` + the `module` binary + the icon + `fe/` into a
zstd tarball.

Every module workspace shares one build directory (`target/kmod`), so the
dependency graph they have in common (axum, tokio, candle, librqbit) compiles
once rather than once per module. Cargo holds an exclusive lock on it, so module
builds run in sequence.

A `.kmod` carries a native binary, so it must match the server's platform.
Cross-compile with `KMOD_TARGET`, which also suffixes the bundle with the triple:

```bash
KMOD_TARGET=x86_64-unknown-linux-musl bun run modules:pack
```

Declare cargo features the bundle needs in the manifest, not on the command
line, because `modules:pack` reads them:

```toml
[package.metadata.kmod]
features = ["rqbit"]
```

A module with no `[[bin]]` is a *library module*: manifest + frontend only,
no spawned process. Its Rust code is co-linked into whatever uses it
(`tv.kroma.scene`, the release-name parser, is one).

## Write one

Two shapes. Start with the first.

### Single-file (codegen)

One file holds the manifest and every part of the module:

```bash
bun run modules:new tv.kroma.notes     # scaffolds modules/notes.module.md
bun run modules:gen                    # expands it into modules/tv.kroma.notes/
```

The file is YAML frontmatter (the manifest) plus fenced blocks: ` ```tsx ` the
page (required), ` ```rust ` extra backend items, ` ```sql ` migrations,
` ```svg ` the icon, ` ```locale.en `/` ```locale.fr ` the catalogs. The registry
entry `pub const MODULE` is generated: do not write one.

**Generated output is committed.** Re-run `modules:gen` after editing the source
and commit the result; never hand-edit a generated file. `modules:check` fails on
drift.

### Hand-written crate

For a substantial backend. Use `modules/tv.kroma.torrents/` as the template. The
crate exports one `pub const MODULE`, which the macro fills in from the manifest
and icon at compile time:

```rust
use kroma_module_sdk::EmbeddedModule;
pub const MODULE: EmbeddedModule = kroma_module_sdk::embedded_module!();
```

A sidecar's whole `main()` is one `serve` call: the runtime builds the
out-of-process host, applies the module's migrations to its own database, runs
`on_enable` and serves the module's admin routes on the port the supervisor
assigned. The closure is handed the live host and returns whatever extra routes
the module serves:

```rust
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    kroma_module_runtime::serve_one(
        |host| host.register_service(kroma_remote::RemoteAccess::new(host.data_dir().into())),
        kroma_remote::server_module::<RemoteHost>(),
    )
    .await
}
```

Depend on **`kroma-module-sdk`** and, for a sidecar, **`kroma-module-runtime`**,
never on core crates directly. The SDK re-exports the surface a module is allowed
to touch. In this repo they are path deps back into `server/crates/`.

What the SDK does NOT carry is any description of what a module is for. To reach
a peer, ask the host for a POINT name and speak JSON both sides declare
themselves; see [Calling another module](#calling-another-module).

Shared *computation* is different, and lives in `modules/lib/`: the naming engine
(`kroma-naming`) and the release parser (`kroma-scene`). Those are ordinary crates
their consumers link, because a function called once per imported file or once per
scored release cannot be a localhost round trip.

### Calling another module

A module never names a peer. It asks the host which modules answer a point, and
POSTs JSON:

```rust
// The consumer. The point is a NAME; which module answers is the supervisor's
// business, and changes as modules are installed. `Some(kind)` picks one
// contribution when several are live at once.
const ENGINE: &str = "tv.kroma.indexer/engine";

let resolve = pinned_resolver(host, ENGINE, Some(kind))
    .ok_or_else(|| anyhow!("no module answers {ENGINE} as {kind}"))?;
let releases: Vec<Release> = call(&resolve, &format!("{ENGINE}/search"), &body)?;
```

```rust
// The contributor, in its own crate, with its own structs. The route path is
// `/_port/<point>/<method>`, the point's full name included, which is the same
// string the consumer resolved with.
pub fn routes<S: Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new().route("/_port/tv.kroma.indexer/engine/search", post(search))
}
```

Three manifest verbs, and any module may use all three:

- **`definesPoints: [{ name, version?, methods? }]`** invents a point. `name` is
  local: the full name is `<this module's id>/<name>`, so ownership reads off the
  name and two authors cannot collide. The handful the CORE calls (`acquisition`,
  `transcriber`, `embedder`) are bare, and nothing but the core may define one.
- **`contributes: [{ point, version?, id?, label?, fields?, flow? }]`** answers a
  point, its own included. `id` is the instance name, for a point several modules
  answer at once — a download client is picked by it — and absent for a point that
  takes one answer. `label` / `fields` / `flow` drive the admin's add-form, so an
  engine the console can add an instance of declares them here and nowhere else.
- **`consumes: [{ point, version?, id?, optional? }]`** calls a point. It names
  what has to answer, never which module answers it, which is what a marketplace
  can resolve; an unmet non-optional entry is what makes the admin call a running
  module INERT.

Two rules make this hold together across independently released modules:

- **Each side owns its structs.** Declare the fields YOU read or write, not a
  shared type. The two ends ship on separate tags and the operator installs
  whichever pair they installed, so a shared type would prove they agreed at build
  time in this repo and nothing about the pair actually running.
- **Be tolerant, and pin the JSON.** `#[serde(default)]` on anything crossing,
  unknown fields ignored, and a test on each side asserting the exact JSON it
  sends or expects. That test is the contract; without it a rename fails in
  someone's install rather than in CI.

### Reacting to what happens

A module can also be woken by the bus instead of only being called. Declare the
topics on the `ServerModule` and handle them:

```rust
fn events(&self) -> Vec<&'static str> {
    vec!["item.added"]
}

async fn on_event(&self, host: S, topic: String, payload: serde_json::Value) {
    // `payload` is the whole event, `type` included, so a module that took
    // several topics dispatches on it.
}
```

The runtime registers them at boot and serves `/_event/{topic}`; the core reads
its bus and POSTs each matching event to every subscriber. Three things to know:

- **Opt in one topic at a time.** The bus carries high-rate traffic (playback
  progress) and each delivery is an HTTP call to the module's process.
- **Delivery is best-effort and unordered.** A module that was restarting missed
  what fired. Anything that must not be missed belongs in a job that reconciles
  state, not in a handler.
- **Addressed events are not delivered.** An event published to one user is that
  user's business; a module is not a user.

The design and the parts of it that are not built yet are in
[`docs/module-plugin-model.md`](../docs/module-plugin-model.md).

### Frontend

`defineModule` takes id / version / dependsOn from the manifest, so they are
never restated. Each page is a `path` + `component`; the nav URL is derived
from `section` + `path`, so a route and its link cannot drift:

```ts
export const torrentsModule = defineModule(manifest, {
  locales: import.meta.glob('../../locales/*.json', { eager: true, import: 'default' }),
  pages: [
    {
      path: 'downloads', // -> /admin/downloads
      component: lazy(() => import('./DownloadsPage')),
      nav: { label: 'nav.title', icon: 'download', section: 'acquisition', requires: 'library.manage' },
    },
  ],
});
```

`section` picks the nav group: an admin group (`management | media | acquisition
| system | maintenance`, or `admin` for the generic one) or `library` for the
main sidebar. `icon` is a name from `clients/web/src/modules/module-icons.ts`;
`requires` gates the link by capability.

Every user-visible string is a key. Ship `locales/{en,fr}.json`; they resolve
against the module's own catalog first, then the core ones.

## Runtime contract

The supervisor scans `<data>/modules/*`, spawns each enabled module as its own
process on a free localhost port, and reverse-proxies `/api/module/<id>/*` to it.
A module calls back into the core over the token-authed `/api/_host/*` API for
settings, events, jobs and session lookup (`AuthUser` resolves through the
host, so authenticating a caller costs no database).

- **`dependencies`** is a hard dependency, as a `{ "<id>": "<range>" }` map.
  Enforced on the backend; the Store installs missing ones automatically.
- **`optionalDependencies`** is ordered first when present, not required.
- **`consumes`** is a POINT dependency, satisfied by any module whose
  `contributes` answers it. Prefer it to a module id: it says what has to happen
  rather than who has to do it.
- **`engines`** is what the module needs from its host (`{ "server": ">=0.1.4" }`),
  enforced at install **and** at spawn, so a stale bundle fails with a clear
  message instead of proxy errors.

## Storage

**A module has no database unless it declares one.** That is what `storage` in
`module.json` is, and leaving it out is the normal case: eight of the twelve
first-party modules never open a database, and a sidecar that declares none does
not link SQLite at all, which is half of what its binary used to be.

```jsonc
"storage": {
  // The slice of the SHARED core database this module may reach. Anything not
  // listed is denied by SQLite's own authorizer, at prepare time.
  "core": { "read": ["requests", "users.username"], "write": ["wanted"] },
  // Tables this module used to keep in the core database and now owns. Moved
  // into its own file, once, before it is next spawned.
  "adopt": ["indexers"]
}
```

Declaring it is half the job: the crate enables the matching SDK feature, or it
compiles without the API.

```toml
kroma-module-sdk = { path = "...", features = ["storage"] }
kroma-module-runtime = { path = "...", features = ["storage"] }
```

The capability gives a module TWO databases, and they are not
interchangeable:

- `host.store()` is the module's own file, `<data>/modules/<id>/module.sqlite`.
  It owns it outright, `migrations()` are applied there, and nothing else reads
  it. This is where a table only that module uses belongs, especially one
  holding credentials.
- `host.db()` is the shared core database, and every statement prepared on it
  passes an authorizer built from the `core` grant above. A module that declared
  no grant still gets the pool; it just answers nothing, and says which table it
  refused.

Two rules about a grant come from SQLite rather than from us, and both have bitten:
a column named in a `WHERE` is reached as much as one that is projected, and a
foreign key drags its other table in, so writing a child row reads the parent
and a cascading delete writes the child.

A `write` entry scoped to a column (`"write": ["users.language"]`) authorises
UPDATE of that column and nothing else. INSERT and DELETE act on a whole row, so
they need the whole table (`"write": ["users"]`) and are refused otherwise. A
module that inserts or deletes under a column-scoped grant must widen it.

A table the core itself reads (`downloads`, for the progress overlay) or that is
a channel between the core and the module (`whisper_jobs`) is shared by
definition: it lives in the core schema, and the module holds a grant on it. A
module cannot create a table in the core database, which is the same statement
said in enforcement.

Points are unaffected, and the reason is worth stating: a consumer holds no
capability just because a provider does. A provider reads its OWN database and
answers with what the caller needs, which is why an indexer's `api_key` and a
download's engine bookkeeping do not cross. Name a row by id and let the provider
read it.

## Publish one

`bun run modules:pack` output is directly installable: upload the `.kmod` in
Admin → Modules.

To try the packed bundles as a registry before publishing anything:

```bash
bun run modules serve                      # dist/modules, on :4173
bun run modules serve --from ./bundles --port 8080
```

It serves the RFC 110 documents live off the directory, re-read per request, with
artifact URLs taken from the origin each request arrived at, so the same tree is
right on localhost, on a LAN address and behind a tunnel. Add
`http://localhost:4173` under Admin → Modules → Registries to browse it.

To actually install a local build, upload it rather than pointing a server at
that registry. A server refuses an artifact URL that is not https, which a local
registry never is:

```bash
KROMA_TOKEN=<a token with settings.manage> \
  bun run modules install tv.kroma.vpn            # -> http://localhost:4040
bun run modules install tv.kroma.vpn --server http://192.168.1.20:4040
```

It picks this machine's build out of `dist/modules` when a module was packed for
several targets, and the server applies the same gates the Store does. A bundle
built against an older manifest schema is refused with what to do about it.

To serve modules to others, host them: `bun run modules registry` writes the same
documents to disk (plus the schemas and a `modules.json` mirror), which any
static host can serve. See
[`docs/module-registries.md`](../docs/module-registries.md).

### Releasing this repo's modules

**Bump `version` in `module.json` in the same commit as the change.** Modules
release on their own tags (`<module-id>@<version>`) from
`.github/workflows/modules.yml`, and it refuses a module whose bundle changed
while its version stood still. The Store decides "update available" by comparing
versions, so a silent republish reaches nobody. `bun run modules release
--dry-run --repo <owner/repo>` gives the same verdict locally, against whatever
`dist/modules` currently holds. Full shape in
[`docs/modules-as-kmod.md`](../docs/modules-as-kmod.md#the-release-train).

## Checks

```bash
bun run modules:validate   # every manifest against the @kroma/registry schema
bun run modules:gen        # expand single-file sources + regenerate aggregators
bun run modules:check      # CI gate: valid + generated output in sync
```

`id` must be reverse-DNS (`^[a-z0-9]+(\.[a-z0-9-]+)+$`) and unique; `version`
must be semver. Both are checked before anything is generated.
