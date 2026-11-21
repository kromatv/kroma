# Emby import

Brings a household over from an Emby server. The module answers the core's
`importer` point: it signs in to Emby as an administrator and describes what it
finds. The core decides what each thing becomes and does every write, so the
module holds no account, no library and no watch state of KROMA.

Layout: `server/` (the crate), `module.json` (manifest), `audit.json` (what
`kroma audit` asks of it). See `modules/README.md` for the authoring guide, and
[the point's contract](../README.md#answering-the-importer-point).

## One reader, two servers

Emby and Jellyfin speak APIs of one family, so this module has no reader of its
own. Its crate runs the routes of `tv.kroma.import.jellyfin` with that crate's
Emby dialect (`EMBY` in its `server/src/dialect.rs`): the same calls under
`/emby/`, the `Emby` authorization scheme, and Emby's `/Query` forms of the user
and library lists. What it reads, what it leaves behind and what it keeps are
the Jellyfin importer's, in [its README](../tv.kroma.import.jellyfin/README.md).

The module is its own so that it releases on its own tag: a change to this
manifest or its icon ships Emby alone, and the Jellyfin importer's version
moves only when the reading both share changes.

## Where it differs

Every endpoint, the fields read and the page of Emby's documentation each fact
comes from are in [`docs/reference/emby-api.md`](../../docs/reference/emby-api.md).
Nothing in it was run against an Emby server.

- **Address.** Left empty, the module looks for an Emby on the machine KROMA
  runs on, at `http://127.0.0.1:8096`.
- **Which server.** Emby's public answer names no product. The module takes any
  server whose answer has an id and does not call itself Jellyfin, and the
  Jellyfin importer refuses a server that names no product.
- **A title kept in two versions** comes over with one file: Emby's answer
  carries no count of a title's versions.
- **Limits.** A user Emby keeps out of sub-folders or shows only some tags is
  named with `blockedFolders` or `tag`, and the core gives that user no library
  until the owner chooses.

## Icon

The mark is Emby's, from Simple Icons 15.0.0 (`icons/emby.svg`), white on the
colour Simple Icons gives Emby, `#52B54B`, the way the Jellyfin importer's icon
is made. Simple Icons lists no branding guidelines for Emby, as it does for
Jellyfin.
