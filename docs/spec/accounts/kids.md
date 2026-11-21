# KROMA Kids and maturity ratings

Status: **SHIPPED** in part, from [RFC 696](../../rfcs/696-kroma-kids.md). Sections carry
their own status below, and requirements carry theirs.

What age each title is rated for, how a profile is kept below an age, and the profile a
household makes for a child. The model is the one Netflix and YouTube Kids already taught
parents: a Kids profile on the picker, a maturity level per profile, and titles blocked or
allowed one by one.

A **profile** here is what the picker shows: an account (ACCT-1). A Kids profile is an
account too, so ACCT-4 holds. What sets it apart is that it has no credential of its own.

## A title's age rating

Status: **SHIPPED** in part; each requirement carries its own.

**ACCT-101** (SHIPPED) - The server keeps, for each title, the label every country's rating
system gave it, for each country the metadata provider knows.

**ACCT-102** (SHIPPED) - Each label carries the minimum age it stands for, from one table
that covers every system the provider returns
([`docs/reference/content-ratings.md`](../../reference/content-ratings.md)). A label that is
not a rating, such as "not rated" or "exempt", has no age.

**ACCT-103** (AGREED) - A show's rating is the rating of every one of its episodes.

**ACCT-104** (AGREED) - Every account has a ratings country. It starts as the server's
metadata country. A person changes their own in their settings, and an admin sets a Kids
profile's.

**ACCT-105** (AGREED) - A title shows its rating as a badge holding the label of the
reader's ratings country.

**ACCT-106** (AGREED) - A title that country never rated borrows another country's label,
and the badge names that country. It borrows from the server's metadata country first, then
the United States, then the first other country, in alphabetical order, that rated it.

**ACCT-107** (SHIPPED) - A title no country rated shows no badge.

**ACCT-108** (SHIPPED) - The badge is on a title's detail page, on the home's hero and on
the phone's billboard, on web, television, phone and desktop, and it looks the same on each.

## A maturity ceiling

Status: **AGREED**

A ceiling is chosen from six levels, the ones Netflix uses: **All**, **7+**, **10+**,
**13+**, **16+** and **18+**. All, 7+ and 10+ are the kids levels.

**ACCT-109** (AGREED) - Every profile carries one of the six levels. 18+ is the default, and
it hides nothing. A profile at any other level is under a ceiling.

**ACCT-110** (AGREED) - A ceiling compares ages, never labels. A title passes when the age
of the rating its badge shows to that profile is at or below the level. All is age 0.

**ACCT-111** (AGREED) - Under a ceiling, a title with no rating does not pass. A title the
server does not hold counts as unrated.

**ACCT-112** (AGREED) - A title that does not pass is absent for that profile from browse,
search, every home row, recommendations, a person's page and its watch state.

**ACCT-113** (AGREED) - A title that does not pass is refused by its id on every route that
presents the profile's session, deep links and media bytes included (ACCT-35). It refuses
exactly as an ungranted title does (ACCT-34), so probing cannot tell a title kept from this
profile apart from one that was never scanned.

**ACCT-114** (AGREED) - A changed ceiling bites on the profile's next request, on every
device it is signed in on.

**ACCT-115** (AGREED) - Only an admin sets a profile's ceiling. No profile can change its
own.

**ACCT-116** (AGREED) - An admin confirms their own password before changing a ceiling, as
Netflix asks for the account password. One confirmation covers the rest of that visit to
the profile's restrictions.

The artwork edge ACCT-35 records holds here too: someone who already has a hidden title's
id can fetch its cover. None of its bytes.

## Blocking and allowing a title

Status: **AGREED**

**ACCT-117** (AGREED) - An admin can block a title for one profile. A blocked title is kept
from that profile as ACCT-112 and ACCT-113 say, whatever its rating and whether or not the
profile is under a ceiling.

**ACCT-118** (AGREED) - An admin can allow a title for one profile. An allowed title passes
that profile's ceiling, rated or not.

**ACCT-119** (AGREED) - A title is blocked or allowed for a profile, never both. Setting one
clears the other.

**ACCT-120** (AGREED) - A block or an allow on a show covers every episode of it.

**ACCT-121** (AGREED) - Blocks and allows sit behind the same confirmation as the ceiling
(ACCT-116).

## A Kids profile

Status: **AGREED**

**ACCT-122** (AGREED) - An admin creates a Kids profile under Users, with a name and an
avatar. It has no email, no password, no passkey, no sign-in provider and no invitation.

**ACCT-123** (AGREED) - Creating it picks its ceiling among the kids levels, with none
preselected. YouTube Kids' bands map onto them: 4 and under is All, 5 to 8 is 7+, 9 to 12
is 10+.

**ACCT-124** (AGREED) - Its library visibility is set like any account's (ACCT-20).

**ACCT-125** (AGREED) - Nobody can sign in to a Kids profile, by any means, as nobody can
sign in to a waiting account (ACCT-95).

**ACCT-126** (AGREED) - A device on which a member of this server is signed in lists the
server's Kids profiles on its picker. Opening one gives that device a session of the Kids
profile (ACCT-6), which its device list shows like any other.

**ACCT-127** (AGREED) - The owner's account can never be a Kids profile, and a Kids profile
can never be made admin.

**ACCT-128** (AGREED) - An existing account cannot become a Kids profile. It has a
credential of its own, and a person would lose their sign-in.

**ACCT-129** (AGREED) - A Kids profile carries the KROMA Kids logo on its avatar, on the
picker and wherever its avatar is drawn.

**ACCT-130** (AGREED) - A Kids profile whose ceiling an admin raises above 10+ loses the
Kids experience. It still has no credential and still opens from the picker.

## Leaving a Kids profile

Status: **AGREED**

**ACCT-131** (AGREED) - Leaving a Kids profile goes to the picker. There is no exit lock of
its own: a profile with a PIN asks for it there, as it always does.

**ACCT-132** (AGREED) - The picker draws a lock on every profile that asks for a PIN, on
every surface.

**ACCT-133** (AGREED) - Creating a Kids profile offers the admin, in the same flow, to set a
profile PIN when theirs has none.

**ACCT-134** (AGREED) - Every other adult on the server whose profile has no PIN is told in
their inbox that a Kids profile now exists, with a way to set a PIN.

**ACCT-135** (AGREED) - A device's picker adds a Kids profile only while an admin is signed
in on it, and asks that admin's profile PIN first when the admin has one.

Without a PIN on the adult profiles of a device, the way out of Kids is one press deep.
That is a choice the household makes, and the product says so the moment it matters
rather than locking every profile on its behalf.

## The Kids experience

Status: **AGREED**

**ACCT-136** (AGREED) - A Kids session wears the KROMA Kids look: the KROMA Kids logo in
place of KROMA's, and a simpler, friendlier theme, on every surface.

**ACCT-137** (AGREED) - A Kids session has no admin, no Store, no requests and no account
settings, and the server refuses those routes to its session.

**ACCT-138** (AGREED) - A Kids session never shows a title the server does not hold.

**ACCT-139** (AGREED) - A Kids session shows no module page, and the server refuses module
routes to its session. A module draws its own pages, and the core cannot filter what they
show.

**ACCT-140** (AGREED) - Search stays on in a Kids session and finds only what the profile
may see (ACCT-112).

## Later

Status: **DESIGN, NOT IMPLEMENTED**

- **A daily watch timer**, as YouTube Kids has. A parent who wants the screen off leaves the
  Kids profile. The timer needs a clock the server enforces across devices, and nobody has
  asked for it before the ceiling exists.
- **A Kids profile that grows up.** A child who outgrows Kids would keep their watch state
  by becoming a waiting account (ACCT-94) that an invitation opens. Until then an admin
  raises the ceiling (ACCT-130).
- **A rating per season**, as Netflix shows one. The metadata provider rates a show once,
  so the show's rating covers every season (ACCT-103).
- **Content advisories** beside the badge (violence, language). The metadata provider
  carries none.
