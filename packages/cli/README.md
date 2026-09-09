# @kromatv/sdk

Build KROMA modules. One package: the SDK, the design system's types, the Rust
crates a sidecar links, and the `kroma` CLI.

```bash
bunx @kromatv/sdk create                 # a few questions, then a project ready to run
cd tv.acme.notes
bunx kroma login http://localhost:4040   # once; an account with settings.manage
bunx kroma dev                    # build, install, rebuild on every save
bunx kroma check                  # manifest, types, clippy
bunx kroma build                  # dist/modules/tv.acme.notes.kmod (+ .sha256)
bunx kroma install --server http://kroma.local:4040
```

Bun 1.4 or newer, and a Rust toolchain for a module with a sidecar (the
scaffold pins one in `rust-toolchain.toml`). The project depends on `@kromatv/sdk`
and nothing else of KROMA's: the SDK and the kit as declarations (a page's
runtime is the KROMA app's, injected when the module loads), and the Rust SDK
crates under `node_modules/@kromatv/sdk/rust`, which the scaffolded `Cargo.toml`
path-depends on.

## What a module is

```
tv.acme.notes/
  module.json          the manifest: id, version, engines, points, storage
  icon.svg
  locales/{en,fr}.json every user-visible string is a key
  ui/src/module.tsx    export default defineModule({ pages: [...] })
  server/              a cargo workspace: the sidecar the server spawns
  package.json         depends on @kromatv/sdk
  tsconfig.json        extends @kromatv/sdk/tsconfig
```

`kroma build` compiles the sidecar with the `release-kmod` profile, builds the
frontend into `fe/` (a bundle that takes React, the design system and the SDK
from the host at load time, so a page renders inside the host's theme with one
React on the page), and packs `module.json` + `module` + the icon + `fe/` into a
zstd tar. A `.kmod` carries a native binary, so it matches one platform:
`--target x86_64-unknown-linux-musl` cross-compiles for a NAS, and the server
tells `kroma install` which target it runs.

`kroma dev` uploads a debug build to the server and re-uploads whatever half
changed on every save: the server stops the old process, keeps the module's
database, and spawns the new one. The server can be this machine or another
one on the network.

## Commands

| Command | What it does |
|---|---|
| `create [dir]` | Scaffold a module. `--yes` takes every default; `--kind full\|server\|ui`, `--storage`. |
| `dev` | Build once, install, then rebuild and reinstall on every save. `--target` for a server on another platform. |
| `build [dirs]` | Pack `.kmod` bundles into `dist/modules`. `--target`, `--debug`, `--skip-build` (CI's prebuilt binaries). |
| `check [dirs]` | Manifest valid, frontend typed and its imports in bounds, clippy clean. `--no-rust`, `--no-ts`. |
| `install [id]` | Upload a packed bundle to a server. `--file`, `--from`, `--server`, `--token`. |
| `login [server]` | Sign in once; the token is kept in `~/.config/kroma/cli.json`. |
| `plan` | The cargo lines CI runs in its cross-compile container. |
| `cargo <sub>` | One cargo subcommand in every module workspace. |
| `registry` / `serve` | A directory of bundles as a static or live RFC 110 registry. |
| `release` | Which packed modules publish on their own tags, against the live catalog. |

With no directory given, `build`, `check`, `plan` and `cargo` run over the
module in the current directory, or over every `modules/*` below it: the same
CLI drives one module and the KROMA repository's twelve.

## What a frontend may import

`@kromatv/sdk` (the SDK, also reachable as `@kromatv/module-sdk`), `@kromatv/ui/kit` and
`@kromatv/ui/tokens`, `@kromatv/core`, `@kromatv/client` and every
`@kromatv/client/<domain>`, `@kromatv/i18n`, `react`, `react-dom`,
`react-native`, `@tanstack/react-query`, `@tanstack/react-router`,
`react-call`. The host provides all of them and the bundle never carries
them; a deep kit import (`@kromatv/ui/kit/atoms/button`) is folded onto
`@kromatv/ui/kit`, and any other `@kromatv/*` import fails the build. Anything
else (`zod`, an icon set, your own code) is bundled.

See [`modules/README.md`](https://github.com/kromatv/kroma/blob/main/modules/README.md)
for the module model: points, storage, events, the runtime contract.
