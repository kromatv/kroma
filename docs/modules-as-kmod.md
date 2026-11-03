# Modules as `.kmod`: WebAssembly components the server runs

Goal: every module in `modules/*` ships as an installable `.kmod` file and
runs **out of the base `kroma-server` build**: contained, simple to author, and
easy to fetch from a registry.

## Why components (not native processes, not dlopen)

A module is a WebAssembly component (`wasm32-wasip2`) that the server runs
in-process with wasmtime. A component cannot make a system call: it reaches the
network, files, a database and other programs only through the imports the host
links into it, for what its manifest declares. That holds the same on every
platform, because the operating system is not what enforces it. See
[module security](module-security.md).

The same `module.wasm` runs on x86_64 and arm64, Linux and macOS, so a module
builds once and ships one bundle. Native dynamic loading (`.so`/`.dylib`)
**can't work on the musl static build** (Synology can't `dlopen`), and a native
process per module is only as contained as each platform's sandbox, which on DSM
is nothing.

What a component cannot do with what the host gives it, an upstream program does
beside it: `wireproxy`, `cloudflared`, `rqbit` and `curl`. Those are host
processes, declared in the manifest. See
[what the component does not contain](module-security.md#what-the-component-does-not-contain).

## The pieces (built)

- **`kroma-wasm-host`** is wasmtime and the WIT world in
  `wit/module.wit`. A component exports `route` (`handle`, `tick`, `stop`) and
  imports `net`, `host-api`, `settings`, `sql`, `process`, `files`, `media` and
  `lan`.
  Each instance starts from an empty WASI context and has a memory ceiling and a
  CPU budget.
- **`kroma-module-runtime`** is what a module links. `module_main!(wire,
  modules)` is the whole `main`: it builds a `RemoteHost` (the `HostCtx` that
  asks the core through `host-api`), calls `wire` with the live host (which
  registers the module's services and hands back its extra routes), runs
  `on_enable` on the primary instance, and answers the module's `admin_routes`
  and a `/_health` probe through `route.handle`. Before any of that it answers
  the host's `/_lifecycle`: the schema, jobs and event topics its modules
  declare. Built for any other target the module still compiles, so its tests
  run natively, but it refuses to start.
- **Storage is a capability, not part of the runtime.** A module that declares no
  `storage` in its manifest reaches no row. One that does gets two databases:
  its own, which the host keeps in `<data>/databases/<id>/`, and the shared
  core database behind an `sqlite3_set_authorizer` scope built from what its
  manifest declared. The component holds neither file. `kroma-sqlite-guest` is rusqlite's
  API for a component (aliased as `rusqlite` on wasm) and sends every statement
  to the host's `sql` import, which opens both files and enforces the grant. See
  `modules/README.md#storage`.
- **`kroma-module-supervisor`** is the core side (`src/component/`). `Supervisor`
  scans `<data>/installed/*`, hashes each enabled module's `module.wasm` against
  the `sha256` recorded when it was installed, compiles it and keeps the machine
  code beside it at `<data>/installed/<id>/module.cwasm`, so a restart reuses it.
  It serves the module on `modules/<id>/module.sock` under `<data>/run`, in a
  directory only the server's user can open, and `proxy_to` reverse-proxies a
  request there. The first instance is the primary, and it starts as soon as the
  module does: the supervisor reads its `/_lifecycle`, applies the migrations to
  the module's own file, registers the jobs and topics with the core, and only
  then opens the module's other slots to workers, which never run `on_enable`.
  A bundle that predates `/_lifecycle` runs its own startup and gets one
  instance. Every 100 ms each instance not answering a call gets a turn, so
  background tasks advance. An instance holds its slot until its call ends, even
  when the caller has given up, so a module never runs more instances than it
  declares, and one lost to a trap takes the programs it started with it. Stopping runs `on_disable` through `stop`, then stops the
  programs the module started. Before starting a module the supervisor moves any
  table it declared under `storage.adopt` out of the core database and into the
  module's own file.
  `host_router::<HostCtx>(supervisor, reach)` serves `/api/_host/*` (setting /
  settings / events / job / enabled / session / ...), resolved against the core's
  real state behind a token the supervisor minted **per module**, so a callback
  names its caller. The component never holds that token: the host adds it to a
  `host-api` call on the way out. `reach` is the core's own answer for one
  settings key: its own is read back as the caller's default and refused on
  write, a key no declaration hands out likewise, and a credential whose consumer
  is a module goes to the module whose `settings` block named it and no other.
- **Core integration**: `main.rs` builds the supervisor and `spawn_enabled`s
  installed modules at boot; `api/mod.rs` mounts the `/api/module/<id>/*`
  reverse proxy clients reach, and `boot/serve.rs` serves `api/seam.rs` on
  `<data>/run/host.sock`: the host callbacks and that proxy, and nothing else.
  That socket is where a component's `host-api` calls go.
- **`kroma build`** (`packages/cli`, shipped inside the public `@kromatv/sdk`
  package) builds a module's server crate for `wasm32-wasip2` with the
  `release-kmod` profile, bundles its frontend into `fe/`, and stages
  `module.json` + `module.wasm` + `icon` + `fe/` + `locales/` into a zstd
  `<id>.kmod`, with its checksum in `<id>.kmod.sha256`. The server reads
  `locales/` to render the notification types the module declares in each
  reader's language. `kroma dev` uploads a debug build to a running server and
  again on every save.
- **Two folders per module.** What the host installed and reads to decide what
  a module may do (`module.json`, `origin.json`, `module.wasm` and its compiled
  copy, `fe/`, the icon and `locales/`) is in `<data>/installed/<id>/`, which no
  module holds. The module's own data, its database and the files it writes, is
  in `<data>/modules/<id>/`, the folder it may hold. An update replaces the first
  and leaves the second; an uninstall deletes both. A server that kept both in
  `<data>/modules/<id>/` moves them apart on its first start. See
  [what the host installed](module-security.md#how-each-permission-is-enforced).
- **What a server refuses.** A bundle whose manifest schema is not 3, and a
  bundle that carries a native `module` binary, from every registry and from an
  upload. A native module an older server left on disk is never started: its
  log says why, and the Store offers its update.
- **The frontend tier**: `fe/remoteEntry.js` is served at
  `/modules/<id>/remoteEntry.js` and the web client imports it for every
  enabled module at boot. The bundle takes React, the design system, the SDK
  and the client from the host through one global (`SHARED_MODULES` in
  `@kromatv/module-sdk`), so one React and one theme live on the page. At boot
  the host hands an entry only what `fe/shared.json` says it reads as it loads;
  the rest arrives when a module page, slot or panel first renders.
- **Registry + Store (shipped)**: `kroma registry` builds a catalog (one
  artifact per version, with `sha256`, `contentHash`, `dependsOn`, `engines`)
  for a self-hosted directory; `kroma release` builds the
  published one (see "The release train" below). The server's default registry is
  `https://modules.kroma.tv/modules.json`, the registry worker
  (`apps/modules`) that serves the catalog with edge
  caching, a browsable page, and a `<link rel="kroma-modules">` autodiscovery
  tag (overridable via `moduleRegistryUrl`).
  The in-app Store (Admin -> Modules) browses the catalog enriched with this
  server's verdict (the artifact it would install, installed version, update
  flag, compatibility + reason), installs/updates by id with automatic
  hard-dependency resolution, verifies every download's SHA-256, and refuses to
  uninstall a module other enabled modules depend on. Manifests may declare
  `engines` (bare version or semver range); the supervisor enforces it at install
  AND at spawn, so a stale `.kmod` fails with a clear message instead of runtime
  proxy errors.

## The release train

Modules release **independently of the server**, each on its own tag.
`.github/workflows/modules.yml` owns it, triggered by a push touching
`modules/**` or anything a bundle is built from (the module SDK/runtime crates,
`packages/cli`, the pinned toolchain).

```
modules.yml
  modules (one job, wasm32-wasip2)   pack every module -> dist/modules/*.kmod
    |
  publish
    |- kroma release             compare each bundle against the LIVE catalog
    |     publish   -> cut <module-id>@<version>
    |     unchanged -> skip, carry the live entry forward at its own older tag
    |     stale     -> name it, leave it unpublished
    |- publish-modules.sh        the per-module releases, then modules.json
                                 onto the rolling `modules` release
```

Two releases are involved, and they are different kinds of thing:

| Tag | What it holds |
| --- | --- |
| `<module-id>@<version>` | one module's `.kmod` and its `.sha256`. Immutable; one per version ever published. Also the module's version history, which is what the registry site reads. |
| `modules` | rolling, and holds **only** `modules.json`, the merge of the newest release of every module. What `modules.kroma.tv` serves. |

Both are prereleases, so neither can become the repo's `latest` and displace a
server release.

### The version gate

`module.json`'s `version` is the source of truth, bumped by hand, and CI refuses
a run that changed a module's bytes without moving it:

```
✗ tv.kroma.indexer: the bundle changed but the version did not.
    module.json says 0.1.2, which is already published
    Bump the module's version past 0.1.2 and re-push.
```

This closes the failure the old pipeline had all along. Modules rode the server's
release, so the catalog's download base was the server tag and every module was
republished at whatever version its manifest said. Nothing checked the version
had moved, so the same version went out again carrying different bytes, and the
Store, which compares versions to decide whether an update exists, correctly
concluded there was nothing to do. **Module fixes shipped to nobody.**

The comparison is on `contentHash`: the sha256 of the **uncompressed** tar, not
of the `.kmod`. `pack` writes that tar deterministically (fixed epoch, uid/gid 0,
sorted entries), so it is stable across machines, where the compressed sha
would move on a zstd upgrade and demand a bump from every module at once.

An entry with no `contentHash` (a catalog published before this existed) is
treated as matching, so the first run after this change does not fail everything.

### Consequences worth knowing

- **A module publishes nothing when nothing about it changed.** A push that only
  touches the SDK still rebuilds all 12, but they come out content-identical and
  the run only refreshes the catalog.
- **Modules are not in the server's candidate gate** any more. `ci.yml` still
  runs `modules:clippy` + `modules:test` on every push, so a broken module is
  caught there; the `.kmod` build is proven by this workflow.
- **The live catalog is the pipeline's memory** of what is published. It is a
  release asset and every per-module release keeps its own bundles, so a lost
  catalog is rebuildable from `gh release list`.
- **Building is still all-or-nothing.** Deciding what to build without building it
  needs a source fingerprint over each module's transitive path-dep closure; the
  content hash above is exact but only available *after* a build. Since
  `rust-cache` already keeps the heavy dep tree (candle) warm, the remaining win
  is per-module final links + vite builds. Not yet done.

## Proven end to end

The `kroma-module-supervisor/tests/component_*.rs` suites build real components
and run them under the supervisor: a guest that tries each import, and the real
Transmission, vector and whisper modules. A component answers on its socket,
cannot read a file of the machine, sends every call through its gateway into the
journal, has no network when it declares no `permissions`, starts only the
programs its manifest declares (none for a third-party module), and loses only
the instance that panicked. `kroma-wasm-host/tests/escape.rs` shows a component
cannot read a path, open a TCP socket, resolve a name or read an environment
variable the host process can.

## Measured

Against the native builds the components replaced:

| | Component | Native |
|---|---|---|
| Bundle, per module | about 0.35 to 1.2 MB, one for every platform | 3 to 14 MB, per platform |
| Whisper `tiny`, 82 s clip, M2 Max | 1.8 to 1.9x real time | 5.6x on all threads, 22.9x with Metal |
| Whisper `base` | 0.80x | 3.1x, 12.7x with Metal |
| Whisper `small` | 0.21x | 0.98x, 4.7x with Metal |
| Vector embeddings | 4.9 docs/s | 12.4 on one thread, 24 on all |
| Torrent download through the gateway, loopback | 379 to 398 MiB/s | the same |

Inference is the cost: on a NAS only Whisper `tiny` is practical for a film. The
torrent engine is the native `rqbit` helper behind the same gateway as before.
A restart starts from the compiled copy in about 60 ms instead of compiling.

## Remaining work (staged)

1. ~~**Install path**~~ shipped: `/api/admin/store/install` (upload) and
   the Store's install-by-id both unpack a `.kmod` under
   `<data>/installed/<id>/` via the supervisor and start it.
2. ~~**The coupled cluster**~~ shipped: every one of the nine cross-module ports
   is HTTP now, provider at `/_port/<point>/<method>` and consumer resolving by
   point name. Each side declares the JSON it reads or writes, so no crate sits
   between two modules and none of it is in `server/`. The engine-plugin model
   changed as this item predicted: the function pointer and the `Arc<dyn Any>`
   handle are gone, and qBittorrent and Transmission are modules answering
   `tv.kroma.torrents/client` under their own kind. The naming engine stayed a compile-time
   library, in `modules/lib/`. See
   [`module-plugin-model.md`](module-plugin-model.md).
3. ~~**Core → module direct calls**~~ shipped: `api/requests/acquisition.rs`
   forwards opaque JSON to whatever answers a point, and `boot/embedder.rs` /
   `boot/transcriber.rs` resolve theirs by name. No crate under `server/` names a module.
4. ~~**Zero-module base build**~~ shipped: the compile-time roster and its
   generated aggregator are gone, modules live at `modules/<id>` as their own
   cargo workspaces outside `server/`, and no module is a dependency of the
   binary any more. `kroma-scene` became a library its consumers link; `kroma-whisper` and
   `kroma-vector` were only there so the `whisper-*` / `semantic-embeddings`
   feature flags could forward into them, which compiled candle into the binary
   for code no file under `src/` reached.
5. ~~**Registry**~~ shipped (see "Registry + Store" above): catalog + in-app Store
   with dependency resolution, checksums and the `engines` compatibility gate.
6. ~~**Independent releases**~~ shipped (see "The release train" above):
   per-module tags, a merged catalog, and a CI gate on the version bump.
7. **Helpers as host capabilities.** WireGuard inside the gateway (#512) and the
   torrent engine as a component at full speed (#514) would retire `wireproxy`
   and `rqbit`. Neither is done.

## Trade-offs to weigh

- A component has one thread and no GPU. It has SIMD, and the ML modules are
  still several times slower than native (see "Measured").
- Each component links its own dependency tree, so code two modules share is in
  both bundles.
- Cross-module calls are HTTP through the core's reverse proxy. Hot paths (e.g.
  acquisition scoring releases via the scene parser) stay in-process as a shared
  library, or they get slower.
