---
name: file-structure
description: One file, one job, and short enough to hold in your head. Covers the size policy (hard-split over 300 lines, split 200 to 300 at a seam, aim for 150), what a natural seam is and where to cut, the exemptions, the dependency rules that decide where the split lands, and the signals that a file is already two files. Use before adding to a file that is already long, when naming a new file, when a function has nowhere obvious to live, or when a review says a file is doing too much. Triggers - "this file is too long", "where should this go", "split this file", "is this file too big", "one responsibility".
---

# File structure

Two rules, and the second is a symptom of the first.

**One file, one responsibility, and its name says which.** A file you cannot name
without "and" is two files.

**Short enough to hold in your head.** Hard-split over **300 lines**. Split
**200 to 300** only where a seam already runs. Aim for **150**.

Exempt, because splitting them makes them worse: generated output, vendored code,
data and locale JSON, lockfiles, and irreducible adapters such as a command-line
flag builder.

Those numbers are the default. A project that states its own policy wins: look for
it in `ARCHITECTURE.md`, `CONVENTIONS.md`, `CODE_STYLE.md`, `CONTRIBUTING.md` or
the agent instructions at the repository root. Read the project's policy before
quoting a threshold at anyone.

## The cut is a seam, not a line count

Never split at line 300 to satisfy the number. Cut where a domain or layer
boundary already runs through the file, and if there is no such boundary the file
may be long because the job is.

Finding the seam, in the order that usually works:

1. **Name the file's job in one sentence.** The word after "and" is the seam.
2. **Group by what changes together.** Two clusters that never change in the same
   commit are two files, whatever their line count.
3. **Follow the imports.** A block that pulls in a whole subsystem nothing else in
   the file touches wants to leave with it.
4. **Look for the noun.** A cluster of functions all taking and returning the same
   type is that type's module.

A cut that leaves two files importing each other's internals was not a seam. Put
it back and look again.

## Where the piece lands

Splitting is only half the decision. The other half is which side of a boundary
the new file sits on, and a boundary you have not read is a boundary you are about
to break.

Learn them before cutting. The workspace manifest names the packages and who
depends on whom, the project's architecture doc names the layers, and a directory
that holds only more directories is usually a layer boundary with a rule attached.

The rules that hold in most codebases:

- **Dependencies run one way.** Whatever the layers are called, a lower one never
  reaches up. If the project draws the arrow (`features -> shared -> kit -> core`
  is a common shape), that arrow is not a suggestion.
- **Siblings do not import siblings.** Two feature slices that both need a thing
  push it up to the shared level, never sideways. A sideways import is how two
  features become one.
- **Cross-package code travels by name, not by path.** A relative import that
  climbs out of its own package defeats the workspace graph. If the shared code has
  no package, giving it one is the work.
- **Let the compiler hold the line where it can.** Layers expressed as separate
  crates, packages or modules are enforced by the build rather than by review, so
  a helper lands in the layer whose dependencies it is allowed to have. A pure
  domain layer that suddenly needs the web framework has landed in the wrong place.
- **A transport layer holds no business logic.** Route handlers, controllers and
  CLI entry points translate in and out. Logic that could be called without them
  belongs behind them.
- **A design system's levels each know only the levels below.** Tokens, then the
  smallest controls, then arrangements, then regions, then page skeletons. Pages
  themselves know the router and the server, so they belong to the app rather than
  to the kit.

## Signals a file is already two files

- The name contains "and", or is a bag: `utils`, `helpers`, `common`, `misc`.
- Two `describe` blocks in its test that share no setup.
- A reader has to scroll past unrelated code to follow one path.
- Two exports whose callers never overlap.
- A change to one half keeps forcing a merge conflict with someone working on the
  other.
- Adding a feature means adding a parameter to something the feature does not own.

## Applies to what you touch

The policy governs the file you are changing, not the whole tree. Most codebases
have files well over the limit already, and a PR is not the place to discover that.
Leaving a file simpler than you found it is expected; rewriting an unrelated
1500-line service because you passed through it is a separate change with its own
review.

That said, a change that lands duplication, dead code, or a second way of doing
something the file already does is not finished. The refactor is part of the
change, not a follow-up.

## Checking

Longest files first, skipping what is exempt:

```bash
git ls-files '*.ts' '*.tsx' '*.rs' '*.py' '*.go' \
  | grep -vE 'vendor|\.gen\.|/generated/|locales/' \
  | xargs wc -l | sort -rn | head -20
```

Then run whatever dead-code check the project ships, named in its manifest scripts.
Line count is rarely enforced in CI, so it holds only where a reader insists on it
in review.
