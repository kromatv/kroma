# Code style

How code is written here, for humans and for agents alike. [`CONVENTIONS.md`](CONVENTIONS.md)
covers house rules that span files; this document covers the shape of the code
itself, and mostly it covers **comments**, because that is where this codebase
drifts.

The short version: **well-written code does not need to be narrated.** A comment
is a failure to express something in the language, tolerated only when the
language genuinely cannot express it.

## The default is no comment

Before writing a comment, try to delete the need for it:

| Instead of a comment                     | Do this                                        |
| ---------------------------------------- | ---------------------------------------------- |
| Explaining what a block does             | Extract it into a named function               |
| Explaining what a value is               | Name the variable properly                     |
| Explaining what an argument means        | Take a named type or an options object         |
| Explaining a magic number                | Make it a named constant                       |
| Explaining an invariant                  | Encode it in the type, or assert it            |
| Explaining what a test checks            | Name the test after what it checks             |

If, after that, the code still cannot say it — say it in a comment. That comment
is now worth reading, because it is rare.

## What a comment is for

Only two things:

1. **Why, not what.** A non-obvious constraint, a trade-off, a bug being worked
   around, a rule imposed by something outside this file (a platform, a spec, a
   vendor's API, a wire format).
2. **The public contract.** What a caller must know to use an exported thing
   correctly and cannot see from its signature.

Everything else is noise.

```ts
// Bad — restates the code
// Increment the retry counter
retries += 1;

// Bad — narrates the author's session
// I first tried a Set here but it turned out that ordering matters, so
// now we use an array and dedupe at the end.

// Good — a constraint the reader cannot see
// Tizen 6 rejects a range request whose end is past EOF; clamp before sending.
const end = Math.min(requestedEnd, size - 1);
```

## Document public API, nothing else

- **Exported / `pub` functions, types, components, hooks, and modules** get a doc
  comment (`/** … */`, `///`) when their contract is not obvious from the
  signature. One or two sentences. Say what it guarantees and what it costs the
  caller — not how it is implemented.
- **Private functions get no doc comment.** They are read together with their
  only caller. If a private function needs explaining, its name is wrong or it is
  doing two things.
- **Properties, fields, struct members, interface members, enum variants and
  constants get no doc comment.** Name them so they do not need one. A field
  called `expiresAtMs` does not need `/** Expiry timestamp in ms. */`.
- **One exception: a kit component's props.** The props of a component exported
  from `@kroma/ui` ARE its public API — a caller outside the file reads nothing
  else, and the workbench renders them as the component's help. So a prop gets
  ONE line when the contract is not visible from its name and its type: a
  default, a unit, a fallback chain, or how it interacts with another prop.
  A prop whose name and type already say it gets nothing.

```ts
// Good - states a fallback chain the type cannot
/** The size members fall back to, defaulting to the shell's. A member's own
 *  `size` still wins. */
size?: ControlSize;

// Bad - restates the name and the type
/** Design type role. Defaults to `body`. */
variant?: TypeRole;
```

  This exception is for the kit only. Props on an app-level component, and every
  other interface member anywhere, follow the rule above.
- **No `@param` / `@returns` / `@type`.** TypeScript and Rust already state the
  types, and the duplicate rots the moment a signature changes. Mention a
  parameter in prose only when its meaning is genuinely surprising.

```ts
// Bad
/**
 * Formats a duration.
 * @param ms The duration in milliseconds.
 * @returns The formatted string.
 */
export function formatDuration(ms: number): string

// Good — nothing to add, the signature says it all
export function formatDuration(ms: number): string

// Good — states something the signature cannot
/** Rounds to whole minutes; a duration under 30s formats as `0 min`, not `< 1 min`. */
export function formatDuration(ms: number): string
```

## Never write these

- **Narration and journals.** "We used to…", "This was measured on an Apple TV…",
  "After trying X we settled on Y", "Note that I…". Git history holds this. If a
  measurement matters, keep the one-line conclusion, drop the story.
- **Section banners.** `// ---- helpers ----`, `// === STATE ===`, ASCII boxes. If
  a file needs internal signposting it needs splitting.
- **File-header essays.** A module doc is at most a few lines saying what the
  module is for. Not a design document, not a rationale for the architecture,
  not a tour of the alternatives rejected. Long-form rationale belongs in
  `ARCHITECTURE.md` or a package `README.md`, where it is found on purpose.
- **Commented-out code.** Delete it. It is in git.
- **Changelog comments.** `// Added 2026-03 for the cast feature`. Git blame.
- **Restating the next line.** `// loop over items`, `// return early`.
- **Obvious type/step narration.** `// 1. Parse  // 2. Validate  // 3. Save`
  above three self-evident calls.
- **Apologies and hedging.** `// hacky but works`, `// not sure why this is
  needed`. Either find out and write the reason, or delete the comment.
- **Comments in a language other than English.** Code, comments, identifiers and
  commit messages are English. (User-facing copy is French — that is content, not
  code.)

## When a comment is worth it

Keep — and write — comments in these cases, because the code cannot carry them:

- A **workaround** for a platform, browser, or vendor bug: name the platform and
  what breaks without it.
- A **spec or protocol requirement**: cite the rule (`RFC 7233 §4.1`, `HLS
  EXT-X-TARGETDURATION must be an integer`).
- A **non-obvious performance decision**, with the reason it is not the naive
  form.
- A **security or safety constraint**: why this is validated here, why this
  ordering matters, why this must not be logged.
- A **deliberate deviation** from what the reader would otherwise assume is a
  bug.
- `SAFETY:` on `unsafe` blocks in Rust — always required.
- `TODO(owner):` / `FIXME(owner):` — only with a name and, ideally, an issue.
  An unowned TODO is deleted on sight.

Keep them **short**. One or two lines. A comment that runs a paragraph is either
a design doc in the wrong place or a sign the code needs restructuring.

## Tests

Tests document behaviour by being readable, not by being annotated.

- The test name is the sentence. `rejects a range past EOF` beats a `// should
  reject…` comment above an anonymous case.
- No `// Arrange / // Act / // Assert` banners.
- A comment in a test is warranted only for a non-obvious fixture or a subtle
  reason a specific value was chosen.

## Beyond comments

The same instinct applies to the code:

- **Name things fully.** `remainingRetries`, not `n`, not `retriesLeft2`. Short
  names are fine only for a short life (`i`, `f`, `ok` inside a five-line block).
- **Small functions with one job**, named after the job.
- **Return early**; do not nest to describe control flow.
- **Types over checks** — see [`CONVENTIONS.md`](CONVENTIONS.md) for validating
  untrusted input with zod rather than by hand.
- **No dead code, no unused exports.** `bun run deadcode` catches them.
- Follow `biome.json` for formatting and lint; run `bun run check` before a PR.

## For agents

If you are an AI agent working in this repository, these are hard rules:

1. **Do not narrate your work in the code.** No "I changed this because…", no
   summary of the approach you considered, no notes to the next reader about
   what you just did. Put that in the PR description or your response, never in
   a source file.
2. **Do not add a comment to explain a change.** The diff explains the change.
3. **Adding a comment is a decision you must justify.** If asked why a comment
   exists, "for clarity" is not an answer — name the specific thing a reader
   cannot get from the code.
4. **Do not add doc comments to private functions, fields, or properties**, even
   when writing new code and even when the surrounding file has them.
5. **When you touch a function, leave its comments no longer than you found
   them.** Cleaning up as you go is welcome; growing them is not.
6. **Never delete a comment that documents a workaround, a spec rule, or a
   safety constraint** while cleaning. Those are the ones that were expensive to
   learn.
