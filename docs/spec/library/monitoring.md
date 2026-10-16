# Monitoring

Status: **AGREED**

What the server wants to hold, and what it still lacks of it. The library observes what is on
disk ([`README.md`](README.md)); monitoring records what someone wants there, which is what
the missing list is built from and what acquisition ([`../modules/acquisition.md`](../modules/acquisition.md))
works from. Monitoring is useful without any acquisition installed: it is still the list of
what is missing.

## Monitored titles

Status: **AGREED**

**LIB-51** (AGREED) - A movie or a show can be **monitored**: the server wants to hold it.
Monitoring is a record of intent, kept apart from the record of what is on disk, so a title can
be monitored before a single file of it exists.

**LIB-52** (AGREED) - Inside a monitored show, each episode is monitored or not, on its own.

**LIB-53** (AGREED) - Monitoring a show applies one preset, once: all episodes, future ones,
missing ones (not on disk, or still to come), existing ones (on disk), the first season, the
latest season, the pilot, or none. Afterwards each season and each episode is switched on its
own, and applying a preset again chooses again.

**LIB-54** (AGREED) - A preset never takes an episode away from a request that is still open:
what someone asked for stays monitored until their request is settled.

**LIB-55** (AGREED) - A season is monitored when its episodes are: switching a season on
monitors every episode in it and the ones announced in it later, and switching it off
unmonitors them all.

**LIB-56** (AGREED) - An episode announced in a monitored season joins monitored. An episode a
person switched off stays off when the show is next read from its provider.

**LIB-57** (AGREED) - A monitored show may **take new seasons**: a season its provider announces
after the show was monitored joins, every episode of it monitored. The presets that look ahead
(all, future, missing) turn this on; the others leave it off; a person can set it either way.

**LIB-58** (AGREED) - A monitored film becomes searchable at its **minimum availability**: when
it is announced, when it is in cinemas, or when it is released for viewing at home. Released is
the default, and each film has its own.

**LIB-59** (AGREED) - Approving a request monitors its title with what the request asked for,
added to whatever was monitored already. A request for a whole show also takes new seasons.

**LIB-60** (AGREED) - Deleting a request leaves its title monitored. Wanting a title and having
asked for it are separate facts, and only an admin unmonitors.

**LIB-61** (AGREED) - Many titles of the library can be monitored at once, with one preset and
one minimum availability.

**LIB-62** (AGREED) - Unmonitoring a title forgets which of its units were wanted. Its files and
any request about it are left alone.

## Missing

Status: **AGREED**

**LIB-63** (AGREED) - A monitored episode or film that is available (aired, or past its minimum
availability) and has no file is **missing**.

**LIB-64** (AGREED) - The missing list shows monitored units, and beside them, kept apart, the
aired episodes of shows nobody monitors, which a person can still turn into a request.

**LIB-65** (AGREED) - What is missing stays true in both directions: a file that lands makes
its unit available, and a unit whose file vanished from a title still in the library is missing
again, so it gets searched.

**LIB-66** (AGREED) - A unit goes back to missing only after it has been without its file for
half a day. A file imported a moment ago is on disk before the library has matched it, and must
not read as gone in between.

**LIB-67** (AGREED) - When more monitored files vanish at once than a person deletes, none of
them goes back to missing, and the pass says how many it held back. A source going offline must
never cause a library to be downloaded again.

**LIB-68** (AGREED) - A file holding several episodes answers for every episode in it, in the
missing list and wherever the library says what it holds.

## Not in scope

Status: **AGREED**

- **Judging copies**: which release or file is good enough, and upgrading it, is acquisition,
  [`../modules/acquisition.md`](../modules/acquisition.md).
- **Movie collections**: monitoring a saga so its missing films are listed is not decided.
