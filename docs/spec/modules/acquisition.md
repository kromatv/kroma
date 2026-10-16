# Acquisition

Status: **AGREED**

How the acquisition module decides what is worth downloading, for what is missing and for what
could be better. What a title wants is monitoring ([`../library/monitoring.md`](../library/monitoring.md));
this chapter is how a release is judged against that want, and against the files the title
already holds.

## Quality rules

Status: **AGREED**

**MOD-54** (AGREED) - An admin can change every rule below while the server runs: qualities and
their sizes, custom formats, and profiles. A change applies from the next search.

**MOD-75** (AGREED) - A server that had acquisition settings before rules existed starts with
rules built from them: its resolution, HEVC preference, minimum seeders, size caps and required
and forbidden words become the default profile and sizes, so it keeps refusing and preferring
what it did.

**MOD-55** (AGREED) - A **quality** is a source at a resolution, from a fixed vocabulary: cam,
SD sources, HDTV, WEBRip, WEB-DL, Blu-ray and remux at 720p, 1080p and 2160p, and unknown at each
resolution. The vocabulary is fixed so two profiles rank the same names.

**MOD-56** (AGREED) - Each quality has a size range in megabytes per minute of runtime,
minimum, preferred and maximum, for films and for episodes separately, so one limit fits a
22-minute episode and a three-hour film.

**MOD-57** (AGREED) - A **custom format** is a named test made of conditions on the release
name, group or edition (a pattern), the audio language with its regional dub or the title's
original language, the subtitle language, the source, the resolution, the video codec, the HDR
format, the audio codec and channels, the size, or an indexer flag.

**MOD-58** (AGREED) - A condition can be negated or required. A format matches when every
required condition holds and, for each kind of condition that has optional ones, at least one of
them holds.

**MOD-59** (AGREED) - A **profile** ranks the qualities it allows, several of them sharing a rank
when they are equals, names the cutoff where quality upgrades stop, and says whether upgrades
happen at all.

**MOD-76** (AGREED) - A profile scores each custom format, and sets the minimum format score a
release needs, the upgrade-until score where format upgrades stop, and the minimum increment a
format upgrade must clear.

**MOD-77** (AGREED) - A profile names terms a release must contain and terms it must not, and a
minimum number of seeders.

**MOD-60** (AGREED) - One profile is the default. Any title may be judged by another.

**MOD-61** (AGREED) - The rules can be tested against a release name: the editor shows what was
read from the name and how each profile judges it.

## Judging a release and a file

Status: **AGREED**

**MOD-62** (AGREED) - One set of rules judges a release and a file on disk. A file's facts come
from what its probe measured and, for what only a name says (source, group, edition), from the
release it was imported under or else its own name. Where the probe measured something, the
probe wins: a file named 2160p that decodes at 1080p is 1080p.

**MOD-63** (AGREED) - A release name says which French dub it carries (a file says it as
MEDIA-47 describes): TRUEFRENCH and VFF are
the France dub, VFQ the Québec one, VF2 both, FRENCH a dub of unstated origin, MULTi the
original audio plus a dub, VOSTFR the original audio with French subtitles. A name with no
language tag is in the title's original language.

**MOD-64** (AGREED) - Releases are ranked by their quality's rank in the profile, then their
format score, then their revision (a PROPER or REPACK), then how many episodes one grab covers,
then the indexer's priority, the seeders, and how close the size is to the preferred one.

**MOD-78** (AGREED) - A release outside the profile's qualities, below its minimum format score,
outside its quality's size range, short of seeders, or breaking a must or must-not term is
refused, and says which rule refused it.

**MOD-65** (AGREED) - With upgrades on, a release **upgrades** a file in three cases, and in no
other. A release never replaces a file of better quality.

- Its quality ranks above the file's, and the file is below the cutoff.
- Its quality ranks the same, its format score beats the file's by the minimum increment, and
  no file of the title reaches the upgrade-until score.
- It is a newer revision of the same quality.

**MOD-66** (AGREED) - A title is **cutoff unmet** when its best file is below the cutoff, or no
file of it reaches the upgrade-until score.

**MOD-67** (AGREED) - With **add beside** on, a release that wins on formats and loses on
quality is placed next to the file instead of being refused: a 1080p release with the France dub
beside a 2160p file in English only. Add beside is off by default, because the file a viewer is
served is still chosen by picture first (MEDIA-8), so the copy beside is not played unless a
person picks it.

## Searching

Status: **AGREED**

**MOD-68** (AGREED) - Missing units are searched first, each title under its own profile. A unit
searched without result waits before the next search by how long ago it aired: 15 minutes
within a day, an hour within a week, 6 hours within a month, a day within a year, a week beyond.
Each fruitless search stretches that wait, up to five times, and never past a week.

**MOD-69** (AGREED) - Titles that are cutoff unmet are searched for a better copy with what the
missing search leaves, on their own wait: half a day after a search, doubling with each one that
finds nothing, up to a week.

**MOD-70** (AGREED) - Every indexer's latest releases are read on an interval, fifteen minutes
by default, and matched to monitored titles by name, alternative name and year, so a new episode
lands within minutes without each indexer being asked for each episode. The interval can be
changed or turned off.

**MOD-71** (AGREED) - Any title can be searched by hand from its page, monitored or not. Each
release found says whether grabbing it fills a hole, upgrades a file, sits beside one, or
improves nothing, and why.

## Failures and replacements

Status: **AGREED**

**MOD-72** (AGREED) - A download that fails, stalls past a limit, or is removed puts the units
it covered back to missing. The stall limit is 72 hours by default and can be turned off.

**MOD-73** (AGREED) - A release whose download failed is blocklisted for its title, so the next
search skips it from every indexer. The blocklist is visible, and an admin can clear an entry.

**MOD-74** (AGREED) - The library never deletes (LIB-48). Replacing a file is acquisition acting
on an admin's standing choice, replace on upgrade, on by default; turned off, the upgrade lands
beside the file and both are kept. Only a file of the same edition is ever replaced (MEDIA-2).

**MOD-79** (AGREED) - A file an upgrade replaces goes to the recycle bin when one is set, and is
cleared after a number of days, 30 by default. With no bin it is deleted at once.

## Not in scope

Status: **AGREED**

- **Merging an audio track** of one release into the file of another, to keep one file with the
  best picture and the wanted dub, is not decided.
- **Importing community formats** written for other tools as they are is not promised.
- **Waiting before a grab** in case a better release follows is not decided.
