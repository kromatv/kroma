# The KROMA spec

What KROMA does and why, in the same repo as the code that does it.

## What lives here, and what does not

| | Answers | Lives in |
|---|---|---|
| **Spec** (this folder) | *What* the product does, and *why* that is the right behaviour | `docs/spec/` |
| **Architecture** | *How* the code is shaped to do it | `ARCHITECTURE.md`, `docs/architecture/` |
| **Conventions** | *How* we write it | `CODE_STYLE.md`, `CONVENTIONS.md` |
| **Work** | *What is being done about it now* | Issues, the KROMA board |

A rule that keeps them apart: if a sentence would still be true after a full rewrite of
the implementation, it belongs in the spec. If it names a crate, a file or a framework,
it belongs in architecture.

## The domains

One **space** per domain - a folder under `docs/spec/`, using the domain nouns
`ARCHITECTURE.md` already uses (the same words name the server's crates, the
clients' feature folders, and the `area/` labels). A space's landing chapter is
its `README.md`; as a domain grows it splits into further chapter files in the
same folder. Learn the vocabulary once, use it everywhere.

| Space | Domain | `area/` label |
|---|---|---|
| [`library/`](library/) | Sources, scanning, matching, metadata refresh | `area/server` |
| [`media/`](media/) | What a title *is*: containers, codecs, streams, artwork | `area/server` |
| [`playback/`](playback/) | Direct play, fallbacks, resume, continue watching | `area/server` `area/tv` |
| [`accounts/`](accounts/) | Accounts, sessions, profiles, who may see what | `area/server` |
| [`discovery/`](discovery/) | Finding a server on the network, pairing a television | `area/tv` |
| [`modules/`](modules/) | `.kmod` bundles, the Store, out-of-process sidecars | `area/modules` |
| [`admin/`](admin/) | Running a server: settings, users, jobs, diagnostics | `area/server` |
| [`surfaces/`](surfaces/) | What each client must do, and what it is allowed not to do | all client areas |

## Status vocabulary

Every spec file and every section carries one, matching the style already used in
`docs/architecture/`:

- **SHIPPED** - implemented and released. The spec describes today's behaviour.
- **AGREED** - decided, not built. Someone could implement it from this text.
- **DRAFT** - being written. Do not implement from it yet.
- **DESIGN, NOT IMPLEMENTED** - deliberately deferred. The section must say *why*, and
  what shipped instead. See `docs/architecture/mobile-offline-system-storage.md` for the
  shape to imitate - that record is worth more than the design was.

A spec section without a status is a bug in the spec.

## Requirement IDs

Every normative statement in a spec - anything a reader could implement or test -
carries a stable **requirement ID**, so the board can point at it instead of
copying it.

    <DOMAIN>-<N>  (STATUS) - one testable statement.

- `DOMAIN` is a short prefix the **space** picks for itself - no central list. The
  only rules the tooling enforces are the ones that keep IDs unambiguous: a space
  uses **one** prefix (every chapter in the folder agrees), and a prefix belongs to
  **one** space. Pick something legible (`LIB`, `MEDIA`, …) and stay consistent.
- `N` is an integer, assigned once and **never reused or renumbered**. A deleted
  requirement retires its number; it is not recycled.
- One ID is one testable idea. If a line hides two requirements, it needs two IDs.

Example:

> **LIB-4** (AGREED) - A rescan never deletes user data. A file that disappears is
> marked absent; its watch history survives.

The ID is the join key between the spec and the board: an epic or story writes
`Implements: LIB-4, LIB-7` rather than restating the rule. This keeps the earlier
promise - *never copy spec text into an issue* - while still letting work trace
back to exactly what it satisfies.

The `spec-reviewer` agent (`.claude/agents/spec-reviewer.md`) checks that every
normative line has a unique, stable ID and status, that the prose stays readable,
and that nothing leaks architecture.

### Finding a requirement, fast

The prose is for humans; the index is for machines. `bun run spec:index` walks
every space (recursively, all chapters) and regenerates two artefacts:

- [`requirements.json`](requirements.json) - one record per requirement:
  `{ id, domain, space, status, text, file, line }`. An agent resolves any ID to
  its exact chapter and line in a single lookup - no grepping prose, no anchors.
- [`INDEX.md`](INDEX.md) - the same list for a human to skim.

Both are generated; never edit them by hand. Run `bun run spec:index` whenever
you change a requirement and commit the result. `bun run spec:check` verifies
without writing - it fails if the committed index is stale or if any requirement
has a duplicate ID, a prefix used in two spaces, a space mixing prefixes, or a
missing status. Run it before you open the PR; the reviewer runs it too.

## How the spec changes

The spec changes only through a pull request, and a PR that changes behaviour changes the
spec in the same PR. That is the whole enforcement mechanism: review is where a
requirement gets argued, and `git blame` is where you find out why it says what it says.

For anything large or contested, write it as an RFC first - see [`../rfcs/`](../rfcs/).
Small clarifications go straight to a spec PR.

## How the spec becomes work

Each domain has a long-lived **epic issue**. Implementation issues are opened as
**sub-issues** of that epic, so progress rolls up on the board without anyone maintaining
a checklist by hand. The spec says what should be true; the sub-issues say what is left
to make it true.

Never copy spec text into an issue. Link to the section. Copies rot.
