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
see `packages/client/src/schemas/` and `packages/push-relay/worker/schemas.ts`.

The one thing that stays hand-written is a **size check before parsing**: a
schema cannot reject bytes it has not read yet, so bound the body first, then
parse.

## One file, one responsibility

A file does one thing, and its name says which. When a second responsibility
grows inside it, split at the domain seam, not at an arbitrary line count;
the thresholds and exemptions live in
[`ARCHITECTURE.md`](ARCHITECTURE.md#file-size-policy). A file you cannot name
without "and" is two files.

## A file name says what it exports, and a suffix says how it resolves

Kebab-case, named after its export: `focusable.tsx` exports `Focusable`,
`stage-ratio.ts` exports `useStageRatio`. Rust is snake_case. `packages/ui` holds
this without exception; `packages/tv` has drifted to PascalCase in about a third
of its files, so name a new file correctly wherever it lands and rename a
neighbour only when you are already changing it.

A suffix is a resolution instruction, not decoration. These are the ones in use,
and there are no others:

| Suffix | Means |
|---|---|
| `.test.ts` `.test.tsx` | A vitest suite, beside the file it covers |
| `.native.test.ts` | Must run under Metro resolution, where the plain file wins |
| `.web.ts` `.web.tsx` | The web implementation, chosen by the shells' Vite config |
| `.story.mdx` | The workbench story for a kit component |
| `.fixtures.tsx` | Rendered demo props for a story |
| `.fixture.ts` | Plain data a test or story imports |
| `.demo.tsx` | A standalone demo the workbench mounts |
| `.a11y.test.tsx` | An accessibility suite, kept separate so it can be run alone |
| `.gen.ts` | Generated. Never hand-edited, exempt from every policy |

Inventing a new suffix means changing the bundler config first and the file name
second, so do not. A file that fits none of these is a plain `name.ts`.

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
and they are already written.

## A package is reached by name, never by path

`import { tvShellConfig } from '../../packages/bundler/src/shell'` is forbidden,
even when it resolves. Crossing a package boundary on a relative path defeats the
workspace graph: the dependency is invisible to `package.json`, to knip, and to
anyone reading the manifest to find out what this package needs. Write
`import { tvShellConfig } from '@kroma/bundler'`.

Shared code lives in a real `@kroma/*` workspace package, depended on by name. If
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
