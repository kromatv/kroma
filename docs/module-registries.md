# Module registries

A **registry** is any static host serving a small set of JSON documents plus the
`.kmod` files they point at. No server logic is required, which is what makes a
registry universally hostable. The Store (Admin → Modules) reads every
configured registry and shows the union.

The wire format is [RFC 110](#the-wire-format-rfc-110), and it is the only one
read. The older catalogs (schema 2's `{ "modules": [...] }`, schema 1's flat
`url`/`size`/`sha256`) are not: their fields moved, and a moved field parses as
**absent** rather than as an error, so accepting them would list modules whose
dependencies and checksums had quietly gone missing. A registry serving one gets
a clear refusal instead.

## The list

| | |
|---|---|
| **Official** | Pinned first, cannot be removed or disabled. Points at `https://modules.kroma.tv/modules.json`, the first-party registry worker (`apps/modules`), which serves the merged `modules.json` this project's module release train publishes, with edge caching and a stale fallback. The URL is editable (`moduleRegistryUrl`) so it can be aimed at a mirror or a private build. |
| **Added** | Any number of operator-added registries (`moduleRegistries`), each with a name, an https URL and an enabled flag. |

**Official always wins.** When two registries publish the same module id, the
higher-precedence one supplies it and the other's copy is hidden, reported per
registry as `shadowed`. Precedence is official first, then the configured order.
A third-party registry therefore cannot take over an official module id, not
even by publishing a higher version.

## What adding a registry does and does not grant

Adding a registry only makes its modules **appear in the list**. It is not a
trust grant. Every install still goes through the same gate:

- an added registry's catalog URL must be **https**: the catalog is what names
  the artifact URL *and* the checksum to check it against, so fetching it over
  cleartext would hand a MITM both halves and make the verification worthless.
  (The official slot still accepts any scheme: it is one deliberate override and
  predates the list.)
- the artifact URL must be **https**,
- the registry must publish an **`integrity`**, and the downloaded bytes must
  match it; a module with no checksum is refused,
- the bundle declares `apiVersion` and it must be the one this server speaks;
  anything else is refused at install **and** at spawn, because a bundle built
  against an older manifest contract loses fields silently rather than loudly,
- the module's `engines` are enforced at install **and** at spawn, and an engine
  the server cannot check is refused rather than ignored,
- the catalog fetch is bounded by a timeout and a size cap, and an entry's
  `icon` is only accepted as a small inline `data:` image.

That said, a module is a **native binary that the server executes**. Adding a
registry you do not control is equivalent to trusting its operator with code
execution on the host. The list is admin-only (`settings.manage`) for that
reason.

One unreachable registry does not blank the Store: its failure is reported on
its own row and the others still contribute.

A proxying registry that degrades to an **empty catalog carrying an `error`
field** (the first-party worker does this when its upstream is down) counts as
a fetch failure, not as "this registry offers nothing": otherwise an official
outage would let a lower-priority registry claim first-party ids.

## Site URLs and autodiscovery

A registry URL may point at the registry's **website** instead of the raw JSON.
When the fetched body isn't JSON, the server looks for an RSS-style
autodiscovery tag in the page and follows it:

```html
<link rel="kroma-modules" href="/registry.json">
```

The discovered link must be https (or stay on the exact origin the operator
typed), and the second fetch is bounded exactly like the first. So
`https://modules.kroma.tv` works as a registry URL while people clicking the
same link get a browsable page. A static host can offer the same by serving an
`index.html` with that one tag beside its `registry.json`. The bare origin also
answers the descriptor directly to anything that did not ask for HTML, so a
client that pastes the origin never needs the tag at all.

## The wire format (RFC 110)

Three documents, all plain `GET`s, all sha256-verifiable end to end — plus the
schemas that describe them.

| Path | What it is |
|---|---|
| `/registry.json` | The descriptor: `apiVersion`, a display `name`, the registry's own `url`, and the module ids it serves. |
| `/index.json` | One record per module, carrying the version a bare install resolves to. Everything the Store needs to render a listing and judge compatibility, in ONE request. |
| `/m/{id}.json` | One module's full record: every version the registry serves, and the named channels (`distTags`) pointing into them. |
| `/schemas/{version}/{name}.json` | The JSON Schema for `manifest`, `registry`, `index` or `module`. `/schemas/{name}.json` is the unversioned alias. |

Point a registry entry at the registry's **root** — the descriptor lives at the
well-known `/registry.json` beneath it — and the server follows it to the
`index.json` **beside it**, resolved against the URL it actually fetched, never
the `url` the descriptor declares about itself, so a registry cannot redirect a
client somewhere else by lying about where it lives. A document declaring an
`apiVersion` this server does not know is refused rather than half-read.

The schemas are **derived** from the same definitions the reference registry
emits and parses with, so the published spec cannot drift from the running code.
They are versioned and pinned, in the shape Biome and json-schema.org use: a
later contract is a new document beside the old one, never an edit to the URL
someone already pinned. A `module.json` points at its own with

```json
{ "$schema": "https://modules.kroma.tv/schemas/2/manifest.json" }
```

which is what gives an editor completion and inline docs while authoring one.

Every artifact carries a mandatory `integrity` in Subresource-Integrity form
(`sha256-<base64>`). This is the non-negotiable that makes a third-party
registry safe: a compromised host cannot serve tampered bytes undetected.
`contentHash` is the publisher's "did the bundle actually change?" key over the
uncompressed tar — not something an installer verifies.

```json
{
  "apiVersion": 2,
  "id": "tv.kroma.notes",
  "name": "Notes",
  "version": "0.2.0",
  "description": "…",
  "author": "…", "homepage": "…", "license": "GPL-2.0-or-later",
  "keywords": ["notes"], "tags": ["download-client"],
  "engines": { "server": ">=0.1.4" },
  "library": false,
  "dependencies": { "tv.kroma.torrents": "^0.1.0" },
  "optionalDependencies": { "tv.kroma.vpn": "^0.1.0" },
  "provides": [{ "kind": "download-client", "id": "notes" }],
  "requires": [{ "kind": "indexer-engine" }],
  "artifacts": [
    {
      "target": "x86_64-unknown-linux-musl",
      "url": "https://example.org/tv.kroma.notes-x86_64-unknown-linux-musl.kmod",
      "size": 8123456,
      "integrity": "sha256-…",
      "contentHash": "sha256-…"
    }
  ]
}
```

`tags` defaults to the local half of every point the module contributes, so a
store can filter by `client` or `engine` without hand-authored tags. `apiVersion` is the
manifest contract the bundle was built against, copied out of its `module.json`;
a module declaring another one is listed with the reason and never offered.

Artifact URLs are absolute, so the metadata and the bytes may live on different
hosts. `@kroma/registry` is the contract in code: the zod schemas,
the document builders, and a typed client (`descriptor`, `index`, `module`,
`search`, `resolve`) that any conforming registry answers.

### Where the reference registry gets its modules

Two sources, and the split matters:

- **`/index.json`** is projected from the merged `modules.json` the release train
  publishes to the rolling `modules` tag. That document is the publisher's
  statement of what is *current*, and it is the only place the manifest metadata
  (icon, `engines`, dependencies, points) exists outside the bundles.
- **`/m/{id}.json`** additionally lists every version, read from the
  `<id>@<version>` **GitHub Releases themselves** — the ground truth the merged
  catalog is only a current-row projection of. Each asset carries a `digest`
  GitHub computed, which becomes `integrity` directly, so the published
  `.sha256` sidecars never have to be fetched to trust a bundle.

A historical version therefore carries its artifacts and their integrity but not
its manifest metadata: that lives inside the `.kmod`, and only the current row is
in the catalog. Enough to pin or roll back, which is the point.

The listing is walked at most three pages and cached at the edge for an hour, so
a cold request cannot turn into an unbounded crawl, and it degrades to "no
history" rather than to an error: history enriches a record, it never gates one.

## Publishing one

`bun run modules registry` turns a directory of packed `.kmod` files into a
publishable tree: the RFC 110 documents, the schema-2 mirror, and the bundles
they point at.

```bash
bun run modules:pack                                             # -> dist/modules/*.kmod
bun run modules registry --base https://mods.example.com         # -> dist/registry/
bun run modules registry --from ./bundles --out ./public --base https://mods.example.com
```

`--base` is the URL the files will be served from; it becomes each artifact's
`url` and, since everything lands in one directory, the registry's own root.
`--from` / `--out` take any directory (relative to where you ran it), so this
works on a pile of `.kmod` files outside a KROMA checkout. Upload the output
as-is and point the registry entry at its `registry.json`.

`bun run modules serve` is the same documents without the disk: it serves a
directory of bundles live on a local port, which is how you check a registry
before hosting one.

**Nothing is authored by hand.** Every field is read out of the bundles: the
manifest comes from `module.json` inside the tar, `size` and `integrity` from the
bytes. There is no metadata file to maintain alongside them and no pipeline to
run — CI here only decides *what* to publish, never what the documents say.

And the record is a cache of the bundle, not a claim above it. At install the
server unpacks the `.kmod` and re-reads its `module.json`: the id must match the
one the registry offered, and `engines` are enforced from the **bundle**. A
registry that understates either to make a module look installable is refused at
unpack time, and a wrong `integrity` fails when the downloaded bytes are hashed.

`target` is the Rust triple the binary was built for; omit it only for a library
module (manifest + frontend, no native binary), which runs anywhere. The server
picks an exact target match first, then a platform-independent bundle, then a
musl build of the same architecture, which is static, so it also runs on glibc.

Host the documents and the `.kmod` files anywhere that serves them over https
(GitHub Releases, GitHub Pages, an S3 bucket, a NAS), then add the URL under
Admin → Modules → Registries.

## Which registry serves an id

An id is resolved against the operator's **configured registry list**, in
precedence order, with official pinned first. There is no group-prefix routing:
a reverse-DNS prefix map (`com.acme` → some host) would let any module drag in a
registry the operator never approved, which is the opposite of what the list is
for. A build-time tool may map prefixes to registries for its own resolution;
the wire format does not depend on it.
