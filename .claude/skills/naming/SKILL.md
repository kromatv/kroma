---
name: naming
description: What things get called. A file is named after its export in the project's case convention, a suffix is a resolution instruction rather than decoration, an index file only re-exports, and some symbol names are always wrong (utils, helpers, V2, Enhanced, New). Covers learning a tree's local vocabulary before adding to it, test and platform-variant naming, and the per-language conventions. Use when creating a file or directory, naming a test file, adding a platform variant, or when a name has to change. Triggers - "what should I call this file", "where does this file go", "naming convention", "kebab or camel", "name this test".
---

# Naming

A name is read far more often than it is written, and a wrong one costs every
later reader a lookup. Two questions answer most cases: what does this file
export, and what suffix says how it is resolved.

## Learn the local vocabulary first

Naming is the one area where matching the neighbours beats any rule here. Before
adding a file, look at what surrounds it:

```bash
ls path/to/the/directory
git ls-files 'src/**' | head -50
```

Two neighbours agreeing is the convention. If they disagree, the project's own
docs settle it: check `CONVENTIONS.md`, `CODE_STYLE.md`, `CONTRIBUTING.md` or the
agent instructions at the repository root.

## Files

**Named after its export, in one case convention per language.** The file, its
main export and its folder carry the same name. Pick up the project's case from
the tree and do not mix two in one directory.

Kebab-case is the common choice for TypeScript and JavaScript: `focusable.tsx`
exports `Focusable`, `stage-ratio.ts` exports `useStageRatio`. Rust and Python are
snake_case. Go is lower-case, no separator. Java and C# are PascalCase because the
language ties the file to the type.

A tree that has drifted is normal. Name a new file correctly wherever it lands,
and rename an off-convention neighbour only when you are already changing it. A
rename commit that touches nothing else is its own change.

## The suffix vocabulary

A suffix is a resolution instruction, not decoration. It tells a bundler, a test
runner or a platform which of several files wins, so inventing one that nothing
resolves is worse than no suffix at all.

Learn the set already in use before adding to it:

```bash
git ls-files | grep -oE '\.[a-z0-9]+\.[a-z]+$' | sort | uniq -c | sort -rn
```

The families that recur across projects:

| Family | Means |
|---|---|
| `.test.*` `.spec.*` | A test suite, beside the file it covers |
| A platform or target segment before the extension | Which build picks this file: web, native, server, a specific engine |
| `.story.*` `.stories.*` | A design-system story for a component |
| `.fixtures.*` `.fixture.*` | Props or data a test or story imports |
| `.d.ts` | Types only |
| `.gen.*` `.generated.*` | Generated. Never hand-edited, exempt from every policy |

Invent no new suffix. A file that does not fit the set in use is a plain
`name.ext`, and a genuinely new resolution rule is a change to the build config
first and a file name second.

## A component is a folder

Where a component owns more than its own code, give it a directory and let
everything inside share its name:

```
focusable/
  focusable.tsx
  focusable.test.tsx
  focusable.fixtures.tsx
  focusable.story.mdx
  index.ts
```

The folder, the file and the export all carry the same name. An `index.ts`
re-exports and nothing else:

```ts
export * from './focusable';
```

Logic in an `index.ts` is logic nobody can find.

## Test files

A test file is the file under test plus the project's test suffix, in the same
directory. Not a parallel `__tests__` tree, not a `tests/` folder at the package
root, unless that is already the project's convention.

Where a test has to run under a different resolution or a different runner
project, the suffix is what selects it, so read the runner's config to see which
globs it owns before naming the file. Guessing here produces a test that never
runs, which is worse than no test because it reads as coverage.

Per-language conventions that are the language's, not a project's:

- **Rust**: unit tests in a `#[cfg(test)] mod tests` beside the code; integration
  tests in the crate's `tests/` directory. Some projects keep API integration
  tests beside the handlers behind a prefix instead. Follow the tree.
- **Go**: `_test.go` beside the file, same package for unit tests.
- **Python**: `test_*.py`, wherever the project's runner is configured to look.

The name *inside* the test is a different rule and belongs to the project's test
skills: the test name is a sentence about behaviour, the file name is about
resolution.

## Symbols

- **Name things fully.** `remainingRetries`, not `n`, not `retriesLeft2`. Short
  names are fine only for a short life: `i`, `f`, `ok` inside a five-line block.
- **A name that says nothing is always wrong.** `utils`, `helpers`, `common`,
  `misc`, `data`, `stuff`, `manager`, `handler` with no noun. A file named after
  nothing collects everything.
- **Never version a name.** `handleClickV2`, `parseEnhanced`, `dataNew`,
  `configFinal`. Name what it does, or replace the old one. Git holds the
  previous version.
- **A boolean reads as a claim**: `isVisible`, `hasAudio`, `canSeek`. Not
  `visible` on a function, not `flag`.
- **Units and scale belong in the name.** `expiresAtMs`, `widthPx`,
  `bitrateKbps`. A number whose unit is a comment is a bug waiting.
- **Respect the framework's reserved shapes.** In React a hook starts with `use`
  and nothing else does, because the compiler treats a `use`-prefixed member
  reached through an object as a hook and freezes it. Every framework has one or
  two of these; breaking one produces a bug with no error message.
- **One language for code.** Identifiers, comments and commit messages in the
  project's code language, which for almost every project is English. Localised
  copy is content and lives behind a translation key, never in an identifier.

## Directories

Use the domain nouns the project already uses, the same words that name its
top-level modules, its services and its issue labels. Learn the vocabulary once
and use it everywhere. A new noun for an existing domain is how two names for one
thing start, and the second one is always the one nobody searches for.

Where a project uses a namespaced id scheme (reverse-DNS, a scope prefix, a
registry name), take the next id from the existing set rather than inventing a
shape.
