# Modules

Status: **SHIPPED** overall. The out-of-process model, the `.kmod` bundle, the Store,
install-by-id and by-upload, checksum verification, dependency resolution and the
compatibility gate are all released. Two sections stay open and carry their own status:
the trust model for third-party registries, and the abandonment story. Every section
carries a status; the file-level label is the floor.

The base build ships **zero modules**. Everything past playback and catalogue,
downloads, indexers, acquisition, VPN, transcription, embeddings, network discovery,
remote access, arrives as an installable `.kmod` whose backend runs *out of the server
process*. That is what makes every module uninstallable from Admin, and it is the
load-bearing decision of this domain, chosen for three reasons:

- **Isolation.** A module is a separate program the server spawns and supervises. A
  module that crashes, hangs or is incompatible takes down *itself*. The server keeps
  serving, and every other module keeps running.
- **Native dependencies a sandbox can't hold.** Modules carry real native code
  (torrent engines, ML runtimes, native TLS, raw sockets) that no in-process sandbox can
  host safely. Giving each its own process is the honest boundary.
- **Runtime installability.** A capability is added or removed on a running server
  without rebuilding or replacing the server binary. The base build never grows.

Mechanics, meaning how a sidecar is spawned, supervised and reverse-proxied, live in
[`../modules-as-kmod.md`](../../modules-as-kmod.md); registry wiring lives in
[`../module-registries.md`](../../module-registries.md). This file states the product rules.

## What a module is, and the boundary it may not cross

Status: **SHIPPED**

A module is a self-contained capability with a reverse-DNS id (`tv.kroma.torrents`). It
brings its own backend, its own data, its own settings and, optionally, its own admin UI.
Within its own process it has wide latitude: it opens the shared database directly, runs
its own migrations against its own tables, registers services, schedules jobs, and serves
HTTP the server reverse-proxies under `/api/module/<id>/`.

What it may **not** do:

- **It may not reach into the server's process or another module's process.** Every
  cross-boundary call is an explicit, typed request over the local callback API or a named
  port, never a direct function call into core internals. The boundary is a wire, not a
  linker symbol.
- **It may not replace core.** Playback, catalogue, accounts and the library's
  read/observe contract are the server's; a module extends the server, it does not
  substitute for it. A module cannot claim a first-party module id it does not own (see
  the Store).
- **It may not assume it is present.** Because any module is uninstallable, core never
  depends on one. Features that need a module are absent, not broken, when it is gone.

A module *may* depend on another module (hard or optional); that dependency is declared,
resolved and enforced (below), not discovered at runtime.

## The `.kmod` bundle

Status: **SHIPPED**

A module ships as a single `.kmod` file: a manifest, the native backend binary, an icon,
and the module's own frontend, packed together. At product level the manifest is the
contract, and it declares:

- **Identity and version.** The reverse-DNS id and a hand-set version. The version is the
  source of truth for whether an update exists, and the release process refuses to publish
  changed bytes under an unchanged version, so "there is a newer version" always means
  "there is genuinely newer code", never a silent re-issue.
- **`minServer`, the compatibility floor.** The minimum server version the module needs,
  as a bare version or a range. This is the whole compatibility contract (see below).
- **Dependencies.** Hard dependencies that must be installed alongside it, and optional
  ones offered but not required.
- **Target.** Which platform the backend was built for. A library-only module (manifest
  and frontend, no native binary) declares no target and runs anywhere; everything else
  ships per-platform, and the server picks the artifact that fits the host.

Integrity is guaranteed by a published SHA-256 the server checks against the bytes it
downloads. A bundle whose checksum does not match, or that publishes no checksum, is
refused. Integrity is not safety: a matching checksum proves the bytes are the ones the
registry named, not that they are trustworthy.

## Installation

Status: **SHIPPED**

Two paths, one outcome: the module is unpacked under the server's data directory and its
sidecar is spawned:

- **From the Store**, by id. The server resolves hard dependencies automatically,
  offers optional ones and capability providers (e.g. a module that needs a download
  engine is offered the engines the catalogue advertises), verifies every download's
  checksum, and enforces `minServer` before it installs anything.
- **By upload**, handing the server a `.kmod` by hand. Same unpack, same spawn, same
  `minServer` gate. This is for an air-gapped server, a private build, or a module not on any
  registry.

Both are admin actions on the [`admin.md`](../admin/README.md) surface.

## The Store

Status: **SHIPPED**

The Store (Admin → Modules) is the in-app browser over the configured registries. The
official registry is pinned first and cannot be removed; operators may add their own. It
shows the union of every registry's catalogue, and for each module it shows **this
server's verdict**, not just the catalogue entry:

- which artifact matches this host's platform,
- the installed version, if any, and whether an update exists,
- whether the module is **compatible with this server, and if not, the reason** (a
  `minServer` the server does not satisfy is named, not hidden).

That verdict is the point: a user decides to install or update against what *their* server
will actually do, before committing. Registry precedence, https requirements, shadowing of
duplicate ids and the empty-catalogue-is-a-failure rule are specified in
[`../module-registries.md`](../../module-registries.md).

## Trust

Status: **DRAFT**

The trust model for third-party registries is genuinely open. The shipped integrity
guarantees are settled; the *safety* posture around untrusted publishers is not. The
proposed position:

- **First-party is trusted by default.** The official registry is pinned, first-party,
  and curated. A module from it installs without a trust prompt.
- **A third-party registry is an explicit operator opt-in.** Adding one is admin-only and
  is *not* a trust grant to its modules; it only makes them visible. The operator is told,
  in plain terms, that a module is a native binary the server will execute, so adding a
  registry they do not control is equivalent to trusting its operator with code execution
  on the host.
- **Checksums guarantee integrity, never safety.** The server says so where it matters:
  on the add-registry flow and on installing a non-first-party module. Signing and a
  curated-vs-community distinction are candidates, not decided.

Until this is resolved, the honest line the user is shown is: *the server verifies this is
the file the registry published; it does not vouch for what the file does.*

## Lifecycle

Status: **SHIPPED**

Four actions, and what each does to the module's data:

- **Enable.** The server spawns the sidecar; the module's routes, jobs and UI become
  live. Enabled is the state that survives a reboot: enabled modules are re-spawned at boot.
- **Disable.** The sidecar is stopped. The module stops running; its **data is kept
  untouched**. Enabling again resumes where it left off. Disable is the reversible off
  switch.
- **Update.** A newer version replaces the bundle and the sidecar is re-spawned. The
  module's migrations carry its data forward; settings and stored state persist across the
  update. `minServer` is re-checked, so an update that outgrows the server is refused with
  a reason rather than installed into a crash.
- **Uninstall.** The module is removed entirely. The server refuses to uninstall a module
  another enabled module still depends on, naming the dependant. Uninstall is the one
  destructive action: it is the deliberate way to remove a module *and* its data, and it is
  presented as such.

Uninstalling a module never touches media on disk. A downloads module leaves the files it
fetched exactly where they are, and the library keeps observing them,
[`library.md`](../library/README.md).

## Failure and isolation

Status: **SHIPPED**

This is the guarantee the whole architecture exists to make:

- **A crashed module cannot take down the server.** The sidecar is a supervised child
  process. If it dies, the server stays up, every other module stays up, and requests to
  the failed module get a clear error instead of a hung server.
- **An incompatible module never runs by accident.** `minServer` is enforced at install
  *and* again at spawn. A stale bundle that no longer fits the server fails to start with a
  named reason, rather than starting and emitting confusing runtime errors downstream.
- **Failure is visible, not silent.** A module that will not start or has crashed surfaces
  on the Admin Modules surface with its state and reason, [`admin.md`](../admin/README.md).

## The compatibility promise

Status: **SHIPPED**

The promise, grounded in `minServer`: **the server is forward-compatible with older
modules; a module declares the oldest server it can run against, and nothing below that
floor is ever allowed to run.** Concretely, a module installed today keeps working as the
server is updated, because the server does not retroactively break the boundary its
modules were built against. What can require action is the other direction: a *newer*
module may raise its `minServer`, and the Store says so before you install it. The floor is
checked at install and at every spawn, so a mismatch is a clear, upfront refusal, never a
half-running module.

## Module UI

Status: **AGREED**

A module **may** ship UI, and the position is deliberate: a module's frontend mounts
**inside Admin**, under that module's own section, as pages, navigation and settings for
the capability it provides. The boundary:

- A module renders **its own admin surface**: configuration, status, and controls for
  what it does. It does not reskin core, inject into other modules' surfaces, or take over
  the end-user playback experience.
- Its UI is served through the same reverse-proxy as its backend and lives and dies with
  the module: install adds the section, uninstall removes it, disable hides it.

This keeps a capability's controls next to the capability, while keeping the player and the
catalogue the server's alone.

## When a module stops being maintained

Status: **DRAFT**

The abandonment story is not fully settled, but the user must never be left guessing, and
their data must never be at risk. The designed visible signal:

- **The compatibility gate is the early warning.** As the server moves forward, an
  unmaintained module eventually fails its `minServer` against a newer server it was never
  updated for. That mismatch is surfaced by name on the Modules surface, as an
  **incompatible / unmaintained** state, rather than a silent failure to spawn.
- **Their data is retained.** An incompatible or abandoned module is not auto-removed. It
  is stopped and flagged, its data kept, so a later fixed build (or a downgrade, or a
  fork) can pick it back up. Only an explicit uninstall discards module data.
- **The honest signal.** The user is told the module has not kept pace with the server and
  is not running, is pointed at its registry entry and version history, and keeps every
  option: leave it disabled, replace it, or uninstall it deliberately.

Open: whether the registry should carry an explicit maintenance/deprecation flag a
publisher sets, versus inferring abandonment purely from the compatibility gate.

## The first-party set, and why each is a module

Status: **SHIPPED**

Every capability below could have been core. Each is a module instead, for the same three
reasons the base build ships empty, meaning isolation, unsandboxable native dependencies and
runtime installability, plus one product reason: a server that only ever plays a curated
library has no need to carry any of it.

- **Downloads and acquisition** (`tv.kroma.torrents`, `tv.kroma.acquisition`,
  `tv.kroma.indexer`, `tv.kroma.torznab`, `tv.kroma.vpn`, and the download engines
  `tv.kroma.engine.qbittorrent` / `tv.kroma.engine.transmission`). Getting bytes onto disk
  is out of scope for the library, which only *observes* what appears, [`library.md`](../library/README.md).
  This stack carries the heaviest and most legally sensitive native code in the product; it
  is exactly what should be optional, isolated and removable.
- **Transcription** (`tv.kroma.whisper`). A speech-to-text ML runtime, a large native
  dependency most servers will never enable. Its process can be spawned only when used.
- **Semantic search** (`tv.kroma.vector`). Vector embeddings and search, again a native
  ML stack, and a feature a plain catalogue does not need.
- **Network discovery** (`tv.kroma.mdns`). Advertising the server on the LAN for pairing,
  [`discovery.md`](../discovery/README.md), a capability an operator may deliberately not want
  running, so it is opt-in.
- **Remote access** (`tv.kroma.remote`). Reaching the server from outside the LAN, a
  security-relevant surface that should be an explicit, removable choice, not always-on.
- **Scene parsing** (`tv.kroma.scene`). A shared library the acquisition and downloads
  sidecars co-link, rather than a spawned sidecar, because it sits on a hot path that must
  not become a network hop.

## Not in scope

- **Getting bytes onto disk** as a library concern, covering matching, scanning and deletions, is
  [`library.md`](../library/README.md). The library observes; modules acquire.
- **Running the server**, meaning installing, enabling and diagnosing modules from the
  admin surface, is [`admin.md`](../admin/README.md).
- **Registry wiring and precedence**, covering official-vs-added, shadowing, https and
  autodiscovery, is [`../module-registries.md`](../../module-registries.md).
- **How a sidecar is built, packed, spawned and released** is
  [`../modules-as-kmod.md`](../../modules-as-kmod.md).
