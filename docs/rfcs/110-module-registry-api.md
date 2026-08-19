# RFC 110: a normalized Module Registry API anyone can host

- Status: **ACCEPTED** (implemented and deployed)
- PR: #110
- Affects: `packages/registry` (the contract), `packages/module-tools` (the generator and
  the local tools), `apps/modules` (the `modules.kroma.tv` worker),
  `server/src/api/admin/store/` (catalog, registries, plan, install),
  `server/crates/kroma-module-manifest` + `kroma-module-supervisor` (the manifest, and the
  bounded fetch + checksum + schema gates), `.github/workflows/repo-worker.yml`

## Summary

Formalize the catalog `packages/module-tools` already produces (`Entry` / `Artifact`
with `sha256` integrity and per-target bundles) into a **versioned, static-hostable HTTP
contract** — so `modules.kroma.tv` is merely the *reference* registry, and anyone can host a
compatible one behind a plain file server. Add the metadata a store needs (author, tags,
keywords, homepage, license), derived at publish time. Ship one typed `Registry` client, and
a JSON Schema derived from it, so a publisher in any language can validate its output
against exactly what a client parses with.

**Three documents, not four.** `/registry.json` says who the registry is, `/index.json`
carries one record per module (so a store listing costs ONE request), `/m/{id}.json` carries
one module's every version. A separate trimmed search index was folded into `/index.json`:
it carried too little to render a store or judge compatibility, and too much to be worth a
fourth file.

## Motivation

The pieces exist but nothing is a contract: the catalog shape lives in a TypeScript type,
the URL layout is implicit, there is no documented way for a third party to publish or host
modules, no search, and no author/tag metadata for a store page. To let anyone run a KROMA
module registry — the stated goal — the wire format has to be *specified*, *versioned*, and
*verifiable*, not merely *emitted*.

"Specified" has to mean more than a document. A contract nothing validates is a contract that
drifts, so this RFC's shape is defined by schemas that **run**: the reference registry emits
through them, its client parses through them, and the published JSON Schema is generated from
them. Where the wording below and those schemas ever disagree, the schemas are the contract.

## Status

Merged in #111, and **deployed**: `modules.kroma.tv` serves the documents and the schemas
today.

The contract package (`@kroma/registry`), the generator, the paths on the reference
registry — including per-module version history read off the `<id>@<version>` release tags —
and the server's reading half: a descriptor is followed, an unknown `apiVersion` refused,
and `integrity` verified through the existing install gate. The `dependencies` rename, the
`schemaVersion` floor and `engines` landed with it, so every older shape is deleted rather
than tolerated.

Two tools came out of writing it: `modules serve` runs a registry off a directory of
bundles for local verification, and `modules install` uploads one to a running server (the
install path refuses http, so a local registry can be browsed but not installed from).

Still open, and listed under **Unresolved**: a store UI reading the new documents.

## Proposal

### 1. The wire format (static, HTTP GET only)

A registry is a set of JSON files a plain file host (Cloudflare, Pages, S3, nginx) can serve
— no server logic required, which is what makes it universally hostable.

- **`GET /registry.json`** — the descriptor: who the registry is, and which ids it serves.
  ```jsonc
  {
    "apiVersion": 1,
    "name": "KROMA modules",
    "url": "https://modules.kroma.tv",
    "modules": ["tv.kroma.torrents", "tv.kroma.acquisition"] // ids; details are per-module
  }
  ```
- **`GET /m/{id}.json`** — one module's full record (the "packument"): the current
  `Manifest` fields plus the new store metadata, and every version's artifacts:
  ```jsonc
  {
    "apiVersion": 1,
    "id": "tv.kroma.torrents",
    "name": "Torrents",
    "description": "…",
    "author": "Max Scharwath",
    "homepage": "https://…",
    "license": "GPL-2.0-or-later",
    "keywords": ["download", "torrent"],
    "tags": ["download-client"],           // capability kinds it provides, for filtering
    "icon": "…",
    "latest": "0.1.7",                                           // what a bare install resolves to
    "distTags": { "latest": "0.1.7", "beta": "0.2.0-beta.3" },   // channels (§ pre-releases)
    "versions": {
      "0.1.7": {
        "schemaVersion": 2,                                      // the MANIFEST contract it was built against
        "engines": { "server": ">=0.1.4" },
        "library": false,
        "dependencies": { "tv.kroma.x": "^0.1.0" },
        "optionalDependencies": { "tv.kroma.vpn": "^0.1.0" },
        "provides": [{ "kind": "download-client", "id": "qbittorrent", "label": "qBittorrent" }],
        "requires": [{ "kind": "indexer-engine" }],
        "artifacts": [
          { "target": "x86_64-linux", "url": "…/tv.kroma.torrents-0.1.7-x86_64-linux.kmod",
            "size": 12345, "integrity": "sha256-…", "contentHash": "sha256-…" }
        ]
      }
    }
  }
  ```

  `latest` is the version a bare install resolves to — `distTags.latest` when there is a
  stable release, else the newest version present. A pre-release publishes under its own
  channel (`0.2.0-beta.3` → `beta`) and a pre-release that names no channel (`0.2.0-1`)
  publishes under none, so it is reachable by exact range and never by accident.

  **`provides` / `requires` are the capability-interface layer** (already in
  `module.json`, mirrored into the registry). A module `provides` capabilities and
  `requires` capabilities *by `kind`* — a named interface — instead of by concrete
  module id. `requires: [{ "kind": "indexer-engine" }]` means "any module that
  provides that kind satisfies me"; `provides: [{ "kind": "download-client", "id":
  "qbittorrent" }]` declares an implementation of that interface. So the acquisition
  module needs *a* download-client and *an* indexer-engine, and qBittorrent,
  Transmission or a built-in indexer can each fill the slot — polymorphism, decoupled
  from ids. `dependencies` is the *other* axis (a specific module + version range);
  the two compose. A provider entry may also carry admin UI metadata (`label`,
  `fields`, `flow`) so the "add engine" picker is data-driven.
- **`GET /index.json`** — one record per module, carrying the **installable version**: the
  store metadata above, plus that version's `schemaVersion`, `engines`, `library`, `dependencies`,
  `provides`/`requires` and `artifacts`. It is an array of exactly the `/m/{id}.json` fields
  minus the `versions` map, with a flat `version`.

  This is the document a store reads. A KROMA server's Store must render a listing *and*
  decide, per module, whether this host can run it (`engines`, a build for this target) —
  which a name-and-description search index cannot answer, and which is not worth one
  request per module to discover. So the index is the listing and the search corpus at
  once, and `/m/{id}.json` is fetched only to install, or to show version history. See
  **Scaling** for what a registry does when this outgrows one file.
- **`GET /schemas/{version}/{name}.json`** — the JSON Schema for `manifest`, `registry`,
  `index` or `module`, so a publisher can validate its output. Derived from the reference
  implementation's zod schemas via `z.toJSONSchema`, not hand-maintained beside them (see
  **JSON Schema**). `/schemas/{name}.json` is the unversioned alias.
- **The bundles** stay where they are (release assets today); `artifacts[].url` is absolute,
  so the metadata and the bytes can live on different hosts.

A client given a registry's **base URL or its `/registry.json`** reads the descriptor and
then fetches the index **beside the document it actually fetched** — never the `url` the
descriptor declares about itself. A registry does not get to point a client at another host
by lying about where it lives. A document declaring an `apiVersion` the client does not know
is refused outright rather than half-read: an unknown major means fields it would silently
ignore.

`integrity` is **mandatory** (`sha256-<base64>`, Subresource-Integrity form): the installer
verifies every downloaded bundle against it. This is the non-negotiable that makes a
third-party registry safe — a compromised host cannot serve tampered bytes undetected. The
`sha256` field already emitted by `module-tools` becomes this, just reformatted.

### 1b. Where the metadata comes from

Every field in a version record already exists inside the `.kmod` it describes: the bundle
is a tar of `module.json` (id, version, `engines`, dependencies, `provides`/`requires`),
an icon, and the sidecar binary. `size` and `integrity` are functions of the bundle's bytes.

So a registry document is **derived from the bundles, never authored beside them**. That is
what makes "anyone can host one" true without also making it a maintenance burden: point
the generator at a directory of `.kmod` files and it opens each one, reads the manifest out
of the tar, hashes the bytes, and writes the three documents. No CI is required — CI here
only decides *what to publish*, not *what the documents say*.

The record is a **cache of the bundle, and the bundle wins.** At install the server unpacks
the `.kmod` and re-reads its `module.json`: the id must equal the one the registry offered
(otherwise a registry could advertise one id and ship a bundle that overwrites another),
and `engines` are enforced from the *bundle*, not from the record. A registry that
understates them to make a module look installable gets a refusal at unpack time.
The record exists so a client can build a store listing and resolve a dependency graph
*without downloading every bundle* — not so it can be believed over the bytes.

The same holds for `integrity`, which answers "should the registry know the hash?": it
must, and it is never hand-written. The reference registry gets it two ways, both computed
from real bytes — the packer hashes what it just wrote, and the release listing carries the
digest GitHub computed on upload. A third-party publisher gets it from the same generator.
And a wrong one is not a security hole but a loud failure: the installer hashes what it
downloaded and refuses on mismatch, so a registry cannot make a client accept bytes its own
document does not describe.

What is *not* re-checked against the bundle is the dependency and capability set — the
install planner trusts the record for those. A registry that understates them produces a
module that installs and then fails to resolve a port at runtime, which is loud but late.
Verifying the closure against each unpacked manifest is listed under **Unresolved**.

### 2. `dependencies`, and where a package comes from

**Rename `dependsOn` → `dependencies`** (and `optionalDependsOn` → `optionalDependencies`).
These are the exact npm names — one less bit of vocabulary to learn, and no camelCase
coinage. Renamed, not aliased: a reader that takes either spelling is not a transition,
it is two spellings kept forever. See **A single manifest contract** for what makes the
break safe.

A dependency value is a **plain version range**, and nothing else:

```jsonc
"dependencies": { "tv.kroma.torrents": "^0.1.0" }
```

Where a package *comes from* is answered by the **operator's registry list**, never by the
dependency line and never by the module. A KROMA server holds an ordered list — the official
registry, pinned first and unremovable, plus any the operator added — and an id is resolved
against it in precedence order. Official claiming its ids first is what stops a third-party
registry taking over `tv.kroma.*`, even by publishing a higher version.

This is deliberately *narrower* than Gradle's `repositories { … }` or npm's `.npmrc` scopes,
and the reason is the threat model. A group-prefix map (`com.acme` → `https://modules.acme.dev`)
resolved from a **module's own metadata** would let any module introduce a host the operator
never approved, and a module here is a native binary the server executes. Resolving only
against a list the operator curated means the set of hosts that can ever supply code is
exactly the set they typed in. A dependency on a group no configured registry serves is an
ordinary *"module not found"*.

A build-time tool MAY keep a prefix→registry map of its own for resolution while authoring;
that is local configuration, and the wire format does not depend on it.

**Not in v1, deliberately.** Two mechanisms were designed and cut:

- **Group-prefix routing declared by a module** (`"registries": { "com.acme": "…" }` shipped
  inside a published module), with a *trust-on-first-use* prompt the first time an unknown
  host appears. It makes a cross-registry dependency self-describing, and the prompt is a
  real mitigation. It is still a new path by which untrusted metadata proposes a code source,
  and the registry list already solves the case with one line of operator config. Revisit
  when a third-party registry actually exists and the friction is measured, not before.
- **An inline per-dependency source** (`"corp.internal.x": "^2.0.0@https://npm.corp"`,
  `"dev.fork.bar": "git+https://…/bar#^0.3.0"`). Same objection, without the prompt: it puts
  an arbitrary host in a dependency line. It is also what **Alternatives** already rejects —
  neither npm nor Gradle names the registry there.

### 3. The typed client

`@kroma/registry` is the contract in code, and the same package both emits the
documents and reads them — so the reference registry cannot publish a shape its own client
would reject:

- **schemas** — zod, because a registry is hosted by anyone and every document a client
  reads is untrusted input. Not `typeof` chains, not casts.
- **builders** — `buildDescriptor` / `buildIndex` / `buildModuleRecord`, pure, from catalog
  entries.
- **client** — `descriptor()`, `index()`, `module(id)`, `search(query)`,
  `resolve(id, range) → { version, release }`. Transport is injected, so resolution, channel
  selection and integrity are testable without a network. A range resolves to the highest
  satisfying version; a **channel name** (`beta`) resolves through `distTags`; pre-releases
  stay opt-in, so `^0.1.0` and `*` never reach one.

The server is Rust and does not consume this client: it re-implements the *reading* half
against the same documents, which is why the schema is the contract and the client is not.

### 4. Where it lands

- **`packages/registry`** (`@kroma/registry`): the contract itself — schemas, builders,
  client, derived JSON Schema. A leaf package depending on zod and nothing else, so the
  same code runs under Bun, Node and workerd. Named after the protocol, not after any one
  consumer of it.
- **`packages/module-tools`**: depends on `@kroma/registry` to emit. `modules registry`
  writes `registry.json`, `index.json` and `m/{id}.json` beside the bundles, with the new
  metadata read from each `module.json` (`author`, `keywords`, `tags`, `homepage`,
  `license` — optional manifest fields). `sha256` becomes `integrity`, reformatted.
- **`apps/modules`** (`modules.kroma.tv`): serves all four paths off the merged catalog it
  already reads, so the release pipeline is unchanged — the worker *projects* the published
  `modules.json` into the contract rather than the pipeline emitting a second set of files
  to keep in step. An unreachable catalog is a **503**, not an empty registry: those must
  not look alike to an installer.

  `/m/{id}.json` additionally reads the `<id>@<version>` **GitHub Releases**, which are the
  ground truth the merged catalog is only a current-row projection of, so a record carries
  every version ever published rather than one. Each asset's `digest` (GitHub computes it)
  becomes `integrity` directly, so the published `.sha256` sidecars never have to be fetched
  to trust a bundle. Bounded: three pages, cached an hour, and empty rather than fatal —
  history enriches a record, it never gates one, and `/index.json` never touches the listing.
- **`server/src/api/admin/store/`**: `catalog.rs` normalizes the RFC index, schema 2 and
  schema 1 into one module list, follows a descriptor to the index beside it, and turns
  `integrity` into the digest `kroma-module-supervisor`'s existing checksum gate already
  compares — so RFC bundles are verified by the same one place every other artifact is,
  rather than a second code path that could skip it.

## JSON Schema

The wire format is published as JSON Schema (draft 2020-12) at
`/schemas/{version}/{name}.json` — `manifest`, `registry`, `index` and `module` — so a
publisher in any language can validate its output. That path shape is Biome's and
json-schema.org's, and already what this repo pins against in `biome.json`.

**Versioned, because a `$id` is pinned against.** A later contract is a NEW document beside
the old one, never an edit to the URL someone already validated with, so
`packages/registry/src/{manifest,documents}/vN.ts` keeps each published version alive after
the current one moves on. `/schemas/{name}.json` is the unversioned alias for whoever just
wants the current one.

A `module.json` points at its own:

```json
{ "$schema": "https://modules.kroma.tv/schemas/2/manifest.json" }
```

which is what gives an editor completion and inline docs while authoring one — and is why
the manifest schema is published at all, rather than living only in the repo. It used to:
`modules/module.schema.json` was 220 hand-written lines checked by a 199-line hand-rolled
validator, i.e. the manifest defined twice and verified by a third implementation. Both are
gone; the zod schema is the definition, `modules:validate` parses with it, and the JSON
Schema is generated from it.

It is **derived from the reference implementation's schemas, not hand-written beside them**.
A spec maintained twice is a spec that drifts, and only one of the two copies ever runs; a
generated one is the same definition a client actually parses with. The emitted schema is
opened up on the way out (`additionalProperties` is not forced to `false`): a client is
right to drop keys it does not know, but a *validator* must not call a field a later
`apiVersion` defines invalid.

The constraints that matter, and that a third-party document is held to:

| Field | Rule |
|---|---|
| `apiVersion` | integer ≥ 1, on `/registry.json` and `/m/{id}.json` — the DOCUMENT contract. Higher than the client knows → refused. |
| `schemaVersion` | integer ≥ 1, on a manifest and on each version record — the MANIFEST contract, which moves independently. Anything but the current one is refused. |
| `id` | reverse-DNS. Checked before it reaches a URL: `../` in one would walk out of `/m/`. |
| `integrity` | `sha256-<base64>` of exactly 32 bytes. A truncated or non-sha256 digest is not "weaker verification", it is no verification, so it is rejected rather than trusted. |
| `artifacts[].target` | the Rust triple, or `null` for a bundle with no native binary. |
| `artifacts[].size` | non-negative integer. |
| `dependencies` / `optionalDependencies` | `{ id: range }`. The pre-v2 array form is refused, not read as empty. |

`provides` entries may carry admin UI metadata (`label`, `flow`, `fields`) beyond
`kind`/`id`, which the open-world rule above is exactly what allows.

## Scaling (what happens at 3 000 modules)

The design is deliberately O(1) where it matters and never scans the registry to do its job.

- **Resolve / install — already optimal, unbounded.** `resolve(id)` fetches one static file,
  `/m/{id}.json`, straight from a CDN edge. It never lists or scans the registry. 3 000 or
  3 000 000 modules is the same single cache-hit request — this is exactly how Maven Central
  (millions of artifacts) and the npm registry serve as static blobs.
- **Generation — incremental, not full-rebuild.** Publishing one module regenerates only that
  module's `/m/{id}.json` and patches its one line in the index; it does **not** re-emit 3 000
  files. Cost is O(changed), not O(registry).
- **Listing and search — the one thing that must not ship everything.** `/index.json` is the
  document that grows with the registry. It is the right trade at the sizes that exist: the
  reference registry serves every module's record today and a KROMA server caps a catalog
  fetch at 4 MiB, which is thousands of modules — and one request beats N. Past that
  threshold the same path is served in tiers, transparently to clients:
  1. **Trim the index** — drop `icon` (the largest field by far, an inline data URI) to a URL
     and the record shrinks by an order of magnitude. Still one static file.
  2. **Shard it** — `/index/{aa}.json` by id prefix, so a client fetches only the shards a
     query or a listing page touches. Still fully static.
  3. **Query endpoint** — a registry that outgrows even that puts a real search service behind
     `/search?q=…`. This is the *only* place a large registry needs server logic; the static
     floor (descriptor, per-module, sharded index) still lets anyone host without it.

  Note what does **not** tier: resolve and install never touch the index at all, so a registry
  at tier 3 installs exactly as fast as one at tier 0.
- **Verification — linear.** Building the dependency graph is O(modules) reads and O(edges)
  range checks; the topological order is O(V+E).

Net: nothing in resolution, install or verification degrades with registry size; only the
*listing* tiers up, and it tiers without breaking the static-hostable contract.

## Security

A third-party plugin registry is a supply chain, so trust is verified at every hop, and the
**server refuses to load anything it has not checked** — defence in depth on top of the
existing out-of-process module isolation.

- **Integrity, checked in exactly one place.** Every artifact carries `integrity`
  (`sha256-<base64>`, SRI form). Every path that fetches native code — first install,
  reinstall, batch update, boot-time auto-update — goes through the one gate in
  `kroma-module-supervisor` that hashes the downloaded `.kmod` and compares before it is
  unpacked or loaded; a mismatch is a hard refusal naming expected vs actual. *One* place on
  purpose: two checkers is how a caller ends up quietly skipping one. A module with no
  published checksum is refused rather than fetched unchecked. Even a compromised CDN cannot
  serve tampered bytes undetected.
- **The metadata itself.** `integrity` is only as good as the document carrying it, so a
  registry URL must be https (its catalog names the artifact URL *and* the digest that
  vouches for it — cleartext hands an on-path attacker both halves), the artifact URL must be
  https with no downgrade on redirect, the fetch is bounded by a timeout and a size cap read
  *before* parsing, and an `icon` is accepted only as a small inline `data:` image. A rogue
  host cannot answer for `tv.kroma.*` because ids are resolved against the operator's list
  with official pinned first, not against anything a module or a document claims.
- **Dependency closure verified before load — on the server.** At install the server resolves
  the *full* transitive closure and refuses the operation unless: every `dependencies` range
  is satisfied by a resolvable version, every `optionalDependencies` that is present is in
  range, every `requires` capability `kind` is provided by some module in the set, `engines`
  is met, and the graph is acyclic. No module is loaded from a set that does not fully
  resolve — the same checks the workspace verification runs at publish, re-run
  authoritatively at install against what is actually there. A partial or contradictory
  install is rejected whole, not loaded half-way.
- **Provenance by signature (not just integrity).** `integrity` proves the bytes match the
  metadata; it does **not** prove *who* published them. Each version therefore carries an
  optional `signature` over its manifest+artifact digests and a publisher `keyId`; the server
  holds a trust policy — `open` (any), `signed` (a valid signature by any key), or `pinned`
  (an allow-list of `keyId`s, per registry or per module id). The Kroma registry ships
  `signed`; a private registry can demand `pinned`. Signing is opt-in at v2 but the fields are
  reserved now so the wire format need not break to add it.
- **No install-time code execution.** A `.kmod` is data (a zstd tar of a manifest, an icon, a
  compiled sidecar); resolution and verification never execute publisher-supplied scripts (the
  npm `postinstall` class of attack has no surface here). Execution happens only after
  verification, and only in the sandboxed out-of-process host.
- **Failure is loud and safe.** Every rejection (bad hash, unmet dependency, untrusted
  signature, unreachable registry) fails closed with a specific error; the server never
  degrades to "load it anyway".

## What this costs

- A **published contract is a compatibility promise**: `apiVersion` must be bumped and old
  shapes tolerated once third parties depend on it. That is the point, but it is a cost.
- **Metadata now lives in `module.json`** (author/keywords/tags) — a small authoring burden,
  validated at publish, and eased by a `$schema` pointing at the served schema so an editor
  offers completion and inline docs while writing one.
- **Integrity enforcement** can reject an already-installed bundle if a registry rehashes
  incorrectly; the installer needs a clear error, not a silent refusal.
- **`/index.json` grows with the registry.** One request beats N at every size that exists
  today, and **Scaling** says exactly how a registry tiers out of it — but the trade is real
  and it is the one part of this contract that a very large registry has to think about.
- **The reference registry projects rather than publishes.** The contract's documents are
  derived at the edge from the released `modules.json`, so a bug in the projection reaches
  everyone at once and is fixed by a deploy rather than a re-release. Cheap either way, but
  it means the served documents are not themselves a release artifact.

## A single manifest contract

`module.json` carries **`schemaVersion`**, and a server refuses a bundle that does not
declare the one it speaks — at install, at spawn, at publish, and in the Store's
compatibility verdict so it is never offered.

Named `schemaVersion`, not `apiVersion`, because these are **two contracts that move
independently**: one versions a file a module author writes, the other versions the
documents a registry serves. A record carries both — the document's own `apiVersion`, and
the `schemaVersion` of the bundle each version describes — and one word for both would have
made that record unreadable.

That gate is what lets every older shape be deleted rather than tolerated: the array
dependency form, schema-1's flat `url`/`size`/`sha256`, schema-2's `{ "modules": [...] }`.
Tolerating them is not free, and the cost is not the code — it is that **a field which moved
parses as absent, never as an error**. A v1 bundle still spelling its dependencies
`dependsOn` installs with an empty dependency set and fails later, somewhere else, with
nothing pointing back at the manifest. A version that must be declared turns that into one
refusal with a reason.

So the contract is deliberately not backward compatible, and says so out loud:

- **Readers speak exactly one version.** Not a range, not a floor — `schemaVersion` must
  equal what the build knows. A registry document is the same: higher is refused rather than
  half-read (§1).
- **The refusal names the fix.** `'<id>' was built for manifest schema v0, and this server
  speaks v2; rebuild it against the current SDK`.
- **Every module republishes on the bump.** Which is cheap while the modules are first-party
  and the tags are per-module, and is the reason to do it now rather than at 1.0.

## Compatibility

- The generator keeps emitting the schema-2 `catalog.json`, and `modules.kroma.tv` keeps
  serving `/modules.json`, so a server predating this contract keeps working. Reading is
  **not** symmetric: a current server reads the RFC documents and nothing else (see **A
  single manifest contract**), so the default registry URL moves to `/registry.json`.
- Installed modules and their `tv.kroma.<id>@<version>` release tags are unaffected — only the
  *served metadata* is normalized and extended.
- The release pipeline is unchanged: the reference registry's worker projects the published
  `modules.json` into the contract at the edge. One published artifact, no second set of
  files to keep in step, and a fix to the projection ships by deploying the worker.
- **Deploy order matters once.** The worker must serve `/registry.json` before any server
  ships with a default pointing at it. That order holds by construction: the worker deploys
  on merge to main, and a server release is cut from a tag afterwards.

## Alternatives

- **Dynamic registry API (npm-style server).** Rejected as the baseline: it raises the bar to
  host from "serve files" to "run a service". A large registry MAY put a query endpoint behind
  `/search`, but the floor stays static.
- **A separate trimmed search index.** Rejected after building it: it could not answer "can
  this host run this module?", so a store needed the full record anyway — one request per
  module, or a fourth file duplicating the third. `/index.json` is both.
- **Per-dependency inline registry, and module-declared group-prefix routing.** Rejected for
  v1 — neither npm (`.npmrc` scopes) nor Gradle (repository `content` filters) puts the
  registry in the dependency line, and here a module is a native binary the server executes,
  so metadata must not be able to introduce a code source the operator never approved. See §2.
- **Hand-written JSON Schema beside the implementation's schemas.** Rejected: two definitions
  of one contract, only one of which runs. Derive it.
- **Do nothing.** The catalog stays a private implementation detail and no one can host a
  registry — the opposite of the goal.

## Unresolved

- **Signature key distribution and rotation.** The `signature`/`keyId` fields and the
  server trust policy are specified above, but *how a publisher's public key is discovered and
  rotated* (a `/keys.json` on the registry? a well-known transparency log, sigstore-style?) is
  left for a focused security follow-up before `signed`/`pinned` is enforced by default.
- **Yank/deprecate.** A way to mark a version withdrawn without deleting it (npm `deprecate`),
  and how the server treats an installed module whose version was later yanked.
- **Re-checking the dependency set against the unpacked bundle.** `id` and `engines` are
  already enforced from the bundle at install; `dependencies` / `requires` are still taken
  from the record (see §1b). Closing that means comparing the planned closure against each
  unpacked `module.json` and failing the install on disagreement.
- **A store UI on `modules.kroma.tv` reading the new documents.** The site still renders from
  `/modules.json`; the machine paths landed first so servers and third-party publishers have
  something to build against.
