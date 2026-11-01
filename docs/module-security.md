# Module security

How KROMA contains a module: what a module may do, how it says so, and what
stops it from doing more. Networking itself is in [networking](networking.md).
The reasoning is in [RFC 480](rfcs/480-network-firewall.md). Most of what follows
is design: the [status table](#status) at the end says what is built.

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
The block is an optional field of manifest schema 2 (#508), and every
first-party module declares one. The core enforces `net.connect` on every call a
module asks it to decide (#487). A module with no block, third-party or built
before #508, keeps the behaviour it had. The install screen that lists every
permission in plain words before the operator accepts, and asks again when an
update wants more, is planned (#487).

```json
"permissions": {
  "net": {
    "connect": [
      { "purpose": "indexer", "to": ["setting:indexerUrls"], "ports": [80, 443] },
      { "purpose": "peers", "to": ["public"], "proto": ["tcp"] },
      { "purpose": "download-client", "to": ["lan"] }
    ],
    "listen": [{ "purpose": "peers", "proto": ["tcp"], "port": "setting:rqbitPort" }],
    "host": false
  },
  "fs": { "read": ["media", "downloads"], "write": ["module", "downloads"] },
  "run": ["ffmpeg", "tar"],
  "env": ["KROMA_EMBED_MODEL_DIR"]
}
```

| Permission | Grants | Notes |
|---|---|---|
| `net.connect` | connections for a purpose to a set of destinations | `to` is `public`, `lan`, a host pattern, or `setting:<key>`, which makes the operator's own configuration the allowlist |
| `net.listen` | a listening socket the gateway opens on the module's behalf | the module never binds a host interface itself |
| `net.host` | the host's network, outside the sandbox | for LAN multicast (mDNS, SSDP), a network provider's own tunnel, and a tunnel binary that cannot dial through the gateway (cloudflared). Shown in red, official registry only by default |
| `fs.read`, `fs.write` | named roots, never raw paths | `module` (its own data), `media` (library roots, read-only unless `fs.write` names it, as an importer's does), `downloads`, `temp` |
| `run` | binaries it may start | anything it starts inherits its sandbox and its permissions |
| `env` | environment variables beyond the allowlist | the server's own variables, secrets included, are never passed |

These sit beside the declarations that already exist and keep working:

- `storage`: the slice of the core database a module may touch, enforced per
  connection by SQLite's authorizer.
- `settings.read` / `settings.write`: the settings keys it may read or write
  through the host API.
- `consumes`, `contributes`, `definesPoints`: the points it may call and the ones
  it answers.

A call that a module's `net.connect` does not cover fails with an error that
names the missing permission
(`net.connect: tracker.example.org:443 for purpose "indexer" is not declared`)
and the rule `permission:net.connect`. The module's report of the refusal puts
it in the journal like any other blocked call, so a module author sees what to
declare and an operator sees what was attempted. A destination
`setting:<key>` names is read from that setting each time: a URL, or a list of
them. The other permissions are declared but not yet enforced (#486, #488).

## How each permission is enforced

The target is the same on every platform. A module is a WebAssembly component
run by wasmtime inside the server. It cannot make a system call, and it reaches
the network, files and environment only through what the host links into it
for its declared permissions. That holds identically on Linux, macOS, Windows,
Docker and Synology, because the operating system is not what enforces it. See
[RFC 480](rfcs/480-network-firewall.md#the-same-isolation-on-every-platform).

| | WebAssembly component |
|---|---|
| `net` | the only network import goes through the policy and the gateway |
| `fs` | only the declared roots are preopened, read-only where declared |
| `run` | no process can be started; heavy work is a host capability |
| `env` | only the declared variables exist |
| CPU, memory | a ceiling per module |

A module from any registry other than the official one must be a component.
That is the target, and #513 makes the install refuse a native bundle from
anywhere else. Until #513 lands, a third-party native sidecar runs under the
strongest OS tier the platform offers, and the install screen says which.
Native sidecars from the official registry remain while modules move over,
labelled native and contained the same way
(see [networking](networking.md#enforcement)):

| | Strict, namespace | Strict, one user | Watch |
|---|---|---|---|
| `net` | network namespace with only loopback; the gateway on a Unix socket is the only way out | nftables drops every packet of the module's uid except to its gateway port | the gateway decides what goes through it; `/proc` is scanned for sockets that do not |
| `fs` | mount namespace: only the declared roots are mounted | file ownership: the module's uid owns its own data and nothing else | not enforced |
| `run` | only what is mounted can be started | not enforced | not enforced |
| `env` | always: the supervisor builds the environment from an allowlist | always | always |
| `storage`, `settings`, points | always: checked by the core on every call | always | always |

None of the three tiers is wired into the supervisor yet (#486, #489, #490).
A module on the legacy TCP seam stays outside every tier: it is reached on a
loopback port, which a module in its own network namespace cannot serve.
Once they are, Watch records and can stop a module that goes around the
gateway, but it cannot prevent a connection that opens and closes between two
scans, and an operator setting refuses third-party modules outside a strict
tier.

## Identity

A module never chooses who it is. The supervisor mints, per module, per server
run (#503):

- a **module token**, which the module presents when it calls back into the core
  (`KROMA_MODULE_TOKEN`). It names the module, and every host API answer is
  scoped by that name: its settings declaration, its points, its storage grant.
- a **port token**, which the module's own routes accept (`KROMA_HOST_TOKEN`). The
  core calls the module with it, and hands it to another module only when that
  module's manifest consumes or defines a point this one answers. A port token
  authenticates no callback, so holding another module's port token does not let
  you act as that module.

The core's own fabric token is never given to a module. A module that asks the
core for a point it neither consumes nor defines gets nothing, and the request is
written on its log.

## The seam between the core and a module

- The seam is Unix sockets under `<data>/run`, never a TCP port (#485). A
  module serves on `modules/<id>/module.sock`, in a directory only the server's
  user can open, and calls the core back on `host.sock`. No module binds a
  port, so there is none to steal while a module restarts, and a module in an
  empty network namespace can still reach the core through the filesystem.
  `host.sock` serves the host callbacks and the proxy to a peer module and
  nothing else, so a module there is never answered as a local client of the
  server (pairing, handoff, the origin and same-network checks).
- Host API callbacks (`/api/_host/*`) require a token the supervisor minted
  (#503). On the core's TCP listener they answer only a module on the legacy
  seam (below), only from a loopback peer, and never a request carrying a
  forwarding header (a tunnel or a reverse proxy on the same machine adds one).
  Anything else is answered 404, the fabric token included.
- Registering a job or an event subscription requires a token minted for the
  module the request names (#503).
- `kroma build` records the seam in the bundle (`"seam": "unix"` in its
  manifest). A bundle built against an SDK that predates the socket seam
  records none: it still runs, on a loopback port, and is labelled **legacy
  seam** in the admin. It can never be given a sandbox tier, because a module
  with no network cannot reach a port. It reaches a peer on a socket through
  the core's reverse proxy, with the same port token.
- Other processes of the server's own user can still open those directories
  until the filesystem is contained per module (#488, #489).

## Auditing a module on its own

Both tools are planned. Once they ship, every module can be analysed without the
rest of the server:

- **In the dashboard** (#496), Admin → Modules → a module shows its declared
  permissions next to what it actually did: its connections, destinations,
  refusals, and anything it attempted outside its declaration.
- **From the command line** (#495), `kroma audit <module>` starts the module
  alone, in the sandbox, behind a recording gateway, drives its routes and jobs,
  and prints every connection and file access it attempted against what it
  declared. CI runs it on every first-party module, and a third-party author runs
  it before publishing.

## Testing that nothing leaks

Containment is tested, not assumed. The leak suite starts a process in each tier
and has it try every way out it can: TCP and UDP to the internet and the LAN,
IPv6, ICMP, DNS straight to the configured resolver, the host's loopback ports
(the core, the VPN bridge), abstract and pathname Unix sockets outside its own
directory. Each attempt must fail and be recorded. The suite runs in CI wherever
the runner offers namespaces, and the build says so when it does not. The
namespace tier's suite is in review (#507); the other tiers are planned (#497).

## Status

| Piece | State |
|---|---|
| Per-module module and port tokens, declared-only point resolution | in review (#503) |
| Environment allowlist for sidecars | in review (#503) |
| Host API refuses relayed traffic | in review (#503) |
| Network namespace primitive, not yet wired | in review (#507) |
| `permissions` in the manifest | in review (#508) |
| Every first-party module declares its `permissions`; `net.connect` enforced on a module's calls, naming the missing permission | in review (#487) |
| Consent and re-consent screens, a banner on a module that declares nothing | planned (#487) |
| Sidecars started in the sandbox, strict tier by uid | planned (#486, #489) |
| Watch scanner | planned (#490) |
| Module seam on Unix sockets, legacy TCP seam for older bundles | in review (#485) |
| Filesystem and `run` enforcement | planned (#488) |
| Per-module network view | planned (#496) |
| `kroma audit` | planned (#495) |
| Leak test suite in CI, namespace tier | in review (#507) |
| Leak test suite in CI, the other tiers | planned (#497) |
| WebAssembly component host, the spike | in review (#523) |
| Modules as WebAssembly components on every platform | planned (#510, #511, #514) |
| Only components from registries other than the official one | planned (#513) |
