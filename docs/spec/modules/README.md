# Modules

Status: **SHIPPED** overall. The out-of-process model, the `.kmod` bundle, the Store,
install-by-id and by-upload, checksum verification, dependency resolution and the
compatibility gate are all released. The trust posture and the abandonment story are decided
but not yet built, and say so. Every section carries a status; the file-level label is the
floor.

**MOD-1** (SHIPPED) - The base build ships **zero modules**. Everything past playback and
catalogue, meaning downloads, indexers, acquisition, VPN, transcription, embeddings, network
discovery and remote access, arrives as an installable `.kmod` whose backend runs *out of the
server process*, and every module is therefore uninstallable from Admin.

That is the load-bearing decision of this domain, chosen for three reasons:

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

**MOD-2** (SHIPPED) - A module is a self-contained capability with a reverse-DNS id
(`tv.kroma.torrents`). It brings its own backend, its own data, its own settings and,
optionally, its own admin UI.

**MOD-3** (SHIPPED) - Within its own process a module has wide latitude: it registers
services, schedules jobs, and serves HTTP the server reverse-proxies under its own id.

**MOD-4** (SHIPPED) - A database is a **declared capability**, not something every module
gets. A module that declares no storage gets none. A module that declares storage gets its own
file, plus whatever slice of the core data it named, and no more than that slice.

What a module may **not** do:

- **MOD-5** (SHIPPED) - It may not reach into the server's process or another module's
  process. Every cross-boundary call is an explicit, typed request over the local callback API
  or a named port, never a direct function call into core internals. The boundary is a wire,
  not a linker symbol.
- **MOD-6** (SHIPPED) - It may not replace core. Playback, catalogue, accounts and the
  library's read-and-observe contract are the server's; a module extends the server, it does
  not substitute for it.
- **MOD-7** (SHIPPED) - It may not claim a first-party module id it does not own.
- **MOD-8** (SHIPPED) - It may not assume it is present. Because any module is uninstallable,
  core never depends on one, so a feature that needs a module is absent, not broken, when the
  module is gone.
- **MOD-51** (SHIPPED) - It may not read or write the server's own credentials. The settings
  callback withholds every key only the server consumes, meaning the mail, LLM and push
  credentials plus the registry list modules are installed from: a read answers the module's
  own default and a write naming one is refused. A credential whose consumer *is* a module
  stays reachable, because that callback is how it reaches the process that uses it.

**MOD-9** (SHIPPED) - A module *may* depend on another module, hard or optional, and that
dependency is declared, resolved and enforced rather than discovered at runtime.

## The `.kmod` bundle

Status: **SHIPPED**

**MOD-10** (SHIPPED) - A module ships as a single `.kmod` file: a manifest, the native
backend binary, an icon and the module's own frontend, packed together. At product level the
manifest is the contract.

The manifest declares:

- **MOD-11** (SHIPPED) - **Identity and version.** The reverse-DNS id and a hand-set version.
  The version is the source of truth for whether an update exists.
- **MOD-12** (SHIPPED) - The release process refuses to publish changed bytes under an
  unchanged version, so "there is a newer version" always means there is genuinely newer code,
  never a silent re-issue.
- **MOD-13** (SHIPPED) - **`minServer`, the compatibility floor.** The minimum server version
  the module needs, as a bare version or a range. This is the whole compatibility contract.
- **MOD-14** (SHIPPED) - **Dependencies.** Hard ones that must be installed alongside it, and
  optional ones offered but not required.
- **MOD-15** (SHIPPED) - **Target.** Which platform the backend was built for. A library-only
  module, a manifest and frontend with no native binary, declares no target and runs anywhere;
  everything else ships per platform and the server picks the artifact that fits the host.

**MOD-16** (SHIPPED) - The server checks the bytes it downloads against a published SHA-256
and refuses a bundle whose checksum does not match or that publishes none.

**MOD-17** (SHIPPED) - Integrity is not safety: a matching checksum proves the bytes are the
ones the registry named, not that they are trustworthy.

## Installation

Status: **SHIPPED**

Two paths, one outcome: the module is unpacked under the server's data directory and its
sidecar is spawned:

- **MOD-18** (SHIPPED) - **From the Store**, by id. The server resolves hard dependencies
  automatically, offers optional ones and capability providers, so a module that needs a
  download engine is offered the engines the catalogue advertises, verifies every download's
  checksum, and enforces `minServer` before it installs anything.
- **MOD-19** (SHIPPED) - **By upload**, handing the server a `.kmod` by hand: same unpack,
  same spawn, same `minServer` gate. This is for an air-gapped server, a private build, or a
  module on no registry.

**MOD-20** (SHIPPED) - Both are admin actions on the [`admin/`](../admin/) surface.

## The Store

Status: **SHIPPED**

**MOD-21** (SHIPPED) - The Store (Admin → Modules) is the in-app browser over the configured
registries, and shows the union of every registry's catalogue.

**MOD-22** (SHIPPED) - The official registry is pinned first and cannot be removed; operators
may add their own.

**MOD-23** (SHIPPED) - For each module the Store shows **this server's verdict**, not just the
catalogue entry: which artifact matches this host's platform, the installed version and whether
an update exists, and whether the module is compatible with this server and, if not, the
reason. A `minServer` the server does not satisfy is named, never hidden.

That verdict is the point: a person decides to install or update against what *their* server
will actually do, before committing. Registry precedence, https requirements, shadowing of
duplicate ids and the empty-catalogue-is-a-failure rule are specified in
[`../module-registries.md`](../../module-registries.md).

## Trust

Status: **AGREED**

**The registry is the trust boundary, not the module.** A module is a native binary the
server executes, and nothing KROMA can check about the bytes changes that. So the one place
consent is asked is where a source of modules is added, and it is asked in those terms.

- **MOD-24** (AGREED) - **First-party is trusted by default.** The official registry is
  pinned, first-party and curated, and a module from it installs without a trust prompt.
- **MOD-25** (AGREED) - **A third-party registry is an explicit operator opt-in.** Adding one
  is admin-only and is *not* a trust grant to its modules; it only makes them visible.
- **MOD-26** (AGREED) - The operator is told, in plain terms, that a module is a native binary
  the server will execute, so adding a registry they do not control is equivalent to trusting
  its operator with code execution on the host.
- **MOD-27** (AGREED) - **Checksums guarantee integrity, never safety**, and the server says so
  where it matters: on the add-registry flow and on installing a non-first-party module.

**MOD-48** (AGREED) - The Store names the registry every module came from, on the listing and
on the module's own page, so an operator can always see whose code they are about to run.

**MOD-49** (AGREED) - Installing from a registry the operator added is gated once, per
registry, on an explicit acknowledgement that its modules run as native code on this host. The
acknowledgement is recorded; it is not asked again per module.

**KROMA does not sign modules, and the official catalogue has no curated-versus-community
tier.** Both were candidates and both are declined. A signature proves a publisher is the same
publisher as last time, which the registry already establishes, and it does not make a module
safe: a signed malicious module is malicious. Paying for key management, a signing service and
a barrier to every third-party author, to buy continuity the registry already gives, is the
wrong trade for a product where the operator owns the machine and installs by choice. A
curated tier is worse than nothing, because it puts KROMA's name on a safety claim about code
KROMA did not write.

The line the person is shown stays what it always was: *the server verifies this is the file
the registry published; it does not vouch for what the file does.* That sentence is now the
whole policy rather than a placeholder for one.

## Lifecycle

Status: **SHIPPED**

Four actions, and what each does to the module's data:

- **MOD-28** (SHIPPED) - **Enable.** The server spawns the sidecar and the module's routes,
  jobs and UI become live. Enabled is the state that survives a reboot: enabled modules are
  re-spawned at boot.
- **MOD-29** (SHIPPED) - **Disable.** The sidecar is stopped, the module stops running, and
  its **data is kept untouched**, so enabling again resumes where it left off. Disable is the
  reversible off switch.
- **MOD-30** (SHIPPED) - **Update.** A newer version replaces the bundle and the sidecar is
  re-spawned. The module's migrations carry its data forward, and settings and stored state
  persist across the update.
- **MOD-31** (SHIPPED) - `minServer` is re-checked on update, so an update that outgrows the
  server is refused with a reason rather than installed into a crash.
- **MOD-32** (SHIPPED) - **Uninstall.** The module is removed entirely. It is the one
  destructive action, the deliberate way to remove a module *and* its data, and it is presented
  as such.
- **MOD-33** (SHIPPED) - The server refuses to uninstall a module another enabled module still
  depends on, and names the dependant.

**MOD-34** (SHIPPED) - Uninstalling a module never touches media on disk. A downloads module
leaves the files it fetched exactly where they are, and the library keeps observing them
([`library/`](../library/)).

## Failure and isolation

Status: **SHIPPED**

This is the guarantee the whole architecture exists to make:

- **MOD-35** (SHIPPED) - **A crashed module cannot take down the server.** The sidecar is a
  supervised child process. If it dies, the server stays up, every other module stays up, and
  requests to the failed module get a clear error instead of a hung server.
- **MOD-36** (SHIPPED) - **An incompatible module never runs by accident.** `minServer` is
  enforced at install *and* again at spawn, so a stale bundle that no longer fits the server
  fails to start with a named reason rather than emitting confusing runtime errors downstream.
- **MOD-37** (SHIPPED) - **Failure is visible, not silent.** A module that will not start or
  has crashed surfaces on the Admin Modules surface with its state and its reason
  ([`admin/`](../admin/)).

## The compatibility promise

Status: **SHIPPED**

**MOD-38** (SHIPPED) - The server is forward-compatible with older modules. A module declares
the oldest server it can run against, and nothing below that floor is ever allowed to run.

**MOD-39** (SHIPPED) - A module installed today keeps working as the server is updated,
because the server does not retroactively break the boundary its modules were built against.

**MOD-40** (SHIPPED) - A *newer* module may raise its `minServer`, and the Store says so
before it is installed. The floor is checked at install and at every spawn, so a mismatch is a
clear, upfront refusal, never a half-running module.

## Module UI

Status: **SHIPPED**

**MOD-41** (SHIPPED) - A module **may** ship UI, and the position is deliberate: a module's
frontend mounts **inside Admin**, under that module's own section, as pages, navigation and
settings for the capability it provides.

- **MOD-42** (AGREED) - A module renders **its own admin surface**: configuration, status and
  controls for what it does. It does not reskin core, inject into another module's surface, or
  take over the end-user playback experience.
- **MOD-43** (SHIPPED) - A module's UI is served through the same reverse proxy as its backend
  and lives and dies with the module: install adds the section, uninstall removes it, disable
  hides it.

This keeps a capability's controls next to the capability, while keeping the player and the
catalogue the server's alone.

## When a module stops being maintained

Status: **AGREED**

**Abandonment is inferred, never declared.** The person must never be left guessing, and their
data must never be at risk:

- **MOD-44** (AGREED) - **The compatibility gate is the early warning.** As the server moves
  forward, an unmaintained module eventually fails its `minServer` against a newer server it
  was never updated for, and that mismatch is surfaced by name on the Modules surface as an
  **incompatible or unmaintained** state rather than a silent failure to spawn.
- **MOD-45** (AGREED) - **Data is retained.** An incompatible or abandoned module is not
  auto-removed. It is stopped and flagged and its data kept, so a later fixed build, a
  downgrade or a fork can pick it back up. Only an explicit uninstall discards module data.
- **MOD-46** (AGREED) - **The signal is honest.** The person is told the module has not kept
  pace with the server and is not running, is pointed at its registry entry and version
  history, and keeps every option: leave it disabled, replace it, or uninstall it
  deliberately.

**MOD-50** (AGREED) - A module that has disappeared from every configured registry is flagged
the same way a module that fails its floor is, and for the same reason: it is a signal the
server can read without anyone's cooperation.

**A registry carries no publisher-set deprecation flag.** It was the other candidate and it is
declined, because a flag has to be set at exactly the moment the publisher has stopped caring.
A signal that only conscientious publishers raise does not cover the case it exists for, and
shipping it would let an unflagged abandoned module read as maintained. The compatibility gate
and a vanished catalogue entry both fire on their own, so those are the two signals, and both
are honest about being inferences rather than announcements.

## The first-party set, and why each is a module

Status: **SHIPPED**

**MOD-47** (SHIPPED) - Every capability below could have been core and is a module instead,
for the same three reasons the base build ships empty, meaning isolation, unsandboxable native
dependencies and runtime installability, plus one product reason: a server that only ever plays
a curated library has no need to carry any of it.

- **Downloads and acquisition** (`tv.kroma.torrents`, `tv.kroma.acquisition`,
  `tv.kroma.indexer`, `tv.kroma.torznab`, `tv.kroma.vpn`, and the download engines
  `tv.kroma.engine.qbittorrent` / `tv.kroma.engine.transmission`). Getting bytes onto disk
  is out of scope for the library, which only *observes* what appears, [`library/`](../library/).
  This stack carries the heaviest and most legally sensitive native code in the product; it
  is exactly what should be optional, isolated and removable.
- **Transcription** (`tv.kroma.whisper`). A speech-to-text ML runtime, a large native
  dependency most servers will never enable. Its process can be spawned only when used.
- **Semantic search** (`tv.kroma.vector`). Vector embeddings and search, again a native
  ML stack, and a feature a plain catalogue does not need.
- **Network discovery** (`tv.kroma.mdns`). Advertising the server on the LAN for pairing,
  [`discovery/`](../discovery/), a capability an operator may deliberately not want
  running, so it is opt-in.
- **Remote access** (`tv.kroma.remote`). Reaching the server from outside the LAN, a
  security-relevant surface that should be an explicit, removable choice, not always-on.
- **Roku** (`tv.kroma.roku`). A Roku runs no shared client code, so its channel is a second
  UI written in BrightScript, sideloaded through the box's developer installer. A shell that
  only some homes own, with a sideload flow the console has no other reason to carry.
- **Scene parsing** (`tv.kroma.scene`). A shared library the acquisition and downloads
  sidecars co-link, rather than a spawned sidecar, because it sits on a hot path that must
  not become a network hop.

## Not in scope

Status: **AGREED**

- **Getting bytes onto disk** as a library concern, covering matching, scanning and deletions, is
  [`library/`](../library/). The library observes; modules acquire.
- **Running the server**, meaning installing, enabling and diagnosing modules from the
  admin surface, is [`admin/`](../admin/).
- **Registry wiring and precedence**, covering official-vs-added, shadowing, https and
  autodiscovery, is [`../module-registries.md`](../../module-registries.md).
- **How a sidecar is built, packed, spawned and released** is
  [`../modules-as-kmod.md`](../../modules-as-kmod.md).
