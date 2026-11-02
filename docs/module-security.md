# Module security

How KROMA contains a module: what a module may do, how it says so, and what
stops it from doing more. Networking itself is in [networking](networking.md).
The reasoning is in [RFC 480](rfcs/480-network-firewall.md). The
[status table](#status) at the end says what is built.

## What we defend against

A module is a program written by someone else and installed by the
operator. It may be malicious, or become malicious in an update. KROMA's users
include people for whom a leaked address, a leaked tracker name or a list of what
they watch is a real danger, so the bar is: **a module can do what it declared and
the operator accepted, and nothing else, and every attempt to do more is
visible.**

Out of scope: root on the host, a compromised core binary, kernel exploits.

## Permissions

A module declares everything it needs in `module.json`, the way a Deno program
is started with `--allow-net` or `--allow-read`. What is not declared is denied.
The block is an optional field of the manifest (#508), and every
first-party module declares one. The core enforces `net.connect` on every call a
component makes and every connection through its gateway (#546). A module with
no block has no network and starts no program, and the admin marks it.

The install screen lists every permission in plain words before the operator
accepts, from the catalog row or, for an upload, from the bundle itself. An update
that asks for more waits: no automatic or batch update takes it, and the operator
accepts it from the install plan. A bundle must declare what its catalog row showed,
and an install fails when it does not.

```json
"permissions": {
  "net": {
    "connect": [
      { "purpose": "indexer", "to": ["setting:indexerUrls"], "ports": [80, 443] },
      { "purpose": "peers", "to": ["public"], "proto": ["tcp"] },
      { "purpose": "download-client", "to": ["lan"] }
    ],
    "discovery": ["ssdp"],
    "host": false
  },
  "fs": { "read": ["media", "downloads"], "write": ["module", "downloads"] },
  "run": ["ffmpeg"],
  "env": ["KROMA_EMBED_MODEL_DIR"]
}
```

| Permission | Grants | Notes |
|---|---|---|
| `net.connect` | connections for a purpose to a set of destinations | `to` is `public`, `lan`, a host pattern, or `setting:<key>`, which makes the operator's own configuration the allowlist |
| `net.discovery` | `mdns` to publish a service, `ssdp` to search for devices | the host sends and listens for the module, which holds no socket |
| `net.listen` | a port a program the module starts listens on | a component cannot listen. Shown at consent, and an update that adds one asks again |
| `net.host` | the host's network, for the programs the module starts | a tunnel (`wireproxy`, `cloudflared`) and the torrent engine reach the internet from the host. Shown in red |
| `fs.read`, `fs.write` | named roots, never raw paths | `module` (its own data), `media` (library roots, read-only unless `fs.write` names it, as an importer's does, and always read-only when one holds the server's data folder), `downloads`, `temp` (every module gets a private `/tmp`) |
| `run` | programs it may start, by name | first-party modules only. What starts is a process of the host, see [below](#what-the-component-does-not-contain) |
| `env` | environment variables beyond the allowlist | the server's own variables, secrets included, are never passed |

These sit beside the declarations that already exist and keep working:

- `storage`: the slice of the core database a module may touch, enforced per
  connection by SQLite's authorizer, in the host.
- `settings.read` / `settings.write`: the settings keys it may read or write
  through the host API.
- `consumes`, `contributes`, `definesPoints`: the points it may call and the ones
  it answers.
- `helpers`: the pinned upstream build, per `<os>-<arch>`, of a program `run`
  names: a `url`, its `sha256`, and the `member` to take from a `.tar.gz`.
- `component`: `instances` answering at once (default 1, and they share no
  memory), `memoryMib` one may grow to (default 512) and `cpuSeconds` one call
  may spend (default 60).
- `dataDirs`: directories under the data directory that hold the module's state.
  Only a module the official registry shipped gets them; any other keeps its
  state in its own directory.

A call or connection that a module's `net.connect` does not cover fails with an error that
names the missing permission
(`net.connect: tracker.example.org:443 for purpose "indexer" is not declared`)
and the rule `permission:net.connect`. The refusal goes in the journal like any
other blocked call, so a module author sees what to declare and an operator sees
what was attempted. A destination `setting:<key>` names is read from that setting
each time: a URL, or a list of them.

## How each permission is enforced

A module is a WebAssembly component run by wasmtime inside the server. It cannot
make a system call. It reaches the network, files, a database and other programs
only through the imports the host links into it (`kroma-wasm-host`, world
`wit/module.wit`), and each import answers within what the manifest declares.
That holds identically on every platform, because the operating system is not
what enforces it. See
[RFC 480](rfcs/480-network-firewall.md#the-same-isolation-on-every-platform).

| | How the host holds it |
|---|---|
| `net` | `net.fetch`, `fetch-all` and `download` go through the policy and the module's own gateway, and are journaled; `lan` answers only what `net.discovery` names |
| `fs` | WASI preopens: only the declared roots, read-only where declared |
| `run` | `process` starts only what `run` names, for a first-party module |
| `env` | only the declared variables exist |
| `storage` | the host holds both databases; the component has no SQLite |
| CPU, memory | a ceiling per instance |

**Network.** A component that declares no `permissions` has no network. The
policy decides a fetch first, and a refusal names its reason. An allowed fetch is
carried through the module's gateway, which rules again on every redirect hop. See
[networking](networking.md#the-gateway).

**Host API.** `host-api` reaches the core's `/api/_host/*` and a peer's
`/api/module/<id>/*`, and nothing else. The host adds the module token on the way
out, so the component never holds it.

**Database.** The component has no SQLite. `kroma-sqlite-guest` gives it
rusqlite's API and sends every statement to the `sql` import. The host holds the
module's own `module.sqlite`, which refuses `ATTACH` and every `PRAGMA` but a short
allowlist, and the slice of the core database `storage.core` grants, enforced by
SQLite's authorizer in the host. A module that declares no `storage` has no database:
the host refuses every `sql.open`.

**Files.** The host preopens folders at the same paths they have on the host: the
module's own folder, its `dataDirs` (first-party only), the media roots when it
declares `media`, and a private `/tmp`. A directory an absolute path in a
`permissions.env` variable names is preopened read-only. A first-party module
that declares `downloads` holds `/`, because a download client reports where a
torrent landed and nobody can list those paths ahead of time. It also holds the
data folder and the media roots at their own paths: WASI refuses a symlink whose
target is absolute even under `/`, and Synology's `/var/packages/kroma/var` is
one. `files.canonical`
and `files.copy` (a reflink where the filesystem has one) cover what WASI lacks,
inside the same folders.

**Programs.** `process` starts only a program `run` names, and only for a
first-party module: a third-party module never starts one. A program pinned under
`helpers` is fetched by the host, through the gateway under the purpose
`binary-download`, checked against its `sha256`, and kept in
`<data>/helpers/<id>/`, a folder no module can write. Only `ensure` downloads;
starting never does. An argument holding `{gateway:<purpose>}` becomes a SOCKS5
URL to the module's gateway, with a token the component never sees. A program
starts from the environment allowlist, plus what `KROMA_MODULE_ENV` names. Its
children stop with the module, and what a crashed server left running is stopped
at the next start.

**Discovery.** `lan` publishes over mDNS and searches over SSDP for a module that
declares `net.discovery`, and refuses the one it did not declare.

**Limits.** A call that traps or runs past a limit costs that instance, the
failure goes on the module's log, and the next call gets a fresh one. `cpuSeconds`
counts the call's own CPU time, not the time it waits on an import. An instance
starts when the module does, so `on_enable` runs without a first call, and work it
leaves running advances on a 100 ms tick. Stopping runs `on_disable`.

### What the component does not contain

The helper programs. Each is a process of the host, run as the server's user, and
wasm holds none of them:

| Module | Runs | For |
|---|---|---|
| `tv.kroma.vpn` | `wireproxy` | the WireGuard tunnel, which dials its endpoint over UDP from the host |
| `tv.kroma.remote` | `cloudflared` | the remote tunnel, which dials Cloudflare's edge from the host |
| `tv.kroma.torrents` | `rqbit` | the torrent engine. Its TCP peers go through the gateway, its SOCKS proxy. When it must stay behind a network, DHT, rqbit's own trackers and uTP are off, and the module announces through the gateway itself |
| `tv.kroma.torrents` | `curl` | rqbit's own API on loopback, for an add that waits on metadata |
| `tv.kroma.whisper` | `ffmpeg` | decoding an audio track to PCM |

Each is declared in `run`, pinned under `helpers` where it is downloaded, and
shown at consent. Only a first-party module may start one. WireGuard inside the
gateway (#512) and the torrent engine as a component at full speed (#514) would
retire `wireproxy` and `rqbit`. Neither is done.

## Identity

A module never chooses who it is. The supervisor mints, per module, per server
run (#503):

- a **module token**, which names the module on a call back into the core. The
  host adds it to every `host-api` call to `/api/_host/*`, and the component
  never holds it. Every host API answer is scoped by that name: its settings
  declaration, its points, its storage grant.
- a **port token**, which the module's own routes accept (`KROMA_HOST_TOKEN`). The
  core calls the module with it, and hands it to another module only when that
  module's manifest consumes or defines a point this one answers. A port token
  authenticates no callback, so holding another module's port token does not let
  you act as that module.

The core's own fabric token is never given to a module. A module that asks the
core for a point it neither consumes nor defines gets nothing, and the request is
written on its log.

## The seam between the core and a module

- A module is served on `modules/<id>/module.sock` under `<data>/run`, in a
  directory only the server's user can open (#485). No module binds a port.
- `host-api` calls reach `host.sock`, which serves the host callbacks and the
  proxy to a peer module and nothing else, so a module there is never answered
  as a local client of the server (pairing, handoff, the origin and same-network
  checks). A peer is always reached through that proxy.
- Host API callbacks (`/api/_host/*`) are served on `host.sock` only, never on
  the core's TCP listener, and require a token the supervisor minted (#503).
- Registering a job or an event subscription requires a token minted for the
  module the request names (#503).

## Auditing a module on its own

Both tools are planned. Once they ship, every module can be analysed without the
rest of the server:

- **In the dashboard** (#496), Admin → Modules → a module shows its declared
  permissions next to what it actually did: its connections, destinations,
  refusals, and anything it attempted outside its declaration.
- **From the command line** (#495), `kroma audit <module>` starts the module
  alone behind a recording gateway, drives its routes and jobs, and prints every
  connection and file access it attempted against what it declared. CI runs it on
  every first-party module, and a third-party author runs it before publishing.

## Testing that nothing leaks

Containment is tested, not assumed. `kroma-wasm-host/tests/escape.rs` has a
component try to read a path the host process can, open a TCP socket, resolve a
name and read an environment variable the host has, and each attempt must fail.
`limits.rs` holds an instance to its memory ceiling and CPU budget. CI runs both
on Ubuntu, macOS and Windows. The `kroma-module-supervisor/tests/component_*.rs`
suites run components under the real supervisor: a call goes through the gateway and into
the journal, a component with no `permissions` has no network, one reads only the
core tables it declared, and a third-party one starts no program, even one it
declared.

## Status

| Piece | State |
|---|---|
| Per-module module and port tokens, declared-only point resolution | on `main` (#503) |
| Environment allowlist for the programs a module starts | on `main` (#503) |
| `permissions` in the manifest | on `main` (#508) |
| Every first-party module declares its `permissions`; `net.connect` enforced on the calls a module asks about, naming the missing permission | on `main` (#546) |
| Consent and re-consent screens, a banner on a module that declares nothing | on `main` (#487) |
| Every module's connections through its own gateway, ruled and journaled | on `main` (#484) |
| Host API refuses relayed traffic | on `main` (#503) |
| Module seam on Unix sockets | on `main` (#539) |
| Every module a WebAssembly component, one bundle for every platform; manifest schema 3 | on `main` (#510, #511) |
| A native bundle refused from every registry and from an upload | on `main` (#513) |
| Filesystem and `run` held by the component host; programs for first-party modules only | on `main` (#488) |
| Storage grants enforced in the host; the component holds no database file | on `main` (#555) |
| Acquisition and torrents link no core engine | on `main` (#551) |
| LAN discovery as a host capability | on `main` (#552) |
| Remote tunnel | a `cloudflared` helper the host runs, not a host capability (#553) |
| ffmpeg and inference | inference runs inside the component; whisper starts `ffmpeg` as a program (#554) |
| WireGuard inside the gateway | not done: `wireproxy` stands in for it (#512) |
| Torrent engine as a component at full speed | not done: `rqbit` stands in for it (#514) |
| Strict tier by uid, Watch scanner | dropped: no module is a native process (#489, #490) |
| Escape suite on Ubuntu, macOS and Windows | on `main` (#523) |
| Per-module network view | planned (#496) |
| `kroma audit` | planned (#495) |
