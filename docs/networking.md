# Networking and routing

How KROMA reaches the network: who may open a connection, which way it goes,
what is recorded, and what keeps a module from going around it. The design and
its reasoning are in [RFC 480](rfcs/480-network-firewall.md). This page says
how it works.

Part of this is on `main` and part is planned. The [status table](#status) at
the end says which, and the text below describes the design they build to.

## The rule

**Every connection leaves through one door, named, decided and recorded.** The
core and every module open their connections through that door. A connection the
door did not decide does not happen. A module has no other route: it is a
WebAssembly component with no socket of its own. The exception is a program a
first-party module starts with the host's network (`net.host`), and its manifest
says so.

Three questions are asked of every connection, in this order:

1. **Who is calling?** The core, or a module id. This always comes from a
   credential the server minted, never from anything the caller says.
2. **Why?** A purpose the caller declared, such as `metadata`, `peers` or
   `indexer`. A purpose covers its dotted children: whatever names `metadata`
   also reaches `metadata.discover`, never `metadatax`.
3. **Where to?** A host name or an address, and a port.

The answers pick a **route**: `direct`, one of the **networks** a module
provides (a VPN, for example), or `block`.

## The pieces

```
 core code          module (WebAssembly component)
     |                     |
  Fetch ---------------- net.fetch / a program's SOCKS5
     |                     |
     |     egress gate ----+---- the policy: decide(caller, purpose, host)
     |                     |
     +------> egress gateway (kroma-egress, SOCKS5) <---- loopback, one per module
                  |            |              |
               direct     network: vpn     blocked
                  |            |
              internet    VPN module's SOCKS5 bridge -> WireGuard -> internet
```

- **`kroma_http::Fetch`** is the HTTP client of the core and of every module. It
  runs `curl` with every option on stdin, never in argv, so no secret shows up in
  `ps`. It starts curl with `-q`, so a planted `~/.curlrc` cannot rewrite a
  request, and limits every request and redirect to `http` and `https`. A request
  names its purpose with `Fetch::purpose`. In a component, `Fetch` is the
  `net.fetch` import, and the host runs the call.
- **The egress gate** is a hook in `kroma_http` that every `Fetch` asks before
  curl runs. In the core it calls the policy directly. For a component, the host
  asks the policy before it carries the call.
- **The egress gateway** (`server/crates/kroma-egress`) is a SOCKS5 server run by
  the core. It is the door for every call the host carries for a component, and
  for a program a module starts, such as the torrent engine. Each
  connection authenticates: the SOCKS5 password names the caller, the username
  carries the purpose. An anonymous connection is refused before it can name a
  destination. The gateway asks the policy, dials direct or through a network,
  relays the bytes, and reports the connection when it closes.
- **The policy** (`services/network` in the engine) holds the operator's rules
  and the guards no rule can relax.
- **The journal** records every connection. See
  [what is recorded](#what-is-recorded-and-what-never-is).
- **The component host** gives a module no network of its own, so the policy and
  the gateway are its only way out. See [module security](module-security.md).

## Deciding a connection

The policy evaluates, in order. A module's call meets its own declaration
first: when it declares `permissions` and its `net.connect` does not cover the
call, the call is refused with the rule `permission:net.connect`, and no rule
can allow it.

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
   (exact, or `*.example.org` for the domain and its subdomains), address range
   and port. Its action is the route: `direct`, a network's name, or `block`.
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

- A module provides networks by answering the core-called point `network`
  (#491). For each network it describes a name, a SOCKS5 endpoint on loopback,
  with credentials, that the gateway dials, whether it carries UDP, and its
  health with the exit address.
- Only the gateway dials a network. The endpoint asks for credentials, so a
  module cannot use a tunnel the rules did not send it to.
- A rule names a network as its action. Several networks can run at once, so the
  torrent engine can leave through one country and the indexers through another.
- A network can carry another one: a Tor module can dial its entry nodes through
  the VPN network. That is a rule on the Tor module's own traffic, nothing more.

The VPN module answers `network` with the tunnels it runs. The module that
consumes a network does not pick it, the rules do. See
[network modules](network-modules.md) for how to write one.

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

A public address is tallied under the host `*`, never as itself: a torrent's
peers are thousands of addresses a day, and the list says what a household
downloads. The in-memory connections keep the address.

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
| `kroma-module-supervisor/src/proxy.rs` | reqwest client | The reverse proxy into a module, on its Unix socket only |
| `kroma-module-supervisor/src/component/lan.rs` | UDP send | One SSDP search of the local network, for a module that declares `ssdp` |
| `kroma-egress/src/gateway.rs`, `upstream.rs` | TCP connect | The gateway itself, dialling once the policy has routed the connection |
| `kroma-engine/src/services/email/smtp.rs` | lettre SMTP transport | It asks the gate with the purpose `email` and records the exchange |
| `kroma-engine/src/services/notify/push/deliver/tests.rs`, `kroma-egress/src/gateway/tests.rs` | TCP connect | Tests, to a server the test started on loopback |

Code behind `cfg(target_os = "linux")` is only linted where it compiles. Clippy
on macOS does not see it, and CI's Linux job does.

`server/clippy.toml` does not reach the module workspaces: clippy looks for it
in the folders above the crate, and `modules/` is not under `server/`. A module
is held at run time instead: a component opens no socket, so every call it makes
goes through the host.

## Before the gate is installed

Boot installs the network policy when it builds the app state, before the
supervisor starts a module and before any background job runs. With no gate,
`kroma_http` lets a call go where its builder says, so in the server a call
made earlier would go direct and leave no journal row. It does not:

- The server binary calls `kroma_http::egress::require_gate` first thing in
  `main`. Until the gate is installed, every call that asks it (`Fetch`, the
  registry client, SMTP) is refused with "blocked by the network policy: it is
  not installed yet", and nothing is sent.
- An exchange recorded before the journal exists is kept, the first 256 of
  them, and journaled once the journal starts, at the time the call finished.
  A refusal of this kind shows the route `blocked`, no rule, and that error.

A test never calls `require_gate`, so there a call with no gate still goes
where its builder says. A component's calls are decided by the host, and the
supervisor starts no module before the gate is installed.

## The gateway

Every module gets its own gateway: a SOCKS5 endpoint the core serves on a
loopback port (#484). It answers only that module's token, sent as the SOCKS5
password, which the component never holds. The username is the purpose, dotted
children included, then `.public` when every address must be public and `.vpn`
when the connection must take the VPN or fail. The gateway reads only those
trailing flags, so `metadata.discover.vpn` is ruled as `metadata.discover`.

The gateway asks the same policy as the gate, so a connection is ruled by the
module's `net.connect` and then by the operator's rules. A `direct` route dials
from the core, checking every address a name resolves to. A `vpn` route hands the
name to the VPN's bridge with its credentials, so it resolves inside the tunnel.
Each connection goes into the journal under `CONNECT`, whoever opened it.

The host carries a component's `net.fetch` through it once the policy answered,
so a refusal names its reason, and the gateway rules again on every redirect hop.
The fetch then reports its method and status, which only add to the connection
the gateway already filed. A program a module starts reaches the gateway through
`{gateway:<purpose>}` in an argument or a variable, which the host replaces with
the SOCKS5 URL and its token.

Peers are ruled the same way. The torrent engine (`rqbit`) dials them through the
gateway with or without a VPN. Being sealed is a separate setting: behind a VPN the session
also turns off DHT, its trackers and its listener, and without one it keeps them,
outside the gateway until a network can carry UDP (#512).

## Enforcement

Deciding is not enough: something has to make the decision binding. A module is a
WebAssembly component with no network of its own. Its only network imports are
the policy and its gateway, and `lan` for what `net.discovery` declares. That is
the same on every platform, so there is no tier to pick and nothing to watch for.
See [module security](module-security.md#how-each-permission-is-enforced).

A program a first-party module starts is a host process. Given
`{gateway:<purpose>}`, its connections are ruled and journaled like the
component's. `wireproxy` and `cloudflared` reach the internet from the host,
which their module's `net.host` declares. See
[what the component does not contain](module-security.md#what-the-component-does-not-contain).

The core and a module reach each other over Unix sockets under `<data>/run`
(#485), so no module binds a port.

## The VPN and BitTorrent

The torrent engine is the hardest caller to contain, so it gets a section.

Behind the VPN, only peer TCP dialled through the bridge is sealed. Everything
else a BitTorrent client does by default leaves from the real address. So when a
VPN is configured the engine runs with:

- no DHT, no UDP trackers, no uTP;
- no listener on the host's interfaces;
- none of rqbit's own tracker clients;
- IPv4 only, because the bridge is.

Peers come from the module's own tracker announce, sent through the bridge with
the proxy resolving the names, from magnet trackers too, under the session's own
peer id (fresh at each start), plus peer exchange. A `.torrent` link goes
through the tunnel unless its host is on the LAN, and is refused while the VPN is
configured but down. The trade-off is fewer peers until a network can carry UDP.

Local Service Discovery and UPnP port forwarding are off in every session, VPN
or not.

## Status

| Piece | State |
|---|---|
| Fetch: proxy resolves names, `NO_PROXY` overridden, `-q`, web protocols only, `public_only`, `is_local` | on `main` (#500) |
| Torrent engine and indexers sealed behind the VPN, fail closed | on `main` (#501) |
| VPN bridge requires credentials | on `main` (#503) |
| Per-module tokens, declared-only module calls, environment allowlist | on `main` (#503) |
| Egress gate, purposes, policy, rules with `direct`, `vpn` or `block`, journal, admin API | on `main` (#516) |
| Admin → Réseau dashboard | on `main` (#517) |
| Gateway wired into the core for module traffic | on `main` (#484) |
| Module seam on Unix sockets | on `main` (#539) |
| A socket the gateway listens on for a module (`net.listen`) | dropped: a component cannot listen, and a program it starts listens itself (#550) |
| Strict tier by uid and nftables under Docker, Watch scanner | dropped: no module is a native process (#489, #490) |
| `network` point, several networks at once, rules that name one or match a port or address range | on `main` (#491) |
| WireGuard tunnels in the gateway | not done: `wireproxy` stands in for it (#512) |
| Network middleware | planned (#493) |
| A network that carries UDP | planned (#512) |
| ffmpeg and ffprobe open local inputs only | on `main` (#515) |
| A call that skips the gate fails CI, and SMTP mail asks the gate as `email` | on `main` (#541) |
| A call made before boot installs the gate is refused, and journaled once the journal starts | on `main` (#545) |
| Every first-party module declares its permissions, and the core enforces `net.connect` on the calls it is asked about | on `main` (#546) |
| Every module a WebAssembly component, one bundle for every platform | on `main` (#510, #511) |
| Escape suite on Ubuntu, macOS and Windows | on `main` (#523) |
| LAN discovery as a host capability | on `main` (#552) |
| Remote tunnel | a `cloudflared` helper the host runs, outside the gateway: it honours no proxy for its edge connection (#553) |
| Torrent engine as a component at full speed | not done: `rqbit` stands in for it (#514) |
| A native bundle refused from every registry and from an upload | on `main` (#513) |
