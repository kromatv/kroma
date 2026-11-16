# Conventions

House rules that aren't obvious from reading a single file. Short on purpose.

For how the code itself is written (naming, structure, and when a comment is
allowed to exist), see [`CODE_STYLE.md`](CODE_STYLE.md).

## Validate with zod, never by hand

Anything crossing a trust boundary (an HTTP body, a stored blob, a third-party
JSON file, a message from another process) is parsed by a zod schema. Not by
`typeof` chains, not by `as` casts.

Do not write this:

```ts
if (typeof input !== 'object' || input === null)
  return { ok: false, reason: 'notification must be an object' };
const n = input as Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const title = str(n.title);
if (!title) return { ok: false, reason: 'title is required' };
```

Write this:

```ts
const Notification = z.object({
  title: z.string().min(1).max(256),
  body: z.string().max(1024).default(''),
});

const result = Notification.safeParse(input);
if (!result.success) return error(400, firstIssue(result.error));
```

Why, beyond it being shorter:

- **`as Record<string, unknown>` is a lie the compiler stops checking.** Every
  field read after that cast is unverified, and the type system has been told to
  stop helping. A schema produces a value whose type is *earned*.
- **Hand-written guards drift from the type they claim to guard.** Add a field
  to the interface and the validator silently keeps accepting input without it.
  With `z.infer`, the type and the check are the same declaration.
- **Bounds get forgotten.** A hand-rolled check almost never caps length; a
  schema makes `.max()` the natural thing to write, which matters when the input
  is attacker-controlled.
- **The error messages come free**, and they name the field rather than echoing
  the payload back at the caller.

Schemas live in a `schemas.ts` (or `src/schemas/`) next to what they describe:
see `packages/client/src/api/<domain>/schemas.ts` and
`packages/push-relay/worker/schemas.ts`.

The one thing that stays hand-written is a **size check before parsing**: a
schema cannot reject bytes it has not read yet, so bound the body first, then
parse.

## One file, one responsibility

A file does one thing, and its name says which. When a second responsibility
grows inside it, split at the domain seam, not at an arbitrary line count;
the thresholds and exemptions live in
[`ARCHITECTURE.md`](ARCHITECTURE.md#file-size-policy). A file you cannot name
without "and" is two files.

## Code limits are lint errors

A function does one thing and a file holds one concept. `.oxlintrc.json` says how
big that may be. None of these is switched off to land a change: split the code.

| Limit | Value | Instead |
|---|---|---|
| Lines per function | 30, blank lines and comments not counted | Extract a named function, hook or part |
| Parameters | 3 | One options object with named fields |
| Cyclomatic complexity | 8 | Return early, name the branches |
| Cognitive complexity | 15 | The same |
| Nesting depth | 3 | Extract a function |
| Lines per file | 300, blank lines and comments not counted | Split at a seam |
| Nested ternary | none | A named variable or function |
| Boolean flag parameter | none | Two named functions, or an options object |
| Body of `if`, `else` and loops | always in braces | A line added later stays inside the condition |

A test reads as a specification, so a long `describe` is fine: the two length
limits are off in `*.test.*`. Every other limit holds there too.

## A type is earned, never asserted

The compiler is told nothing it did not check:

- **No `as`, no `!`, no `any`, no `@ts-ignore`.** Parse outside data once with zod
  where it enters, and narrow with a guard inside. `as const` is not an assertion.
  `@ts-expect-error` is allowed with the reason written after it.
- **A promise is awaited, handled, or dropped on purpose.** A call whose rejection
  nothing catches is a bug the user sees as nothing happening. A fire-and-forget
  call that handles its own failure is written `void call()`.
- **A `switch` over a union names every member**, so a new member is a compile
  error at each place that has to decide about it.
- **A non-empty zod string is `.nonempty()`**, and `.min(n)` is kept for a real
  length rule.

Lint runs with type information (`oxlint --type-aware`), so these are checked on
every file, tests included.

## Legacy debt only shrinks

The two sections above were switched on over code that predates them. What that
code still owes is written down in
[`packages/lint-rules/debt/counts.json`](packages/lint-rules/debt/counts.json),
one count per rule and file, and `bun run lint:debt` (part of `bun run check`)
holds the line:

- A file with no entry owes nothing, so **new code meets every rule**.
- A file may not exceed its recorded count: legacy code does not get worse.
- A fix lowers the count. Run `bun run lint:debt --update` and commit what it
  rewrites; the check fails while the list is behind the code.

`--update` never raises a count. `--baseline` rewrites the list from the code as
it stands and exists for one case, switching a new rule on. See
[`packages/lint-rules/README.md`](packages/lint-rules/README.md#the-debt-list)
for how the list is read and what to do when the check fails.

## A file name says what it exports

Kebab-case, named after its export, then the role when the file has one:
`focusable.component.tsx` exports `Focusable`, `stage-ratio.hook.ts` exports
`useStageRatio`, `colors.ts` exports values and takes no role. Rust is snake_case.

| Suffix | The file exports | Decided by |
|---|---|---|
| `.component.tsx` | A React component, or a component's named parts (`ChoiceList = { Root, Item }`) | A PascalCase export in a `.tsx` file |
| `.hook.ts` `.hook.tsx` | A React hook | A function named `use` and a capital |
| none | Functions, values, types, or a mix of roles | Everything else |

The role is read from the code, not chosen: the export named after the file
decides, and when no export is, the exports decide if they all agree. A file that
exports a provider and its hook is a mix and keeps a plain name. Lint holds both
halves (`unicorn/filename-case`, `kroma/file-role`): a component in a plain file
fails, and so does a `.hook.ts` with no hook in it. Two places are exempt because a
router reads the name: `clients/mobile/src/app` and every `src/routes`.

After the role comes what the file is for, and last how it resolves. These are
the ones in use, and there are no others:

| Suffix | Means |
|---|---|
| `.test.ts` `.test.tsx` | A vitest suite, beside the file it covers and named after it without the role: `button.test.tsx` covers `button.component.tsx` |
| `.native.test.ts` | Must run under Metro resolution, where the plain file wins |
| `.web.ts` `.web.tsx` | The web implementation, chosen by the shells' Vite config. It comes last: `glide-box.component.web.tsx` |
| `.story.mdx` | The workbench story for a kit component |
| `.fixtures.tsx` | Rendered demo props for a story |
| `.fixture.ts` | Plain data a test or story imports |
| `.demo.tsx` | A standalone demo the workbench mounts |
| `.a11y.test.tsx` | An accessibility suite, kept separate so it can be run alone |
| `.gen.ts` | Generated. Never hand-edited, exempt from every policy |

Inventing a new suffix means changing the bundler config and the lint rule first
and the file name second, so do not.

An `index.ts` re-exports and nothing else. Logic in an `index.ts` is logic nobody
can find.

Unit tests in Rust live in a `mod tests` beside the code; API integration tests
are `src/api/it_*.rs` beside the handlers, and shared setup lives in
`test_support`, never repeated per test.

## One vocabulary for the domains

Feature slices, server crates, spec spaces and `area/` labels all draw from the
same nouns: `catalog`, `playback`, `accounts`, `admin`, `discovery`, `modules`,
`library`, `media`, `surfaces`. Learn them once and use them everywhere. A new
noun for an existing domain is how two names for one thing start, and the second
one is the one nobody searches for.

The `area/` labels are a different axis and deliberately so: they name where in the
stack the work lands (`server`, `web`, `tv`, `mobile`, `desktop`, `synology`,
`ui-kit`, `ci`, `docs`, `modules`, `sdk`), not which product domain it belongs to.
The full label set is in [`docs/TICKETS.md`](docs/TICKETS.md#labels).

Module ids are reverse-DNS: `tv.kroma.torrents`.

## Secrets belong where the source is not

The server's source is public and self-hosted by anyone, so a credential
committed to it is a credential published. Anything Apple or Google issued to
the published app lives in the relay Worker's secrets
(`packages/push-relay/`), never in the server, the app, or a settings form an
operator could fill in.

## A design value is never written raw

No hex literal, no `rgba()`, no hard-coded radius, no font size. Colour comes
from a token name (`bg="surface2"`, `color="textDim"`, `'accent/45'` for alpha),
shape from `radius`, type from a role. The point is not tidiness: a raw value is
invisible to the theme, so it survives a theme swap and a light palette as a
stain nobody sees until a user does.

The failure mode is specific and it has already happened: a value copied from the
design that is byte-for-byte identical to a token, plus near-misses that quietly
become a second palette (`#E8536A` beside `colors.danger`). If a value you need
is not a token, add the token.

## Never alpha an icon

Icons are drawn at solid opacity, and nothing translucent sits under an icon
badge. An icon is already a thin shape; alpha makes it read as disabled on an OLED
panel across a room, which is the one screen this product is designed for. To
quieten an icon, pick a dimmer colour token. Do not fade it.

## No module-scope mutable state

A `let` at module scope, or a `Map` outside a component that survives a remount,
is a global. It leaks between tests, between shells that share the module graph,
and between two mounts of the same screen. When something must outlive a remount,
hoist the component itself, which on TV means the router's chrome and backdrop
slots, rather than parking the state beside it.

Caches keyed on the theme version are the deliberate exception (`sv`, `styles()`),
and they are already written. Bind declarations with `useStyles` or `useSv`;
`Focusable` binds its `sv` prop itself. Theme and breakpoint state belong to the
nearest `KitProvider` / explicit `ThemeProvider`, including nested scopes. Use
`useThemeControls()` for changes and `config.designWidth` for a fixed canvas.

Each API client owns its bearer, media ticket and exchange coalescing. Bind event
sockets to that client explicitly. Native roots create their storage backend
before mounting and pass it through `KitProvider`; session persistence uses
`createAccountStorage(backend)`. Browser convenience readers are stateless and
resolve the platform store on each call.

## Dependencies point one way

The order is written in [`ARCHITECTURE.md`](ARCHITECTURE.md) and lint holds it:

- **Packages:** `@kromatv/client`, then `core`, then `ui`, then `tv`, each
  importing only the ones before it. No package imports a client or an app, and a
  client and an app never import each other (`no-restricted-imports`).
- **Inside a client or `@kromatv/tv`:** `shared/` knows no feature, and a feature
  knows no sibling feature. What two features need is lifted to `shared/`
  (`kroma/import-boundaries`).
- **Inside the kit:** tokens, atoms, molecules, organisms, templates. A level
  imports its own and the ones below (`kroma/import-boundaries`).

## A package is reached by name, never by path

`import { tvShellConfig } from '../../packages/bundler/src/shell'` is forbidden,
even when it resolves. Crossing a package boundary on a relative path defeats the
workspace graph: the dependency is invisible to `package.json`, to knip, and to
anyone reading the manifest to find out what this package needs. Write
`import { tvShellConfig } from '@kromatv/bundler'`.

Shared code lives in a real `@kromatv/*` workspace package, depended on by name. If
the code has no package, that is the work: give it one.

## The quality gate is not optional

A change ships with **0 Sonar issues, 0% duplication on new code, and ~100%
coverage on new logic**. Not "later", not "in a follow-up": the gate is part of
done. The scanner's scope, coverage denominator, and every reviewed suppression
live in [`sonar-project.properties`](sonar-project.properties); read it before
assuming an issue is a false positive, and prefer a code fix over a new entry
there.

Run the gate locally before pushing: `bun run sonar:precheck`,
`bun run sonar:lint`, `bun run check`, `bun run test:coverage`. Untestable glue
is excluded from the denominator deliberately, file by file, in that same
properties file: new logic goes where a test can reach it, not into an excluded
file.

## Write the idiom the analyzer expects

The smells that recur here are all cheaper to avoid at write time than to clear
later. Prefer the direct form:

- Pass a function by reference, never a closure that only forwards its argument:
  `.map(str::to_lowercase)`, not `.map(|s| s.to_lowercase())`. (Rust S1612)
- Past five parameters, take a context or options struct rather than growing the
  signature. (Rust S107)
- Match a character class with a range pattern, not a chain of `|` literals.
  (Rust S9047)
- Name an enum variant without repeating its type: `ClientMessage::Play`, not
  `ClientMessage::CastPlay`. Keep the wire spelling with `#[serde(rename)]`.
  (Rust S9039)
- No nested template literals: lift the inner one into a binding. (TS S4624)
- Use `RegExp.exec` for repeated matching, not `String.match`. (TS S6594)
- Reach a deprecated API through a narrow local type, never by reading it
  directly. (TS S1874)

## No em dashes

Not in comments, not in user-facing copy, not in documentation. Use a comma, a
colon, or a full stop. This one is purely house preference, and it is written down
only because it is otherwise invisible until review.
