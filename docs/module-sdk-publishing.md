# Publishing `@kromatv/sdk`

One package leaves this repository, public on npm: **`@kromatv/sdk`**. It is the whole
of what a module written elsewhere depends on, and the only thing published.
It is AGPL-3.0-or-later, like the rest of the repository, so a module built on
it is too.

| Inside it | From |
|---|---|
| `dist/cli.js`, the `kroma` bin | `packages/cli`, bundled with its workspace imports inlined |
| `types/<pkg>/` declarations | `packages/{module-sdk,ui,core,client,registry,i18n,spatial-nav}` |
| `types/react-native/` | the declaration files of the React Native fork the kit is typed against, so a module installs no React Native (it and its toolchain are most of a 250 MB `node_modules`; the runtime is the host's) |
| `tsconfig.module.json` | `packages/cli/tsconfig.module.json` plus `paths` mapping every `@kromatv/*` specifier and `react-native` onto `types/` |
| `rust/` | the twelve crates a sidecar links, out of `server/crates` (400 KB: the SDK's own, not the server's) |
| `templates/` | what `kroma create` renders |

Every workspace package stays `private: true`; `bun run ci sdk stage` assembles
the package under another name from their output.

## Types only: the KROMA app injects the runtime

A module's page never carries React, the kit, the SDK, `@kromatv/core` or
`@kromatv/client`. `kroma build` rewrites every import of a package the host
provides (`SHARED_MODULES` in `@kromatv/module-sdk`; `@kromatv/sdk` itself is read as
the SDK) into a read of one global, and the KROMA app fills that global before
it imports `remoteEntry.js`. So the package holds `.d.ts` files and nothing
that runs: `tsc` reads the declarations through the preset's `paths`, Vite
never resolves the packages, and a `@kromatv/*` import the host does not provide
fails the build with the list of what it does. The kit's `#ui/*` alias resolves
through the package's `imports` map, also under a `types` condition.

## Versions move in lock-step with the server

In git every package is `0.0.0`. The stage step stamps the run's version on
the package: a module written against `@kromatv/sdk@0.1.40` targets a server
`>=0.1.40`, and `module.json`'s `engines.server` says the same thing. A push
to `main` publishes `0.1.40-canary.<build>` under the `canary` dist-tag; a
`vX.Y.Z` tag publishes `X.Y.Z` as `latest`.

## The Rust half rides in the package

Cargo cannot read npm, but it follows a `path` dependency into `node_modules`.
The stage step copies the crates a module links out of `server/crates` into
`rust/` with every `{ workspace = true }` replaced by the concrete version or a
sibling path, the `[dev-dependencies]` dropped, and a `[workspace]` file so
cargo does not walk up looking for one. The scaffolded `Cargo.toml` reads
`path = "../node_modules/@kromatv/sdk/rust/kroma-module-sdk"`, so one `bun install`
delivers both halves at one version.

The closure is `kroma-module-sdk`, `kroma-module-runtime`, `kroma-module-host`,
`kroma-module-manifest`, `kroma-module-macros`, `kroma-module-wire`,
`kroma-media`, `kroma-sqlite`, `kroma-http`, `kroma-i18n`, `kroma-primitives`,
`kroma-testing`.

None of it is server code, and that is the rule the split enforces. A sidecar
used to link `kroma-domain` for seven wire types and `kroma-db` for a pool and
a grant, which shipped the core's forty-table schema and every query over it:
1.1 MB of source to reach 84 KB of contract. Those two now sit in
`kroma-module-wire` (the JSON both sides exchange) and `kroma-sqlite` (the WAL
pool, the SQLite authorizer behind a `storage` grant, and a module's own
migrations), which the server's crates re-export so nothing above them moved.

The SDK's three in-repo features are dropped from the vendored crate along with
the dependency and the comment that introduced it: `core` (the core schema, so
a first-party grant test prepares against the real tables), `domain` (all of
`kroma-domain`) and `engine` (the whole core, for the two modules that
orchestrate it).

`transcode` is not one of them. `kroma-media` is reading and re-encoding one
input and nothing else, so it ships: a module that holds a media file gets
ffprobe, the HLS engine and the per-request program over it without the database
those used to arrive with. It is in the closure for the same reason
`kroma-module-wire` is, and the crate's own dependency list is what proves it:
`kroma-module-wire`, `kroma-module-host`, `kroma-primitives`, axum, tokio,
serde, tracing, time and walkdir. No `rusqlite`, so `cargo tree` on the SDK with
`transcode` alone finds no SQLite at all.

## The lane

```bash
bun run ci sdk stage --version 0.1.40        # dist/sdk/kromatv-sdk-0.1.40.tgz
bun run ci sdk smoke                         # scaffold a module from it alone, install, check, build
bun run ci npm publish dist/sdk/kromatv-sdk-0.1.40.tgz --tag canary --dry-run
```

`release.yml` runs stage and smoke on every push and uploads the tarball as the
`kroma-sdk` artifact. It publishes `canary` when the candidate is a push to
`main` and `latest` on a stable tag, through `bun run ci npm publish`.

## npm access: trusted publishing only

There is no `NPM_TOKEN` anywhere. The jobs authenticate to npm with GitHub's
OIDC token (`id-token: write`), which needs npm 11.5.1 or later: the jobs run
Node 24 and fail early if `npm --version` is older.

For each of `@kromatv/sdk` and `@kromatv/ui`, on npmjs.com open the package,
then Settings, Trusted publisher, GitHub Actions, and enter organization
`kromatv`, repository `kroma`, workflow filename `release.yml`, environment
left empty.

`@kromatv/ui` does not exist on npm yet, and a trusted publisher can only be
attached to an existing package. Its first version is published by hand: stage
it (`bun run kit:stage --version X.Y.Z`), then `npm login` and
`npm publish packages/ui/dist/*.tgz --access public` from a machine with
publish rights on the `@kromatv` scope. Attach the trusted publisher afterwards.

## When a canary publishes

A `canary` is published only when the package's content changed. The command
fetches the tarball behind `<name>@canary`, hashes both, and skips the publish
when the hashes match, saying so in the log and the run summary. The hash is a
sha256 over every file's path and bytes in sorted path order, with
`package.json` parsed, stripped of `version` and re-serialised with sorted keys,
so the build-stamped version alone never makes a canary. A missing package or
tag counts as nothing published. Any other tag always publishes.
