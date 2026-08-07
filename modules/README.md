# Modules

KROMA's core is playback + catalog. Everything else — downloads, indexers,
acquisition, VPN, transcription, embeddings, discovery, remote access — is a
**module**: a separate program with a reverse-DNS id (`tv.kroma.torrents`) that
the server installs, spawns and reverse-proxies.

Modules are **not** compiled into the server. `roster.yaml` is empty on purpose:
this is the zero-module base build. A module reaches users as a `.kmod` bundle
installed from Admin → Modules, either from a registry or by upload.

## Layout

Every module is one directory here, and it is **its own cargo workspace** — it
builds standalone, with its own `Cargo.lock`, outside the server tree:

```
modules/<id>/
  module.json      manifest: id, version, minServer, dependsOn, provides, config
  server/          the Rust backend — a [[bin]] makes it a spawned sidecar
  ui/              the React frontend (a KromaModule: pages, nav, settings)
  locales/         en.json, fr.json — this module's own catalog
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
cargo build            # or check / test / clippy — a normal, standalone crate
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
dependency graph they have in common — axum, tokio, candle, librqbit — compiles
once rather than once per module. Cargo holds an exclusive lock on it, so module
builds run in sequence.

A `.kmod` carries a **native** binary, so it must match the server's platform.
Cross-compile with `KMOD_TARGET`, which also suffixes the bundle with the triple:

```bash
KMOD_TARGET=x86_64-unknown-linux-musl bun run modules:pack
```

Declare cargo features the bundle needs in the manifest, not on the command
line — `modules:pack` reads them:

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
entry `pub const MODULE` is generated — do not write one.

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

A sidecar's whole `main()` is one `serve` call — the runtime opens the shared
SQLite, builds the out-of-process host, applies migrations, runs `on_enable` and
serves the module's admin routes on the port the supervisor assigned:

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

Depend on **`kroma-module-sdk`** and, for a sidecar, **`kroma-module-runtime`** —
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
A module opens the shared SQLite **directly** (WAL, so multi-process is fine) and
calls back into the core over the token-authed `/api/_host/*` API for settings,
events and jobs. It owns its own tables.

- **`dependsOn`** — hard dependency: a bare id, `"id@^1.0"`, or `{ id, version }`.
  Enforced on the backend; the Store installs missing ones automatically.
- **`optionalDependsOn`** — ordered first when present, not required.
- **`requires: [{ kind, id? }]`** — a *capability* dependency, satisfied by any
  module whose `provides` declares that kind.
- **`minServer`** — a bare version or a range, enforced at install **and** at
  spawn, so a stale bundle fails with a clear message instead of proxy errors.

`provides` is a declaration for introspection and capability deps; the concrete
dispatch is a sub-engine registry (`DownloadClientRegistry` and friends).

## Publish one

`bun run modules:pack` output is directly installable — upload the `.kmod` in
Admin → Modules.

To serve modules to others, host a catalog: `bun run modules registry` emits a
`modules.json` index of per-target artifacts with checksums, which any static
host can serve. Operators add it under Admin → Modules → Registries. See
[`docs/module-registries.md`](../docs/module-registries.md).

## Checks

```bash
bun run modules:validate   # every manifest against module.schema.json
bun run modules:gen        # expand single-file sources + regenerate aggregators
bun run modules:check      # CI gate: valid + generated output in sync
```

`id` must be reverse-DNS (`^[a-z0-9]+(\.[a-z0-9-]+)+$`) and unique; `version`
must be semver. Both are checked before anything is generated.
