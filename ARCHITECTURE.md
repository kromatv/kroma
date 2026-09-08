# KROMA architecture

> Where the in-progress structural migration is heading. A review weighed onion,
> modular, hybrid and DDD and picked a **domain-columnar polyglot hybrid**.

## The one idea

One vocabulary of **domain nouns** organizes the whole repo:

```
media · accounts · playback · library · admin · discovery
```

Each side of the wire shapes those nouns to how it changes:

- the **Rust server is layered** (I/O dominates → separate the rings),
- the **React frontends are feature-sliced** (screens dominate → group by feature).

The same noun names the server's layer-files *and* the client's feature-folders, so
knowing one side tells you where to look on the other.

## Monorepo layout (target)

Split by **role**, not by history:

```
apps/        deployables have an entry point, ship
  server/      Rust binary (embeds the web build)
  web/         Web SPA
  tv/          10-foot TV app
packages/    shared libraries imported by ≥2 apps
  core/        @kromatv/core: pure rules + outbound adapters (re-exports @kromatv/client)
  ui/          @kromatv/ui: presentational primitives + shared hooks/providers
clients/     platform shells / packaging that wrap an app for a host
  tizen/  webos/  synology/
```

Rule of thumb: has a `main()`/entry and ships → `apps/`. Imported by two apps → `packages/`.
Only adapts/packages an app for a device → `clients/`.

## Server (Rust) layered, domain as the column

The server is a **cargo workspace**. The layers are crates, so the compiler enforces
the inward-only dependency rule (an illegal `use` will not resolve), not a convention
or a CI grep. The binary is a thin HTTP shell over the engine:

```
server/
  src/                 kroma-server BINARY: main.rs + api/ (router + handlers), 8k LOC
  crates/
    kroma-engine/       infra + services + state + i18n + model  (the business logic, 20k LOC)
    kroma-db/           all SQL, one shared Pool                 (persistence, 7k LOC)
    kroma-sqlite/       the pool itself, the storage grant, a module's migrations
    kroma-domain/       entities + PURE rules (serde only, no I/O)
    kroma-module-wire/  the JSON a module and the host exchange (serde only)
    kroma-config/       env-parsed Config
    kroma-i18n/         translate + CLDR plurals (Rust port of @kromatv/core i18n)
    kroma-primitives/         timestamps · short hashes · random tokens (below db)
    kroma-whisper/   Whisper transcription (candle)   ── heavy/optional dep graphs,
    kroma-vector/        content embeddings (candle)      ── isolated behind features so
    kroma-mdns/    mDNS advertising                 ── editing the server doesn't
    kroma-http/ kroma-scene/ kroma-torznab/ kroma-torrent/   the acquisition stack
```

**Dependency graph (acyclic, compiler-enforced):**

```
kroma-server(bin) → kroma-engine → { kroma-db, kroma-whisper, kroma-vector, kroma-mdns,
                                    kroma-http, kroma-scene, kroma-torznab, kroma-torrent }
       kroma-db → kroma-domain, kroma-primitives        everything → kroma-domain / kroma-config
```

- **`kroma-domain`** depends only on serde, **never** axum/rusqlite/reqwest/process.
- **A sidecar links neither `kroma-db` nor `kroma-domain`.** The seven types it
  exchanges with the host are `kroma-module-wire`, the pool and the grant are
  `kroma-sqlite`, and both are re-exported by the crate that used to own them,
  so nothing above the seam moved.
- The layer modules keep their historical paths (`crate::db`, `crate::services`,
  `crate::model`, …) via crate aliases, so the split left call sites untouched.
- Heavy or optional dependencies (candle, mdns) live in the module that needs them,
  and each `.kmod` picks its own backend through its `[package.metadata.kmod]
  features`. The binary has no feature flags for them.
- `services/` may use db/infra/domain, never api. `api/` translates HTTP↔services and holds no business logic.
- `main.rs` + `state.rs` are the only composition points.
- The consuming domain owns **cross-cutting joins** (e.g. `continue_watching` in `db/playback.rs`, admin history in `db/admin.rs`). One Pool, so "a domain owns its tables" is a convention, not a wall.
- **Thin domains** (discovery, pairing) may collapse to a single file. Do not force the full ladder on a tiny domain.

## Frontend (React) feature slices

```
packages/tv/src/  app/(shell + providers + router)  features/{catalog,playback,accounts}/  shared/
clients/web/src/  features/{catalog,playback,admin}/  routes/ = thin re-exports
```

**Dependency rule:** `features/* → shared/* → @kromatv/ui → @kromatv/core`.

- A feature **must not import a sibling feature**. Shared code moves to `shared/` or up into `@kromatv/ui`. (Biome-guarded.)
- Wire types come only from `@kromatv/core` (the generated barrel), never hand-redefined.

## File-size policy

Hard-split files **> 300 LOC**, split **200 to 300** only at a natural seam, aim for ~150.
The **domain seam is the cut line**. Split a god-file where a domain or layer boundary
already runs through it, never at an arbitrary line. Exempt: `generated/`, vendored,
data/locale JSON, lockfiles, `*.gen.ts`, irreducible adapters (ffmpeg flag-builders).

## Migration phases

| # | Phase | Status |
|---|-------|--------|
| 0 | Guardrails (CI: domain-purity guard; zod schemas are the wire-type source of truth) | in progress |
| 1 | Server god-file split by domain (`db.rs`, `model.rs` → `db/`, `domain/`) | ✓ done |
| 2 | Server layering (`infra/` + `services/` + `api/` column + `extract.rs`) | ✓ done |
| 3 | Monorepo move (`packages/tv→apps/tv`, `clients/web→apps/web`, `server→apps/server`) | abandoned |
| 4 | Frontend feature slices (TV then web) | ✓ done |
| 5 | Hardening (one `KromaClient` namespace per domain, `packages/client/src/api/`) | ✓ done |
| 6 | Server workspace split into 14 crates (1 bin + 13 libs), binary is a thin `api` shell over `kroma-engine`; layers compiler-enforced | ✓ done |

Phase 3 is dead. Phase 6's crates gave the layering it was after, and `apps/` now holds
the web properties (kit, www, modules, packages), so the names it wanted are taken. The
product's shells stay in `clients/`, the libraries in `packages/`. See CLAUDE.md.

Each phase ships on its own, verified with `cargo test` and `bun run typecheck`/`build`.
