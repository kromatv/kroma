# Contributing to KROMA

Thanks for your interest in KROMA! This is a self-hosted media-streaming project
a Rust server plus web and TV clients sharing one core and one design language.
Contributions of all sizes are welcome: bug reports, fixes, docs, new platform
shells, and design polish.

## Project layout

KROMA is a [Bun](https://bun.sh) workspace monorepo with a Rust server alongside it.

```
kroma/
├─ server/      Rust media server (axum) scan, SQLite, range streaming
├─ packages/    @kroma/core · @kroma/ui · @kroma/tv  (shared logic, UI, 10-foot experience)
└─ clients/     @kroma/web · @kroma/tizen · @kroma/webos  (thin platform shells)
```

See the [root README](README.md) for the full architecture and each package's
own README for details.

## Prerequisites

- **Bun** ≥ 1.3 package manager + runner ([why Bun](README.md#prerequisites))
- **Rust** ≥ 1.81 + **ffmpeg/ffprobe** for the server
- Optional, only to package TV apps: **Tizen Studio** (Samsung) · **webOS TV CLI** (LG)

## Getting started

```bash
git clone https://github.com/maxscharwath/kroma.git
cd kroma
bun install
bun run dev      # media server (:4040) + web client (:3000) together
```

With no media configured, the server seeds demo titles so the UI is populated
immediately. Point it at real files with `KROMA_MEDIA_DIRS=/path/to/media`.

`bun install` wires the repo's git hooks (`prepare` → `core.hooksPath .githooks`).
If you cloned before that existed, run `bun run hooks:install` once.

## Branch names

`<type>/<slug>`, where `<type>` is the conventional-commit type of the work:
`feat` `fix` `docs` `chore` `ci` `refactor` `perf` `test` `build` `revert` `kit`.
For example `fix/audio-transcode-fallback`. The `pre-push` hook refuses any branch
that breaks this.

## Before you open a PR

Everything must build and typecheck cleanly:

```bash
bun run typecheck          # all TS packages
bun run build              # all frontends
cd server && cargo build   # server (use `cargo clippy` if you have it)
cargo fmt                   # rustfmt is canonical; run before every PR
```

- Read [`CODE_STYLE.md`](CODE_STYLE.md) for how code is written here, and in
  particular when a comment is allowed to exist. The default is none.
- The quality gate (0 Sonar issues, 0% duplication, ~100% coverage on new
  logic) is part of done, not a follow-up: see
  [`CONVENTIONS.md`](CONVENTIONS.md#the-quality-gate-is-not-optional).
- Keep clients **thin** UI belongs in `@kroma/ui`, logic in `@kroma/core`, and the
  shared TV experience in `@kroma/tv`. Write platform code once.
- Match the existing style: the design language (deep-charcoal + amber, French
  copy, no emoji) is documented in
  [`packages/ui/README.md`](packages/ui/README.md).
- Keep the server's dependency graph **lean and Rust 1.81-friendly** (see the
  notes in [`server/Cargo.toml`](server/Cargo.toml)).
- Write clear commit messages and describe the *why* in your PR.

## Reporting bugs

Open an issue with:

- what you expected vs. what happened,
- platform (web / Samsung Tizen / LG webOS) and version,
- server logs (`RUST_LOG=debug`) and, for playback issues, the title's codec
  (`hevc` / `h264` / `av1`) plus audio (`ac3` / `eac3` / `aac`).

## License

By contributing, you agree that your contributions will be licensed under the
project's [GPL-2.0 License](LICENSE).
