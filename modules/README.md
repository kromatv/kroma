# Modules

KROMA's core is playback + catalog. Everything else (downloads, indexers,
acquisition, VPN, transcription, embeddings, discovery, remote access) is a
**module**: a separate program with a reverse-DNS id (`tv.kroma.torrents`) that
the server installs, spawns and reverse-proxies.

Modules are **not** compiled into the server. `roster.yaml` is empty on purpose:
this is the zero-module base build. A module reaches users as a `.kmod` bundle
installed from Admin → Modules, either from a registry or by upload.

## Layout

Every module is one directory here, and it is **its own cargo workspace**: it
builds standalone, with its own `Cargo.lock`, outside the server tree:

```
modules/<id>/
  module.json      manifest: id, version, minServer, dependsOn, provides, config
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

A `.kmod` carries a **native** binary, so it must match the server's platform.
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

A module with **no `[[bin]]`** is a *library module*: manifest + frontend only,
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
to touch, plus pure library modules like `kroma_module_sdk::scene`. In this repo
they are path deps back into `server/crates/`.

### Frontend

`defineModule` takes id / version / dependsOn from the manifest, so they are
never restated. Each page is a `path` + `component`; the nav URL is **derived**
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
settings, events, jobs and **session lookup** (`AuthUser` resolves through the
host, so authenticating a caller costs no database).

- **`dependencies`** is a hard dependency, as a `{ "<id>": "<range>" }` map.
  Enforced on the backend; the Store installs missing ones automatically.
- **`optionalDependencies`** is ordered first when present, not required.
- **`requires: [{ kind, id? }]`** is a *capability* dependency, satisfied by any
  module whose `provides` declares that kind.
- **`engines`** is what the module needs from its host (`{ "server": ">=0.1.4" }`),
  enforced at install **and** at spawn, so a stale bundle fails with a clear
  message instead of proxy errors.

## Storage

**A module has no database unless it declares one.** That is what `storage` in
`module.json` is, and leaving it out is the normal case: eight of the twelve
first-party modules never open a database, and a sidecar that declares none does
not link SQLite at all -- which is half of what its binary used to be.

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

The capability gives a module **two** databases, and they are not
interchangeable:

- `host.store()` is the module's own file, `<data>/modules/<id>/module.sqlite`.
  It owns it outright, `migrations()` are applied there, and nothing else reads
  it. This is where a table only that module uses belongs -- especially one
  holding credentials.
- `host.db()` is the shared core database, and every statement prepared on it
  passes an authorizer built from the `core` grant above. A module that declared
  no grant still gets the pool; it just answers nothing, and says which table it
  refused.

Two rules about a grant come from SQLite rather than from us, and both have bitten:
a column named in a `WHERE` is reached as much as one that is projected, and a
foreign key drags its other table in -- writing a child row reads the parent, and
a cascading delete writes the child.

A `write` entry scoped to a column (`"write": ["users.language"]`) authorises
UPDATE of that column and nothing else. INSERT and DELETE act on a whole row, so
they need the whole table (`"write": ["users"]`) and are refused otherwise. A
module that inserts or deletes under a column-scoped grant must widen it.

A table the core itself reads (`downloads`, for the progress overlay) or that is
a channel between the core and the module (`whisper_jobs`) is **shared by
definition**: it lives in the core schema, and the module holds a grant on it. A
module cannot create a table in the core database, which is the same statement
said in enforcement.

Ports are unaffected: a port contract names `HostCtx` and nothing wider, even
when the module answering it is database-backed, because a consumer holds no
capability just because a provider does. A provider that needs a database holds
it itself.

`provides` is a declaration for introspection and capability deps; the concrete
dispatch is a sub-engine registry (`DownloadClientRegistry` and friends).

## Publish one

`bun run modules:pack` output is directly installable: upload the `.kmod` in
Admin → Modules.

To try the packed bundles as a registry before publishing anything:

```bash
bun run modules serve                      # dist/modules, on :4173
bun run modules serve --from ./bundles --port 8080
```

It serves the RFC 110 documents live off the directory, re-read per request, with
artifact URLs taken from the origin each request arrived at — so the same tree is
right on localhost, on a LAN address and behind a tunnel. Add
`http://localhost:4173` under Admin → Modules → Registries to browse it.

To actually **install** a local build, upload it rather than pointing a server at
that registry — a server refuses an artifact URL that is not https, which a local
registry never is:

```bash
KROMA_TOKEN=<a token with settings.manage> \
  bun run modules install tv.kroma.vpn            # -> http://localhost:4040
bun run modules install tv.kroma.vpn --server http://192.168.1.20:4040
```

It picks this machine's build out of `dist/modules` when a module was packed for
several targets, and the server applies the same gates the Store does — a bundle
built against an older manifest schema is refused with what to do about it.

To serve modules to others, host them: `bun run modules registry` writes the same
documents to disk (plus the schemas and a `modules.json` mirror), which any
static host can serve. See
[`docs/module-registries.md`](../docs/module-registries.md).

### Releasing this repo's modules

**Bump `version` in `module.json` in the same commit as the change.** Modules
release on their own tags (`<module-id>@<version>`) from
`.github/workflows/modules.yml`, and it refuses a module whose bundle changed
while its version stood still — the Store decides "update available" by comparing
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
