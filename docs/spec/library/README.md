# Library

Status: **AGREED** overall, with one section still **DRAFT** where a product choice
stays open. Every section carries its own status; the file-level label is the floor.

Sources on disk become titles you can browse. Everything upstream of "there is something
to play". What a title *is* once matched, meaning streams, codecs and artwork, is
[`media/`](../media/); getting bytes onto disk in the first place is a module concern,
[`modules/`](../modules/).

## Sources

Status: **AGREED**

**LIB-1** (AGREED) - A **source** is a directory tree the server is told to watch, tagged
with exactly one content kind, **movies** or **shows**. The kind is chosen when the source
is added and governs how files inside it are matched.

**LIB-2** (AGREED) - A movie source never produces episodes and a show source never produces
standalone films. Mixing kinds in one directory is unsupported; the answer is two sources.

**LIB-3** (AGREED) - A server has zero or more sources, any number of them may point at the
same content kind, and they present as one merged catalogue deduplicated by matched identity
rather than by folder. Three "Movies" sources are normal: an SSD of new releases, a NAS of
archives, a share of home video.

**LIB-4** (AGREED) - A source is an input, not a category a person browses by. Filtering the
catalogue by source is an admin and diagnostic view, never the primary navigation.

**LIB-5** (SHIPPED) - A source tree may be assembled from symlinks. A curated folder of links
into a shared pool of files is a source like any other: the link's own name is what the
conventions below are read from, and the file it points at is what plays.

**LIB-6** (SHIPPED) - A link the server cannot resolve is reported, never silently skipped,
because a source built entirely from links into an unmounted pool would otherwise scan clean
and empty.

**LIB-7** (AGREED) - A source records its mount path, its content kind and its scan schedule.

**LIB-8** (AGREED) - Nothing about a source is destructive. Removing one drops its titles
from the catalogue and stops watching the path, but touches no bytes on disk and preserves
the watch history keyed to those files should the source ever return. Adding, editing and
removing sources is an admin surface, [`admin/`](../admin/).

## Naming conventions understood

Status: **AGREED**

**LIB-9** (AGREED) - Matching is convention-first: a correctly named file matches offline,
with no provider call. A file that follows the conventions below is guaranteed to match to
the right identity; a file that does not is not an error, and lands in the unmatched state.

**Movies.** One film per folder, the folder named for the film and its year:

```
Movies/Blade Runner (1982)/Blade Runner (1982).mkv
Movies/Dune Part Two (2024)/Dune Part Two (2024) - 2160p.mkv
```

**LIB-10** (SHIPPED) - The `Title (Year)` stem is what is matched. The year is not
decoration: it disambiguates remakes and is the difference between a confident match and a
guess.

**LIB-11** (SHIPPED) - A trailing tag after ` - `, a resolution, an edition or a source, is
preserved as version and edition detail ([`media/`](../media/)) and never changes the matched
identity.

**LIB-12** (SHIPPED) - A loose file directly under the source root, with no folder, is
accepted with the same stem rules. The folder-per-film layout is the recommended one and the
only layout guaranteed to keep extras, artwork and sidecars grouped.

**Shows.** One folder per show, one subfolder per season, episodes carrying the
`SxxEyy` marker:

```
Shows/Severance/Season 02/Severance - S02E01 - Hello, Ms. Cobel.mkv
Shows/The Bear/Season 01/The Bear - S01E03.mkv
```

**LIB-13** (SHIPPED) - A season folder is what makes the folder above it the show. With one
present, that folder names the series, and disagreeing filenames inside it still collapse to
one show.

**LIB-14** (SHIPPED) - Without a season folder the folder proves nothing, because a flat pool
holds many shows side by side, so the filename names the series instead.

**LIB-15** (SHIPPED) - An episode whose filename is only its marker (`S01E01.mkv`) takes the
name of the folder holding it, so a run of them is one series rather than one series per
file.

**LIB-16** (SHIPPED) - The show folder name and the `SxxEyy` marker are load-bearing; the
human episode title after the second ` - ` is optional and ignored for matching.

**LIB-17** (SHIPPED) - `Specials` is accepted as an alias for `Season 00`.

**LIB-18** (SHIPPED) - A multi-episode file is named with a range (`S01E01-E02`) and matched
to both episodes.

**LIB-19** (AGREED) - A show folder MAY carry a `(Year)` for disambiguation
(`Shows/Ironheart (2025)/…`) and SHOULD when two shows share a name.

**LIB-20** (SHIPPED) - Case is ignored, and separators may be spaces, dots or underscores.

**LIB-21** (SHIPPED) - Only recognised video containers are considered files to match.
Sidecars, meaning subtitles, artwork and `.nfo`, attach to the matched item by shared stem
and are never matched on their own.

**LIB-22** (AGREED) - The scheme is a convention rather than configuration, so a library is
portable between servers and a rename on disk is a reliable repair rather than a gamble.

## Scanning

Status: **AGREED**

Two scans, one code path, different triggers.

**LIB-23** (SHIPPED) - An **initial scan** runs when a source is added: the whole tree is
walked once, every candidate file matched, the catalogue populated. It is a background job
with visible progress ([`admin/`](../admin/)), and the catalogue fills as it goes rather than
appearing all at once at the end.

**LIB-24** (AGREED) - An **incremental rescan** keeps the catalogue true to disk afterwards.
It is triggered by, in order of preference: filesystem change notifications where the
platform and the mount provide them; a periodic sweep on the source's schedule as the
reliable fallback, because network shares and many container mounts deliver no events; and an
explicit "Scan now" from an admin.

**LIB-25** (AGREED) - An incremental rescan only reconsiders what changed, meaning new paths,
vanished paths, and files whose size or modification time moved, so it is cheap enough to run
often.

**LIB-26** (AGREED) - Scanning is safe to run at any time, including while files are being
copied, moved or downloaded into a source.

**LIB-27** (AGREED) - A file is matched only once it looks **settled**, its size and
modification time unchanged across the observation window. A file still growing is skipped
this pass and picked up on the next, so a half-copied download never enters the catalogue as
a broken title.

**LIB-28** (SHIPPED) - Scanning **reads only**. It never writes, moves, renames or deletes
anything in a source. The library is the person's; KROMA observes it.

**LIB-29** (AGREED) - KROMA never demands exclusive access to a library and never blocks the
tools writing to it. A module mid-download and a scan mid-sweep coexist by design
([`modules/`](../modules/)).

A vanished path is marked absent rather than deleted, so a move that briefly removes then
re-adds a file, the shape of most "atomic" replacements, resolves to the same identity
without losing anything. That rule is LIB-45 below.

## Matching and its failure path

Status: **AGREED**

Two outcomes need a designed product response, and both are first-class UI states rather than
log lines.

**LIB-30** (AGREED) - Matching resolves a settled file to an identity: a convention parse
first, offline and authoritative on the stem, then a metadata provider lookup to attach the
rich record.

**Matches nothing.**

**LIB-31** (AGREED) - A file that parses to no confident identity, whether from an
unconventional name, a film with no year against an ambiguous title, or a provider that
returns nothing, becomes an **unmatched item**. Unmatched items are neither hidden nor
discarded.

**LIB-32** (AGREED) - Unmatched items appear in a browsable **Unmatched** view in the library
UI, listed by their on-disk path, so a person can always see exactly which files the server is
holding but cannot place.

**LIB-33** (AGREED) - **Manual match.** A person searches the provider, picks the correct
title or episode, and binds the file to it. The binding is remembered against the file, so a
later rescan does not undo it.

**LIB-34** (AGREED) - **Rename on disk.** A name fixed to the convention above matches
automatically on the next rescan and leaves the Unmatched view. Neither repair is privileged
over the other.

**Matches two things.**

**LIB-35** (AGREED) - A file that could be more than one identity, a title shared by a remake
with no year to separate them or two provider records that both fit, is recorded as
**ambiguous**, a variant of the unmatched state, with the competing candidates surfaced for a
person to choose. A wrong confident match is worse than an honest "which one?", so the tie is
never broken silently.

**LIB-36** (AGREED) - One unplaceable file never stalls a source. The catalogue is always the
set of files that *did* match plus a visible tally of those that did not.

## Metadata providers

Status: **AGREED**

The matched identity is enriched from a metadata provider: titles, summaries, cast, episode
data and artwork.

**LIB-37** (AGREED) - Every field and image a provider returns is written to the server's own
store on first fetch, and the catalogue is served entirely from that local cache afterwards. A
provider is a source of truth for *acquiring* metadata, never a runtime dependency for
*reading* it.

**LIB-38** (AGREED) - With no internet, everything already matched browses and plays exactly
as before, because it is all local. Offline is a normal state, not a degraded one.

**LIB-39** (AGREED) - Offline, a brand-new file that needs a first provider lookup stays
unmatched until connectivity returns. Its stem still parses by convention, so it is placeable
and playable, just thin on metadata.

**LIB-40** (AGREED) - Offline, a forced refresh queues rather than fails.

The specific providers, and whether more than one is consulted, are configuration and
architecture rather than product rules, and are not fixed here.

## Refresh

Status: **DRAFT**, recommended rules provisional

**LIB-41** (DRAFT) - A newly matched item fetches its metadata once.

**LIB-42** (DRAFT) - Running series are re-checked on a slow cadence, so a new episode's air
date and stills appear without a person asking. Completed films are not re-checked on a
timer, because their metadata does not change.

**LIB-43** (DRAFT) - A "Refresh metadata" action on any title, season or whole source
re-fetches from the provider and overwrites the cache, so a person can pull a corrected
summary or better artwork on demand.

**LIB-44** (DRAFT) - A forced refresh **never** discards a manual match or user-chosen
artwork. It refreshes the descriptive fields around a binding the person set; it does not
overturn the binding.

Open, with a recommendation: whether a forced refresh should also re-run *matching* rather
than only re-fetch metadata for the current identity. Recommended answer: keep them separate.
"Refresh metadata" updates the record, and a distinct "Re-match" action re-runs
identification, so a person never loses a correct match by asking for fresher artwork. This is
provisional pending review.

## Deletions and moves

Status: **AGREED**

The rule is **mark absent, never destroy user data**, and it is not negotiable enough to leave
as an open question.

**LIB-45** (AGREED) - When a file disappears from a source, its title is **marked absent**:
removed from normal browsing, but its record and all watch history, resume positions, ratings
and manual-match bindings keyed to it are retained. Watch history survives a file outliving
its bytes.

**LIB-46** (AGREED) - Content that reappears, because a NAS remounts or a file is moved back
or relocated within the source, re-matches to the same identity, and everything the person
built up is still there.

**LIB-47** (AGREED) - A **move** is therefore not a special case. It is an absent path plus a
new path that resolve to one identity, and the history follows the identity rather than the
path. This is what makes reorganising a library on disk safe.

**LIB-48** (AGREED) - A rescan **only ever marks absent**. It never deletes user data.

**LIB-49** (AGREED) - Permanently deleting a title's history is an explicit, person-initiated
admin action ("Remove and forget"), never a side effect of a scan. The one actor allowed to
destroy history is a human who asks for it, on the admin surface ([`admin/`](../admin/)).

## Not in scope

Status: **AGREED**

- **Acquisition.** Getting files onto disk, meaning downloads and indexers, is a module
  concern, [`modules/`](../modules/). The library observes what appears; it does not fetch it.
- **What a matched title technically is**, meaning containers, codecs, streams and artwork
  sizes, is [`media/`](../media/).
- **Choosing what to send a client** at play time is [`playback/`](../playback/).
- **Who may see which source or title** is [`accounts/`](../accounts/).
