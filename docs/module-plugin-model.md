# The module system as a plugin system

Where the module system stops being a plugin system, and the shape that fixes it.

[`docs/modules-as-kmod.md`](modules-as-kmod.md) covers how a module is packaged,
spawned, supervised and released. That part works. This document is about the
contract layer, which does not: the core still names the modules it hosts, and a
module type nobody has written yet has nowhere to declare itself.

## The rule being broken

The core hosts modules. It must not know what a module is for.

Today it does. `server/crates/kroma-module-sdk/src/ports/` is 3990 lines of
module vocabulary living inside the core cargo workspace:

```
ports/torznab.rs          ports/download.rs      ports/vpn.rs
ports/indexer.rs          ports/download_client.rs
ports/acquisition.rs      ports/naming/
```

`ports/mod.rs` claims "only generic contracts live here, never a module's own
types". That is not what is there. `AcquisitionSearchPort`'s own doc comment
opens with "The acquisition module's interactive-search contract". Each of these
files is one module's domain, and adding a module type means editing a crate the
core compiles.

Four places where the leak is load-bearing:

1. The server binary depends on `kroma-module-sdk` (`server/Cargo.toml:238`) and
   `src/api/requests.rs:61` resolves `AcquisitionSearchPort`. `/api/requests/:id/search`
   and `/grab` are core routes that 404 unless one specific module is installed.
2. `kroma-module-sdk` depends on `kroma-scene`, which is
   `modules/tv.kroma.scene/server` (`server/Cargo.toml:155`), and re-exports it
   as `kroma_module_sdk::scene`. A core crate depending on a module.
3. The binary links `kroma-whisper` and `kroma-vector` (`server/Cargo.toml:235-236`)
   behind the `whisper-*` and `semantic-embeddings` features, with
   `src/boot/embedder.rs` and `src/api/online_subs.rs` naming the sidecars in code.
4. `HostCtx::get_service(TypeId)` and `kroma_module_host::resolve_port<P>` pass
   trait objects between modules in-process. A `TypeId` only matches when both
   ends compiled the same trait from the same crate, so this mechanism *requires*
   a shared trait crate the core can see. It is the reason `ports/` exists.

The mechanism that does not require any of this already ships and already works.
`Supervisor::port_endpoint(name)` reads every installed manifest's `ports`,
finds a running module that declares the name, and answers with its base URL and
token. `kroma_module_host::call` POSTs JSON to `/_port/<method>` there. No core
type is involved and no caller names a module id. Every typed trait in `ports/`
is a convenience wrapper over that, bought at the price of the core's ignorance.

## Three declarations for one idea

A manifest advertises the same thing three ways.

`provides: [{kind, id}]` is the capability advertisement, and what `requires`
gates on. `ports: [string]` is the RPC advertisement, and what `port_endpoint`
resolves. `dependencies: {module-id: semver}` is a hard link to another module by
id. So `tv.kroma.torznab` says `provides: indexer-engine/torznab` and
`ports: ["torznab"]`, which are the same fact written twice, and
`tv.kroma.engine.qbittorrent` says `dependencies: {tv.kroma.torrents: ^0.2.0}`
purely to import a trait, which is the same fact written a third way and the
wrong way round: an engine plugin should not depend on the module that consumes it.

Three problems follow.

Port names carry no version. A provider built against an older shape of
`indexer-search` resolves fine and fails at the first request. `engines`
versions the host, not the contract.

`port_endpoint` returns the first match. Two modules provide `indexer-engine`
today (`tv.kroma.indexer` as `builtin`, `tv.kroma.torznab` as `torznab`) and
three provide `download-client` (rqbit, qbittorrent, transmission), but a port
has no instance id, so a consumer can neither fan out over all providers nor ask
for the one the operator picked. `tv.kroma.acquisition` requires
`indexer-engine` and needs every one of them.

The Store resolves dependencies by module id. A plugin marketplace resolves them
by contract: "this needs something that provides `kroma.indexer.engine@1`, here
are the two modules that do."

## Target shape

One concept. A module declares which extension points it answers and which it
calls. The core resolves a point name to a set of live endpoints and forwards
opaque JSON. It never deserializes a payload and never names a point.

The prior art worth copying is VS Code's contribution points for the manifest
side, HashiCorp's go-plugin for the process and handshake side (already how the
supervisor works), and LSP for versioning a JSON contract that two independently
released binaries have to agree on.

### 1. Contracts move out of the core tree

A contract belongs to whoever defines the point, and lives beside the modules:

```
modules/contracts/
  torznab/            kroma-contract-torznab
  download-client/    kroma-contract-download-client
  indexer/            kroma-contract-indexer
  download-ledger/    kroma-contract-download-ledger
  vpn/                kroma-contract-vpn
  acquisition-search/ kroma-contract-acquisition-search
```

Each is a leaf: serde types, a client built from a `Resolver`, a router builder
for the provider side, and the point's name and major version as constants. It
depends on `kroma-module-host` and nothing else, never on `kroma-engine` or
`kroma-db`. Provider and consumer both path-dep it. The core deps none of them,
and a third-party contract is the same kind of crate in someone else's repo.

### 2. Two kinds of thing, currently confused

A **service point** is stateful, owned by one process, reached over RPC. Torznab
search, a download client, the VPN bridge.

A **compute library** is a pure function, versioned as a crate and linked by its
consumers. `kroma-scene`'s release parser and the naming engine are these, which
is why the RPC treatment goes badly for them: acquisition parses every release of
every search, and a localhost round trip per release is slower than the code it
replaced. They should not be points at all. `scene` becomes an ordinary crate
dependency of the modules that parse release names, dropped from the SDK.
`naming` becomes pure by taking its templates as arguments instead of reading the
core's `Settings`, which is also what lets it stop needing the `engine` feature.

Making the distinction explicit in the manifest (`library: true` already exists)
stops the next contract from picking wrong.

### 3. Points are versioned and resolution returns a set

```jsonc
// provider
"contributes": [{ "point": "kroma.download.client", "version": 1, "id": "qbittorrent" }]
// consumer
"consumes":    [{ "point": "kroma.download.client", "version": "^1" }]
```

The supervisor refuses to resolve a consumer to a provider whose major does not
match, and logs it on the module's own log at spawn rather than failing a request
an hour later. That is go-plugin's handshake, moved into the manifest where an
operator can read it before installing.

Resolution grows the two shapes that are missing:

- `resolve_all(point)` for a consumer that fans out. Acquisition over every indexer.
- `resolve_one(point, instance)` for a consumer that wants the one the operator chose.

Which provider wins when several answer is the operator's decision, so it belongs
in a core setting keyed by point name, not in a consumer's code.

### 4. The in-process registry goes away

Delete `HostCtx::get_service`, `resolve_port`, `port_service`, and the `TypeId`
plumbing behind them. One dispatch mechanism, and with it the only reason a
contract had to sit where the core could see it.

### 5. The core's module-shaped routes become one generic handler

`/api/requests/:id/search` and `/grab` keep their URLs. The core resolves
`kroma.acquisition.search@1` by name and forwards the body as opaque JSON.
Roughly forty lines of `proxy_point(point, method)`, reused for the embedder in
`boot/embedder.rs` and the transcriber in `api/online_subs.rs`. That closes item
4 of the kmod doc: `kroma-scene`, `kroma-whisper` and `kroma-vector` leave
`server/Cargo.toml`, and the `whisper-metal` / `whisper-cuda` /
`whisper-accelerate` / `whisper-local` / `semantic-embeddings` features leave the
server build. The ML backend becomes the whisper module's own build choice, which
the per-target artifact catalog already handles.

### 6. What the SDK is afterwards

Keeps the manifest re-export, `embedded_module!`, `host`, `domain`, `http`, `db`
behind `storage`, and `primitives`. Loses `ports` and `scene`. `engine` is next
after that: it is the whole core behind one feature flag, two modules use it, and
the kmod doc already names splitting it into a thin client as the prerequisite
for a lean sidecar.

### 7. The host contract has its own smaller leak

`HostCtx::tmdb_api_key()` names a specific third-party service in a general
contract. `library_folders()` and `metadata_language()` are core facts and fine
to offer. `trigger_job(&'static str)` cannot carry a job key a module invented.
Worth fixing after the above, not before: a generic `secret(name)` and
`setting(key)`, and metadata lookup as a point like any other.

## Order of work

Each phase leaves the tree green and shippable.

0. Freeze. No new file under `kroma-module-sdk/src/ports/`.
1. `resolve_all` / `resolve_one`, and `contributes` / `consumes` with versions in
   manifest schema 3. Purely additive; `kroma-module-manifest/src/compat.rs`
   already migrates schema versions.
2. Move the six service contracts to `modules/contracts/*`, one per PR. Each move
   is a new crate, a path dep swapped at both ends, and a deletion from the SDK.
   `scene` and `naming` become plain libraries in the same pass.
3. Delete `get_service`, `resolve_port`, `port_service`, the SDK's `ports` module
   and its `kroma-scene` dep. The core's remaining need is `ModuleManifest`, so it
   names `kroma-module-manifest` and drops `kroma-module-sdk`.
4. `proxy_point` in the core. Delete the acquisition, whisper, vector and scene
   special cases, three path deps and five cargo features.
5. Generate both halves of a contract from one declaration, so contract number
   seven costs a declaration instead of 400 lines. Split the SDK's `engine`
   surface into a thin client.
6. Show the operator the point graph in Admin -> Modules: every point, who
   answers it, who calls it, which version. Ship a conformance test kit a
   third-party contract can run against both ends.

## How to tell it worked

A module type nobody here has thought of ships without a core release. Mechanically:
`server/` deps no crate under `modules/`, no crate under `server/` names a module
domain in a type or a function, and the only module string the core resolves is a
point name it was handed. The remaining hits for `tv.kroma.*` under `server/` are
test fixtures and prose, which is where they belong.
