# RFC 107: one release model for every artifact — independent versions, compatibility by contract

- Status: **DRAFT**
- PR: #107
- Affects: `.github/workflows/release.yml`, `.github/workflows/deploy.yml`, `.github/workflows/synology.yml`, `.github/workflows/modules.yml`, `.github/scripts/resolve-version.sh`, `.github/scripts/verify-candidate.sh`, `server/**`, all client areas

## Summary

Generalise the model the `.kmod` modules **already** use to the whole repo. A module today
keeps its version in its own native manifest (`module.json`) and declares its compatibility
(`minServer`, `dependsOn`); that is the pattern. Extend it: the server versions in
`server/Cargo.toml`, each client in its `package.json` (plus a `minServer` field like the
modules have), each module stays in `module.json`. The native manifest is the single source
of truth for a version — nothing lives in a separate "versions file".

A **bumping system** — release-please, the industry-standard tool, not something we write —
reads Conventional Commits per path, decides patch/minor/major for each package, writes the
new number into that package's native manifest, regenerates its `CHANGELOG.md`, and opens a
Release PR. Merging it is the deliberate release act. A client hotfix ships that client
alone; nothing else revs. Compatibility stays coherent through `minServer`, not through a
shared number. Keep today's good parts — candidate build, promote behind a human approval —
and additionally build only what changed and assert completeness in one gate.

## Motivation

Two realities the current single-fleet-version flow fights against:

1. **Clients hotfix independently.** A Tizen-only keyboard fix should ship a new Tizen
   build and move nothing else. Today one product version stamps the whole fleet, so a
   one-client fix either drags a fleet-wide rev or ships as an unversioned patch nobody can
   name. Every app-store/self-hosted product of any size versions its clients on their own
   cadence.
2. **The version is hand-edited, un-changelogged, and always +0.0.1.** Cutting 0.1.39 was a
   human editing `server/Cargo.toml`. No `CHANGELOG.md`, and the bump ignores whether the
   delta was a `fix:` or a `feat:` — SemVer is not being derived from the commits that
   already state intent.

And two build-side facts, unchanged from the first draft of this RFC:

3. A candidate rebuilds every platform even for a one-platform change (`paths-ignore` gates
   the run, but inside it every leg builds).
4. "Complete" is assembled at promotion time, not asserted on the candidate: the Synology
   `.spk` lives in a separate workflow and is only correlated in `verify-candidate.sh`.

## Proposal

### The bumping system: release-please reads commits, writes native manifests

We do **not** hand-roll a version bumper (that is maintenance we do not want, and the norm
already exists). release-please, on every push to `main`, keeps a standing Release PR per
package: it computes the next SemVer from the Conventional Commits that touched that
package's paths, writes it into the package's **native manifest** — `Cargo.toml` for the
server, `package.json` for a client, `module.json` for a module (via the json updater) — and
regenerates that package's `CHANGELOG.md`. Merging the Release PR is the release act. The
modules leave their bespoke bump in `module-tools`/`modules.yml` for this same tool, so all
three families bump identically.

### The versioning model: independent packages, compatibility by contract

Separate two axes today's flow conflates:

- **Release cadence** — *when* an artifact ships. Made **independent per unit**.
- **Compatibility** — *which client works with which server*. Made an **explicit contract**,
  not a shared number.

Concretely:

- **One `release-please-config.json` (manifest mode), one package per releasable unit:**
  `server`, `clients/web`, `clients/tizen`, `clients/webos`, `clients/tv-native`,
  `clients/desktop`, `clients/mobile`. Each carries its own version in
  `.release-please-manifest.json`, its own `CHANGELOG.md`, and its version is computed from
  Conventional Commits scoped to its paths. A `fix(tv):` bumps only the TV clients; a
  `feat(server):` bumps only the server.
- **Component tags:** `<component>-v<version>` (e.g. `tizen-v0.1.4`, `kroma-server-v0.2.0`)
  — release-please's clean multi-package default, and the same spirit as the modules'
  existing `tv.kroma.<id>@<version>` tags. This unifies the whole repo under **one** model
  instead of "core is special, modules are special".
- **The modules fold into the same manifest** as further packages. They are already
  independent with a contract, so they are the proof this model works; bringing them under
  release-please replaces the bespoke bump logic in `modules.yml` with the same tooling.
- **Compatibility by `minServer`, a pattern already in production.** Modules already carry
  `minServer` (and `dependsOn` semver ranges) in `module.json` and are gated on it. Give
  clients the same field: a client declares the minimum server it needs and refuses an older
  one with an honest message. This is not a new contract to invent — it is the module
  contract generalised, which is exactly why it is safe. The coherence lives in `minServer`,
  not in keeping cosmetic numbers aligned.

### The build/publish flow: keep the good, fix the waste

- **Per-artifact candidate + promote.** Each package's Release-PR merge opens its version;
  the existing candidate build + `production`-approval promotion is preserved, but scoped to
  that artifact. The two human gates stay (merge the Release PR, approve the promotion).
- **Build only what changed.** Each `_release-*.yml` leg gets a path predicate; an unchanged
  platform is **reused, not skipped**, its last green artifact carried forward, so a
  candidate is always complete without rebuilding the world.
- **A complete gate per artifact, `.spk` included.** The Candidate gate asserts every
  artifact that belongs to the unit being promoted exists — the Synology `.spk` moves from a
  late `verify-candidate.sh` check into the gate. A partial candidate can never look
  promotable.

## What this costs

- **The API-compat contract must become real and enforced.** This is the keystone: without
  it, independent client versions are *more* dangerous than lockstep (silent breakage). The
  cost is a small, permanent discipline — bump the integer on breaking changes, check it on
  connect. **0.1.x is the cheapest moment this will ever be** to establish it, before many
  servers and clients are in the wild.
- **The publish flow moves from one-fleet-Release to per-artifact Releases.** Real surgery
  on `release.yml`/`deploy.yml`. Bigger than the first draft of this RFC proposed.
- **More tags and Releases** on the repo. Managed by tooling, but a busier releases page.
- **Path predicates are a sharp edge** — a wrong one silently reuses a stale artifact. The
  gate is the backstop; when unsure, the floor rebuilds.

## Compatibility

- **Existing installs / paired devices:** unaffected at switchover — the first per-package
  versions are seeded from today's `0.1.38`. The API-compat integer starts at its current
  de-facto value (1) and only moves on real breaks.
- **Modules:** their public tag scheme (`tv.kroma.<id>@<version>`) is preserved; only the
  machinery that computes the bump changes.
- **In-flight 0.1.39:** ships on the current flow first (see below); this model applies from
  the next cycle.

## Alternatives

- **Do nothing / keep one fleet version.** Rejected: it cannot express a per-client hotfix,
  the exact case that motivated this.
- **Shared `X.Y` + per-client patch `Z` (linked-versions).** A middle model: keep minor in
  lockstep, let patch diverge. Considered and set aside — it still couples cadence
  artificially and adds the linked-versions plugin, for a coherence that the API contract
  already provides more honestly. If the full split proves too heavy, this is the fallback.
- **semantic-release.** Rejected: auto-tags on push, bypassing the promotion approval gate
  that is the best property of the current design.

## Unresolved

- **The API-compat version's exact shape** — a single server integer (recommended) vs.
  per-capability negotiation. Its own follow-up RFC if it grows.
- **Modules now or later.** Folding them into the manifest in the same change vs. a
  follow-up once the core model is proven. Leaning follow-up, to bound blast radius.
- **Implementation needs `workflow` scope.** Every workflow edit here is refused to the
  automation account (`repo` scope only). Either a maintainer applies the staged workflow
  diffs, or the scope is granted for a review-only spike branch. The non-workflow pieces
  (release-please config/manifest, the API-version field) can land without it.
