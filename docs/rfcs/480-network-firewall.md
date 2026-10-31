# RFC 480: one way out, a network firewall for the server and every module

- Status: **DRAFT**
- PR: #480
- Affects: `docs/spec/modules/` (MOD-1, MOD-47), `server/crates/kroma-http`, a new
  `server/crates/kroma-egress`, `kroma-module-supervisor`, `kroma-module-runtime`,
  `kroma-module-manifest` (manifest schema 3), `modules/tv.kroma.vpn`,
  `modules/tv.kroma.torrents`, `modules/tv.kroma.indexer`, `modules/tv.kroma.torznab`,
  `modules/tv.kroma.remote`, Admin → Réseau in `clients/web`, `docker-compose.yml`,
  `docs/module-plugin-model.md` ("Trust, stated honestly"). Areas
  `area/server`, `area/modules`, `area/web`, `area/synology`

## Summary

Every connection the server makes, or a module makes, leaves through one gateway in the
core. The gateway knows who is calling and for what purpose. It resolves the name itself,
applies the operator's rules (direct, through a VPN, or blocked) and writes one journal line
per connection. On the platforms that allow it, the operating system enforces this: a module
process has no route to the network except the gateway, so a third-party module cannot
bypass it by opening its own socket. Where the platform cannot isolate a process, the server
says so, watches module sockets and reports any connection that bypasses the gateway.

## Motivation

The operator cannot answer "what does my server talk to" today, and the VPN does not cover
the traffic it was installed for. Each module decides per call whether to add `.socks5()`.
That decision was made eight different ways and most of them fail open. Nothing records
an outbound call, and a third-party module, which is a native process running as the
server's user, can reach anything.

### What leaves the server today

Inventory as of 2026-10-30. "VPN" means the call goes through the `tv.kroma.vpn` bridge
(wireproxy, SOCKS5 on `127.0.0.1:25345`) when it is running.

**Core process** (the `kroma-engine` code also runs inside the acquisition sidecar)

| Flow | Destination | Client | VPN |
|---|---|---|---|
| Metadata | `api.themoviedb.org` | raw `curl`, key in argv (`infra/metadata/client/mod.rs:149`) | never |
| Artwork | `image.tmdb.org` | raw `curl` (`infra/image/cache.rs:20,66`) | never |
| Theme songs | `http://tvthemes.plexapp.com`, plain HTTP | raw `curl` (`infra/theme.rs:57`) | never |
| AI | `api.anthropic.com`, `openrouter.ai` or the operator's base URL | raw `curl`, key in argv (`infra/llm/http/curl.rs`) | never |
| Push | APNs, FCM, `oauth2.googleapis.com`, `push.kroma.tv`, any Web Push endpoint | `Fetch` | never |
| Mail | `mail.kroma.tv` | `Fetch` | never |
| Anonymous stats | `stats.kroma.tv` | `Fetch` | never |
| Updates | `api.github.com/repos/kromatv/kroma/releases` | `Fetch` | never |
| Module registries | `modules.kroma.tv`, operator registries, artifact hosts | `reqwest` (`kroma-module-supervisor/src/registry.rs`) | never |

**Modules**

| Module | Flow | VPN |
|---|---|---|
| torrents | peer TCP, outbound | yes, through librqbit `proxy_url` |
| torrents | DHT, UDP, bootstraps at `dht.transmissionbt.com`, `dht.libtorrent.org` | **never** (`rqbit.rs:93`, always on) |
| torrents | UDP tracker announces | **never** |
| torrents | HTTP tracker announces, librqbit's own reqwest client | proxied, names resolved locally |
| torrents | its own announce (`announce.rs:52`) | only if the bridge is up, names resolved locally |
| torrents | `.torrent` download (`downloads/fetch.rs:51`) | **never**, passkey in the URL |
| torrents | seal check, `api.ipify.org` every 60 s, one proxied and one direct | both |
| torrents | Local Service Discovery, LAN multicast | n/a |
| indexer | tracker sites, login, search, download | only if `acqIndexersUseVpn` (default off), falls back to direct |
| indexer | FlareSolverr | same as above |
| indexer | `codeload.github.com/Prowlarr/Indexers` master (`store/sync.rs:27`) | never, despite the comment |
| torznab | Jackett or Prowlarr, `apikey` in the query | never |
| qbittorrent, transmission | the daemon's WebUI or RPC on the LAN | never (their peers are outside KROMA) |
| remote | `github.com/cloudflare/cloudflared/releases/latest` | never |
| remote | Cloudflare edge, port 7844 TCP or QUIC | never (correct) |
| vpn | `github.com/windtf/wireproxy` v1.1.2, then the WireGuard endpoint over UDP | never (correct) |
| whisper | `huggingface.co/<model>/resolve/main/...` | never |
| roku | SSDP `239.255.255.250:1900`, ECP `:8060`, installer `:80`, LAN addresses only | n/a |
| mdns | `224.0.0.251:5353` on every interface | n/a |
| vector, scene | none | n/a |

**Listening sockets**

| Who | Address | Notes |
|---|---|---|
| core HTTP | `KROMA_HOST` (default `0.0.0.0`) `:4040` | the API, the web app, `/api/_host/*`, `/api/module/<id>/*` |
| core HTTPS | same host, `:4443` | off by default |
| each sidecar | `127.0.0.1:<random>` | `/_port/*` behind the shared `KROMA_HOST_TOKEN` |
| wireproxy | `127.0.0.1:25345` | SOCKS5, no authentication |
| torrents peers | `[::]:rqbitPort` | the host's real IPv4 and IPv6 interfaces |
| torrents DHT | UDP, ephemeral, every interface | |
| mdns | UDP 5353, every interface | |
| cloudflared | outbound tunnel | internet traffic reaches the core with a loopback peer address |

Clients also reach third parties from the user's device. Discover, search, request and
monitoring art come back as `image.tmdb.org` URLs (`/api/discover/*` does not cache them),
and phones fetch notification images from TMDB (`services/notify/art.rs:41-48`).

### What is wrong

These are verified unless marked otherwise. Most can be fixed today without this RFC and
should be (see Phase 0).

1. **The torrent swarm sees the real IP with the VPN on.** DHT is always enabled
   (`modules/tv.kroma.torrents/server/src/rqbit.rs:93`) and UDP cannot cross a TCP SOCKS5
   bridge. UDP tracker announces carry the info hash, the peer id and the port from the real
   address. The peer listener binds `[::]` on the real interfaces. These librqbit internals
   were read from the upstream 9.0.0-rc.0 source, which is not vendored here. The comment at
   `downloads/grab.rs:139` that "librqbit routes all its traffic through the VPN proxy" is
   wrong.
2. **DNS leaks around the bridge.** The VPN point answers `socks5://127.0.0.1:<port>`
   (`tv.kroma.vpn/server/src/admin.rs:16`). Under `--socks5-hostname`, a `socks5://` prefix
   makes curl resolve the name locally and send only the IP. Tested with curl 8.5.0, the
   proxy received an IPv4 address with the prefix and the domain name without it. Indexer
   sessions (`indexer/server/src/session/mod.rs:103`) and the torrents announce
   (`announce.rs:54`) pass the prefixed URL, so the local resolver learns every tracker
   and indexer hostname. The seal check strips the prefix (`proxycheck.rs:36`), so it
   reports sealed. librqbit hands the same URL to reqwest, where `socks5://` also means
   local resolution.
3. **The VPN fails open.** If the bridge does not resolve, indexers go direct. The cached
   session key leaves out the proxy URL (`indexer/server/src/admin.rs:91`), so a session
   built while the VPN was down stays direct. Torznab, `.torrent` downloads and the
   definition sync never use the VPN. `vpnKillSwitch` defaults to off and waits two failed
   checks, about two minutes. When no proxy resolves, the gate opens (`downloads/gate.rs:25`).
   qBittorrent and Transmission traffic is outside KROMA's reach entirely.
4. **Any module can call any other module.** `/_port/*` on a sidecar accepts the shared
   `KROMA_HOST_TOKEN` (`kroma-module-runtime/src/serve.rs:81`), which every sidecar
   receives (`kroma-module-supervisor/src/process.rs:67`). The callee does not check
   `consumes`. Sidecar ports are on `127.0.0.1` and can be found by scanning, so a
   third-party module can call `tv.kroma.torrents/grab` or read `tv.kroma.indexer/db`.
5. **A module can impersonate another module.** `free_port()` binds `127.0.0.1:0`, reads the
   port and drops the socket (`process.rs:228`). A process that takes the port during a
   restart receives the core's proxied requests, and those carry the user's
   `Authorization` header and cookies (`proxy.rs:50`).
6. **Web Push is a server-side request forgery.** Any signed-in account can register any
   string as its endpoint (`server/src/api/notifications.rs:225`). The server POSTs to it and
   follows redirects, so the target can be `http://127.0.0.1:<port>` or the router's admin page.
7. **The `/api/_host/*` loopback gate admits internet traffic.** `host_loopback_only`
   (`server/src/api/mod.rs:184`) checks the raw peer address. Traffic through cloudflared or
   a same-host reverse proxy has a loopback peer. The token is then the only barrier.
8. **API keys are visible to every local process.** The TMDB key and the AI provider key are
   curl arguments, readable in `/proc/<pid>/cmdline` and `ps`, so every module can read
   them. `kroma-http` keeps options off argv to prevent exactly this.
9. **Executables are downloaded and run without a checksum.** wireproxy is pinned to v1.1.2
   with no hash (`tv.kroma.vpn/server/src/provision.rs:14`). cloudflared is fetched as `latest`
   with no hash (`tv.kroma.remote/server/src/provision.rs:17`). Whisper models follow `main`
   with no hash, and a truncated file is later treated as complete.
10. **Sidecars inherit the server's whole environment.** There is no `env_clear`, so
    `KROMA_TMDB_API_KEY` and anything else in the operator's environment reaches
    third-party modules. curl is also started without `-q`, so it reads `~/.curlrc` and the
    `*_proxy` variables.
11. **Theme songs travel in plain HTTP to Plex.** The TVDB id of each show in the library
    reaches `tvthemes.plexapp.com` and anyone on the path.
12. **The wireproxy SOCKS port has no authentication.** Any local process can use the
    tunnel.
13. **ffmpeg and ffprobe run without `-protocol_whitelist`.** Not a demonstrated hole, since
    their inputs are library paths, but they can open network URLs from playlists and
    nothing stops them.
14. **Nothing records network activity.** `kroma-http` has no tracing. Inbound request
    logs are DEBUG and filtered out by default. The push-delivery table is the only
    per-call record.

Findings 1 to 3 come from one pattern, and it is the reason for this RFC rather than a
list of patches. Each caller chose its own route, so the leaks moved from one caller to
the next. Even first-party code, reviewed and tested, got it wrong in three different ways.
A third-party module will not do better.

## Proposal

### Threat model

The firewall protects:

- the operator's real IP address, when the operator asked for a VPN
- the library's contents, which hostnames, info hashes and TVDB ids reveal
- the credentials the server holds: API keys, tracker passkeys, the host token, user sessions
- the LAN behind the server: the router, the NAS's admin page, other devices

It defends against:

- a third-party module that is malicious, or compromised in an update
- a URL fed in from outside: an indexer result, a registry catalog, a Web Push endpoint, a
  redirect, a playlist
- a network that watches, or a VPN tunnel that drops

It does not defend against root on the host or a compromised core binary. The core is
trusted code, and its own flows go through the gateway so that the operator sees and steers
them, not because the core is contained.

### One gateway

A new crate, `kroma-egress`, runs inside the core process. Like the module host crates, it
carries the mechanism and none of the meaning. It knows callers, purposes, hosts, addresses,
ports and routes, and never what a torrent or an indexer is.

- It speaks SOCKS5, with CONNECT and UDP ASSOCIATE, on a Unix socket, and on one loopback
  port per module where the enforcement tier needs it. curl, reqwest and librqbit can all
  use a SOCKS5 proxy.
- It resolves every name itself, through the route the connection will take, so a VPN flow
  also resolves inside the tunnel. It then checks the resolved address against the guards
  below and connects to that address. Checking after resolution defeats DNS rebinding. A
  redirect opens a new connection, so the rules apply again at every hop.
- The caller's identity comes from the socket, never from what the caller claims. See
  "Enforcement" for how.
- The purpose travels as the SOCKS5 username, for example `peers`, `indexers` or
  `catalog-sync`. It must be a purpose the caller declared. An undeclared purpose is
  refused.
- One journal line per connection: time, caller, purpose, protocol, hostname, address,
  port, route, the rule that decided, bytes in each direction, duration and error. Query
  strings, URL paths and userinfo are never recorded, because that is where passkeys and
  API keys live.

`kroma_http::Fetch` keeps its API. Its executors send through the gateway, and `.socks5()`
goes away: a call names its purpose instead of picking its route. The core's own
`reqwest` clients get the gateway as their only proxy. Every raw `Command::new("curl")`
listed above moves onto `Fetch`, which also closes finding 8.

### Policy

The gateway evaluates fixed guards first, then the operator's rules in order, then the
default.

The guards cannot be relaxed by a rule, only by a declaration the operator accepted:

- No loopback destination. The gateway itself is the only way to reach the core or another
  module (see "East-west").
- No link-local destination (`169.254.0.0/16`, `fe80::/10`), and with it no cloud metadata
  address.
- LAN destinations (the existing `localNetworks` setting, plus RFC 1918, `fc00::/7` and
  `100.64.0.0/10`) only for a purpose declared `lan`. This closes finding 6 without a
  special case for Web Push.

A rule matches on any of caller (core or a module id), purpose, destination (an exact host,
a `*.` suffix, a CIDR, or `public` or `lan`), port range and protocol. Its action is
`direct`, `route:<name>` or `block`.

The default is `block` for modules under strict enforcement and `allow and flag` otherwise.
A flagged connection appears under "À examiner" in Admin → Réseau, with "Autoriser" and
"Bloquer" buttons.

Presets give the operator a starting point. "Téléchargements par le VPN" reproduces today's
intent and fixes its leaks. "Tout par le VPN" routes everything except LAN purposes.
"Le strict minimum" blocks theme songs, anonymous stats, AI and update checks.

### Routes

`direct` and `block` are built in. Every other route is contributed. The core calls a new
bare point, `route`, alongside `acquisition`, `transcriber` and `embedder`. A module that
answers it describes a route: its name, how to dial it (a SOCKS5 upstream first), whether
it carries UDP, and its health with the exit address.

`tv.kroma.vpn` stops answering `tv.kroma.vpn/proxy` and answers `route` instead. Consumers
stop resolving the proxy. They declare purposes, and the operator's rules decide.

A route never falls back to `direct`. If it is unhealthy, its connections are refused at
once and the journal says why. This replaces the two-probe kill switch and its default-off
setting. A purpose that needs UDP on a route that does not carry it is refused, and the
page says so ("Le VPN ne transporte pas l'UDP : DHT désactivé"). The torrents module then
runs without DHT behind the VPN, which is correct until Phase 4.

The gateway is the only client of a route's upstream. wireproxy gets a SOCKS username and
password, or a Unix socket, which closes finding 12.

### Enforcement

The gateway only helps if it is the only way out. The supervisor probes the platform at boot
and picks the strongest tier it can enforce. Admin → Réseau shows the tier, why it was
chosen, and what would raise it.

| Tier | Where | How a module is contained | How the gateway knows the caller |
|---|---|---|---|
| Strict, one user per module | Docker (the image runs as root) with `cap_add: [NET_ADMIN]` | each sidecar runs as its own uid; nftables drops every packet from that uid, over IPv4 and IPv6, TCP, UDP and ICMP, except to its own gateway port on loopback | the port: nftables lets only that uid reach it. On Unix sockets, `SO_PEERCRED` uid |
| Strict, one namespace per module | Linux with unprivileged user namespaces (systemd installs, most distributions) | each sidecar starts in a new user and network namespace that holds only `lo`; it reaches the core and the gateway through Unix sockets on the filesystem | `SO_PEERCRED` pid, then the network namespace inode the supervisor created for it |
| Watch | Synology DSM, Docker without `NET_ADMIN`, macOS development | nothing prevents a bypass; the SDK sends through the gateway, and a scanner reads `/proc/<pid>/fd` and `/proc/net/{tcp,tcp6,udp,udp6}` every few seconds for module sockets that do not lead to the gateway | the module token, which another process of the same user can read |

Under both strict tiers, software inside a module that ignores the proxy has no route, so it
fails closed. In the namespace tier, the SDK runtime starts a small forwarder on
`127.0.0.1:1080` inside the namespace, for libraries that cannot dial a Unix socket. A
module that tampers with the forwarder gains nothing, because the gateway still enforces
the rules behind it.

In Watch, a detected bypass is recorded, raises an admin notification, and can stop the
module ("Arrêter un module qui contourne le pare-feu", on by default for third-party
modules). The page says what Watch cannot do: a short connection can open and close
between two scans. An operator setting refuses to start third-party modules outside a
strict tier.

The one-user tier also contains the filesystem. A module can no longer open the core
database directly. That gap is the one `docs/module-plugin-model.md` admits under "Trust,
stated honestly". See "Unresolved" for what it costs the storage grant.

The core's own child processes do not need the network. Where the platform allows, ffmpeg,
ffprobe and cwebp start in an empty network namespace. Everywhere else they get
`-protocol_whitelist file,pipe,crypto`. curl starts with `-q` and a cleared proxy
environment, so the gateway is its only proxy.

In first-party code, `clippy.toml` `disallowed-types` and `disallowed-methods` forbid
`reqwest::Client`, `std::net::TcpStream`, `tokio::net::TcpStream`, `UdpSocket` and
`Command::new("curl")` outside `kroma-http` and `kroma-egress`. A `bun run ci` check does
the same for module workspaces, which `--workspace` does not reach.

### The same isolation on every platform

The tiers above share a weakness: each one is a different operating system
mechanism. Namespaces exist on Linux only, Docker's default seccomp profile
refuses them, macOS has Seatbelt and Windows has AppContainer, and DSM has
nothing usable. Five mechanisms, one of them missing, each with its own gaps,
cannot promise one behaviour. KROMA runs on Linux, macOS, Windows, Docker and
Synology, and a user's safety cannot depend on which one they picked.

So the guarantee moves out of the operating system and into the server: **a
module is a WebAssembly component (WASI 0.2), run by wasmtime inside the core.**

- **No ambient authority.** A component cannot make a system call. It can only
  call the functions the host links into it. Sockets, files, environment,
  clocks and processes do not exist unless the host provides them. There is
  nothing to escape through, on any platform.
- **Permissions are the linker.** `net` links a KROMA network import whose every
  call goes through the policy and the gateway. HTTP and stream dial and listen
  go to direct, a network or blocked, and are journaled. `fs` preopens the
  declared roots only, read-only where declared. `env` passes the declared
  variables only. `run` does not exist: what a module used to start (ffmpeg, an
  inference runtime) becomes a host capability with fixed operations
  (`wasi-nn` for the Whisper and embedding models).
- **The instance is the identity.** The host knows which component is calling.
  No token crosses the seam, so there is none to steal or replay.
- **Limits.** Each component has a memory ceiling and a CPU budget (epoch
  interruption), set per module.
- **One artifact.** The same `.wasm` runs unchanged on every platform and
  architecture KROMA ships: x86_64 and arm64, Linux, macOS and Windows. A module
  release builds once instead of once per platform. wasmtime compiles it ahead
  of time at install, so no JIT runs at start.
- **Speed.** Compute runs close to native. A call into the host is a function
  call, faster than today's HTTP and JSON over loopback. The heavy work stays
  native in host capabilities: file I/O, hashing, ffmpeg, inference. The torrent
  engine moves last, behind a throughput benchmark it must pass.

What still has to touch the operating system becomes a host capability, not a
native module:

- A userspace WireGuard network inside the gateway, in pure Rust. It also
  carries UDP for DHT and uTP.
- LAN discovery (mDNS, SSDP) as a host capability.
- The remote tunnel.

The VPN, mDNS, Roku and remote modules keep their configuration and their pages,
as components.

Until the move is complete, a native sidecar is accepted from the official
registry only, labelled native in the admin, and contained by the OS tier
where one exists, as a second layer. **A module from any other registry must be
a component.**

### East-west

The module seam moves off TCP. `kroma_http::loopback` already chooses a transport per URL,
so a `unix:` transport is a new `Transport`, not a new seam.

- Each sidecar serves on `<data>/run/modules/<id>.sock`, created by the supervisor before
  the spawn. This closes finding 5: there is no port left to steal.
- `/api/_host/*` moves to `<data>/run/host.sock` and leaves the TCP listener, which closes
  finding 7.
- The shared `KROMA_HOST_TOKEN` stops being handed to modules. A module calls a peer through
  the core, which checks the caller's `consumes` against the callee's `contributes` and
  `definesPoints`. The callee only accepts the core. This closes finding 4, and gives
  internal module-to-module traffic the same journal as everything else.
- The supervisor builds each sidecar's environment from an allowlist (`env_clear`, then
  the `KROMA_MODULE_*` variables), which closes finding 10.

### Declarations

Manifest schema 3 adds a `permissions` block in the spirit of Deno's flags:
`net`, `fs`, `run` and `env`, beside the `storage`, `settings` and point
declarations that already exist. What is not declared is denied. The full
model, and which tier enforces which permission, is in
[module security](../module-security.md). The network part is what follows. A
module that omits it gets no network at all.

```json
"network": {
  "egress": [
    { "purpose": "indexers", "to": "setting:indexerUrls", "ports": [80, 443] },
    { "purpose": "flaresolverr", "to": "setting:acqFlaresolverrUrl", "lan": true },
    { "purpose": "peers", "to": "public", "proto": ["tcp", "udp"], "route": "vpn" },
    { "purpose": "download-client", "to": "lan", "ports": "any" }
  ],
  "listen": [
    { "purpose": "peers", "proto": ["tcp"], "port": "setting:rqbitPort", "route": "vpn" }
  ],
  "hostNetwork": false
}
```

- `to` is a hostname pattern, `public`, `lan`, or `setting:<key>`. The last form makes the
  operator's own configuration the allowlist. A torznab module may reach the Jackett URL the
  operator typed, and nothing else.
- `route` is a default the operator can override. It is not a promise.
- `listen` replaces binding host interfaces. The gateway owns the listening socket on the
  host side, or on the route when the route supports port forwarding. It hands accepted
  connections to the module and journals the peer address. This closes the `[::]` half of
  finding 1.
- `hostNetwork: true` exempts a module from containment. LAN multicast needs it today:
  `tv.kroma.mdns`, the SSDP half of `tv.kroma.roku`, and LSD. The install screen shows it in
  red, and by default only the official registry may ship it.

The core keeps the same table for its own flows (`metadata`, `artwork`, `themes`, `ai`,
`push`, `mail`, `stats`, `updates`, `registry`), so the core and modules are listed and
steered the same way.

The install and update screens list a module's purposes and destinations in French before
consent. An update that widens them asks again.

### Networks and middleware

A VPN is one kind of **network**, a named way out that a module provides. A
module answers the core-called point `network` with the networks it runs (a name,
a SOCKS5 endpoint only the gateway can use, whether it carries UDP and DNS, its
health). Rules name a network as their action, several networks can run at once,
and a network can leave through another one by a rule on its own traffic. This
replaces `tv.kroma.vpn/proxy` and lets an operator send the torrent engine
through one country and the indexers through another.

A module can also be **middleware** on the decision path, answering
`network-policy/decide` after the guards and the rules. It can block a connection
or move it to another network, never relax a decision, within 200 ms, seeing only
caller, purpose, host and port. The contract for both points is in
[network modules](../network-modules.md).

### Analysing one module

Every module can be analysed without the rest of the server. Its page under Admin
→ Modules sets its declared permissions next to what the journal saw it do,
refusals and undeclared attempts included. `kroma audit <module>` starts it alone
in the sandbox behind a recording gateway and reports every connection and file
access it attempted against its declaration. CI runs it on every first-party
module.

### Testing for leaks

A leak suite starts a process in each tier and makes it try every way out: TCP
and UDP to the internet and the LAN, IPv6, ICMP, DNS to the configured resolver,
the host's loopback ports, abstract and pathname Unix sockets outside its own
directory. Each attempt must fail and be recorded. It runs in CI wherever the
runner offers namespaces, and says so where it does not.

### What the operator sees

Admin → Réseau gains four tabs, next to today's settings:

- **Connexions.** The live journal: qui, pour quoi, vers, par, verdict, volume. It can be
  filtered by module, purpose and verdict. The page needs its own admin permission, because
  hostnames reveal what the household downloads.
- **Règles.** One row per purpose, with Direct, VPN or Bloqué, and the presets.
- **À examiner.** Connections refused or flagged, with one click to allow or block.
- **Protection.** The enforcement tier, the listening sockets with their exposure, the routes
  with their health and exit address.

The journal keeps rows for 7 days and daily aggregates per caller, purpose, host and route
for 30. `database_tidy` prunes it, as it prunes `notification_deliveries`.

### Phases

**Phase 0, now, as ordinary PRs.** Findings 1 to 3 and 6 to 13 have local fixes:

- turn off DHT and LSD, drop `udp://` trackers and bind the listener to loopback whenever a
  proxy is set
- make `Fetch::socks5` strip any scheme so `--socks5-hostname` always resolves at the
  proxy, and hand librqbit `socks5h://` once its `proxy_url` parser is checked to accept it
- refuse to go direct when `acqIndexersUseVpn` is on and the bridge is absent, include the
  proxy in the session key, honour the flag in torznab, the `.torrent` fetch and the
  definition sync
- Web Push endpoints: `https` only, public addresses only, no redirects
- move TMDB and the AI providers onto `Fetch`
- pin and hash wireproxy, cloudflared and the Whisper models
- `env_clear` for sidecars, `-q` for curl, `https` or opt-in for theme songs
- SOCKS credentials on wireproxy, `-protocol_whitelist` on ffmpeg

**Phase 1, observe.** `kroma-egress` with the journal only. Every first-party flow goes
through it, the SDK points modules at it, and nothing is blocked. Admin → Réseau →
Connexions ships. This alone answers "what does my server talk to".

**Phase 2, steer.** Rules, presets and the `route` point. The VPN becomes a route.
Modules stop choosing their proxy.

**Phase 3, contain.** Unix sockets for the module seam, the two strict tiers, the Watch
scanner, manifest schema 3, the consent screen, and core-brokered module calls.

**Phase 3b, permissions and audit.** The `permissions` block and its consent
screen, filesystem and `run` enforcement in the namespace tier, `kroma audit`,
the per-module view, and the leak suite in CI.

**Phase 3c, networks and middleware.** The `network` and `network-policy`
points, several networks at once, and the VPN module moved onto `network`.

**Phase 3d, WebAssembly components.** In order:

1. A wasmtime host with a minimal WIT world, tested on Linux, macOS and Windows runners.
2. The full host API as WIT, behind the same SDK traits, so a module's code does not change.
3. The HTTP-only modules move first.
4. The userspace WireGuard network and the discovery capability.
5. The torrent engine, last, behind its benchmark.
6. Third-party modules are accepted as components only.

**Phase 4, UDP and inbound on a route.** A route that carries UDP, either a userspace
WireGuard inside the gateway or a wireproxy replacement, so DHT and uTP can run sealed.
Inbound peers through the provider's port forwarding.

## What this costs

- **A security component in the hot path.** Every byte of torrent traffic crosses one more
  local relay. On Linux `splice` keeps the copy in the kernel, but throughput on a small NAS
  has to be measured before Phase 2 ships. The SOCKS parser faces hostile modules, so it
  needs fuzzing from its first commit.
- **A breaking change for every module.** Unix sockets, schema 3 and the loss of the shared
  host token mean a new `engines.server` floor and a rebuild of every first-party module.
  Third-party modules built against schema 2 run in Watch only, with a banner, until they
  are rebuilt.
- **An extra capability in Docker.** `cap_add: [NET_ADMIN]` goes into `docker-compose.yml`
  and `INSTALL.md`. Operators who leave it out stay in Watch.
- **Synology stays in Watch.** The package runs as its own unprivileged user and the
  kernel may not offer user namespaces. Synology operators who want the strict tier run
  the Docker image under Container Manager.
- **A per-module uid owns its files.** `<data>/modules/<id>` changes owner on the first
  boot under the new tier, and a module can no longer read another module's data.
- **The journal is sensitive data.** It needs its own permission, short retention and no
  URL paths.

## Compatibility

- Paired devices and older clients: nothing changes on the wire to clients.
- Installed modules: schema 2 modules keep working in Watch. They lose direct
  module-to-module calls in Phase 3, when the shared host token stops being issued. Every
  first-party module moves in the same release.
- Operators who route the whole container through a VPN container today (`network_mode:
  service:gluetun`) keep working. The gateway sees that VPN as `direct`.
- `vpnKillSwitch`, `acqIndexersUseVpn` and `vpnCheckUrl` migrate to rules and a route health
  check in Phase 2, then disappear.

## Alternatives

- **Per-OS sandboxes as the main line.** Namespaces, Seatbelt and AppContainer
  are each real, but they are three implementations with three sets of gaps. DSM
  and Docker's default profile have none of them. They stay as a second layer
  for native sidecars, not as the guarantee.
- **A VM per module (Firecracker, libkrun).** Strong, but Linux-first, heavy on a
  NAS, and absent from Windows and DSM.
- **A JavaScript runtime with permissions (Deno).** Portable, but every module is
  Rust today, and embedding V8 in the server costs more than wasmtime.
- **Do nothing and keep per-call `.socks5()`.** Findings 1 to 3 show what that produces in
  first-party code. A third-party module would get the same freedom and less review.
- **`HTTP_PROXY` and `ALL_PROXY` in the environment.** It only covers software that chooses
  to read them, carries no UDP and no identity, and a module can unset it.
- **The whole server inside a VPN container.** It works today, for operators who know
  Docker. It cannot split traffic by purpose, it complicates LAN access to the server, and
  it records nothing. It stays documented as the zero-code option.
- **nftables alone.** It can block, but it sees addresses and no hostnames, so it can neither
  journal "tracker.example" nor route a purpose through a VPN. The gateway supplies the
  names and the routing, the operating system supplies the enforcement. This RFC uses both.
- **A TUN device and a userspace TCP/IP stack in each module's namespace.** It captures
  everything at the IP layer, UDP and ICMP included, without the module knowing about a
  proxy. It is the strongest option and by far the largest. It stays the Phase 4 candidate if
  SOCKS awareness turns out to limit real modules.
- **eBPF cgroup hooks on `connect`.** They need `CAP_BPF` or root, are absent on Synology,
  and still see no hostnames.

## Unresolved

- **The storage grant under per-module uids.** A module with `storage` opens the core
  database file itself today. Either the file becomes group-readable for granted modules,
  which weakens the tier, or granted access moves behind the host API. The module host
  maintainers decide this before Phase 3.
- **LAN multicast.** `hostNetwork` is the first answer. A discovery broker in the core,
  which sends SSDP searches and registers mDNS records on a module's behalf, would remove
  it for `tv.kroma.roku` and `tv.kroma.mdns`. Not designed yet.
- **cloudflared under a strict tier.** It does not dial its edge through a SOCKS proxy as far
  as this RFC's author knows. The remote module may need `hostNetwork`, or an nftables
  allowance limited to port 7844, until that is checked.
- **Who may edit rules.** A new admin permission, or the existing module-management
  permission. This decision belongs to the accounts spec.
- **How each core feature degrades when its purpose is blocked.** Blocking `metadata` must
  show "métadonnées désactivées" and not leave enrichment retrying forever.
