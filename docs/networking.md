# Networking and routing

How KROMA reaches the network: who may open a connection, which way it goes,
what is recorded, and what keeps a module from going around it. The design and
its reasoning are in [RFC 480](rfcs/480-network-firewall.md). This page says
how it works.

None of this is on `main` yet. The [status table](#status) at the end says which
pieces are in review and which are planned, and the text below describes the
design they build to.

## The rule

**Every connection leaves through one door, named, decided and recorded.** The
core and every module open their connections through that door. A connection the
door did not decide does not happen. Under strict enforcement a module has no
other route. Where the platform cannot enforce that, the server says so and watches
for connections that go around it.

Three questions are asked of every connection, in this order:

1. **Who is calling?** The core, or a module id. This always comes from a
   credential the server minted, never from anything the caller says.
2. **Why?** A purpose the caller declared, such as `metadata`, `peers` or
   `indexer`.
3. **Where to?** A host name or an address, and a port.

The answers pick a **route**: `direct`, one of the **networks** a module
provides (a VPN, for example), or `block`.

## The pieces

```
 core code          module sidecar (sandboxed)
     |                     |
  Fetch ---------------- Fetch / any library
     |                     |
     |     egress gate ----+---- asks the core: decide(caller, purpose, host)
     |                     |
     +------> egress gateway (kroma-egress, SOCKS5) <---- Unix socket / loopback
                  |            |              |
               direct     network: vpn     blocked
                  |            |
              internet    VPN module's SOCKS5 bridge -> WireGuard -> internet
```

- **`kroma_http::Fetch`** is the HTTP client of the core and of every module. It
  runs `curl` with every option on stdin, never in argv, so no secret shows up in
  `ps`. It starts curl with `-q`, so a planted `~/.curlrc` cannot rewrite a
  request, and limits every request and redirect to `http` and `https`. A request
  names its purpose with `Fetch::purpose`.
- **The egress gate** is a hook in `kroma_http` that every `Fetch` asks before
  curl runs. In the core it calls the policy directly. In a module it asks the
  core over the host API, caches the answer for a few seconds, and refuses the
  request when the core cannot be reached.
- **The egress gateway** (`server/crates/kroma-egress`) is a SOCKS5 server run by
  the core. It is the door for everything that is not a `Fetch`: a BitTorrent
  engine, a library with its own HTTP client, a binary a module starts. Each
  connection authenticates: the SOCKS5 password names the caller, the username
  carries the purpose. An anonymous connection is refused before it can name a
  destination. The gateway asks the policy, dials direct or through a network,
  relays the bytes, and reports the connection when it closes.
- **The policy** (`services/network` in the engine) holds the operator's rules
  and the guards no rule can relax.
- **The journal** records every connection. See
  [what is recorded](#what-is-recorded-and-what-never-is).
- **The sandbox** (planned, #486) starts a module with no network of its own, so
  the gateway is the only way out. See [module security](module-security.md).

## Deciding a connection

The policy evaluates, in order:

1. **Guards.** Fixed. A rule cannot relax them.
   - A link-local address (`169.254.0.0/16`, `fe80::/10`, IPv4-mapped forms
     included) is never reachable. Cloud metadata services answer there.
   - A module never reaches this server's own listeners on this machine: its
     HTTP and HTTPS ports and the VPN bridge, whether written as an address or
     as `localhost`. It reaches the core and the other modules through the host
     API, which checks who is asking. A download client or FlareSolverr on
     another local port stays reachable.
   - A host on the local network (a private address, a single-label name,
     `.local`, `.lan`, `.home.arpa`, `.internal`, `localhost`) can only go
     direct, because a tunnel cannot reach it. A rule that sends one to a VPN
     resolves to direct.
2. **Rules**, first match wins. A rule matches on any of: caller, purpose, host
   (exact, or `*.example.org` for the domain and its subdomains), and, as the
   network work lands, address range and port. Its action is the route:
   `direct`, a network's name, or `block`. Until the `network` point lands the
   one network is `vpn`, so a rule's action is `direct`, `vpn` or `block`.
3. **The default action**: `allow` (direct) or `block`.

Then, depending on the decision:

- **A route to a network that is down is a refusal.** Nothing falls back to
  direct, ever, unless a rule says `direct`. A VPN that drops stops the traffic
  sent to it. Leaking it is not an option.
- **DNS follows the route.** A connection sent to a network passes the host name
  to that network, which resolves it on its own side. A direct connection is
  resolved by the gateway, and every address the name resolves to is checked
  against the guards before one is dialled, so a name cannot rebind to the LAN.
- **A redirect is a new connection**, decided again.

### Example rules

```json
{
  "defaultAction": "block",
  "rules": [
    { "id": "lan-clients", "caller": "tv.kroma.engine.qbittorrent", "purpose": "download-client", "action": "direct" },
    { "id": "swarm", "caller": "tv.kroma.torrents", "action": "vpn" },
    { "id": "indexers", "caller": "tv.kroma.indexer", "action": "vpn" },
    { "id": "tmdb", "host": "*.themoviedb.org", "action": "direct" },
    { "id": "tmdb-art", "host": "image.tmdb.org", "action": "direct" },
    { "id": "no-stats", "purpose": "stats", "action": "block" }
  ]
}
```

Read top to bottom: the qBittorrent daemon on the LAN is reached directly,
everything the torrent engine and the indexers send goes through the VPN or not
at all, metadata goes direct, anonymous statistics are blocked, and anything not
listed is blocked.

## Networks

A **network** is a way out that a module provides: a VPN tunnel, Tor, a
corporate proxy, a second VPN in another country. The core does not know what a
network is made of. It knows a name, how to dial it, and whether it is up.

The `network` point is planned (#491, #492). Once it lands:

- A module provides networks by answering the core-called point `network`. For
  each network it describes a name, a SOCKS5 endpoint the gateway dials (a Unix
  socket, or a loopback port with credentials), whether it carries UDP, and its
  health with the exit address.
- Only the gateway dials a network. The endpoint asks for credentials, so a
  module cannot use a tunnel the rules did not send it to.
- A rule names a network as its action. Several networks can run at once, so the
  torrent engine can leave through one country and the indexers through another.
- A network can carry another one: a Tor module can dial its entry nodes through
  the VPN network. That is a rule on the Tor module's own traffic, nothing more.

Until then the one network is `vpn`. The VPN module answers
`tv.kroma.vpn/proxy` with its bridge URL, the core resolves that point for a rule
whose action is `vpn` (#516), and the torrent and indexer modules still resolve it
themselves for the traffic that does not go through `Fetch`. The `network` point
replaces `tv.kroma.vpn/proxy`: the module that consumes a network no longer picks
it, the rules do. See [network modules](network-modules.md) for how to write one.

## What is recorded, and what never is

A journal row holds: time, caller, purpose, method, host, port, route (`direct`,
`vpn` or `blocked`), the deciding rule, status, bytes in each direction, duration
and error.

It never holds a URL path, a query string or credentials. That is where passkeys,
API keys and search terms live.

Host names are sensitive too, because they tell what a household downloads. So
the journal keeps two things, and neither for long:

- **Single connections.** The last 5,000, in memory only. A restart clears them.
- **Daily tallies.** One row per day, caller, purpose, host, route and verdict,
  with a count and the bytes each way. They are written to the database every
  30 seconds and kept 30 days. The database tidy job drops older days.

Reading the journal and its tallies, and reading or writing the rules, needs the
`settings.manage` permission. No permission is specific to the network pages.

## Nothing in the core goes around the gate

The gate only hears from a call that asks it. In the server workspace, code
that opens a connection another way fails CI:

- `server/clippy.toml` bans the raw clients and sockets: `reqwest::Client`,
  `reqwest::ClientBuilder` and `reqwest::get`, hyper-util's legacy client,
  lettre's SMTP transports and connections, and the `std::net` and
  `tokio::net` TCP connects and UDP sends. `bun run ci rust clippy` denies
  `clippy::disallowed_types` and `clippy::disallowed_methods`, so the job fails
  naming the lint, the line and the reason the file gives. A plain
  `cargo clippy` shows them as warnings.
- `kroma-http`'s `no_bypass` test fails with `file:line` on a
  `Command::new("curl")` anywhere under `server/` or `modules/` outside
  `kroma-http`.

A client that is not `Fetch` and still asks the gate calls
`kroma_http::egress::decide` (or `rule_url`) before it connects and
`kroma_http::egress::record` after. It refuses a proxy route rather than
going direct. The account emails do this with the purpose `email`, whether they
leave by SMTP or through the kroma.tv relay.

These are the allowed exceptions, and the only ones. Each carries an
`#[expect]` whose `reason` says why, except `curl.rs`, which the curl test
exempts:

| Where | Opens | Why it may |
|---|---|---|
| `kroma-http/src/curl.rs` | `curl` | It is `Fetch`, which asks the gate before curl runs |
| `kroma-http/src/loopback/tcp.rs` | hyper-util client | The loopback seam: it refuses any URL that is not plain http to a loopback address |
| `kroma-module-supervisor/src/registry.rs` | reqwest client | The module registry client: it asks the gate before every request and records the exchange |
| `kroma-module-supervisor/src/proxy.rs` | reqwest client | The reverse proxy into a sidecar, on `127.0.0.1` only |
| `kroma-egress/src/gateway.rs`, `upstream.rs` | TCP connect | The gateway itself, dialling once the policy has routed the connection |
| `kroma-engine/src/services/email/smtp.rs` | lettre SMTP transport | It asks the gate with the purpose `email` and records the exchange |
| `kroma-engine/src/services/notify/push/deliver/tests.rs`, `kroma-module-runtime/tests/boot.rs` | TCP connect | Tests, to a server the test started on loopback |

`server/clippy.toml` does not reach the module workspaces: clippy looks for it
in the folders above the crate, and `modules/` is not under `server/`. A module
is held to the gate at run time, by the gate in `kroma-module-runtime` and, once
it is wired, the sandbox.

## Enforcement

Deciding is not enough: something has to make the decision binding. The target
is the same everywhere. Modules are WebAssembly components with no network of
their own: their only network import is the policy itself. See
[module security](module-security.md#how-each-permission-is-enforced).

A native sidecar, while one remains, is a program that can open its own socket
unless the operating system stops it. For those, the server is to pick the
strongest tier the platform allows and show it under Admin → Réseau. None of
the tiers is wired yet (#486, #489, #490):

| Tier | Where | A module that ignores the gateway |
|---|---|---|
| Strict, one namespace per module | Linux with unprivileged user namespaces | has no route at all: its network namespace holds only loopback |
| Strict, one user per module | Docker (the image runs as root) with `NET_ADMIN` | is dropped by nftables, matched on its uid |
| Watch | Synology DSM, Docker without `NET_ADMIN`, macOS dev | is detected from `/proc` and reported, and can be stopped |

The details, and what each tier cannot do, are in
[module security](module-security.md).

## The VPN and BitTorrent

The embedded engine is the hardest caller to contain, so it gets a section.

Behind the VPN, only peer TCP dialled through the bridge is sealed. Everything
else a BitTorrent client does by default leaves from the real address. So when a
VPN is configured the engine runs with:

- no DHT, no UDP trackers, no Local Service Discovery, no uTP;
- no listener on the host's interfaces;
- none of librqbit's own tracker clients, whose proxy resolves names locally;
- IPv4 only, because the bridge is.

Peers come from the module's own tracker announce, sent through the bridge with
the proxy resolving the names, from magnet trackers too, under the session's own
peer id (fresh at each start), plus peer exchange. A `.torrent` link goes
through the tunnel unless its host is on the LAN, and is refused while the VPN is
configured but down. The trade-off is fewer peers until a network can carry UDP.

## Status

| Piece | State |
|---|---|
| Fetch: proxy resolves names, `NO_PROXY` overridden, `-q`, web protocols only, `public_only`, `is_local` | in review (#500) |
| Torrent engine and indexers sealed behind the VPN, fail closed | in review (#501) |
| VPN bridge requires credentials | in review (#503) |
| Per-module tokens, declared-only module calls, environment allowlist | in review (#503) |
| Egress gate, purposes, policy, rules with `direct`, `vpn` or `block`, journal, admin API | in review (#516) |
| Admin → Réseau dashboard | in review (#517) |
| `kroma-egress` gateway, not yet wired | in review (#507) |
| Network namespace sandbox primitive and its leak suite, not yet wired | in review (#507) |
| Gateway wired into the core for module traffic | planned (#484) |
| Module seam on Unix sockets | planned (#485) |
| Sidecars started in the sandbox | planned (#486) |
| Strict tier by uid and nftables under Docker | planned (#489) |
| Watch scanner | planned (#490) |
| `network` point and several networks | planned (#491, #492) |
| Network middleware | planned (#493) |
| A network that carries UDP | planned (#512, #494) |
| ffmpeg and ffprobe open local inputs only | in review (#515) |
| A call that skips the gate fails CI, and SMTP mail asks the gate as `email` | in review (#536) |
| WebAssembly component host, the spike | in review (#523) |
| Modules as WebAssembly components, the same isolation on every platform | planned (#510, #511, #514) |
| Only components from registries other than the official one | planned (#513) |
