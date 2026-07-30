# KROMA

Rust media server + Bun workspace monorepo (web, TV, mobile, desktop clients).
See [`README.md`](README.md) for architecture and [`CONTRIBUTING.md`](CONTRIBUTING.md)
for setup.

## Read before writing code

- [`CODE_STYLE.md`](CODE_STYLE.md) — how code is written here. **The default is no
  comment.** Document exported API only; never private functions, fields, or props.
  Never narrate your work in a source file.
- [`CONVENTIONS.md`](CONVENTIONS.md) — cross-file house rules (zod at trust
  boundaries, where secrets live).

## Checks

```bash
bun run typecheck        # all TS packages
bun run check            # biome format + lint
cd server && cargo clippy --workspace
```
