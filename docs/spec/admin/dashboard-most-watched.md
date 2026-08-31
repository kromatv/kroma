# Dashboard: what got watched

Status: **AGREED**

The last dashboard panel names titles rather than counts. An owner reads it to learn what
the household actually uses the server for, which is the question that decides what to keep
and what to add.

## The panel

Status: **AGREED**

**ADMIN-39** (AGREED) - The panel ranks titles by number of plays over a chosen window, most
first, in one column for movies and one for shows. Equal play counts rank alphabetically by
title, so two readers of the same window see the same order.

**ADMIN-74** (AGREED) - A column is bounded in height and scrolls inside that bound. The
panel keeps its size whatever the ranking holds, and a reader reaches every entry in it
rather than the first few.

**ADMIN-40** (AGREED) - Each column is headed by the artwork of its own top title, labelled
with the kind of media, so a reader recognises the column before reading a word of it.

**ADMIN-41** (AGREED) - Each entry names the title, its play count, and how many distinct
accounts played it. One person watching a series eight times and eight people watching it
once are different facts about a household, and the panel must not collapse them.

**ADMIN-42** (AGREED) - An entry is a series where the plays were episodes, not a row per
episode. A household watches a show, and a chart that lists nine episodes of one show has
buried the answer.

**ADMIN-43** (AGREED) - Each entry carries its poster, and falls back to a title-seeded
gradient rather than a blank or a broken image.

**ADMIN-44** (AGREED) - A column with no plays in the window says so in its own words rather
than disappearing. A missing column reads as a broken panel; an empty one reads as an
answer.

**ADMIN-45** (AGREED) - The panel carries two filters, account and window, defaulting to
everyone over the last 30 days.

**ADMIN-46** (AGREED) - Selecting an entry opens that title's own watch history
([`watch-history.md`](watch-history.md)), because "who watched this, and on what" is the
next question every time.

## What counts as a play

Status: **AGREED**

**ADMIN-47** (AGREED) - A play is one finished session in the log, whatever fraction of the
title it covered. The panel counts sessions, not completions, and says so by naming the
column "plays".

**ADMIN-48** (AGREED) - Two sessions of the same title by the same account count as two
plays and one account, which is what ADMIN-41 exists to distinguish.
