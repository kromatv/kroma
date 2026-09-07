# Publishing `@kromatv/sdk`

One package leaves this repository, public on npm: **`@kromatv/sdk`**. It is the whole
of what a module written elsewhere depends on, and the only thing published.

| Inside it | From |
|---|---|
| `dist/cli.js`, the `kroma` bin | `packages/cli`, bundled with its workspace imports inlined |
| `types/<pkg>/` declarations | `packages/{module-sdk,ui,core,client,registry,i18n,spatial-nav}` |
| `types/react-native/` | the declaration files of the React Native fork the kit is typed against, so a module installs no React Native (it and its toolchain are most of a 250 MB `node_modules`; the runtime is the host's) |
| `tsconfig.module.json` | `packages/cli/tsconfig.module.json` plus `paths` mapping every `@kroma/*` specifier and `react-native` onto `types/` |
| `rust/` | the ten crates a sidecar links, out of `server/crates` (400 KB: the SDK's own, not the server's) |
| `templates/` | what `kroma create` renders |

Every workspace package stays `private: true`; `bun run ci sdk stage` assembles
the package under another name from their output.

## Types only: the KROMA app injects the runtime

A module's page never carries React, the kit, the SDK, `@kroma/core` or
`@kroma/client`. `kroma build` rewrites every import of a package the host
provides (`SHARED_MODULES` in `@kroma/module-sdk`; `@kromatv/sdk` itself is read as
the SDK) into a read of one global, and the KROMA app fills that global before
it imports `remoteEntry.js`. So the package holds `.d.ts` files and nothing
that runs: `tsc` reads the declarations through the preset's `paths`, Vite
never resolves the packages, and a `@kroma/*` import the host does not provide
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
`kroma-sqlite`, `kroma-http`, `kroma-primitives`, `kroma-testing`.

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

## The lane

```bash
bun run ci sdk stage --version 0.1.40        # dist/sdk/kromatv-sdk-0.1.40.tgz
bun run ci sdk smoke                         # scaffold a module from it alone, install, check, build
bun run ci sdk publish --dry-run             # what `npm publish` would do
```

`release.yml` runs stage and smoke on every push and uploads the tarball as the
`kroma-sdk` artifact. It publishes `canary` when the candidate is a push to
`main` and `latest` on a stable tag, and only when the `NPM_TOKEN` secret is
set (publish rights on `@kromatv/sdk`): without it the step is skipped
and the tarball stays on the run for a hand publish.
