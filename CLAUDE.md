# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# KROMA

Self-hosted, direct-play media stack: a Rust server (axum + SQLite + out-of-process
module sidecars) and a Bun workspace monorepo of web, TV, mobile and desktop clients
sharing one universal component library.

See [`README.md`](README.md) for the product overview, [`ARCHITECTURE.md`](ARCHITECTURE.md)
for the structural north-star, and [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup.

## Read before writing code

- [`CODE_STYLE.md`](CODE_STYLE.md) — how code is written here. **The default is no
  comment.** Document exported API only; never private functions or fields. The one
  exception is a kit component's props, which are its public API.
  Never narrate your work in a source file.
- [`CONVENTIONS.md`](CONVENTIONS.md) — cross-file house rules (zod at trust
  boundaries, where secrets live, the values that are never written raw).
- [`packages/ui/src/components/README.md`](packages/ui/src/components/README.md) —
  the component hierarchy: the six levels, what earns a place at each, and the
  three doors out of the kit.
- [`packages/ui/src/components/DESIGN.md`](packages/ui/src/components/DESIGN.md) —
  **how a component's API is shaped**: the part vocabulary, when a `data` prop
  beats children, the controlled/uncontrolled signature, prop naming, and why
  this kit has no `asChild`. Read it before adding a component or changing
  one's props.
- [`modules/README.md`](modules/README.md) — authoring a module.
- [`docs/tv-pairing.md`](docs/tv-pairing.md) — the three roads a television
  takes to an account, what "the same network" means, and which shells can hear
  a television on the link rather than being told about it.

## Checks

These are the CI hard gates (`.github/workflows/ci.yml`):

```bash
bun run typecheck        # every TS workspace
bun run test             # vitest (two projects: web + native)
bun run check            # biome format + lint  (check:fix to write)
cd server && cargo clippy --workspace --all-targets && cargo test --workspace
bun run modules:clippy && bun run modules:test   # the module workspaces
```

The last line is not redundant: modules are separate cargo workspaces, so
`--workspace` from `server/` does not reach them (see below).

`bun run modules:check` (manifests valid + generated output in sync) and
`bun run deadcode` (knip) are **not** wired into any workflow today — run them by
hand after touching a module or a generator.

Rust is pinned by `rust-toolchain.toml` (1.96.1, with clippy + rustfmt); the
workspace `rust-version` floor is 1.88. `cargo fmt --check` is non-blocking — the
codebase uses a custom import grouping, so do not reformat files wholesale.

## Running things

```bash
bun install
bun run dev              # server:watch (:4040) + web (:3000) + tizen shell (:5174)
bun run dev:webonly      # server + web only
bun run dev:web          # web alone (Vite proxies /api -> :4040)
bun run dev:tizen        # :5174   Samsung   (arrow keys + Enter act as the remote)
bun run dev:webos        # :5175   LG
bun run dev:kit          # design-system workbench
bun run server           # cargo run --features semantic-embeddings,whisper-metal
bun run server:watch:cpu # whisper-local instead of metal (non-Apple)
bun run server:watch:lexical  # no ML features at all — fastest rebuild
```

With no media configured the server seeds demo titles. Point it at real files with
`KROMA_MEDIA_DIRS=/path/to/media`. Full env-var table in
[`server/README.md`](server/README.md); `RUST_LOG=debug` for logs.

Every root script is `<verb>:<target>` (`dev:` / `build:` / `deploy:` / `kit:`);
`bun run` with no argument lists them all. Anything targeting one workspace is
`bun run --filter '@kroma/<name>' <script>`.

### Running a single test

`bun run test` is `vitest run` over the whole repo. To narrow:

```bash
bun run test packages/core/src/hevc.test.ts        # one file
bun run test --project web -t 'rejects a range'    # one test name, one project
cd server && cargo test -p kroma-scene             # one Rust crate
cd server && cargo test --workspace parse_episode  # one Rust test filter
```

There are **two vitest projects** because the repo has two module-resolution
universes: `web` (`.web.*` files win, mirrors the shells' Vite config) and `native`
(Metro precedence, plain file wins). A test that must run under Metro resolution is
named `*.native.test.ts`; the include globs are derived from the web list so the two
cannot drift. Default environment is `node`; a test needing a DOM opts in with
`// @vitest-environment jsdom`.

## Architecture

### Server (Rust) — layered, compiler-enforced

`server/` is a cargo workspace. The layers are crates, so the inward-only dependency
rule is enforced by the compiler, not by a CI grep.

```
server/
  src/            kroma-server BINARY — main.rs + api/ (router + handlers only)
  crates/
    kroma-domain      entities + pure rules — serde ONLY, no axum/rusqlite/reqwest
    kroma-primitives  timestamps · short hashes · random tokens
    kroma-config      env-parsed Config
    kroma-db          all SQL, one shared Pool (WAL)
    kroma-engine      infra + services + state + model — the business logic
    kroma-http kroma-i18n kroma-push
    kroma-module-*    the module host: kernel, manifest, macros, sdk, runtime,
                      host, supervisor, port-bridge, modules-generated
modules/<id>/       NOT in this workspace — see below
```

`api/` translates HTTP↔services and holds no business logic; `main.rs` and the
engine's `state.rs` are the only composition points. Integration tests live beside
the handlers as `src/api/it_*.rs`.

### Modules are out-of-process sidecars

KROMA's core is playback + catalog; everything else (downloads, indexers,
acquisition, VPN, whisper, vector, mDNS, remote, scene) is a **module** with a
reverse-DNS id like `tv.kroma.torrents`.

`modules/roster.yaml` — the compile-time roster — is **empty on purpose**: this is
the zero-module base build. Every first-party module ships as an installable
`.kmod` (a zstd bundle of `module.json` + a native `module` binary + icon + `fe/`).
`kroma-module-supervisor` scans `<data>/modules/*`, spawns each enabled module as
its own process on a free localhost port, and reverse-proxies
`/api/module/<id>/*` to it; modules call back into the core over the token-authed
`/api/_host/*` API for settings/events/jobs, and open the shared SQLite directly
(WAL = multi-process). See [`docs/modules-as-kmod.md`](docs/modules-as-kmod.md) —
it also tracks the remaining cross-module port conversions.

**Each module at `modules/<id>` is its own cargo workspace** — explicit package
metadata, its own `Cargo.lock`, its own `release-kmod` profile — so it builds and
tests standalone (`cd modules/<id>/server && cargo build`). Cargo members must be
hierarchically below their workspace root, which is exactly why modules cannot be
members of `server/`. The server reaches the only three it still links (scene via
the SDK, whisper and vector behind their features) as path deps across the
workspace boundary, which cargo *does* allow.

Consequences worth knowing: features are **bare** (`--features local`, never
`kroma-whisper/local` — inside its own single-package workspace that names a
dependency); one `cargo build` can no longer select every module, so
`bun run modules plan` emits one per module against a shared
`CARGO_TARGET_DIR` (`target/kmod`); and any container that builds the server or a
module must mount the **whole repo**, not `server/`.

Authoring paths (`modules/README.md`): a **single-file** `modules/<name>.module.md`
(YAML frontmatter + fenced `tsx`/`rust`/`sql`/`svg` blocks) expanded by
`bun run modules:gen` into `modules/<id>/` beside it, or a **hand-written crate**.
Generated output is committed — re-run `modules:gen` after editing the source and
commit the result, or `modules:check` fails. Never hand-edit generated files.

```bash
bun run modules:new tv.kroma.notes   # scaffold
bun run modules:gen                  # expand + regenerate the aggregators
bun run modules:validate             # schema-check every manifest
bun run modules:pack                 # build the native .kmod
```

Modules install from **registries**: one pinned official catalog plus any the
operator adds under Admin → Modules → Registries. Official always wins an id
clash, an added catalog must be https, and every artifact is sha256-verified
before it is unpacked. See [`docs/module-registries.md`](docs/module-registries.md).

### Frontend — one component library, thin shells

```
packages/
  client/   zod schemas ARE the wire types (src/schemas/) + KromaClient + events
  core/     re-exports @kroma/client, plus HEVC detection, direct-play, i18n, remote map
  ui/       @kroma/ui — the design system, authored against React Native
  tv/       the whole 10-foot experience (spatial focus nav, home, detail, player)
  module-sdk module-registry bundler workbench push-relay ...
clients/    thin shells only: web · tizen · webos · tv-web · tv-native · mobile ·
            desktop (Tauri+mpv) · kit · site · synology · tv-build (shared TV pipeline)
```

- `@kroma/ui` is authored **against React Native** and renders natively on Apple TV /
  Android TV / iOS / Android, and through **react-native-web** on Tizen, webOS, the
  Tauri desktop shell and the web client. Components are consumed as source — no
  build step; `react`/`react-native` are peer deps. One component per file,
  kebab-case, named after its export; every component is a folder holding its code,
  story, demos and tests. Six levels, each knowing only the ones below it:
  `src/core/tokens/` → `src/components/{atoms,molecules,organisms,templates}/`.
  **Pages are not in the kit** — they live in `packages/tv/src/features/*` and
  `clients/*/src`. See `packages/ui/src/components/README.md`.
- **Components are composed, not configured.** A component that is a set of
  parts exposes them by name in Radix's shape (`<ChoiceList.Root>` /
  `.Item` / `.Label`), with the Root owning state, semantics and behaviour, and
  keeps a sugar prop for the common row so the simple case stays one line.
  Two rules Radix does not have to carry: the **whole row is the control** (one
  D-pad stop, a pointer-sized hit area), so indicators are non-pressable faces;
  and a control's shape comes from the one shell table in `lib/field-shell`,
  never from its own paddings.
- **Clients stay thin.** UI belongs in `@kroma/ui`, logic in `@kroma/core`, the TV
  experience in `@kroma/tv`. Write platform code once.
- Both `clients/web/src` and `packages/tv/src` are **feature-sliced**
  (`features/{catalog,playback,accounts,admin,…}` + `shared/` + `app`/`routes`).
  Dependency rule: `features/* → shared/* → @kroma/ui → @kroma/core`. A feature
  **must not import a sibling feature** — lift shared code to `shared/`.
- Wire types come only from `@kroma/core`, never hand-redefined. Adding or changing
  a payload means editing the zod schema in `packages/client/src/schemas/`.
- Subpath imports: `#ui/*`, `#tv/*`, `#web/*` (see `tsconfig.base.json`).
- Design tokens live in TypeScript only. `kromaUI()` (`@kroma/ui/vite`) expands
  `@import "@kroma/ui/css"` into them at build time, so there is no generated CSS
  to commit and nothing to keep in step.
- `react-native` is aliased repo-wide to `react-native-tvos` via root `overrides`
  **and** a root dependency — both entries are load-bearing (the long comment in
  `package.json` explains why); do not "clean them up".

### TV shells

Each shell is driven by its `tv.target.ts` (platform, dev port, engine floors)
through the shared pipeline in [`packages/bundler/src/shell.ts`](packages/bundler/src/shell.ts).
webOS additionally ships a **legacy tier** (ES2015 + flattened Tailwind CSS,
runtime-gated) for Chromium 53–94 TVs; `build:webos` runs a compat guard that fails
the build on anything a legacy engine cannot parse.

## Conventions worth knowing up front

- **File size:** hard-split files > 300 LOC; split 200–300 only at a natural seam.
  Cut at a domain/layer seam, never at an arbitrary line. Generated, vendored,
  locale-JSON and irreducible-adapter files are exempt.
- **zod at every trust boundary** — HTTP bodies, stored blobs, third-party JSON,
  cross-process messages. No `typeof` chains, no `as Record<string, unknown>`.
  Bound the body size by hand *before* parsing.
- **Secrets never live in the server or the app** — the server's source is public and
  self-hosted, so anything Apple or Google issued to the published app lives in the
  relay Worker's secrets (`packages/push-relay/`).
- **English for code, comments, identifiers and commit messages.** User-facing copy
  is French — that is content, not code. No emoji in the product.
- Every user-visible string is a translation key; modules ship their own
  `locales/{en,fr}.json` resolved against the module's catalog first.
