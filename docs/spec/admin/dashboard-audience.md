# Dashboard: who is watching, and how much

Status: **AGREED**

Below the resource charts the dashboard stops being about the machine and starts being
about the household. Two panels: who watched most, and how much was watched over time.
Both read the play log, so both are only as good as what the log kept. What it keeps is
[`watch-history.md`](watch-history.md).

## Top viewers

Status: **AGREED**

**ADMIN-26** (AGREED) - The panel ranks accounts by time watched over a chosen window, most
first, and shows each one's play count beside their total.

**ADMIN-27** (AGREED) - Each card breaks its total down by kind of media, one row for movies
and one for shows, and marks the kind that account spent most of its time on. A kind with no
time keeps its row, so an account that watched only shows is visibly an account that watched
no movies.

**ADMIN-28** (AGREED) - An account that watched nothing in the window still appears, with
zeroes. An owner comparing members needs the absences as much as the totals.

**ADMIN-29** (AGREED) - The window control offers the last 24 hours, 7 days, 30 days, 90
days, the last year, and everything the log holds. Seven days is the default.

**ADMIN-30** (AGREED) - With more accounts than fit, the panel pages through them rather
than shrinking the cards or scrolling the page sideways.

**ADMIN-31** (AGREED) - Each card carries the account's avatar where it has one, and falls
back to a name-seeded mark rather than a blank.

**ADMIN-75** (AGREED) - A card opens the full history screen
([`watch-history.md`](watch-history.md)) narrowed to that account, and the whole card is
the place to press. It carries everything the log holds for that member rather than the
window the panel is showing, because the question a card raises is what this person
watches, not what they watched this week. A card for plays recorded against no account
has nobody to open and stays a card.

## Playback over time

Status: **AGREED**

**ADMIN-32** (AGREED) - The panel plots time watched per bucket over a chosen window,
stacked by kind of media, so the height of a bucket is that period's total and the bands
are its composition.

**ADMIN-33** (AGREED) - The bucket width is chosen from the window so the chart always
holds a readable number of bars: days for a short window, weeks for a long one. Each bucket
is labelled with the dates it covers.

**ADMIN-34** (AGREED) - The panel carries three independent filters: kind of media, account,
and window. Any combination is valid, and changing one never resets another.

**ADMIN-35** (AGREED) - The account filter lists every account with history in the window,
plus an "everyone" entry, which is the default.

**ADMIN-36** (AGREED) - A footer states the total time for each kind of media over the whole
window, so the reader gets the totals the stacked bars only imply.

**ADMIN-37** (AGREED) - The panel links to the full history screen
([`watch-history.md`](watch-history.md)), carrying its current filters across, so a reader
who has narrowed the chart does not narrow it again on arrival.

**ADMIN-38** (AGREED) - Each kind of media keeps one colour across this panel, the top-viewer
cards and the history screen, for the reason given in ADMIN-23.
