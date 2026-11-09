# Contributing to KROMA

Bug reports, fixes, documentation, new platform shells and design work are
welcome. This page sets up a development machine, shows how to run each part
of KROMA, and lists what a pull request must pass.

To install KROMA rather than work on it, see the
[setup guides](docs/setup/README.md).

## What is in the repository

KROMA is a [Bun](https://bun.sh) workspace with a Rust server beside it:

```
kroma/
├─ server/     the Rust media server: scan, SQLite, streaming, the module host
├─ modules/    the optional modules, each its own Rust workspace, built to WebAssembly
├─ packages/   shared libraries: @kromatv/client, core, ui (the design system), tv (the 10-foot app)
├─ clients/    thin shells: web, Samsung, LG, Apple TV and Android TV, mobile, desktop, Synology
└─ apps/       the websites: kroma.tv, the kit, the module catalog
```

[ARCHITECTURE.md](ARCHITECTURE.md) explains how the parts depend on each other,
and each package has its own README.

## Set up your machine

These steps work on macOS and Linux. On Windows, use WSL 2.

### Install the tools

| Tool | Version | Used for |
| --- | --- | --- |
| [Git](https://git-scm.com) | any recent | the repository |
| [Bun](https://bun.sh) | 1.4 or later | installing packages and running every script |
| [Node.js](https://nodejs.org) | 22.12 or later | the lint plugins and the Expo command line |
| [Rust](https://rustup.rs), through `rustup` | the version in `rust-toolchain.toml` | the server and the modules |
| `cargo-watch` | any | rebuilding the server when you save |
| ffmpeg and ffprobe | any recent | reading media and converting it |

1. Install Bun:

   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. Install Rust with `rustup`:

   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

   You do not choose a version. The first `cargo` command in the repository
   installs the one that `rust-toolchain.toml` pins, with its components and
   targets.

3. Install `cargo-watch`, which `bun run dev` uses to rebuild the server:

   ```bash
   cargo install cargo-watch --locked
   ```

4. Install ffmpeg and Node.js:

   ```bash
   brew install ffmpeg node                 # macOS, with Homebrew
   sudo apt install ffmpeg nodejs npm       # Debian and Ubuntu
   ```

   Check that `node --version` prints 22.12 or later. If your distribution ships
   an older one, install Node.js from [nodejs.org](https://nodejs.org) instead.

### Get the code

```bash
git clone https://github.com/kromatv/kroma.git
cd kroma
bun install
```

`bun install` also points Git at the repository's hooks in `.githooks`. If you
cloned before the hooks existed, run `bun run hooks:install` once.

### Start KROMA

```bash
bun run dev
```

This starts three things together:

| Address | What runs there |
| --- | --- |
| `http://localhost:4040` | the server, rebuilt when you save a Rust file |
| `http://localhost:3000` | the web app, which sends `/api` to the server |
| `http://localhost:5174` | the Samsung TV app, in the browser: arrow keys and Enter act as the remote |

The first build of the server takes several minutes. When the log shows
`KROMA listening on http://0.0.0.0:4040`, open `http://localhost:3000` and
create an account. The first account is the owner.

With no media folder configured, the server shows demo titles. To use your own
files, start it with the folder:

```bash
KROMA_MEDIA_DIRS=/path/to/media bun run dev
```

The development server keeps its data in `server/data`. Delete that folder to
start again from an empty server.

Optional: for faster server rebuilds, install the Dioxus command line. The
server then patches the running process instead of restarting it:

```bash
cargo install dioxus-cli@0.7.10 --locked
```

### Run one part at a time

| Command | What it starts |
| --- | --- |
| `bun run dev:webonly` | the server and the web app |
| `bun run dev:web` | the web app alone, against a server you already run |
| `bun run server` | the server alone, without rebuild on save |
| `bun run dev:webos` | the LG TV app in the browser, on `:5175` |
| `bun run dev:kit` | the design system workbench |
| `bun run dev:site` | the kroma.tv website |
| `bun run dev:mobile` | the phone app, with Expo |

`bun run` with no argument lists every script. The phone, TV and desktop apps
need their platform's tools to run on a device; each client's README says
which:
[mobile](clients/mobile/README.md), [Samsung](clients/tizen/README.md),
[LG](clients/webos/README.md), [Apple TV and Android TV](clients/tv-native/README.md),
[desktop](clients/desktop/README.md).

### Work on a module

Modules are built to WebAssembly. The target is installed with the pinned
toolchain. See [modules/README.md](modules/README.md) to create, build and
install one on your development server.

## Branch names

Name a branch `<type>/<slug>`, where `<type>` is the conventional-commit type
of the work: `feat`, `fix`, `docs`, `chore`, `ci`, `refactor`, `perf`, `test`,
`build`, `revert` or `kit`. For example `fix/audio-transcode-fallback`. The
`pre-push` hook refuses any other name.

## Before you open a pull request

Run the checks CI runs. Each one must pass:

```bash
bun run check            # lint and formatting (bun run check:fix repairs what it can)
bun run typecheck        # every TypeScript package
bun run test             # the TypeScript tests
bun run ci rust clippy   # the server and every module
bun run ci rust test     # the Rust tests
```

To run one test file or one Rust crate, see "Running a single test" in
[CLAUDE.md](CLAUDE.md#running-a-single-test).

Then check the pull request itself:

- Read [CODE_STYLE.md](CODE_STYLE.md) for how code is written here, especially
  when a comment may exist. The default is none.
- Read [CONVENTIONS.md](CONVENTIONS.md) for the rules that span files. The
  quality gate, with no new Sonar issue, no duplication and coverage on new
  logic, is part of done.
- Keep the clients thin: interface in `@kromatv/ui`, logic in `@kromatv/core`,
  the TV experience in `@kromatv/tv`.
- Change a module's `version` in its `module.json` in the same commit as any
  change to that module.
- Change the [setup guides](docs/setup/README.md) in the same pull request when
  a screen, a setting or a default they describe changes. They follow
  [Writing documentation](docs/writing-docs.md).
- Title the pull request as a conventional commit. The squash title sets the
  next version: `feat` and `fix` bump it, `!` marks a breaking change, and
  `chore`, `ci`, `docs`, `refactor` and `test` bump nothing. See
  [docs/ci.md](docs/ci.md).

The house lint rules live in [packages/lint-rules](packages/lint-rules/README.md).
`bun run --cwd packages/lint-rules rules --json` prints what each rule wants,
and `bun run --cwd packages/lint-rules new <name>` starts a new one.

## Report a bug

[Open an issue](https://github.com/kromatv/kroma/issues) with:

- what you expected, and what happened instead;
- the device and the KROMA version;
- the server log, with `RUST_LOG=debug` if you can reproduce it;
- for a playback problem, the codecs of the file: open the title and choose
  **Media details**.

Security problems go through [SECURITY.md](SECURITY.md), not an issue.

## License

By contributing, you agree that your contributions are licensed under the
project's [AGPL-3.0-or-later](LICENSE).
