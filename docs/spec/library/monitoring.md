# Monitoring

Status: **AGREED**

What the server wants to hold, and what it still lacks of it. The library observes what is on
disk ([`README.md`](README.md)); monitoring records what someone wants there, which is what
the missing list is built from and what acquisition ([`../modules/acquisition.md`](../modules/acquisition.md))
works from. Monitoring is useful without any acquisition installed: it is still the list of
what is missing.

## Requests, as monitoring meets them

Status: **AGREED**

A **request** is a person asking for a title the library does not hold, or for some of its
seasons or episodes; an admin approves or denies it. A request is **open** until it is
available, denied or failed, and **settled** after. This chapter states only how requests and
monitoring meet; the request queue itself is not specified yet.

## Monitored titles

Status: **AGREED**

**LIB-51** (AGREED) - A movie or a show can be **monitored**: the server wants to hold it.
Monitoring is a record of intent, kept apart from the record of what is on disk, so a title can
be monitored before a single file of it exists.

**LIB-52** (AGREED) - Inside a monitored show, each episode is monitored or not, on its own.

**LIB-53** (AGREED) - A show is monitored with one of these presets, each of which leaves the
specials out (LIB-71): every episode; the episodes still to come; the episodes not on disk,
aired or still to come; the episodes on disk; the first season; the latest season; the pilot;
none.

**LIB-70** (AGREED) - A show can also be monitored with the recent preset: the episodes that
aired in the three months before the preset is applied, and the ones still to come. The window
is read once, so an episode it chose stays monitored as it ages.

**LIB-71** (AGREED) - The specials, the episodes of season 0, are left out: no preset monitors
one, and a show that takes new seasons does not take season 0 either.

**LIB-74** (AGREED) - A person asks for the specials when they choose the preset, for one title
or for many at once, and they are monitored alongside what the preset chose.

**LIB-69** (AGREED) - A preset is applied once. Afterwards each season and each episode is
switched on its own, and applying a preset again chooses the episodes again, LIB-54 aside.

**LIB-54** (AGREED) - Nothing a person switches takes an episode away from a request that is
still open: not a preset, not a season, not the episode itself. What someone asked for stays
monitored until their request is settled, and the switch leaves it on.

**LIB-55** (AGREED) - A season is monitored when its episodes are: switching a season on
monitors every episode in it and the ones announced in it later, and switching it off
unmonitors them all, LIB-54 aside.

**LIB-56** (AGREED) - An episode announced in a monitored season joins monitored. An episode a
person switched off stays off when the show is next read from its provider.

**LIB-57** (AGREED) - A monitored show may **take new seasons**: a season its provider announces
after the show was monitored joins, every episode of it monitored. The presets that look ahead
(every episode, those still to come, those not on disk, the recent ones) turn this on; the
others leave it off; a person can set it either way.

**LIB-58** (AGREED) - A monitored film becomes searchable at its **minimum availability**: when
it is announced, when it is in cinemas, or when it is released for viewing at home. Released is
the default, and each film has its own.

**LIB-72** (AGREED) - A film in cinemas is not released at home yet. A film whose minimum
availability is released, and whose home date nobody knows, counts as released three months
after it reached cinemas.

**LIB-73** (AGREED) - A film whose home release is unknown, or still ahead, is read again from
its provider on a cadence. A home date that appears, or that moves, takes the film's
availability with it.

**LIB-59** (AGREED) - Approving a request monitors its title with what the request asked for,
added to whatever was monitored already. A request for a whole show also takes new seasons.

**LIB-60** (AGREED) - Deleting a request leaves its title monitored. Wanting a title and having
asked for it are separate facts, and only an admin unmonitors.

**LIB-61** (AGREED) - Many titles of the library can be monitored at once, with one preset and
one minimum availability.

**LIB-62** (AGREED) - Unmonitoring a title forgets which units it wanted. Its files are left
alone, and so is any request about it: what an open request asked for keeps being searched for
until that request is settled.

## Missing

Status: **AGREED**

**LIB-63** (AGREED) - A monitored episode or film that is available (aired, or past its minimum
availability) and has no file is **missing**. An episode whose provider gives no date has not
aired.

**LIB-64** (AGREED) - The missing list shows monitored units, and beside them, kept apart, the
aired episodes of shows nobody monitors, which a person can still turn into a request.

**LIB-65** (AGREED) - What is missing stays true in both directions: a file that lands makes
its unit available, and a unit whose file vanished from a title still in the library is missing
again, so it gets searched. The file is absent at once (LIB-45); the unit is missing only once
LIB-66 allows it.

**LIB-66** (AGREED) - A unit goes back to missing only after it has been without its file for
half a day. A file imported a moment ago is on disk before the library has matched it, and must
not read as gone in between.

**LIB-67** (AGREED) - When more monitored units lose their file in one pass than 20, or than a
tenth of the units that pass found available, whichever is larger, none of them goes back to
missing, and the pass says how many it held back. A source going offline must never cause a
library to be downloaded again.

**LIB-68** (AGREED) - A file holding several episodes answers for every episode in it, in the
missing list and wherever the library says what it holds.

## Not in scope

Status: **AGREED**

- **Judging copies**: which release or file is good enough, and upgrading it, is acquisition,
  [`../modules/acquisition.md`](../modules/acquisition.md).
- **Movie collections**: monitoring a saga so its missing films are listed is not decided.
