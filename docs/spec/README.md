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

One file per domain, using the domain nouns `ARCHITECTURE.md` already uses — the same
words name the server's crates, the clients' feature folders, and the `area/` labels.
Learn the vocabulary once, use it everywhere.

| File | Domain | `area/` label |
|---|---|---|
| [`library.md`](library.md) | Sources, scanning, matching, metadata refresh | `area/server` |
| [`media.md`](media.md) | What a title *is*: containers, codecs, streams, artwork | `area/server` |
| [`playback.md`](playback.md) | Direct play, fallbacks, resume, continue watching | `area/server` `area/tv` |
| [`accounts.md`](accounts.md) | Accounts, sessions, profiles, who may see what | `area/server` |
| [`discovery.md`](discovery.md) | Finding a server on the network, pairing a television | `area/tv` |
| [`modules.md`](modules.md) | `.kmod` bundles, the Store, out-of-process sidecars | `area/modules` |
| [`admin.md`](admin.md) | Running a server: settings, users, jobs, diagnostics | `area/server` |
| [`surfaces.md`](surfaces.md) | What each client must do, and what it is allowed not to do | all client areas |

## Status vocabulary

Every spec file and every section carries one, matching the style already used in
`docs/architecture/`:

- **SHIPPED** — implemented and released. The spec describes today's behaviour.
- **AGREED** — decided, not built. Someone could implement it from this text.
- **DRAFT** — being written. Do not implement from it yet.
- **DESIGN, NOT IMPLEMENTED** — deliberately deferred. The section must say *why*, and
  what shipped instead. See `docs/architecture/mobile-offline-system-storage.md` for the
  shape to imitate — that record is worth more than the design was.

A spec section without a status is a bug in the spec.

## How the spec changes

The spec changes only through a pull request, and a PR that changes behaviour changes the
spec in the same PR. That is the whole enforcement mechanism: review is where a
requirement gets argued, and `git blame` is where you find out why it says what it says.

For anything large or contested, write it as an RFC first — see [`../rfcs/`](../rfcs/).
Small clarifications go straight to a spec PR.

## How the spec becomes work

Each domain has a long-lived **epic issue**. Implementation issues are opened as
**sub-issues** of that epic, so progress rolls up on the board without anyone maintaining
a checklist by hand. The spec says what should be true; the sub-issues say what is left
to make it true.

Never copy spec text into an issue. Link to the section. Copies rot.
