# Watch history

Status: **AGREED**

The complete record of what has been played on this server: one row per finished session,
every account, every title, back as far as the log goes. The dashboard panels are summaries
of this; this is the thing itself, and it is its own screen rather than a panel, because a
household's whole history is not something to scroll past on the way to a chart.

## The screen

Status: **AGREED**

**ADMIN-57** (AGREED) - Watch history is a first-class admin screen with its own entry in
the navigation and its own address, not a section of the dashboard.

**ADMIN-58** (AGREED) - The screen shows every session in scope as a table, one row per
session, ordered by when it was watched with the most recent first.

**ADMIN-59** (AGREED) - The header states how many rows the current filters match, before
paging. A reader narrowing filters watches that number move, which is how they know the
filter did anything.

**ADMIN-60** (AGREED) - The columns are the account, the kind of media, the title, the
player, the platform, and when it was watched. Every one of these was known while the
session was live, and none of it can be recovered afterwards, so the log records all of it.

**ADMIN-61** (AGREED) - An episode's title names its series, its season, its episode number
and its own name in one cell, including a row logged before the log kept any of them, as
long as the catalog still holds the title. A row that said only "Chikhai Bardo" would make
the reader go and look it up.

**ADMIN-62** (AGREED) - Any column can order the table, ascending or descending, and the
column currently ordering it says which way.

**ADMIN-77** (AGREED) - When a session was watched is written out in full, the date and the
time of day, rather than as how long ago it was. An evening's six plays all reading "2 days
ago" tells a reader auditing a history nothing, which is the moment the column exists for.

**ADMIN-78** (AGREED) - A row opens the title it names, at that title's own page, wherever
the catalog still holds it. An episode opens its series, which is the page a series has. A
row whose title has left the catalog offers nothing rather than a link to a page that is
gone, because the log outlives the library.

**ADMIN-63** (AGREED) - The table pages or virtualises rather than rendering everything.
A server with years of history holds tens of thousands of rows, and the screen must open in
the same time on the last day as on the first.

## Filters

Status: **AGREED**

**ADMIN-64** (AGREED) - The screen filters by library, by account, and by window, each
independent of the others, each with an "all" entry, and all three defaulting to everything.

**ADMIN-65** (AGREED) - The window control offers the same choices as the dashboard's, plus
everything the log holds, which is the default here. The dashboard is about now; this screen
is about the record.

**ADMIN-66** (AGREED) - Filters live in the address, so a filtered view can be sent to
someone or reloaded without being rebuilt.

**ADMIN-67** (AGREED) - Arriving from a dashboard panel applies the filters that panel sent,
as ADMIN-37 and ADMIN-75 require.

**ADMIN-76** (AGREED) - A screen narrowed to one title names that title in the filter row
beside the other three, and drops it in one action, returning to the whole log with the
library, account and window the reader had chosen still applied. A filter a reader can
enter and never leave is a trap.

## What the log keeps, and for how long

Status: **AGREED**

**ADMIN-68** (AGREED) - A session is written to the log when it ends, carrying everything
the live session knew: who, what, when, for how long, on what device and player, over which
network class, and whether the server had to transcode to deliver it.

**ADMIN-69** (AGREED) - The log is kept indefinitely by default. It is small, it is the only
record of its kind, and a household's viewing history is the sort of thing people are glad
to still have years later.

**ADMIN-70** (AGREED) - The log survives a backup and restore, because a restored server
that had forgotten who watched what would have lost something the owner cannot re-derive.

**ADMIN-71** (AGREED) - An account deleted from the server keeps its rows, attributed to the
name it had. A history with holes in it is not a history. Erasing a person's rows is a
separate, deliberate act, and the product offers it as one rather than as a side effect of
removing their access.

## Who may read it

Status: **AGREED**

**ADMIN-72** (AGREED) - The screen requires the permission to manage users. A watch history
is the most personal record the server holds, and it is the owner's to read, not every
member's.

**ADMIN-73** (AGREED) - A member can always read their own history. What the product does
not do is show one member another's.
