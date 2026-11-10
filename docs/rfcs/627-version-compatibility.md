# RFC 627: version compatibility between servers, modules and apps

- Status: **DRAFT**
- PR: #627
- Affects: `docs/spec/modules/README.md`, `docs/spec/surfaces/README.md`,
  `docs/spec/accounts/README.md`, [RFC 110](110-module-registry-api.md)'s official registry.
  Areas `area/server`, `area/modules`, `area/sdk`, `area/web`, `area/tv`, `area/mobile`,
  `area/desktop`

## Summary

A KROMA server, its modules and its apps release on separate schedules, and none of them
can tell which versions of the others it works with. A server is offered a module's
newest version or nothing. An app learns that its server moved on only when a feature
breaks with an unrelated error.

This RFC proposes one rule and four changes:

0. A module never asks for a server newer than the release being prepared, and the
   release train refuses one that does.
1. The official registry describes every version of a module in full, not only the
   newest.
2. When a module's newest version does not run on a server, the Store offers the newest
   version that does.
3. A module's compatibility is read from the interface its component was built against,
   not only from a floor someone typed.
4. Apps say which app and version they are. The server says which is the oldest it
   serves, and an app below that tells its viewer to update.

## Motivation

**An LG television failed every title with a codec error (#606).** The viewer ran the
webOS app 0.1.38, the newest on the releases page, against the Docker `latest` image,
which follows `main`. Since #234 (2026-09-10) every media URL must carry a media ticket.
The 0.1.38 app predates it, sends none, and is refused with a 401 that it reports as
"unavailable or codec not supported". Reproduced in the webOS 26 simulator against
`main`. The server could not tell the app was too old, and the app could not tell the
server had moved on.

**A floor can name a server that does not exist.** 0.1.39 is the release being
prepared: the canary builds are its prereleases, `0.1.39-canary.<build>`, and come
before it. Yet `tv.kroma.acquisition` 0.4.0 (2026-10-18) and 0.4.3 (2026-10-20) were
published asking for server 0.1.40. No server, canary or stable, could run them. While
each was the newest version, every server was refused the module, until the next release
put the floor back to 0.1.39. Nothing in the release train noticed.

**A server is offered the newest version or nothing.** The registry describes only the
newest version of a module: `/m/tv.kroma.vpn.json` lists 31 versions, and only the newest
carries `engines`. The other 30 carry nothing but their download, so a server cannot
judge them and is offered none, even when the version before the newest would have run.
Today all 14 modules need 0.1.39, the first release that runs them as WebAssembly
components. When a module next needs a capability added after a release, every server
still on that release will be refused it.

**The history the registry does serve is already incomplete.** The worker reads at most
3 pages of 100 GitHub releases (`apps/modules/src/lib/releases.ts`). The repository has
390, so `tv.kroma.vpn` shows 31 of its 34 versions, and the gap grows with every release.

**The floor is a guess, and it has no ceiling.** `engines.server` is written when a module
is scaffolded and raised by hand. What a module really depends on is the host interface
its component imports, `kroma:module@0.2.0`, and the manifest schema it was packed
against. A server that broke that interface would still accept every module whose floor
it clears, and the module would fail at instantiation with a linker error instead of a
named refusal in the Store.

## Proposal

### 0. What a version means

- The release being prepared is the version in `server/Cargo.toml`, 0.1.39 today. It has
  not been released. The newest release is 0.1.38.
- A canary build is a prerelease of the release being prepared, `0.1.39-canary.<build>`,
  and semver orders it before 0.1.39. Its server reports the release it leads to, 0.1.39,
  when it judges a module, so a module written for 0.1.39 runs on the canaries that lead
  to it.
- A module's server floor names a released server or the release being prepared, never a
  later one. `kroma check` and `kroma release` refuse a floor the release being prepared
  does not meet, because no server built from this tree could run that module.

### 1. Every version described in full

RFC 110 already has room for this: `/m/{id}.json` maps each version to a full record
(`versions[v]`), with the same fields the index carries for the newest one. The official
registry fills that record for the newest version only.

- The module release train keeps a version history beside the catalog: every version it
  ever published, as the registry serves it. Each run folds the catalog it writes into
  the history it read, so a version enters the history the run it is published and is
  never removed. The history is a second asset on the rolling `modules` release, so the
  catalog every Store page reads does not grow with it.
- The registry builds `/m/{id}.json` from that history, and falls back to the release
  listing only for a version the history does not describe.
- A rebuild command reconstructs the history from the repository: each
  `<module-id>@<version>` tag holds the exact `module.json` that release packed, since the
  bundle copies it as is, and the release's assets carry each artifact's size and
  digest. It seeds the history once and is the recovery path afterwards.
- A version described by its download alone is one the server cannot judge, and the Store
  never offers it. Unknown compatibility is treated as incompatible.

This is the shape the package registries converged on. Cargo's index keeps one
append-only record per crate version, carrying its `rust-version`. npm's packument carries
every version's `package.json`, `engines` included.

### 2. The Store offers the newest version that runs

When a module's newest version is refused, the server reads that module's full record
from the registry it came from and picks the highest version that passes the same gate
the newest failed: the manifest schema, the `engines`, and a component artifact. A
prerelease is considered only when the newest version is itself one.

- The Store row shows that version as the one it would install, and names the newest with
  its reason, in the shape "4.2.0 needs a newer server than this one. 4.1.3 runs here."
- Installing, updating, updating everything and automatic updates all read that row, so
  none of them can offer a version this server would refuse. Once the server is updated,
  the next catalog read offers the newer version.
- An installed version newer than the newest runnable one is left alone. It is flagged as
  the spec's abandonment rules already describe (MOD-44 to MOD-46), and never downgraded
  without the operator asking.
- Each dependency resolves to its own newest runnable version. A dependant whose range
  that version misses is refused, naming both, as it is today.

Precedents: Cargo's resolver falls back to the newest version whose `rust-version` the
toolchain meets (`incompatible-rust-versions = "fallback"`, the default since 1.84). VS
Code installs "the latest compatible version" of an extension whose newest needs a newer
editor. `npm-pick-manifest` skips versions whose `engines` the running Node does not meet.

### 3. Compatibility read from the component

- The server publishes the contract it implements: the manifest schema (3) and the host
  interface (`kroma:module@0.2.0`).
- `kroma build` records the interface version the component actually imports into the
  bundled manifest as `engines.host`, so a Store can judge a version before downloading
  it.
- At install and at spawn the server also checks the imports of the component itself,
  because the bytes are the truth and a hand-edited manifest is not.
- Two interface versions are compatible when semver says so, which is the rule wasmtime's
  linker already applies to versioned imports: `0.2.0` and `0.2.1` resolve to each other,
  and `0.3.0` does not (wasmtime 50, `component::Linker`, "Names and Semver").
- `engines.server` stays, as the floor for a host capability added in a given server
  release. It is no longer the whole contract, and the spec's MOD-13 changes with it when
  this part ships.

### 4. Apps and the server agree

- Every request an app makes names the app and its version in one header,
  `X-Kroma-Client: <shell>/<version>`, the way Jellyfin's `X-Emby-Authorization` and
  Plex's `X-Plex-Product` and `X-Plex-Version` do.
- `/api/health` publishes `minClient`, the oldest app version the server serves. It is a
  constant in the server's source. A pull request that breaks an app contract, as #234
  did, raises it in the same change and says so in the release notes.
- An app below `minClient` opens one screen instead of failing a feature: this app is too
  old for this server, and here is where to update it. An app that needs a newer server
  than the one it reached says the same about the server.
- The server records the version each device last used, from the header, on its session.
  The device list shows it and marks any device below `minClient`. For apps already
  installed, which will never send the header, this is the only lever.

## What this costs

- A history document the release train must keep append-only. If it is lost or
  corrupted, the rebuild command restores it from the tags. Rebuilt from every release
  on 2026-11-10, it describes 345 versions of 14 modules in 750 KB, and the rebuild took
  about a minute and a half.
- One extra registry request per module whose newest version is refused, on each catalog
  read. With 14 official modules this is small, and the worker caches it at the edge.
- A rule people must follow: `minClient` moves only on purpose. Raising it too eagerly
  strands televisions, which update on their vendor's schedule (SURF-38). Forgetting to
  raise it is how #606 happened.
- A promise about the host interface: a breaking change to `kroma:module` must change its
  version, or the check in part 3 lies.

## Compatibility

- **Servers already released** do not read the history. They behave exactly as today.
- **Third-party registries** are unaffected. RFC 110 does not change, and `kroma registry`
  can fold the same history in a follow-up.
- **Modules.** A server released before part 3 refuses an engine it does not know, so a
  module that declares `engines.host` would be refused by it. The server side of part 3
  therefore ships one release before `kroma build` starts writing the field.
- **Apps already installed** send no header. The server treats a missing header as an
  unknown version, never as too old, because it cannot tell. The device list shows those
  sessions as "version unknown".
- **Older web clients** ignore the new Store fields and still see an installable row.

## Alternatives

- **Do nothing.** Every server release that raises a module floor strands the servers on
  stable, and every contract change on the server repeats #606 on whichever apps have not
  updated.
- **Read each version's manifest from its release.** It is the ground truth, but building
  one record would cost two requests per version, since GitHub redirects every download,
  and the 300-release cap stays. Rejected for the worker. The rebuild command reads the
  same source once.
- **Put the history in `modules.json`.** One document fewer, but every Store page and the
  registry's website would parse every version of every module.
- **A joint dependency resolver** in the style of PubGrub. Correct, and not needed for 14
  modules whose ranges are floors. Deferred until a pair of modules needs it.
- **Serve media without a ticket to apps that send none.** That reopens the hole #234
  closed.
- **Hand-written upper bounds in `engines.server`.** Still a guess. The component already
  says what it imports.

## Unresolved

- How a canary app compares with `minClient`. Semver orders `0.1.39-canary.<build>`
  before 0.1.39, so a `minClient` of 0.1.39 refuses every canary of that release,
  including the ones built after the change that raised it. Decided with the app work in
  part 4, before any client sends its version.
- Whether `minClient` is one number or one per shell. All shells share one product version
  today, so one number is proposed. Decided with the app work in part 4.
- Whether the Store offers an explicit "install this version" for a rollback. The history
  makes it possible. Nothing in this RFC needs it.
- How a television app words "update this app", which depends on how it was installed:
  from LG's or Samsung's store, or sideloaded. Decided with the app work in part 4.
