# RFC NNNN: monitored titles, wanted lists and quality rules the admin writes

- Status: **DRAFT**
- PR: #NNNN
- Affects: a new spec space `docs/spec/acquisition/` (prefix `ACQ`),
  `docs/spec/library/README.md` (LIB-42, LIB-45 to LIB-48), `docs/spec/media/README.md`
  (MEDIA-8, audio language), the core `requests` and `wanted` model, the modules
  `tv.kroma.acquisition`, `tv.kroma.scene`, `tv.kroma.indexer`, `tv.kroma.torrents`, and the
  web title page and admin

## Summary

Manage a library the way Sonarr and Radarr do. A series or a movie is **monitored**, with
per-season and per-episode control. A monitored episode that has aired and is not on disk is
**missing**, and gets searched. A monitored file below its profile's target is **cutoff
unmet**, and gets upgraded until it reaches the target. Every rule that decides what is good
enough is data the admin edits: the quality ladder, the sizes, the **custom formats** (HDR,
Dolby Vision, VFF, VFQ, MULTi...) and the **profiles** that score them. The shipped defaults
reproduce today's hardcoded scoring, so nothing changes until someone edits a rule. A request
stops being the only way into acquisition: approving one monitors the title, and so does a
click on any title already in the library.

## Motivation

Three things a KROMA admin cannot do today.

**Fill the holes in a show already on disk.** The `library.missing` job lists every aired
episode the library lacks, and the "Manquants" page shows them. Nothing searches for them.
Each gap needs someone to open a request first, because acquisition only accepts a request id.

**Get a better copy of something already on disk.** A grab counts as an upgrade only from a
request's interactive search, and only when every episode it covers is already marked
available. Nothing compares a release with the file it would replace, the automatic pass never
upgrades, and a title nobody requested cannot be searched at all.

**Ask for the French dub.** A show sits on disk in English only, or with a Québec dub. The
household wants the original plus VFF. The release parser throws `MULTi`, `TRUEFRENCH`,
`VFF` and `VFQ` away as noise, the probe records `fre` without telling France from Québec,
and the score has no line for language. There is no way to say "this file is not good enough
until it has VFF".

Behind all three: the rules are code. Resolution scores 1000 points, HEVC 400, a season pack
300. HDR and Dolby Vision are parsed and score nothing. An admin who disagrees has to fork
the scene module.

Four defects found while mapping this, fixed first and independently of the design:

1. The request ledger always shows an empty "on disk" quality: the per-file video columns
   are written, the per-item ones it reads never are.
2. A two-episode file (`S01E01-E02`) reports E02 missing in the gap list and in request
   matching, because that check ignores the episode range the guide check honours.
3. A wanted row never goes back to wanted. A failed or removed download stays `grabbed`, a
   deleted file stays `available`.
4. HDR and Dolby Vision are parsed and never scored.

## What exists to build on

- **Several files per title** (MEDIA-3). A 1080p file and a 4K file of the same cut are two
  files of one edition, and the preferred one is picked by rank (MEDIA-8). Sonarr can hold one
  file per episode. KROMA can hold two, which matters for languages below.
- **A per-episode wanted ledger** with search backoff, a refresh pass that adds newly
  announced episodes, and statuses `wanted`, `grabbed`, `available`.
- **The episode guide** for every season the library holds part of, and a daily gap scan
  over every TMDB season.
- **A release parser** for resolution, source, codec, HDR, Dolby Vision, group, season,
  episode, ranges, packs, PROPER and REPACK.
- **An import** that places by hardlink, reflink or copy, replaces or sits beside on upgrade,
  and drops superseded files of the same cut.
- **A probe** that records every audio track's language and title.

## Proposal

### 1. Monitoring

A **monitored title** is a movie or a show the server wants to hold. It records who added it
and when, which profile judges it (none means the default), and, for a show, whether new
seasons are monitored as they are announced.

Inside a monitored show, each season and each episode is monitored or not. Monitoring a show
applies one of these presets once, and the admin adjusts episode by episode afterwards:

| Preset | Monitors |
|---|---|
| All | every episode, aired or not |
| Future | episodes that have not aired yet |
| Missing | aired episodes not on disk, and future ones |
| Existing | episodes on disk only |
| First season / Latest season | that season |
| Pilot | S01E01 |
| None | nothing; the show is listed but idle |

A monitored movie becomes searchable at its **minimum availability**: announced, in cinemas
or released. The default is released. It is a per-title setting.

**A request is the user's way in, monitoring is the admin's.** Approving a request monitors
the title with the requested scope, merging into the existing monitoring if there is one.
The request keeps its own status for the person who asked, derived from the rows it covers.
Deleting a request no longer deletes what it wanted: the title stays monitored until an admin
unmonitors it.

Monitoring is a library-side record. It is useful without any acquisition module: it is what
the missing list is built from, and an admin can fill it by hand.

### 2. The wanted lists

**Missing** is every monitored episode or movie that is available (aired, or past its
minimum availability) and has no file. It replaces today's request-only list. The gaps of
unmonitored shows stay visible behind a filter, as today's "Manquants" shows them.

**Cutoff unmet** is every monitored episode or movie that has a file its profile would still
upgrade (section 5). It is new, and it needs the acquisition module, which owns the rules.

Both lists are kept true in both directions. A file that disappears puts its row back in
missing on the next scan; an option unmonitors it instead, for an admin who deletes on
purpose. A download that fails or is removed puts its rows back in missing (section 8).

### 3. Quality rules

Everything below is edited in Admin, under Acquisition. The shipped defaults reproduce
today's behaviour, and the current acquisition settings are folded into the default profile
once, on upgrade.

**Qualities.** A fixed vocabulary of source and resolution: `SDTV`, `DVD`, `HDTV-720p`,
`HDTV-1080p`, `WEBRip-720p` to `WEBRip-2160p`, `WEBDL-720p` to `WEBDL-2160p`, `Bluray-720p`
to `Bluray-2160p`, `Remux-1080p`, `Remux-2160p`, and `Unknown`. The vocabulary is fixed so
two profiles can be compared. What is editable is each quality's **size range**, in megabytes
per minute of runtime (minimum, preferred, maximum), so one rule fits a 22-minute episode and
a three-hour film.

**Custom formats.** A named test on a release or a file. A format has one or more conditions,
and each condition is one of:

| Condition | Tests |
|---|---|
| Release title | a regular expression on the release name |
| Release group | a regular expression on the group |
| Edition | a regular expression on the edition |
| Language | an audio language, with its regional variant (`fr-FR`, `fr-CA`), or `Original` |
| Source | Remux, BluRay, WEB-DL, WEBRip, HDTV, DVD |
| Resolution | 480p to 2160p |
| Video codec | HEVC, H.264, AV1, VP9 |
| HDR format | HDR10, HDR10+, Dolby Vision, HLG, any HDR |
| Audio | codec and channel count |
| Size | a range in gigabytes |
| Indexer flag | freeleech, internal, scene |

Each condition can be negated or marked required. A format matches when every required
condition matches, and, for each condition type that has optional conditions, at least one of
them matches. This is Sonarr's rule, kept on purpose so formats written for Sonarr read the
same here.

The defaults include HDR10, HDR10+, Dolby Vision, HEVC, AV1, Remux, VFF, VFQ, VF2, MULTi,
VOSTFR and VO, scored to reproduce today's points.

**Profiles.** A named set of:

- the **allowed qualities**, in the order the admin ranks them, where several may share a rank;
- the **cutoff**: the quality at which quality upgrades stop;
- whether **upgrades** are allowed at all;
- a **score for each custom format**, positive or negative;
- the **minimum format score** a release needs to be grabbed;
- the **upgrade-until score**: the format score at which format upgrades stop;
- the **minimum increment**: how much better a release's format score must be to replace a
  file of the same quality;
- **must contain** and **must not contain** terms, today's keyword settings;
- the **minimum seeders**;
- whether a release that wins on formats but loses on quality is **added beside** the file
  rather than rejected (section 6).

One profile is the default. A monitored title may name another.

### 4. What a release and a file are made of

A custom format and a profile judge **facts**. The same facts are read from a release and
from a file on disk, so one rule decides both what to grab and whether what is on disk is
good enough.

| Fact | From a release | From a file on disk |
|---|---|---|
| Resolution, codec, HDR format, bit depth | the release name | the probe |
| Audio languages and their regions | the release name | the probe: tags, then track titles |
| Audio codec and channels | the release name | the probe |
| Source, group, edition, PROPER/REPACK | the release name | the release name it was grabbed under, else its file and folder names |
| Size | the indexer | the file |

Where the probe measures something, the probe wins: a file named `2160p` that is 1080p is
1080p.

**Languages in a release name.** `TRUEFRENCH` and `VFF` mean the France dub. `VFQ`, `QC`
and `QUEBEC` mean the Québec dub. `VF2` means both. `FRENCH` means a French dub of unstated
origin, which a format treats as French with no region. `MULTi` means the original audio plus
a French dub, and the tag after it (`MULTi.VFF`, `MULTi.VFQ`, `MULTi.VF2`) says which.
`VOSTFR` means the original audio with French subtitles. A format can still add any term the
parser does not know through a release-title condition.

**Languages in a file.** An audio track's region comes from its language tag when the file
carries one (`fr-CA`), else from its title (`VFQ`, `Québécois`, `Canada`, `VFF`, `France`,
`Truefrench`). A track with neither is French with no region. This is a media fact, not an
acquisition one: the player's audio menu shows it too.

`Original` in a language condition is the title's original language from its metadata, so
one format, "VO + VFF", serves an English series and a Korean film.

### 5. When a release is better

A release is ranked against another, or against the file on disk, by comparing in order:
its quality's rank in the profile, its format score, its revision (a PROPER or REPACK of the
same group beats the original), the indexer's priority, the seeders, and how close its size
is to the preferred size. The ranking is a comparison, not a sum, so each step of "why this
one" can be shown.

A release **upgrades** a file when the profile allows upgrades and one of these holds:

- its quality ranks above the file's, and the file is below the cutoff;
- its quality ranks the same, its format score beats the file's by at least the minimum
  increment, and the file's score is below the upgrade-until score;
- it is a newer revision of the same release.

A release never replaces a file of a better quality. A file is **cutoff unmet** when some
release could still upgrade it: its quality is below the cutoff, or its format score is below
the upgrade-until score.

### 6. Languages, and keeping two files

The VFF case: a 2160p HDR file in English is on disk, and the profile scores "VO + VFF".
A `MULTi.VFF` release at 1080p wins on formats and loses on quality. Sonarr would refuse it.
KROMA can keep both, because one edition holds several files (MEDIA-3).

With **add beside** on, that release is grabbed and placed next to the 2160p file, which
stays. With it off, the release is rejected and the title waits for a 2160p `MULTi.VFF`.

Keeping two files only helps if the right one plays. So the preferred file for a viewer
(MEDIA-8) considers their audio language first: a viewer whose language is French gets the
file that has a French track, then resolution and the rest of today's rank apply.

Merging the VFF track into the existing file, instead of keeping two, is out of scope here
(see Unresolved).

### 7. When the server searches

- **On monitor**, if the admin ticks "search now".
- **The backoff pass**, as today, over missing rows. Cutoff-unmet rows join it on a slower
  cadence, with their own backoff, so upgrades never starve a new episode.
- **RSS sync**, every 15 minutes by default: each indexer's latest releases, fetched without
  a query, matched to monitored titles by name, alternative titles and year, and judged by
  the same rules. This is how a new episode is grabbed within minutes without asking every
  indexer for every episode.
- **By hand**: search an episode, a season or a movie; search all missing; search all cutoff
  unmet; and **find a better version** on any title, monitored or not.

Every interval is a setting.

**Find a better version** is an interactive search from the title page. Each release is shown
against the file on disk: better quality, better formats, same, worse, or rejected with the
rule that rejected it. Grabbing one replaces the file, or adds it beside, by the rules above.

### 8. When a download fails

A download that errors, stalls past a limit, or is removed from its client returns its rows
to missing, and its release joins a **blocklist** for that title so the next search skips it.
The admin sees the blocklist and can clear an entry. The stall limit is a setting.

### 9. Replacing a file

The library never writes (LIB-28); acquisition does. When an upgrade replaces a file, the old
file goes to a **recycle bin** folder, kept for a number of days and then deleted. An empty
recycle bin setting deletes at once, which is today's behaviour. Only a file of the same cut
is ever replaced, as today.

### 10. Surfaces

All of it is admin-only, on the web client.

- **Title page**: monitor toggle and preset, season and episode toggles, the profile, each
  file's quality, matched formats and score, "cutoff unmet" when it applies, search buttons
  and "find a better version". The core page offers a slot; the acquisition module fills
  everything that needs its rules.
- **Wanted**: Missing (the "Manquants" page, now monitored first) and Cutoff unmet.
- **Bulk editor**: select many shows or movies, set monitoring, preset and profile at once.
  This is how an existing library is put under management in one step.
- **Admin, Acquisition**: profiles, custom formats (with a "test" box that takes a release
  name or picks a file and shows which formats match), quality sizes, the blocklist, and the
  settings for RSS, failure handling and the recycle bin.

The television and phone clients change only through MEDIA-8 (the preferred file) and the
audio region shown in the audio menu.

### Delivery

Each step is a pull request that ships on its own.

1. The four defects.
2. Facts: audio regions on disk, languages and editions in release names.
3. Rules: qualities, custom formats, profiles, the default profile, scoring switched over,
   the editors.
4. Monitoring, wanted rows independent of requests, the title page controls, the bulk editor.
5. Cutoff unmet, the upgrade decision, automatic upgrades, find a better version, the recycle
   bin.
6. Failed downloads and the blocklist.
7. RSS sync.
8. Add beside and the preferred file by language.

## What this costs

- **A rules engine to maintain.** Custom formats are a small language. Every condition type
  is a promise to keep evaluating it the same way, on releases and on files.
- **A migration with behaviour at stake.** Today's settings become the default profile. If
  the defaults do not reproduce today's ranking, an installed server starts grabbing
  differently the day it updates. The scene module's existing score tests are the guard: they
  must pass unchanged against the default profile.
- **Requests change meaning.** A request no longer owns its wanted rows. Deleting one stops
  deleting what it wanted, which an admin used to deleting requests to stop downloads will
  notice.
- **RSS sync is load on indexers** every 15 minutes, which some private trackers limit.
- **The recycle bin is disk space** the admin has to know about.

## Compatibility

- **Existing requests** become monitored titles with exactly their current scope, and their
  wanted rows keep their status and backoff.
- **The acquisition point** keeps accepting a request id, and gains a title and a scope
  without one. A core that predates this keeps working with a new module, and the reverse.
- **Modules release on their own tags.** The core change (monitoring, the slot, the audio
  region) ships first, and acquisition checks for it before showing anything that needs it.
- **Clients that do not update** see what they saw: the new surfaces are admin web pages.
- **Libraries** are untouched until an admin monitors something. Monitoring nothing is the
  default after the upgrade, apart from what requests already wanted.

## Alternatives

- **Do nothing**, and keep requests as the only way in. Gaps stay listed and unsearched,
  and the VFF case stays impossible without forking the scene module.
- **Integrate Sonarr and Radarr** instead of building their model. That means two more
  services to run beside KROMA, each with its own library database that disagrees with ours,
  and still no way to keep two files of one edition.
- **Keep the scores in code and add settings for each new case.** That is how
  `acqPreferHevc` and the keyword settings came about. Each new case is a release, and the
  next case (an AV1 preference, a group to avoid, a Québec household) is another.
- **Make every request a monitored title and add no new concept.** Bulk-monitoring an
  existing library would then fill the requests page with hundreds of requests nobody made.

## Unresolved

- **Add beside, on or off by default.** Off matches Sonarr and never uses more disk than
  asked. On is what makes the VFF case work without a second 2160p release.
- **Merging an audio track into the existing file.** Muxing the VFF track of a 1080p release
  into the 2160p file keeps one file and the best picture. It needs the same cut at the same
  frame rate, which a PAL dub at 25 frames per second breaks. Deferred until add beside has
  shipped and been used.
- **Importing Sonarr and Radarr custom formats** as JSON, so the published community formats
  work as they are. The condition model above is compatible on purpose; whether to promise
  the import is open.
- **Movie collections.** Monitoring a collection, so a missing film of a saga is listed and
  searched, is Radarr's next feature. It needs collection metadata the server does not fetch
  yet, and a separate RFC.
- **Delay before grabbing.** Waiting some minutes after a release appears, in case a better
  one follows, is a Sonarr profile option. Left out until RSS sync shows whether it is needed.
