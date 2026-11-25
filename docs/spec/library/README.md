# Library

Status: **SHIPPED** in part. The scan, the walk and most of the naming conventions are built;
the rest is decided. Every section and every requirement carries its own status.

Sources on disk become titles you can browse. Everything upstream of "there is something
to play". What a title *is* once matched, meaning streams, codecs and artwork, is
[`media/`](../media/); getting bytes onto disk in the first place is a module concern,
[`modules/`](../modules/).

## Sources

Status: **SHIPPED** in part; each requirement carries its own.

**LIB-1** (AGREED) - A **source** is a directory tree the server is told to watch, tagged
with exactly one content kind, **movies** or **shows**. The kind is chosen when the source
is added and governs how files inside it are matched.

**LIB-2** (AGREED) - A movie source never produces episodes and a show source never produces
standalone films. Mixing kinds in one directory is unsupported; the answer is two sources.

**LIB-3** (AGREED) - A server has zero or more sources, any number of them may point at the
same content kind, and they present as one merged catalogue deduplicated by matched identity
rather than by folder. Three "Movies" sources are normal: an SSD of new releases, a NAS of
archives, a share of home video.

**LIB-79** (AGREED) - A file belongs to one source. A source whose folder holds a folder of
another source, or sits inside one, is refused when it is added or edited, and the refusal
names that other source. Folders are compared part by part: `/media/Films` holds
`/media/Films/4K`, and does not hold `/media/Films 4K`. Sources that already share files
keep working: the rule refuses new overlap and removes nothing.

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

Status: **SHIPPED** in part; each requirement carries its own.

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

**LIB-80** (SHIPPED) - In a show source, a name the `SxxEyy` and `NxNN` forms miss still
names an episode when it carries a season past 100 (`S211E06`), an absolute `Episode 259` or
`Ep. 259`, or a leading number (`215 - Title`). Without a season in the name, the episode takes
its season folder's, else season 1.

**LIB-81** (SHIPPED) - In a show source, a file whose name carries no episode number is left
out of the catalogue and named in the server log, never filed as a film.

**LIB-19** (AGREED) - A show folder MAY carry a `(Year)` for disambiguation
(`Shows/Ironheart (2025)/…`) and SHOULD when two shows share a name.

**LIB-20** (SHIPPED) - Case is ignored, and separators may be spaces, dots or underscores.

**LIB-21** (SHIPPED) - Only recognised video containers are considered files to match.
Sidecars, meaning subtitles, artwork and `.nfo`, attach to the matched item by shared stem
and are never matched on their own.

**LIB-22** (AGREED) - The scheme is a convention rather than configuration, so a library is
portable between servers and a rename on disk is a reliable repair rather than a gamble.

## Scanning

Status: **SHIPPED** in part; each requirement carries its own.

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

**LIB-93** (SHIPPED) - When a person's search for a film's or a show's match finds nothing at
the provider, the screen offers to write the title's info by hand (LIB-83) instead, so a
title the provider does not know is never left without a way forward.

**LIB-34** (AGREED) - **Rename on disk.** A name fixed to the convention above matches
automatically on the next rescan and leaves the Unmatched view. Neither repair is privileged
over the other.

**LIB-78** (AGREED) - **A match that came from another server.** An import
([`admin/import.md`](../admin/import.md)) brings the identity the other server held for a
file. KROMA takes it as that file's match ahead of its own reading of the name, and behind a
match a person made by hand in KROMA (LIB-33).

Neither Plex nor Jellyfin records which matches a person fixed, so there is no fixed set to
bring. Every identity comes over, and the ones somebody fixed come with them.

**LIB-85** (SHIPPED) - **A match named in the `.nfo` file.** A film's or a show's `.nfo` file
(LIB-84) that names the title's provider id, as Kodi, Jellyfin and Plex write it, matches the
title to that id ahead of KROMA's own reading of the name, behind a match made by hand (LIB-33)
and one an import brought (LIB-78). A title already matched to another id by its name is
matched again to the file's at the next scan.

**LIB-92** (SHIPPED) - A film's or a show's `.nfo` file (LIB-84) that names no provider id,
only the title's IMDb or TheTVDB id as Kodi, Jellyfin and Plex write them, matches the title
to the record the provider gives for that id. The provider is asked once, and its answer holds
until the file changes. Such a file comes behind a provider id that the file or an import
names (LIB-85, LIB-78), and one the provider knows nothing about leaves the title to be
matched by its name.

**Matches two things.**

**LIB-35** (AGREED) - A file that could be more than one identity, a title shared by a remake
with no year to separate them or two provider records that both fit, is recorded as
**ambiguous**, a variant of the unmatched state, with the competing candidates surfaced for a
person to choose. A wrong confident match is worse than an honest "which one?", so the tie is
never broken silently.

**LIB-36** (AGREED) - One unplaceable file never stalls a source. The catalogue is always the
set of files that *did* match plus a visible tally of those that did not.

## Metadata providers

Status: **SHIPPED** in part; each requirement carries its own.

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

**LIB-82** (SHIPPED) - A title's text is shown in the reader's language one field at a time.
A title, tagline, summary, genre list or character name that language lacks is shown in
English where English has it, so a film with a French title and no French summary shows the
French title over the English summary. Artwork is never borrowed this way.

**LIB-83** (SHIPPED) - A person who manages the library can write a film's or a show's name,
summary, year and genres by hand, whether the provider matched it or not. Each field they
write is shown in place of the provider's, in every language, until they clear it. A field
they leave empty keeps following the provider. A rescan, a refresh or a re-match keeps what
they wrote (LIB-44), search finds the name they wrote, and a backup carries it.

**LIB-84** (SHIPPED) - A film or a show takes its name, summary, year and genres from the
`.nfo` file kept beside it, the file Kodi, Jellyfin and Plex read: one named after a film's
video or `movie.nfo` in a folder that holds that film alone, and `tvshow.nfo` in a show's
folder. The file comes before the provider's text, in every language and whether or not the
provider matched the title, as a local file does in Jellyfin and Kodi. What a person wrote by
hand (LIB-83) comes before the file, field by field. A file added or changed is read at the
next scan, and one that is not such a document is passed over.

**LIB-86** (SHIPPED) - The catalogue sorts and filters a title by the name, year and genres it
shows: what a person wrote by hand (LIB-83), else its `.nfo` file (LIB-84), else the provider's.
A year written in place of the provider's also replaces a release date that falls in another
year, so a title sorted by release lands where its year says.

**LIB-87** (SHIPPED) - A person can write the day a title came out in place of its year
(LIB-83), and a `.nfo` file's premiere date gives it too (LIB-84). The year shown is the date's,
as Plex and Kodi take a film's year from its release date, and the date replaces the
provider's. A year written alone stays possible for a title whose day nobody knows.

**LIB-88** (SHIPPED) - A person can write a sort title for a title (LIB-83), and a `.nfo`
file's `<sorttitle>` gives one too (LIB-84). The catalogue sorts the title, and files it under
a letter, by that name, while the name shown stays the same, as in Plex, Jellyfin and Kodi.

**LIB-89** (SHIPPED) - An episode takes its name, summary and air date from the `.nfo` file
named after its video, as Kodi, Jellyfin and Plex read it. The file comes before the provider's
text, in every language and whether or not the provider recognized the episode, as a film's
does (LIB-84). A file that describes several episodes gives the first.

**LIB-90** (SHIPPED) - A person who manages the library can write an episode's name, air date
and summary by hand, from the episode's row on its show's page. What they write comes before the
episode's `.nfo` file (LIB-89) and the provider's text, field by field and in every language, and
a rescan or a refresh keeps it, as for a film (LIB-83).

**LIB-91** (SHIPPED) - The backdrops behind the sign-in screen, the notification that new
titles arrived and the most-watched panel of the dashboard name a title by what a person wrote
or its `.nfo` file says (LIB-83, LIB-84), before the scanned or fetched name. They show the
poster or the backdrop kept for it (MEDIA-48 to MEDIA-50) before the fetched one.

**LIB-94** (SHIPPED) - A film or a show shows its original title, the one it was made under,
below the name shown when the two differ by more than their case, as Jellyfin does. It comes
from the provider, the `.nfo` file's `<originaltitle>` (LIB-84) comes before it, and what a
person writes (LIB-83) comes before both, the same in every language. Search finds a title by
its original title too.

**LIB-95** (SHIPPED) - A film or a show shows its tagline above its summary. It comes from the
provider, the `.nfo` file's `<tagline>` (LIB-84) comes before it, and what a person writes
(LIB-83) comes before both, the same in every language.

The specific providers, and whether more than one is consulted, are configuration and
architecture rather than product rules, and are not fixed here.

## Refresh

Status: **SHIPPED** in part; each requirement carries its own.

**LIB-41** (SHIPPED) - A newly matched item fetches its metadata once.

**LIB-42** (AGREED) - Running series are re-checked on a slow cadence, so a new episode's air
date and stills appear without a person asking. Completed films are not re-checked on a
timer, because their metadata does not change.

**LIB-43** (AGREED) - A "Refresh metadata" action on any title, season or whole source
re-fetches from the provider and overwrites the cache, so a person can pull a corrected
summary or better artwork on demand.

**LIB-44** (AGREED) - A forced refresh **never** discards a manual match or user-chosen
artwork. It refreshes the descriptive fields around a binding the person set; it does not
overturn the binding.

**LIB-50** (SHIPPED) - Refreshing metadata and re-running identification are two actions, and
a metadata refresh never re-runs matching. "Re-match" is its own action, on a title, and it is
the only thing that can change a binding.

Two actions rather than one, because they fail in opposite directions. A person asking for
better artwork is asking about the *record*; a person fixing a wrong film is asking about the
*identity*. Folding them together means the cheap, frequent, safe request carries the risk of
the rare, deliberate, destructive one, and the first time a refresh silently re-matched a
correctly-bound file the person would stop trusting refresh entirely. Splitting them costs one
menu entry.

## Deletions and moves

Status: **SHIPPED** in part; each requirement carries its own.

The rule is **mark absent, never destroy user data**, and it is not negotiable enough to leave
as an open question.

**LIB-45** (SHIPPED) - When a file disappears from a source, its title is **marked absent**:
removed from normal browsing, but its record and all watch history, resume positions, ratings
and manual-match bindings keyed to it are retained. Watch history survives a file outliving
its bytes.

**LIB-46** (SHIPPED) - Content that reappears, because a NAS remounts or a file is moved back
or relocated within the source, re-matches to the same identity, and everything the person
built up is still there.

**LIB-47** (SHIPPED) - A **move** is therefore not a special case. It is an absent path plus a
new path that resolve to one identity, and the history follows the identity rather than the
path. This is what makes reorganising a library on disk safe.

**LIB-48** (SHIPPED) - A rescan **only ever marks absent**. It never deletes user data.

A folder the scan cannot read, because it is missing, empty or holds a link it cannot open,
says nothing about the files below it: their titles stay as they were, present, and the scan
names that folder where the owner reads the scan's result (LIB-6).

**LIB-49** (AGREED) - Permanently deleting a title's history is an explicit, person-initiated
admin action ("Remove and forget"), never a side effect of a scan. The one actor allowed to
destroy history is a human who asks for it, on the admin surface ([`admin/`](../admin/)).

## Not in scope

Status: **AGREED**

- **Acquisition.** Getting files onto disk, meaning downloads and indexers, is a module
  concern, [`modules/`](../modules/). The library observes what appears; it does not fetch it.
  What the server wants to hold, and what it still lacks, is monitoring,
  [`monitoring.md`](monitoring.md).
- **What a matched title technically is**, meaning containers, codecs, streams and artwork
  sizes, is [`media/`](../media/).
- **Choosing what to send a client** at play time is [`playback/`](../playback/).
- **Who may see which source or title** is [`accounts/`](../accounts/).
