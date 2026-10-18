# KROMA lint rules

Oxc enforces concrete requirements from `CONVENTIONS.md` and `CODE_STYLE.md`.
The root `lint` command runs Oxlint; `check` runs it before Biome. CI runs the
rule tests and `check`. Biome continues enforcing its existing rules, formatting,
and import organization. Oxfmt is available for evaluation only.

## Commands

The root package keeps the existing `lint`, `format`, `check`, and `check:fix`
scripts. Rule development lives in this workspace package. From the repository
root, use `bun run --cwd packages/lint-rules <command>`, or change into this
package and use:

| Command | Purpose |
| --- | --- |
| `bun run rules [name] [--json]` | Read repair guides |
| `bun run new <name>` | Scaffold an inactive rule draft |
| `bun run test` | Test the rules and tooling |
| `bun run coverage` | Run the tests and generate LCOV for Sonar |
| `bun run compare [--rounds 5] [--output /tmp/results.json]` | Run the comparison |

Use `bun run lint --format agent` at the repository root for agent diagnostics.
Oxfmt remains available with `bunx oxfmt --check .` for evaluation.

## Use the rules

```sh
bun run lint
bun run lint --format agent
bun run --cwd packages/lint-rules rules
bun run --cwd packages/lint-rules rules no-relative-workspace-imports
bun run --cwd packages/lint-rules rules --json
bun run --cwd packages/lint-rules test
```

`bun run lint --format agent` uses Oxlint's agent output format. Every custom
diagnostic includes a concrete action and the local repair-guide command. `bun run rules --json` emits
structured guidance that an agent can read before editing: `id`, `description`,
`why`, `scope`, `repair`, `exceptions`, `verification`, `invalid`, and `valid`.
Guidance lives beside each rule implementation. The helper rejects missing fields,
empty examples, and unfinished TODO placeholders when a rule is imported.

Node.js 22.12 or newer is required. Bun launches the scripts, but Oxlint's
JavaScript bridge and RuleTester run under Node. Do not replace the rule test
command with `bun test`: the installed RuleTester does not support that runtime.

### no-relative-workspace-imports

Use package names and public exports between declared workspaces. Inspects
static imports, re-exports, literal dynamic imports, and unshadowed `require()`.
Same-workspace relative imports remain valid. The source and destination must
both belong to a declared workspace under one of the root workspace folders.
Run `bun run --cwd packages/lint-rules rules no-relative-workspace-imports` for repair steps.

### no-module-mutable-bindings

Reject direct top-level `let` and `var`, including named exports, in configured
runtime source folders. Tests and declaration files are excluded. Move mutable
state to its owner rather than hiding it in a `const` object. Theme-version caches
need an individually reviewed exception with a reason. This rule does not claim
to detect arbitrary mutation of `const` objects, Maps, or Sets.
Run `bun run --cwd packages/lint-rules rules no-module-mutable-bindings` for repair steps.

### no-react-forward-ref

Reject React's `forwardRef` named imports/re-exports and default/namespace member
accesses. Aliases and computed string properties are covered; shadowed variables
and unrelated libraries are allowed. Use a plain component with `ref` as a prop.
Run `bun run --cwd packages/lint-rules rules no-react-forward-ref` for repair steps.

### no-comment-banners

Reject comment lines framed with hyphens/equals and decorative separators.
Strings and prose are allowed. Preserve workaround and safety rationale while
removing decoration or extracting a named function/module.
Run `bun run --cwd packages/lint-rules rules no-comment-banners` for repair steps.

### index-reexports-only

Keep `index.ts` and `index.tsx` as direct re-export barrels. Declarations,
local imports, local exports, and executable statements belong in named modules.
Type-only and namespace re-exports are allowed. TanStack file routes retain their
local `Route` declaration because the route generator requires it; these framework
entry points are not barrels.

### no-nested-templates

Name inner interpolated text before building an outer template. Conditional
computation and side effects must keep their original evaluation order. Tagged
templates and independent function bodies are outside this check.

### owned-task-comments

Write `TODO(real-owner): task` or `FIXME(real-owner): task`, ideally with an issue
reference. Empty owners, placeholder owners, and empty tasks are rejected.
Prose and strings discussing task markers are allowed.

### no-redundant-jsdoc-tags

In TypeScript, replace `@param`, `@return`, `@returns`, and `@type` with concise
public-contract prose when needed. JavaScript JSDoc can carry types and remains
allowed. This check does not judge whether ordinary prose is redundant.

### no-unknown-record-assertions

Reject `as Record<string, unknown>` and the equivalent angle-bracket assertion.
Use a bounded Zod schema at trust boundaries. An annotation or `satisfies` is
allowed for trusted assignable data. This checks a specific assertion pattern;
it cannot prove that every external input has been validated.

### no-em-dashes

Reject em dashes in JS/TS comments, strings, JSX text, and template text. Use a
comma, colon, or full stop. Regexes are allowed. Oxlint does not cover Markdown,
JSON, or CSS prose; those files still need review.

### no-raw-design-values

Consumer styles and JSX props use named colour, radius, and type tokens. Reject
literal hex/rgb/hsl colours in known colour properties, literal font sizes, and
literal radii. Zero radius resets are allowed. The token/core layer, icon data,
tests, and fixtures are excluded. Computed values and CSS strings are not checked.

### re-export-from

Re-export with `export … from` when a file imports a binding only to export it
again. A binding the file also uses, in code or in a type, stays as it is.
Mirrors Sonar S7763, which oxlint's `unicorn/prefer-export-from` port cannot:
the port counts the `export type { … }` line itself as a use.

### use-state-pair

Destructure `useState` into `[value, setValue]`, the setter named after the
value. Keeping the value alone, `[slide]`, is allowed. Mirrors Sonar S6754,
which accepts a lone value where `react/hook-use-state` does not.

For every rule above, run `bun run --cwd packages/lint-rules rules <rule-name>` for the full scope,
exceptions, examples, and verification steps.

## Add a rule

```sh
bun run --cwd packages/lint-rules new no-example-pattern
```

The command creates `drafts/no-example-pattern/rule.mjs` and refuses to overwrite
an existing draft. Drafts are inactive and intentionally incomplete. Complete
all guidance fields, implement the AST visitors, and add RuleTester cases for
both violations and legitimate lookalikes. Read `src/rules/house-rules.test.mjs`
and the config integration test for examples.

Move the implementation into `src/rules/`, update the helper import to
`../define-rule.mjs`, and register it in `src/index.mjs`. Add the named rule to
`.oxlintrc.json` as an error, using an override when scope is part of the policy.
Run `bun run --cwd packages/lint-rules test`, `bun run --cwd packages/lint-rules rules <name>`, and `bun run lint`.
For a rule with options, define `meta.schema` and test each supported option.

A good diagnostic names the violation, its consequence, the next action, and the
repair-guide command. A good repair guide names public APIs and paths, explains
permitted cases and known blind spots, supplies minimal before/after examples,
and gives commands that verify behavior. Keep guidance specific enough that an
agent can act without guessing the architecture.

Do not add an automatic fix unless it preserves semantics without a design
choice. These eleven rules deliberately leave repairs to the author. A suppression
uses `// oxlint-disable-next-line kroma/rule-name -- concrete reason` and needs an
actual policy exception, not a desire to make the gate green. Biome suppressions
continue applying to Biome only.

## Evaluation

See [the evaluation](../../docs/tooling/oxc-evaluation.md) for the known backlog
and coverage differences. JavaScript plugins are still
[alpha upstream](https://oxc.rs/docs/guide/usage/linter/js-plugins.html), so Oxlint
is pinned. Its [plugin guide](https://oxc.rs/docs/guide/usage/linter/writing-js-plugins.html)
documents the ESLint-compatible API and RuleTester.

## The SonarCloud mirror

`bun run lint:sonar` runs `.oxlintrc.sonar.json`, and `bun run check` runs it,
so a change that would fail the SonarCloud quality gate fails locally first.
The file is generated: `bun run sonar:rules` reads the project's TypeScript
quality profile from SonarCloud and `sonar-project.properties`, then writes:

- every active rule SonarSource ships in `eslint-plugin-sonarjs`, with the
  profile's parameters, run through oxlint's JavaScript plugin bridge;
- the borrowed rules with a faithful equivalent: S3863 `import/no-duplicates`,
  S7761 `unicorn/prefer-dom-node-dataset`, S7776 `unicorn/prefer-set-has`,
  S7763 `kroma/re-export-from`, S6754 `kroma/use-state-pair`;
- Sonar's scope: test files and `sonar.exclusions` ignored, and one override per
  `sonar.issue.ignore.multicriteria` entry, so an issue the project accepted
  there is accepted here too.

Left to the CI scan: rules that need type information (oxlint's plugin bridge
has none), and borrowed rules whose oxlint port disagrees with Sonar on code
Sonar accepts: S6481 (the port also flags function-call results), S7721 and
S7787 (`export {}` is flagged by the port only). Regenerate after the profile
or the ignores change, and commit the result.
