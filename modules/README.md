# Modules

KROMA's core is playback + catalog. Everything else (downloads, indexers,
acquisition, VPN, transcription, embeddings, discovery, remote access) is a
module: a separate program with a reverse-DNS id (`tv.kroma.torrents`) that
the server installs, spawns and reverse-proxies.

Modules are NOT compiled into the server: the base build carries none, and a
module reaches users as a `.kmod` bundle installed from Admin → Modules, either
from a registry or by upload. A module is written the same way inside this
repository (under `modules/`) and outside it (`bunx @kromatv/sdk create`, against the
public `kroma` package).

## Layout

Every module is one directory here, and its own cargo workspace: it builds
standalone, with its own `Cargo.lock`, outside the server tree:

```
modules/<id>/
  module.json      manifest: id, version, engines, dependencies, points, config
  server/          the Rust backend: a [[bin]] makes it a spawned sidecar
  ui/src/module.ts optional React frontend (a KromaModule: pages, nav, slots)
  locales/         optional en.json, fr.json, this module's own catalog
  package.json     with a frontend: its dependencies (@kroma/module-sdk, @kroma/ui)
  icon.svg
  README.md
```

`ui/`, `locales/` and `package.json` are optional and travel together: 5 of
the 12 first-party modules have a frontend.

## Build one

Every module chore is one `kroma` command (`packages/cli`). Inside this
repository it is `bun run kroma <command>`; a module of your own gets it with
the `kroma` package it depends on, as `bunx kroma <command>`.

```bash
bun run kroma build modules/tv.kroma.remote   # -> dist/modules/<id>.kmod (+ .sha256)
bun run kroma build                           # every module under modules/
bun run kroma check                           # manifests, frontend types, clippy
cd modules/tv.kroma.remote/server && cargo build   # a normal standalone crate
```

`kroma build` compiles the `[[bin]]` with the `release-kmod` profile (release +
`panic = "abort"`: a sidecar aborts and the supervisor respawns it, which drops
the unwinding tables for ~11% smaller binaries), builds the `ui/` into `fe/`
(see [Frontend](#frontend)), and packs `module.json` + the `module` binary + the
icon + `fe/` into a zstd tarball.

Every module workspace shares one build directory (`target/kmod`), so the
dependency graph they have in common (axum, tokio, candle, librqbit) compiles
once rather than once per module. Cargo holds an exclusive lock on it, so module
builds run in sequence.

A `.kmod` carries a native binary, so it must match the server's platform.
Cross-compile with `--target`, which also suffixes the bundle with the triple:

```bash
bun run kroma build --target x86_64-unknown-linux-musl
```

Declare cargo features the bundle needs in the manifest, not on the command
line, because `kroma build` reads them:

```toml
[package.metadata.kmod]
features = ["rqbit"]
```

A module with no `[[bin]]` is a *library module*: manifest + frontend only, no
spawned process. Whatever uses it links its Rust code (`tv.kroma.scene`, the
release-name parser, is one).

### Iterating against a server

```bash
bun run kroma login http://localhost:4040     # once; an account with settings.manage
cd modules/tv.kroma.remote && bunx kroma dev  # build, install, rebuild on every save
```

`kroma dev` uploads a debug build to the server and re-uploads whichever half
changed on every save: the server stops the old process, keeps the module's
database, and spawns the new one. The server can be this machine or the NAS
(`--server http://kroma.local:4040`, with `--target` for its platform).
`kroma install` uploads a `kroma build` bundle the same way.

## Write one

```bash
bun run kroma create tv.kroma.notes          # a few questions; lands in modules/
```

The scaffold is the layout above: a manifest, a page, a sidecar crate with one
admin route, both locales, and the `package.json` that links the SDK. Outside
this repository `bunx @kromatv/sdk create` produces the same project against the one
public package, `kroma`, declarations only (`docs/module-sdk-publishing.md`). Use
`modules/tv.kroma.remote/` as the reference for a real one.

The crate exports one `pub const MODULE`, which the macro fills in from the
manifest and icon at compile time:

```rust
use kroma_module_sdk::EmbeddedModule;
pub const MODULE: EmbeddedModule = kroma_module_sdk::embedded_module!();
```

A sidecar's whole `main()` is one `serve_one` call: the runtime builds the
out-of-process host, applies the module's migrations to its own database, runs
`on_enable` and serves the module's admin routes on the port the supervisor
assigned. The closure takes the live host and wires the process's own services
into it:

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

Reach past `serve_one` to `serve` when one process hosts several modules, or
serves routes of its own: its closure returns an `axum::Router` that is mounted
beside every module's `admin_routes`.

Depend on **`kroma-module-sdk`** and, for a sidecar, **`kroma-module-runtime`**,
never on core crates directly. The SDK re-exports everything a module is allowed
to touch, its `testing` feature included (`host::testing::StubHost`,
`testing::serve`, `db::testing::temp_pool`, `testing::temp_dir`). In this repo
they are path deps back into `server/crates/`; outside it they are the same
crates under `node_modules/@kromatv/sdk/rust`, built into the public package.

What the SDK does NOT carry is any description of what a module is for. To reach
a peer, ask the host for a POINT name and speak JSON both sides declare
themselves. See [Calling another module](#calling-another-module).

Shared *computation* is different. `modules/lib/naming` holds the naming engine
`kroma-naming`, and the release parser `kroma-scene` is the library module
`tv.kroma.scene`. Both are ordinary crates their consumers link, because a
function called once per imported file or once per scored release cannot be a
localhost round trip.

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
  point, its own included. `id` is the instance name for a point several modules
  answer at once, the way a download client is picked, and absent for a point
  that takes one answer. `label` / `fields` / `flow` drive the admin's add-form,
  so an engine the console can add an instance of declares them here and nowhere
  else.
- **`consumes: [{ point, version?, id?, optional? }]`** calls a point. It names
  what has to answer, never which module answers it, which is what a marketplace
  can resolve. An unmet non-optional entry makes the admin call a running module
  INERT.

Two rules make this hold together across independently released modules:

- **Each side owns its structs.** Declare the fields YOU read or write, not a
  shared type. The two ends ship on separate tags and the operator installs
  whichever pair they installed, so a shared type would prove they agreed at
  build time in this repo and nothing about the pair that is running.
- **Be tolerant, and pin the JSON.** `#[serde(default)]` on anything crossing,
  unknown fields ignored, and a test on each side asserting the exact JSON it
  sends or expects. That test is the contract. Without it a rename fails in
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

The runtime registers them at boot and serves `/_event/{topic}`. The core reads
its bus and POSTs each matching event to every subscriber. Three things to know:

- **Opt in one topic at a time.** The bus carries high-rate traffic (playback
  progress) and each delivery is an HTTP call to the module's process.
- **Delivery is best-effort and unordered.** A module that was restarting missed
  what fired. Anything that must not be missed belongs in a job that reconciles
  state, not in a handler.
- **Addressed events are not delivered.** An event published to one user is that
  user's business, and a module is not a user.

The design, and the parts of it not built yet, are in
[`docs/module-plugin-model.md`](../docs/module-plugin-model.md).

### Frontend

`ui/src/module.ts` default-exports the module. `defineModule` takes id / version /
dependencies from `module.json` (the build injects them, with `locales/*.json`),
so they are never restated. Each page is a `path` + `component`; the nav URL is
derived from `section` + `path`, so a route and its link cannot drift:

```ts
const torrentsModule = defineModule({
  pages: [
    {
      path: 'downloads', // -> /admin/downloads
      component: lazy(() => import('./DownloadsPage')),
      nav: { label: 'nav.title', icon: 'download', section: 'acquisition', requires: 'library.manage' },
    },
  ],
});

export default torrentsModule;
```

`section` picks the nav group: an admin group (`management | media | acquisition
| system | maintenance`, or `admin` for the generic one) or `library` for the
main sidebar. `icon` is a name from `clients/web/src/modules/module-icons.ts`;
`requires` gates the link by capability.

`kroma build` bundles the frontend into `fe/` and `module.json` declares it with
`"feRemote": { "module": "./remoteEntry.js" }`. The web client fetches
`/modules/<id>/remoteEntry.js` for every enabled module at boot. The bundle
carries none of `react`, `@kroma/ui`, `@kroma/module-sdk`, `@kroma/core`,
`@kroma/client`, `@tanstack/react-query` or `react-call`: it reads them from
the host at load time (`SHARED_MODULES` in `@kroma/module-sdk`), so one React,
one design system and one query cache live on the page and a module's `<Text>`
renders inside the host's theme. Outside this repository those packages are
declarations only, and a `@kroma/*` import the host does not provide fails the
build. Anything else a page imports (`zod`, an icon set) is bundled. Import
components from `@kroma/ui/kit`; a deeper kit path is folded onto it.

Every user-visible string is a key. Ship `locales/{en,fr}.json`; they resolve
against the module's own catalog first, then the core ones.

## Runtime contract

The supervisor scans `<data>/modules/*`, spawns each enabled module as its own
process on a free localhost port, and reverse-proxies `/api/module/<id>/*` to it.
A module calls back into the core over the token-authed `/api/_host/*` API for
settings, events, jobs and session lookup (`AuthUser` resolves through the
host, so authenticating a caller costs no database).

- **`dependencies`** is a hard dependency, as a `{ "<id>": "<range>" }` map.
  The backend enforces it, and the Store installs missing ones automatically.
- **`optionalDependencies`** is ordered first when present, not required.
- **`consumes`** is a POINT dependency, satisfied by any module whose
  `contributes` answers it. Prefer it to a module id: it says what has to happen
  rather than who has to do it.
- **`engines`** is what the module needs from its host (`{ "server": ">=0.1.4" }`),
  enforced at install **and** at spawn, so a stale bundle fails with a clear
  message instead of proxy errors.

## Storage

**A module has no database unless it declares one.** `storage` in `module.json`
is that declaration, and leaving it out is the normal case: eight of the twelve
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

The capability gives a module TWO databases, and they are not interchangeable:

- `host.store()` is the module's own file, `<data>/modules/<id>/module.sqlite`.
  It owns it outright, `migrations()` are applied there, and nothing else reads
  it. This is where a table only that module uses belongs, especially one
  holding credentials.
- `host.db()` is the shared core database, and every statement prepared on it
  passes an authorizer built from the `core` grant above. A module that declared
  no grant still gets the pool. It answers nothing, and says which table it
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

Points are unaffected: a consumer holds no capability just because a provider
does. A provider reads its OWN database and answers with what the caller needs,
which is why an indexer's `api_key` and a download's engine bookkeeping do not
cross. Name a row by id and let the provider read it.

## Publish one

`kroma build` output installs as it is: `kroma install` uploads it, or upload
the `.kmod` in Admin → Modules.

To try the packed bundles as a registry before publishing anything:

```bash
bun run kroma serve                        # dist/modules, on :4173
bun run kroma serve --from ./bundles --port 8080
```

It serves the RFC 110 documents live off the directory, re-read per request, with
artifact URLs taken from the origin each request arrived at, so the same tree is
right on localhost, on a LAN address and behind a tunnel. Add
`http://localhost:4173` under Admin → Modules → Registries to browse it.

To install a local build, upload it rather than pointing a server at that
registry. A server refuses an artifact URL that is not https, which a local
registry never is:

```bash
KROMA_TOKEN=<a token with settings.manage> \
  bun run kroma install tv.kroma.vpn              # -> http://localhost:4040
bun run kroma install tv.kroma.vpn --server http://192.168.1.20:4040
```

It picks this machine's build out of `dist/modules` when a module was packed for
several targets, and the server applies the same gates the Store does. It refuses
a bundle built against an older manifest schema, with what to do about it.

To serve modules to others, host them: `bun run kroma registry` writes the same
documents to disk (`catalog.json`, `registry.json`, `index.json`, `m/*.json` and
the schemas), which any static host can serve. The `modules.json` mirror comes
from `kroma release`. See
[`docs/module-registries.md`](../docs/module-registries.md).

### Releasing this repo's modules

**Bump `version` in `module.json` in the same commit as the change.** Modules
release on their own tags (`<module-id>@<version>`) from
`.github/workflows/modules.yml`, and it refuses a module whose bundle changed
while its version stood still. The Store decides "update available" by comparing
versions, so a silent republish reaches nobody. `bun run kroma release
--dry-run --repo <owner/repo>` gives the same verdict locally, against whatever
`dist/modules` currently holds. Full shape in
[`docs/modules-as-kmod.md`](../docs/modules-as-kmod.md#the-release-train).

## Checks

```bash
bun run modules:check      # every manifest valid, every frontend typed, clippy clean
bun run modules:test       # cargo test in every module workspace
bun run modules:clippy     # cargo clippy --all-targets in every module workspace
```

`id` must be reverse-DNS (`^[a-z0-9]+(?:\.[a-z0-9-]+)+$`) and unique, and
`version` semver: `kroma check` refuses a manifest that is not, and `kroma
release` refuses one it cannot order against what is published.
