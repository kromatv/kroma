# Module security

How KROMA contains a module: what a module may do, how it says so, and what
stops it from doing more. Networking itself is in [networking](networking.md).
The reasoning is in [RFC NNNN](rfcs/NNNN-network-firewall.md).

## What we defend against

A module is a native program written by someone else and installed by the
operator. It may be malicious, or become malicious in an update. KROMA's users
include people for whom a leaked address, a leaked tracker name or a list of what
they watch is a real danger, so the bar is: **a module can do what it declared and
the operator accepted, and nothing else, and every attempt to do more is
visible.**

Out of scope: root on the host, a compromised core binary, kernel exploits.

## Permissions

A module declares everything it needs in `module.json`, the way a Deno program
is started with `--allow-net` or `--allow-read`. What is not declared is denied.
The install screen lists every permission in plain words before the operator
accepts, and an update that asks for more asks again.

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
| `net.host` | the host's network, outside the sandbox | for LAN multicast (mDNS, SSDP) and for a network provider's own tunnel. Shown in red, official registry only by default |
| `fs.read`, `fs.write` | named roots, never raw paths | `module` (its own data), `media` (library roots, read-only), `downloads`, `temp` |
| `run` | binaries it may start | anything it starts inherits its sandbox and its permissions |
| `env` | environment variables beyond the allowlist | the server's own variables, secrets included, are never passed |

These sit beside the declarations that already exist and keep working:

- `storage`: the slice of the core database a module may touch, enforced per
  connection by SQLite's authorizer.
- `settings.read` / `settings.write`: the settings keys it may read or write
  through the host API.
- `consumes`, `contributes`, `definesPoints`: the points it may call and the ones
  it answers.

A denied operation fails with an error that names the missing permission
(`net.connect: tracker.example.org:443 for purpose "indexer" is not declared`)
and is recorded, so a module author sees what to declare and an operator sees what
was attempted.

## How each permission is enforced

The supervisor picks the strongest tier the platform allows (see
[networking](networking.md#enforcement)). This is what each tier makes real:

| | Strict, namespace | Strict, one user | Watch |
|---|---|---|---|
| `net` | network namespace with only loopback; the gateway on a Unix socket is the only way out | nftables drops every packet of the module's uid except to its gateway port | the gateway decides what goes through it; `/proc` is scanned for sockets that do not |
| `fs` | mount namespace: only the declared roots are mounted | file ownership: the module's uid owns its own data and nothing else | not enforced |
| `run` | only what is mounted can be started | not enforced | not enforced |
| `env` | always: the supervisor builds the environment from an allowlist | always | always |
| `storage`, `settings`, points | always: checked by the core on every call | always | always |

Watch is honest about what it is: it records and can stop a module that goes
around the gateway, but it cannot prevent a connection that opens and closes
between two scans. An operator can refuse to run third-party modules outside a
strict tier.

## Identity

A module never chooses who it is. The supervisor mints, per module, per server
run:

- a **module token**, which the module presents when it calls back into the core
  (`KROMA_MODULE_TOKEN`). It names the module, and every host API answer is
  scoped by that name: its settings declaration, its points, its storage grant.
- a **port token**, which the module's own routes accept (`KROMA_HOST_TOKEN`). The
  core calls the module with it, and hands it to another module only when that
  module consumes a point this one serves. A port token authenticates no
  callback, so holding another module's port token does not let you act as that
  module.

The core's own fabric token is never given to a module. A module that asks the
core for a point it neither consumes nor defines gets nothing, and the request is
written on its log.

## The seam between the core and a module

- Host API callbacks (`/api/_host/*`) answer only a loopback peer, refuse any
  request carrying a forwarding header (a tunnel or a reverse proxy on the same
  machine adds one), and require a token the supervisor minted.
- Registering a job or an event subscription requires a token minted for the
  module the request names.
- Under strict enforcement the seam moves to Unix sockets in a directory only the
  core and that module can reach, so there is no port to steal while a module
  restarts.

## Auditing a module on its own

Every module can be analysed without the rest of the server:

- **In the dashboard**, Admin → Modules → a module shows its declared permissions
  next to what it actually did: its connections, destinations, refusals, and
  anything it attempted outside its declaration.
- **From the command line**, `kroma audit <module>` starts the module alone, in the
  sandbox, behind a recording gateway, drives its routes and jobs, and prints
  every connection and file access it attempted against what it declared. CI runs
  it on every first-party module, and a third-party author runs it before
  publishing.

## Testing that nothing leaks

Containment is tested, not assumed. The leak suite starts a process in each tier
and has it try every way out it can: TCP and UDP to the internet and the LAN,
IPv6, ICMP, DNS straight to the configured resolver, the host's loopback ports
(the core, the VPN bridge), abstract and pathname Unix sockets outside its own
directory. Each attempt must fail and be recorded. The suite runs in CI wherever
the runner offers namespaces, and the build says so when it does not.

## Status

| Piece | State |
|---|---|
| Per-module module and port tokens, declared-only point resolution | in review |
| Environment allowlist for sidecars | in review |
| Host API refuses relayed traffic | in review |
| Network namespace primitive | in review, not yet wired |
| `permissions` in the manifest, consent screen, denial errors | planned |
| Strict tiers wired into the supervisor, Watch scanner | planned |
| Filesystem and `run` enforcement | planned |
| `kroma audit`, per-module network view | planned |
| Leak test suite in CI | planned |
