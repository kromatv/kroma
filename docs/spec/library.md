# Library

Status: **DRAFT** — skeleton only, nothing here is agreed yet.

Sources on disk become titles you can browse. Everything upstream of "there is something
to play".

## Scope

- What a **source** is, and how many a server may have
- Scanning: initial scan, incremental rescan, what triggers each
- **Matching**: filename and folder conventions understood, and what happens when a file
  matches nothing or matches two things
- Metadata providers: what is fetched, what is cached locally, what happens offline
- Refresh: when metadata is re-fetched, and what a user can force
- Deletions and moves: what happens to watch history when a file disappears

## Open questions

- Is a mis-matched title fixable from the UI, or only by renaming on disk?
- Does a rescan ever delete user data, or only ever mark absent?

## Must answer

- [ ] The exact naming conventions a file must follow to be matched
- [ ] What the user sees when matching fails — the failure path is product, not an edge case
- [ ] Whether scanning is safe to run against a library being written to

## Not in scope

Acquisition (getting files onto disk) is a module concern — see [`modules.md`](modules.md).
