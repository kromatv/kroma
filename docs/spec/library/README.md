# Library

Status: **AGREED** overall, with two sections still **DRAFT** where a product choice
stays open. Every section carries its own status; the file-level label is the floor.

Sources on disk become titles you can browse. Everything upstream of "there is something
to play". What a title *is* once matched, meaning streams, codecs and artwork, is [`media.md`](../media/README.md);
getting bytes onto disk in the first place is a module concern, [`modules.md`](../modules/README.md).

## Sources

Status: **AGREED**

A **source** is a directory tree the server is told to watch, tagged with exactly one
content kind: **movies** or **shows**. The kind is chosen when the source is added and
governs how files inside it are matched. A movie source never produces episodes, a show
source never produces standalone films. Mixing kinds in one directory is unsupported;
the answer is two sources.

A server has zero or more sources, and any number of them may point at the same content
kind. Three "Movies" sources are normal, an SSD of new releases, a NAS of archives, a
share of home video, and they present as one merged catalogue, deduplicated by matched
identity, not by folder. A source is just an input; it is not a category the user browses
by. Filtering the catalogue by source is an admin/diagnostic view, not the primary
navigation.

A source records the mount path, its content kind, and its scan schedule. Nothing about a
source is destructive: removing a source removes its titles from the catalogue and stops
watching the path, but touches no bytes on disk and, per the deletions rule below,
preserves the watch history keyed to those files should the source ever return. Adding,
editing and removing sources is an admin surface, [`admin.md`](../admin/README.md).

## Naming conventions understood

Status: **AGREED**

Matching is convention-first: a correctly named file matches offline, with no provider
call. The conventions below are the contract. A file that follows them is guaranteed to
match to the right identity; a file that does not is not an error. It lands in the
unmatched state and is fixable (see below).

**Movies.** One film per folder, the folder named for the film and its year:

```
Movies/Blade Runner (1982)/Blade Runner (1982).mkv
Movies/Dune Part Two (2024)/Dune Part Two (2024) - 2160p.mkv
```

The `Title (Year)` stem is what is matched. The year is not decoration. It disambiguates
remakes and is the difference between a confident match and a guess. A trailing tag after
` - ` (resolution, edition, source) is preserved as version/edition detail, [`media.md`](../media/README.md),
and never changes the matched identity. A loose file directly under the source root
(`Movies/Blade Runner (1982).mkv`, no folder) is accepted with the same stem rules, but the
folder-per-film layout is the recommended one and the only layout guaranteed to keep
extras, artwork and sidecars grouped.

**Shows.** One folder per show, one subfolder per season, episodes carrying the
`SxxEyy` marker:

```
Shows/Severance/Season 02/Severance - S02E01 - Hello, Ms. Cobel.mkv
Shows/The Bear/Season 01/The Bear - S01E03.mkv
```

The show folder name and the `SxxEyy` marker are load-bearing; the human episode title
after the second ` - ` is optional and ignored for matching. `Specials` is accepted as an
alias for `Season 00`. Multi-episode files are named with a range (`S01E01-E02`) and
matched to both episodes. A show folder MAY carry a `(Year)` for disambiguation
(`Shows/Ironheart (2025)/…`) and SHOULD when two shows share a name.

**Common to both.** Case is ignored. Separators may be spaces, dots or underscores. Only
recognised video containers are considered files to match; sidecars (subtitles, artwork,
`.nfo`) attach to the matched item by shared stem and are never matched on their own.
These are conventions, not configuration: the scheme is fixed so that a library is
portable between servers and a rename on disk is a reliable repair, not a gamble.

## Scanning

Status: **AGREED**

Two scans, one code path, different triggers.

**Initial scan** runs when a source is added: the whole tree is walked once, every
candidate file matched, the catalogue populated. It is a background job with visible
progress, [`admin.md`](../admin/README.md); the catalogue fills as it goes rather than appearing all
at once at the end.

**Incremental rescan** keeps the catalogue true to disk afterwards. It is triggered by,
in order of preference: filesystem change notifications where the platform and mount
provide them; a periodic sweep on the source's schedule as the reliable fallback (network
shares and many container mounts do not deliver events); and an explicit "Scan now" from an
admin. An incremental rescan only reconsiders what changed: new paths, vanished paths,
and files whose size or modification time moved. So it is cheap enough to run often.

**The guarantee while a library is being written to.** Scanning is safe to run at
any time, including while files are being copied, moved or downloaded into a source. The
guarantee rests on three rules:

- A file is only matched once it looks **settled**: its size and modification time are
  unchanged across the observation window. A file still growing is skipped this pass and
  picked up on the next, so a half-copied download never enters the catalogue as a broken
  title.
- Scanning **reads only**. It never writes, moves, renames or deletes anything in a
  source. The library is treated as owned by the user; KROMA observes it.
- A vanished path is **marked absent, not deleted** (see below), so a move that briefly
  removes then re-adds a file, the shape of most "atomic" replacements, resolves to the
  same identity without losing anything.

The corollary: KROMA never demands exclusive access to a library and never blocks the
tools writing to it. A module mid-download and a scan mid-sweep coexist by design,
[`modules.md`](../modules/README.md).

## Matching and its failure path

Status: **AGREED**

Matching resolves a settled file to an identity: convention parse first (offline,
authoritative on the stem), then a metadata provider lookup to attach the rich record.
Two outcomes need a designed product response, and both are first-class UI states, not
log lines.

**Matches nothing.** A file that parses to no confident identity, whether an unconventional
name, a film with no year against an ambiguous title, or a provider that returns nothing, becomes
an **unmatched item**. Unmatched items are not hidden and not discarded. They appear in a
browsable **Unmatched** view in the library UI, listed by their on-disk path, so the user
can always see exactly which files the server is holding but cannot place. From there the
user has two repairs, and both are supported:

- **Manual match.** Search the provider, pick the correct title/episode, and bind this
  file to it. The binding is remembered against the file so a later rescan does not undo
  it.
- **Rename on disk.** Fix the name to the convention above; the next rescan matches it
  automatically and it leaves the Unmatched view.

Answering the skeleton's open question directly: a mis-match is fixable **from the UI**,
by manual match; renaming on disk is the equivalent, portable repair, and neither is
privileged over the other.

**Matches two things.** When a file could be more than one identity, a title shared by a
remake with no year to separate them or two provider records that both fit, KROMA does not
guess. It records the file as **ambiguous** (a variant of the unmatched state) with the
competing candidates surfaced, and asks the user to choose. A wrong confident match is
worse than an honest "which one?", so the tie is never broken silently.

Nothing about either failure is fatal to the rest of the scan: one unplaceable file never
stalls a source, and the catalogue is always the set of files that *did* match plus a
visible tally of those that did not.

## Metadata providers

Status: **AGREED**

The matched identity is enriched from a metadata provider: titles, summaries, cast,
episode data and artwork. Two rules define the behaviour.

**Fetched once, cached locally, owned locally.** Every field and image a provider returns
is written to the server's own store on first fetch. After that the catalogue is served
entirely from the local cache. The provider is a source of truth for *acquiring* metadata,
never a runtime dependency for *reading* it.

**Offline is a normal state, not a degraded one.** With no internet, everything already
matched browses and plays exactly as before, because it is all local. Only two things are
affected offline: a brand-new file that needs a first provider lookup stays unmatched (by
convention it still parses its stem, so it is placeable and playable, just thin on
metadata) until connectivity returns; and forced refreshes queue rather than fail. KROMA
is a media server first and a metadata client second.

The specific providers, and whether more than one is consulted, are configuration and
architecture, not product rules, and are not fixed here.

## Refresh

Status: **DRAFT**, recommended rules provisional

Metadata re-fetches on two automatic triggers and one manual one:

- **New need.** A newly matched item fetches its metadata once, as above.
- **Staleness sweep.** Running series are re-checked on a slow cadence so a new episode's
  air date and stills appear without user action; completed films are not re-checked on a
  timer, because their metadata does not change.
- **User force.** A "Refresh metadata" action on any title, season or whole source
  re-fetches from the provider and overwrites the cache, letting a user pull a corrected
  summary or better artwork on demand. A forced refresh **never** discards a manual match
  or user-chosen artwork; it refreshes the descriptive fields around a binding the user
  set, it does not overturn the binding.

Open, with a recommendation: whether a forced refresh should also re-run *matching* (not
just re-fetch metadata for the current identity). Recommended answer: keep them separate.
"Refresh metadata" updates the record, and a distinct "Re-match" action re-runs
identification, so a user never loses a correct match by asking for fresher artwork. This
is provisional pending review.

## Deletions and moves

Status: **AGREED**

The rule is **mark absent, never destroy user data**, and it is not negotiable enough to
leave as an open question.

When a file disappears from a source, its title is **marked absent**: removed from normal
browsing, but its record and, critically, all watch history, resume positions, ratings
and manual-match bindings keyed to it are retained. If the same content reappears (a NAS
remounts, a file is moved back or relocated within the source), it re-matches to the same
identity and everything the user built up is still there. Watch history survives a file
outliving its bytes.

A **move** is therefore not a special case: it is an absent path plus a new path that
resolve to one identity, and the history follows the identity, not the path. This is what
makes reorganising a library on disk safe.

Genuine permanent deletion of a title's history is an explicit, user-initiated admin
action ("Remove and forget"), never a side effect of a scan. Answering the skeleton
directly: a rescan **only ever marks absent**; it never deletes user data. The one actor
allowed to destroy history is a human who asks for it, on the admin surface,
[`admin.md`](../admin/README.md).

## Not in scope

- **Acquisition.** Getting files onto disk (downloads, indexers) is a module concern,
  [`modules.md`](../modules/README.md). The library observes what appears; it does not fetch it.
- **What a matched title technically is**, meaning containers, codecs, streams and
  artwork sizes, is [`media.md`](../media/README.md).
- **Choosing what to send a client** at play time is [`playback.md`](../playback/README.md).
- **Who may see which source or title** is [`accounts.md`](../accounts/README.md).
