# Notifications

Status: **SHIPPED** in part. Sections carry their own status below, and requirements carry
theirs: the inbox ships, while what a row knows about itself is agreed and not built.

What the server tells a person about, where they read it, and what it is allowed to cost
them in attention. A household server has few people and few events, so the bar is high: a
notification nobody acts on is one that should not have been sent.

## What a person is told about

Status: **SHIPPED**

**ACCT-36** (SHIPPED) - A notification belongs to an **account**, not to a device. Every
screen signed into that account shows the same inbox and the same badge, and reading a row on
one of them reads it on all of them.

**ACCT-37** (SHIPPED) - The occasions are these, and a person hears only the ones addressed
to them:

| What happened | Who hears it |
|---|---|
| Someone requested a title | Admins who handle requests |
| A request was approved, denied, or became watchable | The person who requested it |
| New titles arrived in the library | Everyone |
| New episodes of a show arrived | The people following that show |
| A report was filed | Admins who handle reports |
| A report was answered or dismissed | The person who filed it |
| A job failed | Admins who run the server |

Downloads and a disk filling up have names in the same vocabulary, and nothing in the core
raises them today. A module that owns downloads is what would.

**ACCT-38** (SHIPPED) - A notification is addressed to one account, to everyone, to the
holders of one permission, or to the people following one show. There is no way to be told
about another person's business: a request names its requester, and only they and the admins
who act on it hear about it.

**ACCT-39** (SHIPPED) - New media is announced as a **digest**, never per file. A scan that
adds four hundred films is one row, a run of new episodes is one row per show, and the first
digest on a library that already has contents announces nothing, so turning this on does not
greet everyone with the whole catalogue.

**ACCT-40** (SHIPPED) - A job that fails again on its next run says nothing. Only the first
failure of a run of them is told, because the second telling adds no fact and the first is
still unread.

**ACCT-41** (SHIPPED) - An admin can write a notification by hand and send it to one account,
to the admins or to everyone, seeing how it will read first. It goes out on the path a real
one takes, so each person's preferences still decide whether it reaches them
([`admin/`](../admin/)).

## What a row shows, and where it leads

Status: **SHIPPED**

**ACCT-42** (SHIPPED) - A row says what happened in the reader's own language, names the
title, show or job it is about, and carries that title's artwork where there is one. The
wording is chosen when the row is read, so a person who changes language sees the rows they
already have in the new one.

**ACCT-43** (SHIPPED) - A row leads to the screen it is about, and opening it goes there. A
row with nowhere to go offers nothing rather than a link that fails.

**ACCT-44** (SHIPPED) - A row may carry up to a few actions, such as approving a request or
opening a title, and pressing one does that from the inbox without a detour through the
screen that owns it.

**ACCT-45** (SHIPPED) - A row records **what it is about** (a request, a title, an episode, a
job, a report, a download) and **who caused it**, and each client decides from that which of
its own screens to open. A client with no screen for that kind shows the row as a message
rather than leading nowhere.

**ACCT-46** (SHIPPED) - A destination is never frozen into a stored row. Renaming a screen
moves every row already sitting in an inbox, and a row whose subject only becomes reachable
later, such as a film that reaches the catalogue after its request was answered, starts
leading to it.

**ACCT-47** (SHIPPED) - The person a row names is read when the row is read, so a renamed
account or a new avatar shows on rows written before the change.

## Repeats

Status: **SHIPPED** in the reader's list and for a second telling; folding on
the server **AGREED**.

**ACCT-48** (SHIPPED) - Repeats of one thing read as one row with a count, so a run of
identical failures is a line saying how many. The fold happens in the list being read, so a
device that was asleep still raises one banner per repeat.

**ACCT-49** (AGREED) - A repeat folds into the row the person already has: its count rises,
it comes back unread at the top of the inbox, and the banner it raises on a device replaces
the earlier one instead of stacking beside it.

**ACCT-50** (DRAFT) - A folded group raises a banner at most once an hour, and repeats in
between update the inbox silently. One hour is the proposed window and is still open.

**ACCT-51** (SHIPPED) - A second telling of something a person already holds is dropped
rather than folded. A request that flips between partly and fully available tells its
requester once per real change, not once per flip.

## Rows that no longer need anyone

Status: **AGREED**

**ACCT-52** (AGREED) - A notification that asked for a decision stops asking once the decision
is made: its actions go, and it says who decided. This holds for every recipient, not only
the admin who acted, and for any subject that can settle: a request approved or denied, a
report closed, a job that succeeds after failing.

**ACCT-53** (AGREED) - A settled row is not deleted behind the reader's back. It stays where
it is and reads as settled, because "this was dealt with" is itself worth knowing.

**ACCT-54** (DRAFT) - Whether settling a row also takes back a banner already delivered to a
device is open. Taking it back costs a second delivery per decision.

## The inbox

Status: **SHIPPED** in part; each requirement carries its own.

**ACCT-55** (SHIPPED) - The inbox opens from the bell on any screen, lists rows newest first
under day headings, and filters down to the unread ones. A reader can mark a row read, put it
back to unread, or mark everything read at once.

**ACCT-56** (SHIPPED) - Every open screen agrees on the badge within a moment of one of them
changing it: reading a row on the phone drops the number in the browser.

**ACCT-57** (AGREED) - The badge counts rows the person has **not seen**: opening the panel
clears it, whether or not they then open each row. Each row still shows whether it was read,
and the unread filter still works on that.

Today the badge counts unread rows, so it stays lit until every row has been opened one by
one. Unseen is the number a person can actually clear, which is what a badge is for.

**ACCT-58** (AGREED) - A reader **archives** a row rather than deleting it. An archived row
leaves the default list and stays findable.

**ACCT-59** (SHIPPED) - An inbox holds two hundred rows per person. Beyond that the oldest go,
whatever state they are in.

**ACCT-60** (AGREED) - What goes first is archived rows, then the oldest rows that were read.
An unread row is never dropped for being old, so a burst of job failures cannot push out the
request nobody has answered yet.

**ACCT-61** (SHIPPED) - The inbox is on the web client and on the phone. The television has
none: it is a screen people watch from a sofa, and an inbox there is a list nobody can act
on ([`surfaces/`](../surfaces/)).

**ACCT-62** (DRAFT) - Which kinds of subject a television would open, if it ever gains an
inbox, is open.

## Preferences

Status: **SHIPPED**, with per-type choice **AGREED**.

**ACCT-63** (SHIPPED) - Each person decides, per category (requests, media, reports,
downloads, server), whether it reaches their inbox and whether it reaches their devices.
Everything starts on, so a new category needs no visit to the settings to work.

**ACCT-64** (SHIPPED) - A category whose inbox switch is off writes no row at all. Muting is
not a filter over a pile that was kept anyway: what a person muted was never recorded against
their account.

**ACCT-65** (AGREED) - The same choice is available per notification type, a module's own
types included, listed under their category. A type the person never touched follows its
category, so nothing changes for someone who never opens the setting.

## Devices and banners

Status: **SHIPPED** in part; each requirement carries its own.

**ACCT-66** (SHIPPED) - A device asks to receive banners, and nothing is sent to a device that
did not. The person can send a test to their own devices to prove it works, and a device that
stops accepting is dropped rather than retried forever.

**ACCT-67** (SHIPPED) - A banner that cannot be delivered costs the banner, never the
notification. The row is written first and waits in the inbox whatever the device does.

**ACCT-68** (AGREED) - Every delivery attempt is recorded with its outcome (delivered, failed,
muted, held back, device gone) and kept for thirty days, so "why didn't my phone ring?" has an
answer. A person sees their own devices' record and an admin sees the server's. Neither view
exposes a device's address.

## What a module may send

Status: **SHIPPED** in part; each requirement carries its own.

**ACCT-69** (SHIPPED) - A module tells people through this same inbox rather than inventing
one. Its notifications obey the reader's preferences, reach their devices on the same terms,
and sit in the list beside the core's ([`modules/`](../modules/)).

**ACCT-70** (SHIPPED) - A module addresses the audiences the core addresses and no others: one
account, everyone, the holders of a permission, or a show's followers. It cannot invent a
reach of its own.

**ACCT-71** (AGREED) - A module declares the kinds of notification it sends and ships their
wording in each language it supports, so a module's row reads in the reader's language like a
core one. A kind it did not declare is refused rather than sent as raw text.
