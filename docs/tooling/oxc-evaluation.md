# Oxc house-rule enforcement and evaluation

The useful change is enforceable house rules with repair instructions agents can
read. The branch adds eleven custom rules, a guidance contract, an inactive rule
scaffolder, tests, and CI integration. `bun run lint` now runs Oxlint;
`bun run check` runs Oxlint followed by the existing Biome gate.

## Rules and rollout

- Package boundaries use workspace names and public exports.
- Runtime sources reject direct module-level mutable bindings.
- React components use ref as a prop instead of forwardRef.
- Comments use prose instead of decorative section banners.
- Index files directly re-export symbols instead of holding logic.
- Nested templates become named intermediate values.
- TODO/FIXME comments carry a real owner and a task.
- TypeScript signatures own type information instead of redundant JSDoc tags.
- Unknown records are validated instead of asserted with a cast.
- Source prose uses commas, colons, or full stops instead of em dashes.
- Consumer styles use colour, radius, and typography tokens.

Each rule has rationale, scope, repair steps, exceptions, before/after examples,
and verification commands. Run `bun run --cwd packages/lint-rules rules --json` for structured guides
or `bun run lint --format agent` for actionable diagnostics. See the
[authoring instructions](../../packages/lint-rules/README.md).

The initial scan reported **852 findings**, inventoried below. The rollout now
requires repairing that backlog before merging; the draft PR must pass the full
gate. The current repair batch leaves **155 findings**: 89 module mutable bindings
and 66 unknown-record assertions. There is no suppression baseline. Registries,
stores, and caches need an ownership review; converting them to const containers
would merely hide their mutability.

Application repairs extract implementation from barrel modules, preserve Expo
route entry points through re-exports, replace literal styles with named tokens,
and remove unchecked dynamic-global casts. TanStack file routes retain local
`Route` exports because its generator requires them; the rule recognizes that
framework contract explicitly. Size-only tokens are separate from complete text
roles, preserving both existing type ramps and current rendered dimensions.

The native rule set is explicit: no-debugger, no-eval, no-constant-condition,
no-var, and the existing no-nested-ternary policy. Broad recommended categories
are off. An exploratory scan with React/accessibility defaults produced hundreds
of additional findings, including TV-specific patterns, so those defaults are
not the chosen enforcement policy.

## Coverage and compatibility

Biome continues enforcing its recommended rules, browser-global restrictions,
JSON/CSS rules, formatting, and import organization. Its audited suppression
comments remain effective. Oxlint does not interpret `biome-ignore`: naively
copying the browser-global policy also reports 13 already audited accesses.
That policy remains in Biome during this staged adoption.

The custom mutable-binding rule is scoped to core, client, ui, tv, spatial-nav,
and module-sdk source plus client source folders. It excludes tests and type
declarations. It does not detect arbitrary mutations of const containers or
bindings inside top-level blocks. The import-boundary rule ignores root scripts,
non-workspace destinations, nonliteral imports, and TS import-equals. The
forwardRef rule does not inspect CommonJS or indirect aliases. The banner rule
recognizes hyphen/equals decorations only. These limits are also in the guides.

The stricter rules are deliberately mechanical: the record check recognizes only
an explicit Record<string, unknown> assertion; the design-token check recognizes
known style keys and literal values in configured consumer folders. Neither
proves full semantic compliance. Markdown prose, English comment quality,
responsibility boundaries, arbitrary trust-boundary validation, secrets, and
adapter-specific file-size exceptions still require review.

Oxlint's [JavaScript plugin API](https://oxc.rs/docs/guide/usage/linter/js-plugins.html)
is ESLint-compatible but alpha. Custom type-aware rules and custom parsers are
not supported there. Versions are pinned to Oxlint 1.88.0 and Oxfmt 0.73.0.
The [RuleTester](https://oxc.rs/docs/guide/usage/linter/writing-js-plugins.html)
works under Node here and rejects Bun, so tests use Node 22.12 or newer.
CI installs Node 22 explicitly. Local measurement used Node 26.5.0 and Bun 1.3.14,
which is older than the repository's declared Bun 1.4 minimum.

Biome also supports [GritQL plugins](https://biomejs.dev/linter/plugins/), including
custom diagnostics and rewrites. Oxc's benefit for this task is authoring rules in
JavaScript with AST/scope APIs and structured repair guides; custom rules alone
do not prove a complete replacement is necessary.

## Measured results

One Apple M2 Max run, one warmup and five interleaved sequential rounds, wall time
including process startup and diagnostics. Input: 3,405 tracked JS/TS files for
linting and 3,688 JS/TS/JSON/JSONC/CSS files for formatting. Current Biome excludes
are applied to both requested file lists. Oxlint actually processes 3,396 of the
source files; it skips declaration files. The corpus includes the new plugin
files. Generated evaluation snapshots are excluded from the benchmark.

| Operation | Median | Exit code |
| --- | ---: | ---: |
| biome-lint | 1311 ms | 0 |
| oxlint-native | 132 ms | 0 |
| oxlint-custom | 1088 ms | 1 |
| biome-format | 966 ms | 0 |
| oxfmt-format | 142 ms | 1 |

These are different rule sets: Biome checks its recommended rules, while the
native-only Oxc run checks five chosen rules and the custom run also checks the
eleven house rules. The small native time is not evidence for equal-coverage speed.
JavaScript plugin startup and traversal add substantial cost. This workload does
not establish that replacing Biome linting is universally much faster.

Oxfmt is faster in this run, but would change 38 files. Its output and
import sorting are not Biome parity. Import and package sorting are disabled
in the candidate's sorting options to avoid an unrelated import/package rewrite;
formatting itself is enabled. The canonical formatter stays Biome.
`bunx oxfmt --check .` is an evaluation command, not the CI gate. The Oxfmt
candidate was created with its built-in Biome migration, then reviewed.

Reproduce without rewriting source:

```sh
bun install --frozen-lockfile --ignore-scripts
bun run --cwd packages/lint-rules test
bun run --cwd packages/lint-rules compare --rounds 5 --output /tmp/kroma-oxc-comparison.json
bun run lint --format agent
```

The [raw benchmark](oxc-results.json) records versions, host, revision, config, plugin, and
corpus hashes, timing samples, diagnostic counts, and exit codes. Measurements
include existing failures. The benchmark deliberately does not apply fixes.

## Validation

- 140 focused lint-tooling tests pass, including actual CLI/config loading,
  AST false positives, structured guidance, and scaffolder path safety.
- Whole-workspace typechecking passes.
- 159 focused application test files pass (2,104 tests), covering UI core,
  registry, metadata, discovery, relays, mobile services/player, and Vite adapters.
- Biome, `bun run sonar:lint`, and `git diff --check` pass.
- `bun run check` still fails on the 155 remaining policy findings. The PR stays
  draft until repairs and required CI checks pass.

## Existing policy findings

This is the initial inventory, not the current remaining count or a suppression baseline. The gate reports every finding.
The [per-file inventory](oxc-findings.json) is machine-readable for cleanup work.

| Rule | Findings |
| --- | ---: |
| `kroma(index-reexports-only)` | 442 |
| `kroma(no-raw-design-values)` | 213 |
| `kroma(no-module-mutable-bindings)` | 89 |
| `kroma(no-unknown-record-assertions)` | 83 |
| `kroma(no-em-dashes)` | 20 |
| `kroma(no-nested-templates)` | 2 |
| `kroma(no-relative-workspace-imports)` | 2 |
| `kroma(no-redundant-jsdoc-tags)` | 1 |
