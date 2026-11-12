# RFC 567: the next module host

- Status: **DRAFT**
- PR: #567
- Affects: `kroma-wasm-host`, `kroma-module-supervisor`, `kroma-module-runtime`,
  `kroma-module-host`, `kroma-module-manifest`, `kroma-egress`, `kroma-http`, the
  network service in `kroma-engine`, `packages/cli`, every module under `modules/`.
  Areas `area/modules`, `area/sdk`, `area/server`

## Summary

Since #559 every module is a WebAssembly component that the server runs with wasmtime
50. The host around it still has the shape of the native-sidecar era. A module is reached
over Unix sockets. It calls out through a custom `fetch` that starts a `curl` process
behind a SOCKS gateway. It only advances on a 100 ms tick, and its whole startup runs once
per instance.

This RFC proposes one long-lived instance per module, with a lifecycle the host runs once,
and async host calls, so that a long call stops holding the module. Outgoing calls use the
standard `wasi:http` (and `wasi:sockets` for the modules that need raw sockets), behind one
policy decision with one purpose rule. The host gets smaller. The roadmap at the end is
eleven PR-sized steps, each one shippable and approvable on its own.

## How to read the evidence

| Mark | Meaning |
| --- | --- |
| **Proven** | A throwaway spike ran it on wasmtime 50.0.1 and Rust 1.98 on an M2 Max. The spikes are not in this PR. [Appendix A](#appendix-a-the-spikes) says what each one did. |
| **Read** | Taken from the source of the crate named, not run. |
| **Guess** | An estimate or a judgment. Every J3455 figure is extrapolated from the M2 Max. None was measured on the NAS. |

File references are to `main` at `1d270635` unless a crate version is named.

## Motivation

What production showed on 2026-11-02 (DS918+, Celeron J3455, kernel 4.4.302), and why
each one happened:

| What happened | Why | Where |
| --- | --- | --- |
| torrents starts `curl` to wait on rqbit's add | every host call is synchronous and holds the module's instance for its whole length | `modules/tv.kroma.torrents/server/src/rqbit/adding.rs:1-4`, `kroma-module-supervisor/src/component/pool.rs:89-102`, `kroma-wasm-host/src/state.rs:118-150` |
| the tracker announce helps one stalled torrent per pass | same | `tv.kroma.torrents/server/src/downloads/engine.rs:171-173` |
| the VPN ran two `wireproxy` bridges | a second instance runs `serve` and every `on_enable` again (#563, still open, holds the slot) | `kroma-module-runtime/src/serve.rs:103-119`, `pool.rs:61-79` |
| acquisition registers its jobs 4 times | every instance announces its jobs and event topics | `serve.rs:121-176`, acquisition's `component.instances: 4` |
| 4 instances migrated `module.sqlite` at once: `no copy ... was kept before upgrading it: disk I/O error` | every instance applies the migrations and writes the pre-upgrade copy | `serve.rs:111`, `kroma-sqlite/src/migrate.rs:192-200` |
| 191 TMDB calls refused for a day | the manifest matches a purpose exactly, operator rules match by dotted prefix | `kroma-module-manifest/src/permissions.rs:148,170`, `kroma-engine/src/services/network/flow.rs:89` |
| background work crawls while nobody calls | a task only advances inside a 1 ms slice every 100 ms, when a slot is free | `pool.rs:15,109-146`, `kroma-module-runtime/src/guest.rs:30,188-192` |

Three more things the code shows:

- **There are three purpose rules, not two.** The SOCKS gateway also cuts a purpose at its
  first dot and reads the rest as flags (`kroma-module-supervisor/src/gateway.rs:156-171`).
  So `metadata.search` is decided as `metadata.search` by the first check and as
  `metadata` by the second.
- **Every module fetch is decided twice and runs a `curl` process.**
  `Outside::refusal` asks the policy (`component/outside.rs:113-133`). Then `curl` starts
  (`kroma-http/src/fetch/native.rs:47`), dials the module's own SOCKS gateway on
  loopback TCP inside the same server, and the gateway asks the policy again
  (`gateway.rs:79-100`). A request body goes through a temp file on the way.
- **Every host call holds a server thread.** Calls, ticks and the first start each run on
  `spawn_blocking` (`pool.rs:212,229,260`). `fetch-all` and `call-all` start one OS thread
  per request (`state.rs:126-170`).

## Proposal

### 1. Execution model

**Today.** A module declares `component.instances` (up to 16, `component/mod.rs:35,167`).
Each instance runs `module_main!` and `serve`: the migrations, every `on_enable`, and the
job and topic registration (`serve.rs:103-154`). Every import is synchronous
(`kroma-wasm-host/src/host.rs:32` links WASI with `add_to_linker_sync`), so a slow call
holds its instance until it returns. Work a module leaves running only moves in the 1 ms
slice of a tick.

**Proposal.**

- **One instance per module, kept for the module's life.** It holds the module's
  in-memory state. A trap restarts the module as a whole, and the programs it started stop
  with it, as #563 already does per instance.
- **The host runs the lifecycle, once.**
  - Migrations: the bundle carries its SQL (`migrations/NNNN_name.sql`). Every step a
    module ships today is `Run::Sql` (3 of 3). The host already holds the file behind the
    `sql` import, so it applies the steps before the instance starts, and keeps one copy.
  - Jobs and event topics: declared in `module.json`, as notification types already are.
    The supervisor registers them from the manifest. The guest only answers
    `/_job/run/{key}` and `/_event/{topic}`.
  - `on_enable` runs once.
- **Extra instances become stateless workers.** `component.instances` above 1 adds
  instances that answer only the routes the manifest lists under `component.workers`
  (vector's embedding, whisper's transcription) and never run `on_enable`. CPU-bound
  inference keeps its parallelism. Nothing else gets a second copy.
- **Async host calls.** Host functions become async on wasmtime's fibers. The instance
  runs from a tokio task, with no `spawn_blocking` and no thread per batched request. The
  CPU budget moves from "per call" to "per slice": the epoch callback counts the CPU the
  slice spent and yields (`UpdateDeadline::Yield`), and a module over its rate traps.
- **Async guests.** The exports and the long imports become component-model async
  functions. A call waiting on the network suspends its own task only. Other calls enter
  the same instance, and background tasks run with no tick at all.
  **Proven** (spike 1): one instance answered a second call at 101 ms while the first
  waited 2 s on an async host import. A task spawned by a third call beat every ~103 ms
  with no tick: 9 beats by 1.1 s, 28 by 3.0 s. Every call saw the same counter.
- **What wasmtime 50 supports.** **Read**: component-model async is compiled in with the
  `component-model-async` feature and turned on with `Config::wasm_component_model_async`,
  which its docs call "_very_ incomplete" (wasmtime 50.0.1 `src/config.rs:1301-1313`).
  WASI 0.3 (`wasmtime-wasi`'s `p3` feature, on by default) is documented as "not ready for
  production use" (`src/p3/mod.rs:1-9`). `Config::async_support` is deprecated and does
  nothing, because async is always there (`config.rs:426-431`). The spike used component
  async for our own WIT only and kept WASI at 0.2. That narrow use is what this RFC
  proposes. WASI 0.3 waits for upstream.
- **The guest runtime changes.** Today it is tokio's current-thread runtime with a timer
  driver only (`guest.rs:37-44`). It becomes wit-bindgen's async executor, the one the
  spike used (`spawn_local`). `tokio::sync` keeps working. These move to SDK calls:
  `tokio::spawn` (13 sites in modules and the SDK), `tokio::time` (13),
  `std::thread::sleep` (16) and the blocking `Fetch` builder (17). A synchronous import
  still blocks the whole instance under component async, so those sites are the migration.

Cost: L, split over steps 2, 3 and 6. Risk: the maturity of wasmtime's component async. A
module opts in with `component.async: true`, and today's world (`kroma:module@0.2.0`) stays
linked until every first-party module has moved.

**Fallback** if component async misbehaves: stay on WASI 0.2 and make the tick
event-driven. Long imports return a handle, and the host calls `tick(ready)` when one
completes instead of every 100 ms. Background work gets the same benefit. Calls still enter
one at a time. **Guess**, M.

### 2. Network

**One decision point.** `NetworkPolicy::decide` runs once per request or connection, in
the host. It folds together the manifest's `net.connect`, the guards, the operator's rules
and the seal. The gateway stops deciding for component traffic.

**One purpose rule.** Purposes are dotted and match by prefix everywhere (`metadata`
covers `metadata.search`). The rule lives once, in `kroma-module-manifest`, and the
manifest check, the rules, the journal filters and the offers all call it. Flags stop
riding inside the purpose string (`.public`, `.vpn`) and travel as fields. Host patterns get
one matcher too. The two copies disagree today: `decide.rs:123` wants a label before the
suffix, `permissions.rs:216` does not.

**The purpose comes from the declaration.** A module names it per call today
(`kroma-module-runtime/wit/module.wit:27`), and so does the seal (`module.wit:38`). Under this proposal:

- For HTTP the module still names a purpose, in a header. The host checks it against
  `net.connect` and strips it before sending (spike 5).
- For a raw socket the purpose is the first `net.connect` entry that covers the
  destination. The journal still says `peers` for peer traffic, and a module cannot file
  tracker traffic under `metadata`.

**HTTP through `wasi:http`.** The standard outgoing handler replaces `net.fetch`,
`fetch-all`, `download`, `host-api.call` and `call-all`. The host's hook
(`WasiHttpHooks::send_request`, wasmtime-wasi-http 50.0.1 `src/ctx.rs:268`) sees the
method and the full URL. It decides, routes the request direct or through the VPN,
counts the bytes, and sends it with hyper inside the server instead of a `curl` process.
Calls to `/api/_host/*` and to a peer reach the core's router in-process through the same
hook. **Proven** (spike 5): the hook saw
`GET http://localhost:<port>/movie/1 purpose="metadata"`, refused an undeclared host with
`HttpRequestDenied`, and two 1-second requests ran at once beside a 300 ms timer, in one
guest call. A published crate, `http-acl-wasmtime`, enforces ACLs through the same hook.

One constraint until step 6 (**Read**): under WASI 0.2 a guest has one executor. tokio's
reactor on `wasm32-wasip2` waits on sockets only, and a `wasi:http` response is a pollable
it cannot wait on, so a module picks `tokio::net` or a `wasi:http` client, not both at
once. Step 5 therefore ships blocking: the SDK waits on the response the way today's
`fetch` does. Component async removes the constraint, because wit-bindgen's executor
drives every import.

**Raw sockets through `wasi:sockets`,** only for a module whose `net.connect` declares a raw
protocol (torrent peers, WireGuard's UDP). `socket_addr_check` enforces the address half
of `net.connect` (`public`, `lan`, a range, a port). The host links its own
`ip-name-lookup` over the stock one, so every address carries the name the module
resolved. **Proven** (spikes 2 and 2b): tokio's `net` ran inside a component, three
1-second connections finished together at ~1008 ms while a timer kept ticking, a refused
connect reached the guest as `Permission denied`, and the check saw
`[::1]:<port> (name: localhost)`. Three limits:

- A name sticks to its address. In spike 2b a later connect to `127.0.0.1` on a denied
  port also read as `localhost`. A socket shows no SNI and no Host header. So on raw
  sockets a name rule means "the addresses this name resolved to", and only HTTP keeps
  name precision.
- The stock `wasmtime-wasi` socket connects directly. The check can allow or refuse, but
  it cannot reroute, and it sees no bytes. Sealed raw traffic cannot use `wasi:sockets`
  until the host implements `wasi:sockets/tcp` over its own tunnel (**Guess**, L). Until
  then it stays on the gateway.
- tokio resolves names on `spawn_blocking`, which panics in a component (no threads).
  Names must resolve through std, which is WASI `ip-name-lookup`. **Proven**.

**The SOCKS gateway stays for programs only** (`{gateway:<purpose>}`) and goes with the last
one.

| | Keep `fetch` + SOCKS, make imports async | `wasi:http` + `wasi:sockets` |
| --- | --- | --- |
| A long call holds the module | no | no |
| Decisions per call | two, unless the gateway is bypassed | one |
| Process per call | `curl` | none |
| Name-precise policy for HTTP | yes | yes, the hook sees the URL |
| Raw protocols in a component | no | yes, address-level rules |
| VPN for sealed raw traffic | yes, through SOCKS | not until the host owns `wasi:sockets/tcp` |
| Ordinary crates | none, a KROMA-only client | any `wasi:http` client, tokio `net` |
| WIT the project maintains | `net`, `host-api` | neither |

### 3. Standard interfaces

| Interface | Replaces | What it buys | Evidence |
| --- | --- | --- | --- |
| `wasi:http` outgoing | `net.*`, `host-api.*` | async calls, URL-level policy, ordinary clients (`wstd::http` in the spike) | **Proven**, spike 5 |
| `wasi:http` incoming | `route.handle` with whole bodies (`pool.rs:14,238`, 64 MiB cap) | streamed bodies, any `wasi:http` server; axum stays usable on top, it is a tower service | **Read** |
| `wasi:sockets` | nothing (`state.rs:80-82` turns it off) | `tokio::net` under `--cfg tokio_unstable`, raw protocols | **Proven**, spikes 2 and 2b |
| `wasi:clocks` | the guest's timer driver and the tick | a sleep that wakes the module | **Proven** inside spikes 2 and 5 |
| `wasi:filesystem` | already used for preopens | unchanged | |

Kept custom: `sql` (the host enforces the grant per statement), `lan` (mDNS and SSDP),
`files.canonical` and `files.copy`, and `process` for first-party programs.

Deleted: `settings.get`. No production module reads it. The pool hands every instance
`Settings::default()` (`pool.rs:68`), and only the host's test guest calls it
(`kroma-wasm-host/tests/guest/src/lib.rs:30`).

Linking WASI 0.2 needs no change on the author's side: a guest built for `wasm32-wasip2`
already imports it through std (spikes 1 to 5). A client that resolves names on a thread
pool needs a resolver that goes through std or the host (**Read**, tokio 1.54
`src/lib.rs:462-470`).

### 4. The programs modules still start

| Program | Verdict | J3455 estimate | Evidence |
| --- | --- | --- | --- |
| `curl` (torrents) | Goes with async calls. The long add becomes an awaited request. S once step 6 lands | n/a | **Proven** mechanism, spikes 1 and 5 |
| `wireproxy` (VPN) | Replace with userspace WireGuard (boringtun or Mullvad's fork gotatun, plus smoltcp) **in the host**, as the tunnel the network layer routes sealed purposes through (#512). The VPN module keeps the config and the status. Native crypto, no wasm cost, and the seal no longer depends on a module's process. L | ChaCha20-Poly1305 native in the host: comparable to wireproxy. Inside a component instead: 55 to 65 MB/s of cipher on one core, so 150 to 300 Mbit/s through a TCP stack (**Guess**) | **Proven**: boringtun 0.7.1 and smoltcp 0.12 compile for `wasm32-wasip2` with a 10-line clock patch (boringtun has no WASI branch in `sleepyinstant/mod.rs:6-14`). Not run. boringtun 0.6 fails on ring 0.16 |
| `rqbit` (torrents) | Feasible later, not first. The peer wire protocol parses untrusted input from the internet, which is the strongest case for moving it into wasm. L, after a NAS spike | SHA-1 inside a component: about 100 MB/s on one core (80 to 125), roughly 800 Mbit/s of verified data. Native rqbit uses the J3455's SHA extensions, which wasm cannot (**Guess**) | **Proven**: librqbit 8.1.1 fails to compile for `wasm32-wasip2` on `network-interface` (getifaddrs) and `aws-lc-sys` (rustls' default provider), and on `openssl-sys` with its default TLS. **Read**: its disk and hashing work goes through `spawn_block_in_place`, which runs inline on a current-thread runtime (`spawn_utils.rs:23-39`), so it does not panic there. The `watch` feature starts a thread (`watch.rs:214`) |
| `cloudflared` (remote) | Keep as a first-party program. It is Go, it speaks QUIC and capnp to Cloudflare's edge, and no Rust implementation is known to this author. Revisit if Cloudflare ships one | n/a | **Guess** |
| `ffmpeg` (whisper) | Moving into a core host API in another branch. Not covered here | n/a | |

How the J3455 estimates were made: the M2 Max ratio of wasm to native (best of 5,
interleaved, load average 24) was SHA-1 0.60x (619 against 1040 MB/s), SHA-256 1.0x
(373 against 366), ChaCha20-Poly1305 on 1420-byte packets 0.77x (329 against 426), and
0.90x with `simd128`. The M2 Max natives here are portable Rust without SHA hardware. A
J3455 core is taken as one sixth of an M2 Max performance core (**Guess**, could be a fifth
or a seventh). Measure on the NAS before deciding on rqbit.

### 5. What the native era left behind

Lines are `wc -l`, tests included.

| What | Lines | Goes in step |
| --- | --- | --- |
| The Unix-socket seam: `run_dir.rs`, `endpoint.rs`, `proxy.rs`, `api/seam.rs`, `boot/seam.rs`, `kroma-http/src/loopback/*` | 1,480 | 4, most of it |
| The axum server per module in front of an in-process component, and the header and body copies (`pool.rs:233-274`, `outside.rs:183-207`, `guest.rs:108-162`) | counted in the rows above and below | 4 and 5 |
| The custom fetch path: `kroma-http/src/fetch/guest.rs`, `component/outside.rs`, `kroma-module-runtime/src/guest.rs` | 669 | 5 |
| The tick: `pool.rs` tick, awake, reclaim, start (about 120), `guest.rs` tick | about 140 | 6 |
| `settings.get` in WIT and `kroma-wasm-host/src/settings.rs` | 60 | 11 |
| Native-only paths: `outside_native.rs` (163), `refuse_native` (`serve.rs:77-88`, `kroma-module-runtime/src/lib.rs:31-32,41-44`), the native-build checks (`lifecycle.rs:16-35,94`, `install.rs:42`) | about 210 | 11 |
| `target_family = "wasm"` gates in the module crates, mostly so they compile natively for tests | 71 gates | 10 and 11 |
| The SOCKS gateway, its policy and `kroma-http`'s egress (`kroma-egress`, `gateway.rs`) | 1,852 | 8 and 9, when no program needs it |
| Program supervision (`component/programs/*`, `program_env.rs`, `kroma-module-host/src/process.rs`) | 969 | stays while `cloudflared` does |

Four shapes of request and response cross a module call today: the WIT types,
`kroma_http::Response`, `kroma_http::loopback::Request` and axum's, plus
`FetchRequest`/`GuestCall` and three journal shapes (`NetworkFlow`, `kroma_egress::Flow`,
`FlowReport`). `wasi:http` carries the `http` crate's types end to end.

The component host is compiled on Unix only (`kroma-module-supervisor/src/lib.rs:14-18`),
because of the socket seam. Step 4 lifts that.

`bun run deadcode` (knip) finds 38 unused files, 148 unused exports and 430 unused
exported types across the repo. In the module system it finds only the CLI's UI
templates (which are a false positive), `AuthoredManifest` (`packages/cli/src/project.ts:10`),
`SettingsScope` and `DescribedModule` in `packages/registry`, and a few props interfaces in
`apps/modules`. Knip does not read Rust, so the table above was counted by hand.

### 6. Developer experience

**What an author writes today.** The scaffold (`packages/cli/templates/server`) is a
`Cargo.toml` with two target tables for axum and tokio, its own profiles and a SQLite
build flag, and a `lib.rs` where `S: HostCtx + Clone + Send + Sync + 'static` appears three
times in 43 lines. Routes come from two places: the `module_main!` closure and
`admin_routes`. State goes through a `TypeId` service registry (`register_service`,
`get_service`) rather than axum's `State`. `HostCtx` has 23 blocking methods. Tests run
natively against `StubHost`, which is not the real host. A component built natively
refuses to start. `kroma dev` rebuilds, uploads the bundle, and the server compiles it
again on every save.

**Proven** (spike 6 and two `cargo build` runs) on the M2 Max for `tv.kroma.indexer`:

| | Time |
| --- | --- |
| `cargo build` for `wasm32-wasip2`, debug, after touching `lib.rs` | 1.4 s |
| the same, `release-kmod` | 34 s |
| the server compiling the 4.8 MB release component, Cranelift as today | 1.1 s (7.8 s on one thread) |
| the same with Winch, wasmtime's baseline compiler | 0.2 s (0.9 s on one thread) |

On the NAS's four slower cores a Cranelift compile of that module is likely 10 to 15 s
(**Guess**).

**Improvements**, in the order they pay:

1. **Manifest-first lifecycle.** Jobs, event topics and migrations are declared in
   `module.json`, and `kroma check` verifies that each declared job and topic has a
   handler. Lands with step 2.
2. **Winch for `kroma dev` uploads.** The server keeps Cranelift for installs and uses
   Winch for a dev upload. Machine code roughly doubles and runs slower, which a dev loop
   does not mind. The server always compiles. It never accepts machine code from an
   upload. S.
3. **`kroma test`, which runs the real component.** It embeds the host with a fake core:
   settings from a file, temporary SQLite files, and a recording network policy that
   answers from fixtures. It prints what the module reached against what it declared.
   That is `kroma audit` (#495) too, so one tool serves both. Once it exists the native
   test path, its 71 gates, `refuse_native` and `outside_native` can go. M.
4. **One concrete context and less ceremony.** The SDK exposes a concrete `Ctx` (the real
   host, whose transport the harness swaps) instead of a generic `S`. A builder replaces
   the macro, the trait object list and the closure: routes, handlers by job key and by
   topic, `on_enable`. It lands with the async SDK, since signatures change then anyway. M.
5. **Typed host errors.** The WIT returns `denied { permission, detail }`, `unavailable` or
   `failed(string)` instead of a bare string, and a trap report names the module, the call
   and the last host call. `net.connect` refusals already name the missing entry. The
   other capabilities follow. S to M.
6. **Point schemas without shared types.** `definesPoints` methods may carry a JSON Schema
   for the request and the response. `kroma check` validates each side's pinned JSON
   against the definer's schema, and the Store warns at install when an installed pair
   disagrees. Each side still owns its structs. M.

## Roadmap

Each row is one PR. The order puts the fixes for real failures first, then host changes
nobody has to rebuild for, then interface changes, then the programs.

| # | Step | Removes or secures | Cost | Risk | Evidence |
| --- | --- | --- | --- | --- | --- |
| 1 | One purpose rule and one host pattern, in `kroma-module-manifest`, used by the manifest check, rules, filters, offers and the gateway. Flags leave the purpose string | the outage class of 191 refused TMDB calls, the third rule in the gateway | S | a manifest entry now covers its dotted children: an update that adds `peers` covers `peers.x` | Read |
| 2 | The host runs the lifecycle once: SQL migrations from the bundle, jobs and topics from the manifest, `on_enable` on the primary instance only, extra instances as workers | the migration race, jobs registered N times, the duplicated-bridge class of bug | M | a module whose code relied on per-instance startup | Read |
| 3 | Async host functions on wasmtime fibers, instances driven from tokio tasks | a server thread per call, a thread per batched request | M | CPU budget accounting moves to per slice | Read |
| 4 | In-process seam: the core calls the instance directly, and host calls reach the core's router without `host.sock` | most of the 1,480-line socket seam, the Unix-only gate on the component host | M | the seam's "never a local client" rule must hold in-process too | Read |
| 5 | `wasi:http` for outgoing calls, one decision in the hook, hyper instead of `curl`. Blocking at first, so the guest executor does not change | `net.*` and `host-api.*` (669 lines), a `curl` process per module call, the second decision | M to L | `kroma:module@0.3.0` linked beside `@0.2.0`, first-party modules rebuilt | Proven, spike 5 |
| 6 | Async guests: component-model async exports and imports, wit-bindgen's executor, `kroma::spawn` and `kroma::sleep`, opt-in per module | the tick, the `curl` add in torrents, an announce that holds the module | L | wasmtime calls component async "very incomplete" | Proven, spike 1 |
| 7 | `wasi:sockets` for modules that declare a raw protocol, with the address check, the host's name lookup and a purpose taken from the declaration | direct peer traffic through the SOCKS gateway | M | name rules are address rules on sockets | Proven, spikes 2 and 2b |
| 8 | WireGuard in the host (boringtun or gotatun, plus smoltcp) as the tunnel for sealed purposes | `wireproxy`, `net.host` for `tv.kroma.vpn` | L | owning a WireGuard implementation: handshakes, timers, roaming | compile Proven for wasm; native is ordinary Rust |
| 9 | The torrent engine, after a spike on the NAS: librqbit as a component with the two dependencies patched, or rqbit kept native behind the host's tunnel | `rqbit` native, `net.host` for torrents; the peer parser contained | L | single-thread hashing caps throughput | compile blockers Proven, speed Guess |
| 10 | `kroma test` (and `kroma audit`), Winch for dev uploads, typed host errors, point schemas | the native test path, slow NAS dev loops, string errors | S to M each | low | Proven for compile times, spike 6 |
| 11 | Cleanup: `settings.get`, `refuse_native`, `outside_native`, the native-build checks, and `kroma:module@0.2.0` once no first-party bundle needs it | about 270 lines plus the old world | S | a third-party bundle still on `@0.2.0` | Read |

Steps 1 to 4 change nothing a module author sees. Steps 5 and 6 are the interface break,
taken together if possible so that authors rebuild once.

## What this costs

- The project gains a second version of its WIT world, `kroma:module@0.3.0`, and keeps
  `@0.2.0` linked for a while.
- The guest SDK changes executor. Every first-party module is touched in step 6: about 60
  call sites in all.
- Component async is young in wasmtime. A regression there lands on us, so the blocking path
  stays until the async one has run on the NAS for a release.
- WireGuard in the host is a protocol implementation the core then owns. It names a
  protocol, not a vendor or a module, so it passes the rule in
  `docs/module-plugin-model.md`.

## Compatibility

- Installed bundles (schema 3, world `kroma:module@0.2.0`) keep working through steps 1 to
  4. Step 2 reads the new manifest fields when they are present, and an older bundle keeps
  running its own lifecycle until its next release.
- From step 5 the host links both worlds. A bundle built against `@0.3.0` sets
  `engines.server` to the release that ships it.
- Third-party authors rebuild against the new SDK to move to `@0.3.0`. A bundle still on
  `@0.2.0` keeps running until step 11, which waits for a stated release.

## Alternatives

- **Do nothing.** Each new long call needs its own workaround (a `curl`, a program, a split
  pass), and each per-instance side effect is a bug waiting for a second instance.
- **One instance per request, as `wasmtime serve` does.** It fits stateless HTTP handlers.
  It does not fit a VPN, a torrent engine or anything that keeps state between calls.
- **Native processes with an OS sandbox.** The NAS has no Landlock, no seccomp and no user
  namespaces, so WebAssembly is the only isolation it can enforce.
- **Keep `fetch` and SOCKS, make the imports async.** Smaller, and it fixes the hold. It
  keeps a client nobody else uses, a `curl` per call, and two decisions. See the table in
  section 2.
- **Wait for WASI 0.3.** Steps 1 to 5 need nothing from it, and step 6 needs only component
  async, which wasmtime 50 already runs.

## Unresolved

- Whether a third-party module must use component async, or may keep blocking calls for
  good. The owner decides after step 6 has run a release.
- Where WireGuard lives (the host, or a component behind a host-owned `wasi:sockets/tcp`).
  This RFC recommends the host. Decided in the PR for step 8.
- The future of `cloudflared`.
- Every J3455 figure. The perf spike (Appendix A, 3) should be rebuilt for
  `x86_64-unknown-linux-musl` and run on the DS918+ before step 9 is planned.

## Appendix A: the spikes

All ran on 2026-11-02 on an M2 Max (load average up to 24 from other work), Rust 1.98,
wasmtime 50.0.1, targets `wasm32-wasip2` and `aarch64-apple-darwin`. None is in this PR.

1. **Concurrent calls in one instance.** WIT with `wait: async func` imported and
   `handle: async func` exported. Guest on wit-bindgen 0.63 with `spawn_local`. Host with
   `component-model-async`, one `run_concurrent` loop fed by a channel. Results in
   section 1.
2. **Sockets.** Guest on tokio 1.54 `rt,net,time` with `--cfg tokio_unstable`, host
   `wasmtime-wasi` 0.2 with `allow_tcp`, `allow_ip_name_lookup` and a logging
   `socket_addr_check`. 2b links the host's own `wasi:sockets/ip-name-lookup@0.2.12` over
   the stock one (`Linker::allow_shadowing`), because the stock `ResolveAddressStream` has
   a private field (`p2/ip_name_lookup.rs:13`).
3. **Throughput.** `sha1` 0.10, `sha2` 0.10 and `chacha20poly1305` 0.10 natively and as a
   component, best of 5 interleaved runs.
4. **Compile checks.** boringtun 0.6 and 0.7.1 with smoltcp 0.12, and librqbit 8.1.1 with
   each TLS feature, `cargo check --target wasm32-wasip2`.
5. **`wasi:http`.** Guest on `wstd` 0.6.8, host on `wasmtime-wasi-http` 50.0.1 with a
   `send_request` hook that reads and strips a `kroma-purpose` header, refuses an
   undeclared host and forwards the rest with `default_send_request`.
6. **Compile time.** `Engine::precompile_component` on the indexer's debug and
   `release-kmod` components, with Cranelift at default, without optimisation, and with
   Winch, each with and without parallel compilation.
