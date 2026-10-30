# Networking and routing

How KROMA reaches the network: who may open a connection, which way it goes,
what is recorded, and what keeps a module from going around it. The design and
its reasoning are in [RFC 480](rfcs/480-network-firewall.md). This page says
how it works.

Some of the pieces below are merged, some are in review, some are planned. The
[status table](#status) at the end says which is which. Nothing here describes a
behaviour as shipped before it is.

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
- **The journal** keeps the last 5,000 connections in memory and a daily
  aggregate in SQLite for 30 days.
- **The sandbox** starts a module with no network of its own, so the gateway is
  the only way out. See [module security](module-security.md).

## Deciding a connection

The policy evaluates, in order:

1. **Guards.** Fixed. A rule cannot relax them.
   - A link-local address (`169.254.0.0/16`, `fe80::/10`, IPv4-mapped forms
     included) is never reachable. Cloud metadata services answer there.
   - A module never reaches loopback directly. The core and the other modules
     are reached through the host API, which checks who is asking.
   - A host on the local network (a private address, a single-label name,
     `.local`, `.lan`, `.home.arpa`, `.internal`, `localhost`) can only go
     direct, because a tunnel cannot reach it. A rule that sends one to a VPN
     resolves to direct.
2. **Rules**, first match wins. A rule matches on any of: caller, purpose, host
   (exact, or `*.example.org` for the domain and its subdomains), and, as the
   network work lands, address range and port. Its action is `direct`, a network
   name, or `block`.
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

Today the VPN module answers `tv.kroma.vpn/proxy` with its bridge URL, and the
torrent and indexer modules choose to use it. The `network` point replaces that:
the module that consumes a network no longer picks it, the rules do. See
[network modules](network-modules.md) for how to write one.

## What is recorded, and what never is

A journal row holds: time, caller, purpose, method, host, port, route, the
deciding rule, status, bytes in each direction, duration and error.

It never holds a URL path, a query string or credentials. That is where passkeys,
API keys and search terms live. Host names are sensitive too, because they tell
what a household downloads, so the journal and the rules need the
`settings.manage` permission, and rows are kept 7 days.

## Enforcement

Deciding is not enough: something has to make the decision binding. The target
is the same everywhere. Modules are WebAssembly components with no network of
their own: their only network import is the policy itself. See
[module security](module-security.md#how-each-permission-is-enforced).

A native sidecar, while one remains, is a program that can open its own socket
unless the operating system stops it. For those, the server picks the strongest
tier the platform allows and shows it under Admin → Réseau:

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
| Fetch: proxy resolves names, `NO_PROXY` overridden, `-q`, web protocols only, `public_only`, `is_local` | in review |
| Torrent engine and indexers sealed behind the VPN, fail closed | in review |
| VPN bridge requires credentials | in review |
| Per-module tokens, declared-only module calls, environment allowlist | in review |
| Egress gate, purposes, policy, journal, admin API | in progress |
| Admin → Réseau dashboard | in progress |
| `kroma-egress` gateway | in review, not yet wired |
| Network namespace sandbox primitive | in review, not yet wired |
| Module seam on Unix sockets, sandbox wiring | planned |
| `network` point and several networks | planned |
| Network middleware | planned |
| A network that carries UDP | planned |
| Modules as WebAssembly components, the same isolation on every platform | planned |
