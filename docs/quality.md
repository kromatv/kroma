# The quality report

Three measurements the lint and the Sonar gate do not make: how risky each
function is to change, which functions are the same function twice, and
whether the tests would notice a bug. They are a report. No number here fails
a check or blocks a merge, and the weekly workflow passes whatever it finds.

The measuring is done by Robert C. Martin's
[crapper](https://github.com/unclebob/crapper),
[dryer](https://github.com/unclebob/dryer) and
[mutator](https://github.com/unclebob/mutator), three Python tools pinned by
commit. `packages/quality-tools` installs them, hands them the right files and
turns what they write into a summary.

```
bun run quality:setup                    clone the tools at their pins, one venv, into target/quality-tools
bun run quality:crap [path ...]          CRAP per function, from the coverage already on disk
bun run quality:dry [path ...]           structural duplicates between functions
bun run quality:report [path ...]        both, and .metrics/summary.md
bun run quality:mutate <package path>    mutation testing, one package at a time
```

A path narrows a run to a directory or a file: `bun run quality:report
packages/core`. Without one the run covers every tracked source file.

`quality:setup` needs Python 3.11 or newer and finds it by itself: it tries
`python3`, then `python3.13`, `python3.12`, `python3.11` and `python3.14`, and
names what it found when none is new enough. Everything it installs is under
`target/`, which git ignores.

## What each number means

### CRAP

```
CRAP = complexity² × (1 − coverage)³ + complexity
```

Complexity is the cyclomatic complexity of one function. Coverage is the share
of that function the tests exercise: its branches when the coverage report
records branches inside it, its lines otherwise. A function that is fully
covered scores its complexity. A function no test reaches scores its
complexity squared, plus its complexity.

The summary counts the functions at 10 or more and at 30 or more. crapper's
own reading is that a score up to 5 is low risk, 5 to 30 is worth a look, and
from 30 up the function is both complex and under-tested. Five decisions and
no test is exactly 30. The fix for a high score is a test or a split,
whichever the function is missing.

crapper counts `??` and `?.` as decisions in TypeScript, so its complexity
reads higher than the lint rule's on the same function.

The summary has two lists per language: the worst functions, which on a tree
this size are large functions no test reaches, and the worst functions a test
does reach, which is the shorter list to act on.

### Duplication

dryer strips each function down to its structure. Calls, operators and the
shape of the tree stay. Local names, field names and literals go. The score of
a pair is the share of structural fingerprints the two functions have in
common: 1.0 means the same structure, and the report keeps every pair at 0.8
or above with at least four lines.

A pair is a candidate to read, not a verdict. Two small wrappers of the same
shape score 1.0 without being worth folding. The summary therefore leads with
the pairs that would remove the most lines, and with clusters: the groups of
functions joined by any chain of pairs.

Pairs are split in two. `production` pairs have production code on both sides.
`test` pairs have test code on either side: test support, demos, stories, and
any Rust item under `#[cfg(test)]`.

### Mutation score

mutator changes one operator or constant at a time (`<` into `<=`, `&&` into
`||`, `true` into `false`) and runs the tests. A mutant the tests fail on is
killed. A mutant they still pass on survived, and each survivor is a bug the
tests would not have caught. The score is killed over killed plus survived. A
site on a line the coverage report does not hit is not run.

`bun run quality:mutate packages/core` mutates one package. TypeScript runs
under `vitest run --bail=1 <package>`, Rust under `cargo test --manifest-path`
of the crate at or below the path. Anything after the path goes to mutator as
it is: `--mutate-all` reruns mutants an earlier run already killed,
`--max-workers 4` limits the parallel runs, `--lines 12,13` narrows to a few
lines. Start with one small package: every mutant is a test run.

## What a run writes

Everything goes to `.metrics/`, which git ignores.

| File | What it is |
| --- | --- |
| `summary.md` | The report: counts, worst functions, largest duplicates. Written by `quality:report` |
| `crap-typescript.txt`, `crap-rust.txt` | crapper's full table, worst first |
| `crap-typescript.edn`, `crap-rust.edn` | The same as data |
| `dry-production.tsv`, `dry-test.tsv` | Every pair: score, language, left span, right span |
| `dry.edn` | dryer's own snapshot, before the split |
| `mutate/` | mutator's snapshot per namespace. A later run reads it and reruns only survivors and changed functions |

`quality:report` runs both halves whatever the other gives. When one fails the
summary says why under its heading, the other half is still written, and the
command exits 1 so a broken report is not mistaken for a clean one.

## Coverage

Nothing here runs a test. The CRAP score and the mutation run read the lcov
reports already on disk:

- `coverage/lcov.info`, written by `bun run test:coverage`;
- `server/lcov.info`, written by `bun run ci rust test`;
- any other report named with `--lcov <file>`, as often as needed.

They are folded into one file, `target/coverage/quality/lcov.info`, that keeps
the best hit count of each line and branch. This is not a convenience. crapper
keeps the last record it meets for a file, and a concatenated Rust report
names a file once per workspace that compiled it, so an unmerged report scores
some files on whichever run happened to come last.

`bun run ci rust test` rewrites `server/lcov.info` on every run. Measure every
workspace in one run, or copy the file aside between two `--only` runs and
pass the copies with `--lcov`.

A report made on another machine works as it is, since a record is matched to
a source file from the repository root down. The `coverage-rust-<n>` artifacts
of a CI run that built Rust are reports of this kind, one per Rust job, kept for
a day.

A language no report covers is scored on complexity alone, and the summary
says so in place of printing a CRAP that is only complexity squared.

## The weekly run

`.github/workflows/quality.yml` runs on Monday morning and on demand. It runs
the TypeScript tests under coverage, then `quality:report`, prints the summary
on the run page and uploads `.metrics/` as the `quality-report` artifact, kept
30 days. It is triggered by no pull request. A failing test does not stop it,
since the CI gate reports those; a tool that crashes does, with whatever was
written still uploaded.

## The pins

`packages/quality-tools/pins.txt` holds one line per tool, `name url commit`.
`requirements.txt` beside it holds their Python dependencies at exact
versions. `quality:setup` checks out exactly those commits, and every other
command refuses to run when either file changed since the last setup.

To move a pin:

1. Put the new commit in `pins.txt`. `git ls-remote
   https://github.com/unclebob/crapper HEAD` prints the current one.
2. Run `bun run quality:setup`.
3. If the tool's `pyproject.toml` asks for something new, install it and copy
   the versions from `target/quality-tools/venv/bin/pip freeze` into
   `requirements.txt`.
4. Run `bun run quality:report packages/core` before and after, and say in the
   pull request what moved. A new commit can count complexity differently, and
   the numbers then change with no change to the code.

mutator takes its function names from crapper, so the two move together.

## What the report cannot see

- **Files git does not track.** The tools walk the disk when handed a
  directory and would score generated output such as `apps/www/src/paraglide/`.
  They are only ever handed the tracked source list, minus tests, benchmarks,
  fixtures, declarations and generated files. A new kind of generated file
  that is committed has to be excluded in `src/sources.ts`.
- **Rust in the weekly run.** The workflow measures no Rust coverage, so its
  Rust section is complexity only. For Rust CRAP, run `bun run ci rust test`
  and then `bun run quality:report` on a machine with room for the build, or
  pass the Rust report of a CI run with `--lcov`.
- **`clients/desktop/src-tauri`.** No coverage run includes it, so every
  function there reads 0% when Rust is measured. The summary lists it, and any
  other area in that state, under "Read as 0% because nothing measures them".
- **`packages/lint-rules`.** Its tests run under `node --test`, not vitest, so
  it reads 0% unless its own report is passed with `--lcov`.
- **A second report for the same TypeScript file.** crapper reads
  `coverage/lcov.info` by itself as well, after the merged file. For a file
  that report holds, a better count from another report passed with `--lcov`
  is not the one it keeps.
- **Where a function lives.** crapper names a function by namespace and name,
  not by path, and a TypeScript namespace is the path below `src/`. Two files
  with the same path below `src/` in two packages share a namespace.
- **Test code inside a Rust file.** dryer skips `mod tests` by itself. Other
  `#[cfg(test)]` items are found from rustfmt's layout: the item ends at the
  first later line that is a lone `}` at its own indentation.
- **Slow mutants.** mutator calls a mutant killed when its test run times out,
  and the timeout is a multiple of the baseline run. Its default of 10 is too
  low here in both directions: a busy vitest run times out, and on macOS
  mutator then crashes; a Rust mutant still compiling is counted as killed,
  which inflates the score. The runs use 30 for TypeScript and 300 for Rust.
- **Tests outside the package.** A mutation run uses the package's own tests.
  A mutant that only a test elsewhere would catch is reported as a survivor.
- **History.** A renamed or moved function is a new entry. Nothing matches one
  run against the last.

The first analysis on a machine downloads the tree-sitter grammars it needs
into the user's cache directory.
