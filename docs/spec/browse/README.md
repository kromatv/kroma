# Browse

Status: **SHIPPED**, with the deferrals named at the end. Sections carry their own status
below.

What a person sees when they open KROMA with nothing in mind, and how they find the title
they do have in mind. The home answers the first, search the second. Both stop where
[`playback/`](../playback/) begins: this file decides what is offered, never what happens
once it is chosen. Who may see a title at all is [`accounts/`](../accounts/).

## The home is made for one viewer

Status: **SHIPPED**

**BROWSE-1** (SHIPPED) - The home is built for the account looking at it. Two people of one
household opening it on the same day do not get the same page.

**BROWSE-2** (SHIPPED) - A viewer with no history still opens on a full page: with nothing to
read a taste from, titles are ordered by what recommends them to anybody (their rating, how
recently they arrived, what the household is watching).

**BROWSE-3** (SHIPPED) - The home is the same on every surface: the same sections, in the same
order, for the same viewer. A surface decides how a section is drawn, never which sections
there are.

**BROWSE-4** (SHIPPED) - The order of a row sways from one day to the next and holds still
within a day, so the page is not the same every morning and does not shuffle between two
visits an hour apart.

## How a section asks to be drawn

Status: **SHIPPED**

**BROWSE-5** (SHIPPED) - Every section names one of five layouts: a **rail** of posters; a
**wide** rail of landscape cards with room for a line under each title; a **ranked** rail whose
entries are numbered because their order is the point; a **spotlight**, one title given the
width of the page; and the **hero**, the few titles the page opens on, shown one at a time.

**BROWSE-6** (SHIPPED) - A client is only sent the layouts it says it can draw. A layout it
cannot draw arrives as a rail when the section still reads as one, and is left out when it does
not: a hero is not a row of five posters.

**BROWSE-7** (SHIPPED) - An app released before a layout existed therefore keeps a home it can
draw, and still gains every new row that is a rail.

**BROWSE-8** (SHIPPED) - A section may say one line about an entry: why it is offered to this
viewer ("for you, from this director", "on your list", "new") or what is new in it ("3 new
episodes"). A client shows the line where its layout has room for one.

## What a page holds

Status: **SHIPPED**

**BROWSE-9** (SHIPPED) - The hero holds at most five titles and takes a small share of a small
library, so that a library of thirty titles is not spent on its first screen.

**BROWSE-10** (SHIPPED) - No recommendation repeats a title another recommendation on the same
page already offers. The hero and the spotlight choose first, because they show a title large.

**BROWSE-11** (SHIPPED) - A row that lists facts (what was added, what gained episodes, what
is trending, what the viewer saved or loved) shows what it lists, whatever the other rows hold.

**BROWSE-12** (SHIPPED) - A title the library holds under two entries is recommended once.

**BROWSE-13** (SHIPPED) - A title the viewer finished, dropped, or has in progress is not
recommended. It still appears in the rows that list facts.

**BROWSE-14** (SHIPPED) - A row with too few titles to look like a row is not shown. A row is
never padded with titles that do not belong in it.

**BROWSE-15** (SHIPPED) - A row that makes a claim about its members ("with this actor", "like
that film") is promised its minimum before the general rows take their pick, so a small
library keeps its specific rows.

## Reading a taste

Status: **SHIPPED**

**BROWSE-16** (SHIPPED) - A taste is read from what the viewer did, never asked for. Finishing
a title counts for it, and going back to it counts for more. A season watched says more than
an episode. Saving a title counts for it.

**BROWSE-17** (SHIPPED) - A film left in its first minutes and not returned to counts against
what it is, as does a show sampled for one episode and abandoned. One that was only just
started counts neither way.

**BROWSE-18** (SHIPPED) - A taste fades with time without vanishing: last week says more than
last year, and last year still says something.

**BROWSE-19** (SHIPPED) - A title is described by its genres, the people in it and behind it,
its decade and whether it is a film or a show. A rare trait says more than a common one:
sharing a director means more than sharing "drama".

**BROWSE-20** (SHIPPED) - One title is not a leaning. A genre or a person earns a row of its
own once the viewer liked at least two titles that carry it.

**BROWSE-21** (SHIPPED) - Recommendations need no module. A module that embeds titles sharpens
the order when it is installed and is not missed when it is not.

## Rows that make a claim

Status: **SHIPPED**

**BROWSE-22** (SHIPPED) - "Because you watched X" holds only titles that share a genre with X
and resemble it. It is offered for the latest titles the viewer clearly liked.

**BROWSE-23** (SHIPPED) - A genre row holds only titles of that genre, and a person's row only
titles that credit them.

**BROWSE-24** (SHIPPED) - A themed row is a rule before it is a ranking. A title is a member
only when its genres allow it and none of them is one the theme excludes, and, where the theme
names something a genre cannot (Christmas, a heist, a true story), when its own title or
synopsis says so, in whatever language either was stored.

**BROWSE-25** (SHIPPED) - A slasher set at Christmas is therefore not in the Christmas row, and
neither is a family film that never mentions Christmas.

**BROWSE-26** (SHIPPED) - An embedding may order the members of a theme. It never admits one.

**BROWSE-27** (SHIPPED) - A theme that is only a mood, which no rule can check, is shown only
while a module that embeds titles answers, and only over the titles that clear that module's
own threshold.

**BROWSE-28** (SHIPPED) - Themes follow the calendar and the clock: a season's themes in its
months, evening themes in the evening, family themes at the weekend. Seasonal themes come
first.

## Rows that list facts

Status: **SHIPPED**

**BROWSE-29** (SHIPPED) - New films and new shows are two rows. A show is new by when its
first episode arrived.

**BROWSE-30** (SHIPPED) - "New episodes" lists the shows that were already in the library and
gained episodes in the last three weeks, the ones the viewer follows first. Each says what is
new in it: the episode, or how many.

**BROWSE-31** (SHIPPED) - "Trending" is a ranked row of at most nine. A household of several
leads it with what it watched most over the last month.

**BROWSE-55** (SHIPPED) - What the world is watching this week, as the metadata provider ranks
it, fills the rest of the trending row, restricted to titles the library holds. A household
of one is given that ranking alone: its own plays are its history, not a trend.

**BROWSE-56** (SHIPPED) - The provider's ranking never delays the home. It is read in the
background, kept for half a day, and a server that cannot reach the provider simply shows
what the household watched.

**BROWSE-32** (SHIPPED) - What the viewer saved and has not finished is a row of the home, the
latest save first.

**BROWSE-33** (SHIPPED) - An admin can turn the recently added rows off ([`admin/`](../admin/)).

**BROWSE-61** (SHIPPED) - While a scan runs, the home gains each title as the scan matches it,
without a reload. A new owner watches the library arrive ([`admin/setup.md`](../admin/setup.md)).

## Search

Status: **SHIPPED**

**BROWSE-34** (SHIPPED) - Every word of a query has to land somewhere in a result: its title in
any stored language, the people in it or behind it, its genres, its synopsis. A title outranks
a name, a name a genre, a genre a synopsis.

**BROWSE-35** (SHIPPED) - The last word may be unfinished, and a typo is forgiven in a title or
a name. It is not forgiven in a synopsis, where at any useful distance most queries match by
accident.

**BROWSE-36** (SHIPPED) - A query that is the whole title comes before the titles that only
start with it, and those before the titles that merely contain it.

**BROWSE-37** (SHIPPED) - A year beside a title is read as the release year and picks the film
of that year among namesakes. A year that is part of a title still finds that title.

**BROWSE-38** (SHIPPED) - An episode can be named by its number, however it is written
("s02e05", "2x05", "season 2 episode 5"). It then comes before the show it belongs to.

**BROWSE-39** (SHIPPED) - A sequel is found however its number is written: "2", "II" and "two"
are one number.

**BROWSE-40** (SHIPPED) - A title written with a hyphen is found typed as one word, and the
reverse.

**BROWSE-41** (SHIPPED) - A word naming a kind ("film", "series") beside a title favours that
kind. Alone, it is a word like any other.

**BROWSE-42** (SHIPPED) - A full name ranks the titles of that person above a title that merely
holds both words in two different credits.

**BROWSE-43** (SHIPPED) - A query nothing answers in full is read again more loosely, in this
order: word for word; as one word; for most of its words; and, when a module embeds titles,
for its meaning.

**BROWSE-44** (SHIPPED) - A query that matches a credited person's name answers with the
person as well as with their titles.

**BROWSE-45** (SHIPPED) - Search obeys visibility ([`accounts/`](../accounts/)): a title in a
library the asker cannot see takes no place in the results, and a person is counted only over
the titles the asker may see.

**BROWSE-46** (SHIPPED) - A title the asker is in the middle of, or saved, comes before its
namesake.

**BROWSE-47** (SHIPPED) - A show that matches is listed once, without its episodes. A show
that did not match itself is represented by at most three of its episodes.

**BROWSE-48** (SHIPPED) - A title the library holds under two entries is listed once, in
search and on a person's page.

## Every language

Status: **SHIPPED**

**BROWSE-57** (SHIPPED) - Nothing the home or the search recognises in text depends on one
language. The words for a film, a show, a season, an episode, the articles, the number words,
and the words a theme is known by (Christmas, a heist) are part of each language's copy, and
are read across every language the app ships: a query is understood whatever language it is
typed in, and a synopsis counts whichever language it was stored in.

**BROWSE-58** (SHIPPED) - Adding a language is adding its copy. Its words join the vocabulary
and its row titles, notes and plural forms are used, with no other change.

**BROWSE-59** (SHIPPED) - A synopsis shown on the home is cut by sentence, never by the box:
as many whole sentences as fit, and always the first one in full. It ends on a full stop, not
on an ellipsis. Where the device knows the sentence rules of the language it uses them.

**BROWSE-60** (SHIPPED) - A rank is drawn as a shape in the display face, the same on a
television, a phone and a browser. A ranking stops at nine, so every rank is one digit and
all of them are drawn the same size.

## A person's page

Status: **SHIPPED** on web, **AGREED** elsewhere

**BROWSE-49** (SHIPPED) - A person's page lists the titles of the library that credit them,
best known first.

**BROWSE-50** (AGREED) - Under them it lists the rest of the person's filmography, the titles
the library does not hold, each leading to where it can be requested. The web client does
this; the television and mobile clients list the library titles only.

**BROWSE-51** (SHIPPED) - A guest spot as oneself on a talk show is not part of a filmography.

## Deliberately not done

Status: **DESIGN, NOT IMPLEMENTED**

**BROWSE-52** (DESIGN, NOT IMPLEMENTED) - Explicit feedback: "not for me" on a title, or a
thumb up or down. What shipped reads taste from behaviour alone, because that needs nothing
from the viewer and three clients to change nothing. A dropped title already counts against
its kind; a button would let somebody say so without having to start the film.

**BROWSE-53** (DESIGN, NOT IMPLEMENTED) - Counting what was shown and never chosen, to retire a
title a viewer has scrolled past twenty times. What shipped is the daily sway of BROWSE-4,
which moves titles without recording anything about what a viewer looked at.

**BROWSE-54** (DESIGN, NOT IMPLEMENTED) - Themes read from the provider's keywords. The
provider tags a title "christmas" or "heist" more reliably than its synopsis says so, and the
tags are fetched at enrichment but not kept. What shipped reads titles and synopses, which
needs no library to be enriched again.
