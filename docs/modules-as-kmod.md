# Modules as `.kmod`: out-of-process module architecture

Goal: every module in `modules/*` ships as an installable `.kmod` file and
runs **out of the base `kroma-server` build**: native, fast, simple to author, and
easy to fetch from a registry.

## Why out-of-process (not WASM, not dlopen)

The modules are native Rust with dependencies a sandbox can't run (librqbit,
candle ML, native TLS, real sockets), so **WASM can't host them**. Native dynamic
loading (`.so`/`.dylib`) **can't work on the musl static build** (Synology can't
`dlopen`). The one model that keeps them native *and* runtime-installable is the
HashiCorp-plugin model: **each module is its own native binary; the core spawns
it, supervises it, and reverse-proxies its HTTP.**

## The pieces (built)

- **`kroma-module-runtime`** is what a module binary links. `serve(wire, modules)`
  is the whole `main()`: it reads the env the supervisor set, builds a
  `RemoteHost` (the out-of-process `HostCtx`), applies the module's migrations to
  the module's OWN database, calls `wire` with the live host (which registers the
  module's services and hands back its extra routes), runs `on_enable`, and
  serves the module's `admin_routes` + a `/_health` probe on the assigned local
  port. Settings, events, jobs and session lookup go to the core over a small
  callback API; everything else is local.
- **Storage is a capability, not part of the runtime.** A module that declares no
  `storage` in its manifest neither links SQLite nor can reach a row; the eight
  first-party modules in that position are about half the size they were. One
  that does gets two pools: its own file at
  `<data>/modules/<id>/module.sqlite`, and the shared core database behind an
  `sqlite3_set_authorizer` scope built from what its manifest declared. See
  `modules/README.md#storage`.

  This is a privilege reduction and an auditability property, not a sandbox: a
  sidecar is a native process running as the same user and could always open the
  file itself. What the grant buys is that the reach is declared where an
  operator can read it before installing, and enforced for every module that goes
  through the SDK.
- **`kroma-module-supervisor`** is the core side. `Supervisor` scans
  `<data>/modules/*`, spawns each enabled module's `module` binary with the
  runtime env (id, free localhost port, core URL, a per-process callback token,
  DB path, data dir, and the module's declared storage grant), tracks
  `id -> port`, and stop/spawns them. Before spawning it moves any table the
  module declared under `storage.adopt` out of the core database and into the
  module's own file -- the core does it, because the module no longer holds the
  rights to. `proxy_to` reverse-proxies a request to a module process.
  `host_router::<HostCtx>(token)` serves `/api/_host/*` (setting / settings /
  events / job / enabled / session / ...), token-authed, resolved against the
  core's real state.
- **Core integration**: `main.rs` builds the supervisor and `spawn_enabled`s
  installed modules at boot; `api/mod.rs` mounts the callback API and a
  `/api/module/<id>/*` reverse proxy.
- **`bun run modules:pack`** builds a module's native binary + stages
  `module.json` + `module` (the binary) + `icon` + `fe/` into a zstd `.kmod`
  (per-target via `KMOD_TARGET`; sidecar bundles are suffixed with the triple)
  plus a `.sha256` sidecar.
- **Registry + Store (shipped)**: `bun run modules registry` builds a catalog
  (schema 2: per-target `artifacts` with `sha256`, `contentHash`, `dependsOn`,
  `engines`) for a self-hosted directory; `bun run modules release` builds the
  published one (see "The release train" below). The server's default registry is
  `https://modules.kroma.tv/modules.json`, the registry worker
  (`apps/modules`) that serves the catalog with edge
  caching, a browsable page, and a `<link rel="kroma-modules">` autodiscovery
  tag (overridable via `moduleRegistryUrl`).
  The in-app Store (Admin -> Modules) browses the catalog enriched with this
  server's verdict (matching artifact, installed version, update flag,
  compatibility + reason), installs/updates by id with automatic hard-dependency
  resolution, verifies every download's SHA-256, and refuses to uninstall a
  module other enabled modules depend on. Manifests may declare `engines`
  (bare version or semver range); the supervisor enforces it at install AND at
  spawn, so a stale `.kmod` fails with a clear message instead of runtime proxy
  errors.

## The release train

Modules release **independently of the server**, each on its own tag.
`.github/workflows/modules.yml` owns it, triggered by a push touching
`modules/**` or anything a bundle is built from (the module SDK/runtime crates,
`packages/module-tools`, the pinned toolchain).

```
modules.yml
  build (matrix: 3 targets)      pack every module -> dist/modules/*.kmod
    |
  publish
    |- modules release           compare each bundle against the LIVE catalog
    |     publish   -> cut <module-id>@<version>
    |     unchanged -> skip, carry the live entry forward at its own older tag
    |     stale     -> FAIL the run
    |- publish-modules.sh        the per-module releases, then modules.json
                                 onto the rolling `modules` release
```

Two releases are involved, and they are different kinds of thing:

| Tag | What it holds |
| --- | --- |
| `<module-id>@<version>` | one module's per-target `.kmod`s + `.sha256`s. Immutable; one per version ever published. Also the module's version history, which is what the registry site reads. |
| `modules` | rolling, and holds **only** `modules.json` — the merge of the newest release of every module. What `modules.kroma.tv` serves. |

Both are prereleases, so neither can become the repo's `latest` and displace a
server release.

### The version gate

`module.json`'s `version` is the source of truth, bumped by hand — and CI refuses
a run that changed a module's bytes without moving it:

```
✗ tv.kroma.indexer: the bundle changed but the version did not.
    module.json says 0.1.2, which is already published
    differing target(s): x86_64-unknown-linux-musl
    Bump modules/tv.kroma.indexer/module.json past 0.1.2 and re-push.
```

This closes the failure the old pipeline had all along. Modules rode the server's
release, so the catalog's download base was the server tag and every module was
republished at whatever version its manifest said. Nothing checked the version
had moved, so the same version went out again carrying different bytes — and the
Store, which compares versions to decide whether an update exists, correctly
concluded there was nothing to do. **Module fixes shipped to nobody.**

The comparison is on `contentHash`: the sha256 of the **uncompressed** tar, not
of the `.kmod`. `pack` writes that tar deterministically (fixed epoch, uid/gid 0,
sorted entries), so it is stable across machines — whereas the compressed sha
would move on a zstd upgrade and demand a bump from every module at once.

An entry with no `contentHash` (a catalog published before this existed) is
treated as matching, so the first run after this change does not fail everything.

### Consequences worth knowing

- **A module publishes nothing when nothing about it changed.** A push that only
  touches the SDK still rebuilds all 12, but they come out content-identical and
  the run only refreshes the catalog.
- **Modules are not in the server's candidate gate** any more. `ci.yml` still
  runs `modules:clippy` + `modules:test` on every push, so a broken module is
  caught there; the `.kmod` cross-build is proven by this workflow.
- **The live catalog is the pipeline's memory** of what is published. It is a
  release asset and every per-module release keeps its own bundles, so a lost
  catalog is rebuildable from `gh release list`.
- **Building is still all-or-nothing.** Deciding what to build without building it
  needs a source fingerprint over each module's transitive path-dep closure; the
  content hash above is exact but only available *after* a build. Since
  `rust-cache` already keeps the heavy dep tree (candle, librqbit) warm, the
  remaining win is per-module final links + vite builds. Not yet done.

## Proven end to end

The real core boots, its supervisor spawns the installed `tv.kroma.remote` as a
separate process, and `GET /api/module/tv.kroma.remote/_health` is reverse-proxied
to that process → `200 ok`. `remote` builds as a standalone binary purely from its
generic `ServerModule<S: HostCtx>` behind `RemoteHost`.

## Remaining work (staged)

1. ~~**Native install path**~~ shipped: `/api/admin/store/install` (upload) and
   the Store's install-by-id both unpack a native `.kmod` under
   `<data>/modules/<id>/` via the supervisor and spawn it.
2. **The coupled cluster**: `torrents`, `acquisition`, `indexer`, `torznab`,
   `vpn`, and the two engines are wired by **9 cross-module ports**. Out-of-process
   these become HTTP: the provider exposes `/_port/<name>/<method>`, the consumer
   resolves a client proxy. Boundary types need serde derives. Hard cases:
   - `DownloadClientHost::register_engine(fn(&mut Registry))` is a raw **function
     pointer**, so the engine-plugin model must change to expose the `DownloadClient`
     trait itself as the RPC surface.
   - `AddTorrentReq`/`DownloadClientCtx` carry borrowed bytes + `Arc<dyn Any>`
     (the librqbit handle), so they need owned, serde mirrors.
   - the `ports/naming` engine is a **shared compile-time library** (torrents +
     acquisition), so it stays vendored into each process.
3. **Core → module direct calls**: `api/requests.rs`, `discover.rs`,
   `online_subs.rs` call module functions in-process (active downloads, transcribe,
   interactive search); these become proxied/port calls.
4. **Zero-module base build**: `roster.yaml` and the generated aggregator are
   empty, and modules now live at `modules/<id>`, each its own cargo workspace
   outside `server/`. Three are still linked into the binary and are what is
   left of this item: `kroma-scene` (a pure library the SDK re-exports) and
   `kroma-whisper` / `kroma-vector` (behind the `whisper-*` and
   `semantic-embeddings` features).
5. **More per-platform binaries**: the matrix packs `x86_64-unknown-linux-musl`
   and `aarch64-unknown-linux-musl` (both static: between them they cover the
   .spk, both Docker arches and any Linux host) plus `aarch64-apple-darwin`; the
   store picks per-target artifacts from the catalog. Adding a platform is one
   matrix entry + a cross linker.
6. ~~**Registry**~~ shipped (see "Registry + Store" above): catalog + in-app Store
   with dependency resolution, checksums and the `engines` compatibility gate.
7. ~~**Independent releases**~~ shipped (see "The release train" above):
   per-module tags, a merged catalog, and a CI gate on the version bump.

## Trade-offs to weigh (the goal says "optimized, fast")

- Each module binary links its own dep tree; the SDK façade currently re-exports
  `kroma-engine`, so a naive per-module binary duplicates a lot of code (large
  artifacts, slow builds). Making this lean needs splitting the SDK's engine
  surface into a thin client, a prerequisite for "optimized".
- Cross-module calls that were direct trait calls become localhost HTTP; hot paths
  (e.g. acquisition scoring releases via the scene parser) must stay in-process
  (shared lib) or they get slower, not faster.
