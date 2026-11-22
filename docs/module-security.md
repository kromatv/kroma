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

A module's page opens its security card with one verdict: "Accès étendu" when it
reaches past its isolation (a program it starts or the host's own network),
"Isolé" when it does not. The four kinds of access that weigh most follow as
tiles, and "Détails" opens the rest. The install screen says it once for every module the install
brings: one line per module with extended access, then the kinds of access they
share and which modules have each. It reads the catalog row or, for an upload,
the bundle itself. The row carries the module's `storage` and `settings` beside
its `permissions`, so the account data, server tables and settings show before
install too. An update that asks for more waits: a new permission, core table or
account column, a key in `settings.write` the installed version did not declare,
or a dependency this server does not have yet. No automatic or batch update
takes it, and the operator accepts it from the install plan, which shows only
what the update adds. A bundle must declare what its catalog row showed: the
same `permissions`, the same core tables and columns in `storage`, the same
`settings` and the same `helpers`. An install fails when it does not, and a
part the row leaves out admits only a bundle that leaves it out or leaves it
empty. A declaration with no `permissions` block still shows the storage and
the settings it declares, and a module that changes the accounts reaches past
its isolation.

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
  "run": ["rqbit"],
  "media": ["decode"],
  "env": ["KROMA_EMBED_MODEL_DIR"]
}
```

| Permission | Grants | Notes |
|---|---|---|
| `net.connect` | connections for a purpose to a set of destinations | `to` is `public`, `lan`, a host pattern, or `setting:<key>`, which makes the operator's own configuration the allowlist. An entry that names a transport in `proto` (`tcp`, `udp`) also gives the component raw sockets of that transport, see [raw sockets](#raw-sockets) |
| `net.discovery` | `mdns` to publish a service, `ssdp` to search for devices | the host sends and listens for the module, which holds no socket |
| `net.listen` | a port a program the module starts listens on, a number or `setting:<key>`, and with `count` (1 to 16) that port and the ones after it | a component cannot listen. Shown at consent, and an update that adds one or widens its run asks again. No other module may dial these ports on this machine |
| `net.host` | the host's network, for the programs the module starts | a tunnel (`wireproxy`, `cloudflared`) and the torrent engine reach the internet from the host. Marked as extended access |
| `fs.read`, `fs.write` | named roots, never raw paths | `module` (its own data), `media` (library roots, read-only unless `fs.write` names it, as an importer's does, and always read-only when one holds a folder of the server's own), `downloads` (the [download folders](#the-download-folders), first-party only), `temp` (every module gets a private `/tmp`) |
| `run` | programs it may start, by name | first-party modules only. What starts is a process of the host, see [below](#what-the-component-does-not-contain). Marked as extended access |
| `env` | environment variables beyond the allowlist | the server's own variables, secrets included, are never passed |
| `media` | the core's media tools, by name: `decode` turns an audio track into raw PCM | the core's ffmpeg runs it under its budget, on a file the module holds and cannot write |

These sit beside the declarations that already exist and keep working:

- `storage`: the slice of the core database a module may touch, enforced per
  connection by SQLite's authorizer, in the host.
- `settings.read` / `settings.write`: the core settings keys it may read or
  write through the host API, and no others. See [settings](#settings).
- `consumes`, `contributes`, `definesPoints`: the points it may call and the ones
  it answers.
- `helpers`: the pinned upstream build, per `<os>-<arch>`, of a program `run`
  names: a `url`, its `sha256`, and the `member` to take from a `.tar.gz`. A
  helper's name is letters, digits, `-` and `_`, and a manifest that pins one
  under any other name is refused.
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

A purpose covers itself and its dotted children, and nothing else: an entry for
`metadata` covers a call made for `metadata` or `metadata.discover`, never one for
`metadatax`. A host pattern names that host only, or with `*.` a domain and every
name under it. The `net.connect` check, the operator's rules, the journal's filter
and the gateway all decide with these two rules, `purpose_covers` and
`host_matches` in `kroma-module-manifest`, so a call one of them allows is never
refused by another for its purpose or its host.

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
| `net` | `net.fetch`, `fetch-all` and `download` go through the policy and the module's own gateway, and are journaled; `lan` answers only what `net.discovery` names; `wasi:sockets` only for a transport an entry names in `proto`, each bind, connection, datagram and name lookup ruled before it happens |
| `fs` | WASI preopens: only the declared roots, read-only where declared |
| `run` | `process` starts only what `run` names, for a first-party module |
| `env` | only the declared variables exist |
| `media` | `media.decode-audio` checks both paths against the module's folders, then runs the core's ffmpeg |
| `storage` | the host holds both databases, the module's own in a folder no module holds; the component has no SQLite |
| `settings` | the host API answers only a declared key, and never one the core keeps |
| CPU, memory | a ceiling per instance |

**Network.** A component that declares no `permissions` has no network. The
policy decides a fetch first, and a refusal names its reason. An allowed fetch is
carried through the module's gateway, which rules again on every redirect hop. See
[networking](networking.md#the-gateway).

**Raw sockets.** A component holds a socket only for a transport a `net.connect`
entry names in `proto`. An entry with no `proto` is for `fetch` alone and grants
no socket, so a module asks for one in the open:

```json
{ "purpose": "discovery", "to": ["lan"], "ports": [7359], "proto": ["udp"] }
```

TCP runs on wasmtime's own sockets, under the address check wasmtime calls
before each bind, listen and connection, and the host counts them as they are
created. UDP and name lookup are the host's own: the stock UDP socket cannot
broadcast, and the stock lookup does not tell the check which name an address
came from. Every use is ruled where every fetch is, by the core's network
policy, in this order:

1. Each entry that names the transport, names the port (or no port) and covers
   the address. The first one gives the purpose the socket is filed under.
   - `public` covers a public address that is not the broadcast address of a
     network this machine sits on.
   - `lan` covers an address on one of the networks this machine's interfaces
     sit on, the broadcast address of each, `255.255.255.255`, and the
     multicast that stays on the link: `224.0.0.0/24`, `239.0.0.0/8` and
     `ff02::/16`. Loopback, an unspecified address and `0.0.0.0/8` are never
     `lan`, and an interface that reports no netmask counts for nothing.
   - A host pattern covers an address the module resolved a name it matches to,
     through the host, and only a public one, unless that name is a local one
     (`nas.local`, a single label). A pattern that is an address covers that
     address. Loopback is reached only by a pattern that is a loopback address,
     or a setting that names `localhost` or one.
   - `setting:<key>` covers an address the setting names, or one the module
     resolved a name the setting names to, private ones included: the operator
     wrote it.
   - Broadcast and multicast are covered by `lan` alone.
2. The guards: a link-local address is never reachable, nor are the cloud
   metadata services that are not link-local (`100.100.100.200`,
   `fd00:ec2::254`), nor this server's own listeners on any address that lands
   on this machine: loopback, one of its own addresses, or a broadcast or
   multicast one.
3. The operator's rules, for every entry that covers the socket, for the address
   and for each name resolved to it. A rule that blocks refuses the socket, and
   so does one that sends a purpose through a network: a raw socket goes direct,
   so it is refused rather than leaked past the tunnel.

A refusal reaches the component as `access-denied`. A TCP connection is filed in
the journal when it is ruled. A datagram's bytes are counted, and a peer is
filed under the purpose of its entry with `UDP` for a method at its first
datagram, then at most every ten seconds with the bytes since, and with what is
left when the module stops. Each refusal is filed with the rule that made it,
and each lookup, allowed or refused, with `LOOKUP`. A ruling holds for ten
seconds for that transport, use, address, port and resolution, so a module
sending many datagrams to one peer is ruled once in that time.

Every way to an address the manifest does not name is closed:

- **No `proto`, no socket.** A component with no such entry is refused TCP,
  UDP and name lookup outright, and one that names only `udp` has no TCP.
- **Arrivals are ruled too.** A datagram from an address and port no entry
  covers is dropped before the component reads it. An address that sends from
  more than eight refused ports is refused for the rest of the ten seconds
  without asking the rules again.
- **No listening.** A component binds only an ephemeral port on every address,
  never a port or an interface it chose, and a TCP socket never listens.
- **`public` never broadcasts.** Broadcast and multicast are `lan` only. WASI
  has no option for a multicast hop limit, so a multicast datagram leaves with
  the system's default of one hop, and no call joins a group.
- **`lan` is this machine's networks.** A private address behind a router, on
  another VLAN or across a VPN, is not on them and is refused. `fetch` keeps
  its wider `lan`, any address that is not public.
- **A name a module controls leads only to the internet.** A host pattern for a
  name the module's author runs reaches the public addresses it resolves to,
  never a private or loopback one it might point at. Reaching the local network
  takes `lan`, a local name, an address or a setting the operator wrote.
- **A name is looked up only for an entry that reaches it.** A host pattern or
  a setting that names it, or `public` for a name that is not a local one. `lan`
  grants no lookup. The operator's rules are asked about the name too. The host
  asks for the name as an absolute one (`tracker.example.org.`), so the
  resolver's search domains are never tried. A lookup sends a query out through
  the host's resolver, so one the manifest does not name would carry data out
  in the name.
- **A name rule is an address rule.** A socket shows no name, so an address is
  covered by a name only once the module resolved that name to it. An address
  keeps the last eight names resolved to it, and the host forgets them all past
  1,024 named addresses. A name stays attached while the instance lives, so a
  host that shares its address with the name (a CDN) is reachable too. HTTP
  keeps the precision of a name.
- **A module holds a bounded share of the host.** An instance holds at most 64
  sockets at once, TCP and UDP together, and the next one is refused with
  `new-socket-limit`. It sends at most 1,000 datagrams and 1 MiB a second; past
  that a send waits.
- **Nothing is inherited.** Every socket is closed on exec, so a program a
  first-party module starts holds none of the component's.
- **The audit sees them.** `kroma audit` writes down every socket and lookup a
  module attempts, `ok` or `NOT DECLARED`, judging `lan` and `public` the way
  the server does, and lets none out.

Two things `lan` reaches on purpose. This machine's own addresses on any port
but the server's own listeners, so an importer finds a Plex or Jellyfin server
on the same NAS. And, for a server in a container on Docker's default bridge,
the bridge network itself: its gateway (`172.17.0.1`) is the Docker host, so a
module with a `lan` entry for the server's port could reach a KROMA port the
host publishes there and come back to this server's own listener. The guard
cannot tell that address from a neighbour's. A server whose modules declare
`lan` runs better on the host's network.

What a raw socket does not get: the VPN, since the host cannot route it through
a tunnel yet (sealed traffic stays on the gateway), and byte counts on TCP,
since the host sees no bytes there. A `public` raw socket reaches any public
address on its ports, the way a `public` fetch does.

**Host API.** `host-api` reaches the core's `/api/_host/*` and a peer's
`/api/module/<id>/*`, and nothing else. The host adds the module token on the way
out, so the component never holds it.

**Settings.** A component reaches the core's settings only through `host-api`
(`GET /_host/setting`, `POST /_host/settings`), and one check answers both: the
key must be in the module's `settings.read` to be read and in its
`settings.write` to be written. A module that declares no `settings` reaches no
setting. A key the core keeps to itself is refused even when declared: the mail,
LLM and push credentials, the key that signs a media ticket, the registry list,
the library and download folders, every module's state and the identities the
server mints. A refusal is a `403` whose error names the key and what to declare
(`settings.write: "namingMovieFolder" is not declared; add it to settings.write in
module.json`), and it goes on the module's log. A write naming one refused key
writes none of the batch. Settings shape what other modules and the core do (the
naming templates, the download limits, the VPN config, the recycle bin), so a
module that changes one does it in the open: the key is on its manifest, and an
update that adds one to `settings.write` waits for the operator. The component's
`settings` import answers nothing; it is not a second way in.

**Database.** The component has no SQLite. `kroma-sqlite-guest` gives it
rusqlite's API and sends every statement to the `sql` import. The host holds the
module's own databases, which refuse `ATTACH` and every `PRAGMA` but a short
allowlist, and the slice of the core database `storage.core` grants, enforced by
SQLite's authorizer in the host. A module that declares no `storage` has no database:
the host refuses every `sql.open`. A module the official registry did not ship
may not name the tables that hold a credential (`sessions`, `access_tokens`,
`passkeys`, `identities`, `invites`, `credential_resets`,
`email_verifications`, `reset_requests`) or `settings`, nor `users` whole or
`users.password_hash`, nor write anything on `users`. Its install fails before
it replaces anything, and an installed one does not start and says why in its
log. It may still read the other account columns it declares.

A module names its own database and never says where it is. `sql.open` takes a
file name, `module.sqlite` or that name under the module's own folder as the
runtime asks for it, and the host opens it in `<data>/databases/<id>/`, a folder
it creates open to the server's user alone and that no module holds. A name is
one file of letters, digits, `.`, `_` and `-`, and never a journal's. The file,
and the `-wal`, `-shm` and `-journal` SQLite keeps beside it, must each be a
regular file with a single link, and SQLite opens it following no link. The copy
a schema upgrade takes lands in the same folder, and the host keeps the last two.
A backup exports and restores a module's database from there, the same way.

**Files.** The host preopens folders at the same paths they have on the host: the
module's own folder, its `dataDirs` (first-party only), the media roots when it
declares `media`, the [download folders](#the-download-folders) when a
first-party module declares `downloads`, and a private `/tmp`. A directory an
absolute path in a `permissions.env` variable names is preopened read-only. Each
folder is opened where it really is and shown at the path it was named by, because
WASI refuses a symlink whose target is absolute, and Synology's
`/var/packages/kroma/var` is one. `files.canonical` and `files.copy` (a reflink
where the filesystem has one) cover what WASI lacks, inside the same folders.
`files.copy` and `net.download` open what they write one name at a time from the
held folder, following no link, and write only a regular file with a single
link. A download lands in a file of the host's under `run` first, and reaches
the module's folder only once curl is done.

The server's own folders are the data folder, the modules folder, the release
folder the Synology package starts from, the folder of the running binary, the
web client and the updater's folder. No module holds one of them or a folder
above one, except a library folder, which is then read-only. Under the data
folder, `modules`, `installed`, `databases`, `run`, `logs`, `backups` and
`helpers` keep each module's own data, what the host installed of it, its
databases, its socket, and the programs the host runs for it: a module holds its
own folder in `modules` and nothing else, and no library, download or
`permissions.env` folder is taken from inside them. Each folder the host creates
for a module (its own folder, its `dataDirs`, its `/tmp` and the folder of its
databases) is open to the server's user alone, `0700` on Unix, and one that is
already there is closed to other users when the module starts. A link the
operator put in place of a data folder is left as it is.
Which folders a module holds comes from settings no module may write:
`libraries` and `downloadFolders` reach no module, and `acqRecycleBin` reaches
only one that declares it. A module whose library or download folders change is
restarted within half a minute.

**Media.** `media.decode-audio` writes one audio track of a file as raw PCM, at
the sample rate, channel count and sample format the module asks for, for a module
that declares `media: ["decode"]`. The host checks the source against the module's
folders and refuses one in a folder the module may write, because ffmpeg parses
what it reads with the server's rights. The output goes to a folder the module may
write, its private `/tmp` included, and appears only once the whole track is in it.
The pass draws on the core's ffmpeg budget, gets at least an hour, and stops when
the module does.

**What the host installed.** The files the host reads to decide what a module
may do are in `<data>/installed/<id>/`, a folder no module holds: `module.json`,
`origin.json` (where the module came from, and whether the official catalog
served it), `module.wasm`, the compiled copy of it, and the frontend, icon and
catalogs the bundle carried. `<data>/modules/<id>/` holds only the files the
module writes, and is the only one of the two a module may hold, read-write when
it declares `storage` or `fs.write: module`. An install or an update replaces the
first and leaves the second and the module's databases as they are; an uninstall
deletes all three.

The host records the component's `sha256` in `origin.json` when it installs it,
and hashes the component against it before every start: one that does not match
does not start, and the module's log says to install it again. The compiled copy
is kept with the `sha256` of its own bytes beside it, and a copy that does not
match is not loaded: the component is compiled again, and the module's log says
so. With `KROMA_MODULE_HOT_RELOAD=1`, a dev setting, a component dropped into
the folder is recorded as a local build before it starts.

A server laid out before this kept everything in `<data>/modules/<id>/`. The
first start of a server that keeps them apart copies each module's manifest,
origin record, component, frontend, icon and catalogs into
`<data>/installed/<id>/`, before any module starts, records the component's
`sha256`, and removes those files from the module's own folder. The module's
other files stay where they are, and its databases move at its own next start, as
below. A link in the old folder is not followed and each file is copied rather
than moved, so nothing in the module's folder remains attached to what the host
reads. This happens once: after it, no file in a module's own folder is read as
part of its install.

A server laid out before the host kept the databases apart had them in
`<data>/modules/<id>/` too. The first start of a module with `storage` and no
`<data>/databases/<id>/` copies, by content, each database at the top of its own
folder into a staging folder beside that one: a regular file with a single link
that begins as an SQLite file does, with the `-wal` and `-journal` beside it when
those are regular files too. A link is neither followed nor carried. Each copy
takes in its journal and is checked whole (`PRAGMA quick_check`), the staging
folder is renamed into place, and only then are the old files removed. A copy
that fails leaves every old file as it was, and the module does not start: its
log says why, and its next start tries again. This happens once per module.

**Programs.** `process` starts only a program `run` names, and only for a
first-party module: a third-party module never starts one. A program pinned under
`helpers` is fetched by the host, through the gateway under the purpose
`binary-download`, checked against its `sha256`, and kept in
`<data>/helpers/<id>/`, a folder no module holds and that holds nothing else of
the module's. The file is hashed against the
manifest's `sha256` again before every start, so a binary changed after the fetch
does not run: starting refuses it, and `ensure` fetches the pinned build again.
A binary taken from a `.tar.gz` keeps its archive beside it, since the pin names
the archive: starting hashes the archive against the pin and the binary against
the `member` inside it. Only `ensure` downloads; starting never does. An argument holding
`{gateway:<purpose>}` becomes a SOCKS5 URL to the module's gateway, with a token
the component never sees. A program starts from the environment allowlist, plus
what `KROMA_MODULE_ENV` names. Its children stop with the module, and what a
crashed server left running is stopped at the next start.

**Discovery.** `lan` publishes over mDNS and searches over SSDP for a module that
declares `net.discovery`, and refuses the one it did not declare.

**Limits.** A call that traps or runs past a limit costs that instance, the
failure goes on the module's log, and the next call gets a fresh one. `cpuSeconds`
counts the call's own CPU time, not the time it waits on an import. An instance
starts when the module does, so `on_enable` runs without a first call, and work it
leaves running advances on a 100 ms tick. Stopping runs `on_disable`.

### The download folders

A download client reports where a torrent landed, so a module that imports
downloads has to reach where clients save. It holds:

- the `downloads` folder of each data directory a first-party module that declares
  `downloads` keeps. The torrent engine's is `<data>/torrents/downloads`. A link
  there that leads out of its data directory is not followed.
- each folder in **Download folders** under Admin → Acquisition, where an external
  client such as qBittorrent or Transmission saves, as this server sees it.
- the recycle bin, when one is set.

None of them lies inside or above one of the server's own folders: one the
operator names there is not held, and the module's log says so when it starts.
They are writable when `fs.write` names `downloads`. A download saved anywhere
else does not import, and the queue says which folder to add.

### What the component does not contain

The helper programs. Each is a process of the host, run as the server's user, and
wasm holds none of them:

| Module | Runs | For |
|---|---|---|
| `tv.kroma.vpn` | `wireproxy` | the WireGuard tunnel, which dials its endpoint over UDP from the host |
| `tv.kroma.remote` | `cloudflared` | the remote tunnel, which dials Cloudflare's edge from the host |
| `tv.kroma.torrents` | `rqbit` | the torrent engine. Its TCP peers go through the gateway, its SOCKS proxy. When it must stay behind a network, DHT, rqbit's own trackers and uTP are off, and the module announces through the gateway itself |
| `tv.kroma.torrents` | `curl` | rqbit's own API on loopback, for an add that waits on metadata |

Each is declared in `run`, pinned under `helpers` where it is downloaded, and
shown at consent. Only a first-party module may start one. WireGuard inside the
gateway (#512) and the torrent engine as a component at full speed (#514) would
retire `wireproxy` and `rqbit`. Both were dropped, so the two helpers stay.

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

Two tools let a module be judged on its own:

- **In the dashboard** (#496), Admin → Modules → a module shows its declared
  permissions next to what it actually did: where its connections went over the
  last days, its latest connections, and every attempt outside its declaration,
  marked. A host rule written there applies to that module alone. Attempts
  outside the declaration are kept in the journal, which holds the latest 5,000
  connections and is emptied when the server restarts.
- **From the command line** (#495), `kroma audit <module>` builds the module's
  component and starts it alone, with no server beside it: the same supervisor
  and component host the server uses, a network policy that writes down every
  connection and lets none out, and a host that holds no library, no account and
  no secret. It then runs every job the module registers, sends every event topic
  it listens on, calls every method of every point it answers whose definition is
  on disk, and makes the requests the module's own `audit.json` names. The report sets what the module
  declares beside every connection it attempted, every program it asked to
  start and every file it asked of the host, each marked `ok` or `NOT DECLARED`.
  It exits non-zero on anything outside the declaration. The `Module audit` job
  runs it in CI on every first-party module a change can reach, and a
  third-party author runs `bunx kroma audit` before publishing: the SDK carries
  the host.

What an audit sees is what the module did while it was driven. A path the
requests did not take is a path it did not judge, so a module whose work hangs
off a setting or a request body says so in `audit.json`
(see [`modules/README.md`](../modules/README.md#auditing-your-module)). Plain
file access is not listed: a component cannot open a path outside the folders
it holds, so only what it asks of the host's own file calls can be refused.

## Testing that nothing leaks

Containment is tested, not assumed. `kroma-wasm-host/tests/escape.rs` has a
component try to read a path the host process can, open a TCP socket, resolve a
name and read an environment variable the host has, and each attempt must fail.
`sockets.rs` there grants a component one transport at a time: it reaches only
what its rules allow, never the other transport, never a port it chose, never
listens, drops a datagram from an address its rules refuse, broadcasts only
where the rules allow, and looks up only a name its rules allow, which then
reaches the rules with the address. `socket_limits.rs` holds an instance to 64
sockets and its send budget, keeps the last eight names of an address, and
reports each datagram's bytes. The engine's `raw_sockets` and `socket_reach`
tests rule `lan`, `public`, ports, names, host patterns pointed at private or
loopback addresses, broadcasts, the guards and the operator's rules for every
covering entry.
`limits.rs` holds an instance to its memory ceiling and CPU budget. CI runs both
on Ubuntu, macOS and Windows. The `kroma-module-supervisor/tests/component_*.rs`
suites run components under the real supervisor: a call goes through the gateway and into
the journal, a component with no `permissions` has no network, one reads only the
core tables it declared, a third-party one starts no program, even one it
declared, nor starts at all when it declares `sessions`, a downloads module opens its download folders and the libraries but
none of the server's own files, a helper changed after its fetch does not
start, and the host decodes only a file a component holds and cannot write.
`component_installed.rs` there has a module holding its own folder
read-write fail to read or write its manifest, origin record, component and
compiled copy, refuses a component changed after its install, compiles again
over a changed compiled copy, and starts a module installed the old way with its
database. `layout.rs` checks that move file by file, that it happens once, and
that a link or a hard link in the old folder is not carried over.
`component_databases.rs` checks that a link a module makes in its own folder,
under its database's name or a journal's, leaves the core database and every
other file as they were across a restart, that the module reaches none of the
files its databases are kept in, and that its folders are `0700`. The
supervisor's `databases` tests move a database with rows still in its journal,
leave a link, a second link and a file that is not a database behind, move once,
and keep every old file when a move fails and try it again. `kroma-sqlite`'s
own-file tests refuse a link or a second link at the file or at a journal, and
the backup's tests export and restore through no link.
`host_settings.rs` there and the server's `it_host_settings.rs` refuse a read or
a write of a key the module did not declare, and of a key the core keeps even
when declared, and `install_accept.rs` holds back an unattended update that
writes a new key, and an unattended install of a module that is not installed.

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
| A downloads module holds its download folders, not `/`; a helper is hashed against its pin before every start | on `main` (#569) |
| A module reads and writes only the settings it declares; an update that writes a new one waits for the operator | on `main` (#574) |
| What the host reads to decide what a module may do is kept where no module reaches; the component is hashed against its install record before every start; a helper's name is never one of the host's files | on `main` (#576) |
| A module's databases are kept where no module reaches and opened following no link; the folders the host creates for a module are open to the server's user alone | on `main` (#577) |
| Storage grants enforced in the host; the component holds no database file | on `main` (#555) |
| Acquisition and torrents link no core engine | on `main` (#551) |
| LAN discovery as a host capability | on `main` (#552) |
| Remote tunnel | a `cloudflared` helper the host runs, outside the gateway: it honours no proxy for its edge connection (#553) |
| ffmpeg and inference | inference runs inside the component (#554); whisper decodes its audio through the host's `media` capability and starts no program |
| WireGuard inside the gateway | dropped: `wireproxy` keeps the tunnel (#512) |
| Torrent engine as a component at full speed | dropped: `rqbit` stays a native helper the host starts (#514) |
| Strict tier by uid, Watch scanner | dropped: no module is a native process (#489, #490) |
| Escape suite on Ubuntu, macOS and Windows | on `main` (#523) |
| Per-module network view | on `main` (#496) |
| Raw sockets for a transport an entry names in `proto`, each use ruled and journaled | on `main` (RFC 567, step 7) |
| `kroma audit` | on `main` (#495) |
