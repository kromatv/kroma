# RFC 696: KROMA Kids, a maturity ceiling per profile, and the rating a reader sees

- Status: **ACCEPTED**
- PR: #853, for issue #696
- Affects: a new chapter, `docs/spec/accounts/kids.md` (ACCT-101 to ACCT-140),
  `docs/spec/accounts/README.md` (ACCT-4's reasoning, the permission matrix),
  `docs/spec/browse/README.md` (BROWSE-62, BROWSE-63), `docs/spec/admin/README.md` (the
  Users verbs), and a new reference table, `docs/reference/content-ratings.md`. Areas
  `area/server`, `area/web`, `area/tv`, `area/mobile`, `area/ui-kit`

## Summary

KROMA behaves the way Netflix and YouTube Kids do. Every title carries its age rating as a
badge, in the label of the reader's own country. Every profile can be held under a maturity
ceiling chosen from six age levels, and the server, not the client, keeps a title above it
out of reach. An admin can block or allow single titles for one profile. A Kids profile is
an account an admin makes for a child, with a name, an avatar and a kids-level ceiling, and
no credential: it opens from the picker of a device a member of the household is already
signed in to. Leaving it goes back to the picker, where a PIN-locked profile asks its PIN.

## Motivation

Issue #696 has the full case. A household with children cannot hand a child the remote.
Library visibility (ACCT-20) is the only cut there is, and it holds only while someone sorts
the children's films into their own library by hand. One misfiled film is visible.

The rating that would make the cut is half there. The server asks the metadata provider for
one label per title and keeps the label alone: no country, no age. `12` may be French,
German or British, a title its own country never rated takes another country's label
without saying so, and nothing can tell whether `TV-14` sits above or below `12`. It shows
in three places, as plain text inside a line of facts.

## Proposal

### The owner's decisions

The owner asked for the product to behave as Netflix and YouTube Kids do. Each decision
below names the help page it follows.

| Question | Decision | Source |
|---|---|---|
| Who makes a Kids profile | An admin, under Users: a name and an avatar. No email, no password, no invitation. It cannot sign in on its own and opens from the picker of a device a member already signed in to. ACCT-4 stays: it is an account, not a profile under one. The owner's account can never be one. | [NF-114275](https://help.netflix.com/en/node/114275): Add Profile, a name and the Kids option, "can't have an email address added, so kids can't sign in directly", "the main profile on your Netflix account can't be set up as a Kids profile". [YT-7554914](https://support.google.com/youtubekids/answer/7554914): a signed-in parent enters "your kid's first name (or nickname), age"; "profiles are available on any device where the parent is signed in". |
| One ceiling or bands | Every profile, not only Kids, carries one of six levels: All, 7+, 10+, 13+, 16+, 18+. A Kids profile picks one of the three kids levels when it is made. A ceiling above them takes the Kids look away. | [NF-2064](https://help.netflix.com/en/node/2064) lists the six levels and groups All, 7+ and 10+ as "Recommended for Kids". [NF-114275](https://help.netflix.com/en/node/114275): "If you choose a maturity rating that's higher than the level allowed for the Netflix Kids experience, then the Kids experience won't be applied". [YT-7554914](https://support.google.com/youtubekids/answer/7554914): Preschool (4 and under), Younger (5 to 8), Older (9 to 12). |
| Who changes a ceiling | An admin, after typing their password. | [NF-114276](https://help.netflix.com/en/node/114276): "Verify your identity by entering your Netflix account password". [YT-6172308](https://support.google.com/youtubekids/answer/6172308): "enter your parent account password". |
| Which country's system a reader sees | Each account has a ratings country, by default the server's metadata country. The badge shows that country's label. A borrowed label names its country. A title nobody rated has no badge. | Issue #696, step 1. |
| What the ceiling compares | Ages, never labels. The server keeps every country's label for a title and a minimum age for each. | Issue #696; the table is `docs/reference/content-ratings.md`, from TMDB's own lists and [Wikipedia](https://en.wikipedia.org/wiki/Motion_picture_content_rating_system). |
| What the ceiling does | A title above it is absent from browse, search, the home, recommendations, deep links, playback and every API route under that session's token, as ACCT-34 and ACCT-35 keep an ungranted library. A title nobody rated is hidden unless an admin allowed it. | [NF-114276](https://help.netflix.com/en/node/114276): "that profile will only see shows, movies, and games with a rating at or below that level". |
| Single titles | An admin blocks a title for one profile, or allows an unrated or above-ceiling one for one profile. | [NF-114276](https://help.netflix.com/en/node/114276): "block specific shows or movies from individual profiles". [YT-7178746](https://support.google.com/youtubekids/answer/7178746): block, and share a video "that aren't normally available". [YT-6172308](https://support.google.com/youtubekids/answer/6172308): "Approve content yourself". |
| Whether an adult with no PIN may sit beside Kids | It may. Leaving Kids goes to the picker, and a locked profile asks its PIN there. There is no separate exit lock. Making a Kids profile offers the admin a PIN, every other adult without one is told, and the picker draws a lock on every locked profile. Adding a Kids profile from a device's picker asks the admin's PIN when set. | [NF-114277](https://help.netflix.com/en/node/114277): Profile Lock, "Require PIN to add new profiles". [NF-127831](https://help.netflix.com/en/node/127831): "Profiles protected with a PIN will appear with a lock icon on the profile selection page". [YT-7554373](https://support.google.com/youtubekids/answer/7554373): switching profiles. |
| What a module's pages show in Kids | Nothing: a Kids session has no module page. A module draws its own frontend, and the core cannot filter it. | Issue #696's own default. |
| The Kids experience | A logo on the profile, a simpler and friendlier look, no admin, no Store, no requests, no account settings, no title the server does not hold. Search stays on and finds only what the ceiling allows. | [NF-114275](https://help.netflix.com/en/node/114275): "Has a logo on the profile icon", "Has a simplified look and feel", "Removes direct access to account settings". [YT-6130561](https://support.google.com/youtubekids/answer/6130561): search on or off, and a parent's controls. |
| A daily watch timer | Later. | [YT-6130561](https://support.google.com/youtubekids/answer/6130561): "you can set a timer". |

### Decisions the issue did not ask for

Each of these could surprise someone, so each is written down.

- **The ceiling compares the rating the badge shows.** A parent who reads `PG` on a title
  and set 10+ expects the title to be there. Comparing the strictest country instead would
  hide a `PG` film because Germany rated it 12, with nothing on screen to say why.
- **A borrowed label comes from a fixed order**: the server's metadata country, then the
  United States, then the first other country by its code. The badge names the country, so
  a borrowed `FSK 12` never passes for a French `12`.
- **18+ is the default level and hides nothing,** not even unrated titles. A server that
  upgrades changes nobody's home. Everything below it is "under a ceiling".
- **A title the server does not hold counts as unrated.** Its rating is unknown, so a
  person's page under a ceiling lists only the library's titles (BROWSE-63), and a Kids
  session never meets one (ACCT-138).
- **A show is rated once.** The provider rates a show, not its seasons. Every episode
  carries the show's rating, and a block or allow on a show covers every episode.
- **A label with no age of its own takes one by a written rule.** Most systems tie each
  label to an age. Those that do not (`PG` in several countries, two Hong Kong categories)
  take an age the reference table marks and explains. Most take 10, the US system's own
  `PG` age.
- **An existing account never becomes a Kids profile.** Netflix turns a secondary profile
  into Kids. A KROMA account has a credential, and the conversion would take a person's
  sign-in away. A Kids profile whose ceiling is raised above 10+ stays a profile with no
  credential and loses the Kids look (ACCT-130).
- **The PIN offer reaches the other adults by their inbox.** A PIN is the person's own: an
  admin may clear it (ADMIN-84) but never set it. So the admin making the profile is offered
  one in the flow, and every other adult without one gets a notification with a way to set
  it.
- **The confirmation is the admin's password, once per visit** to a profile's restrictions.
  An admin always keeps a password (ACCT-83), so the check never locks an admin out.

### How the server keeps a title from a profile

A ceiling and a block are a second rule beside the library grant, applied everywhere the
grant is applied today. The grant asks "may this account see this library". The ceiling asks
"may this profile see this title", from the title's ratings, the profile's country and level,
and its blocks and allows.

- **Lists** drop the titles that do not pass: browse, search, every home row, the hero,
  recommendations, a person's page, saved titles and watch state.
- **Every route that takes an id** refuses one that does not pass with the same answer as an
  unknown id. That covers a pasted link, a resume and a request for any of a title's parts.
- **Media bytes** check the ticket's account (ACCT-35) against the same rule, on every
  request, so a raised or lowered ceiling bites at once.

Artwork stays reachable by id, as ACCT-35 already records for ungranted titles.

### A Kids profile on a device

A Kids profile has no credential, so no sign-in route accepts one. Its session comes from
the picker. A device that holds the session of a member of this server lists the server's
Kids profiles on its picker. Opening one asks the server, with that member's session, for a
session of the Kids profile bound to the same device. That session is ordinary: it is in the
Kids profile's device list, it does not expire on a clock (ACCT-7) and an admin revokes it
like any other.

A Kids session is refused by the server, not only hidden by the client, on admin routes,
the Store, requests, account settings, module routes and every route that names a title the
server does not hold.

### Stories

In this order, each shipping on its own:

1. The server stores every country's label with its minimum age, and the wire carries the
   reader's label, its country and whether it is borrowed (ACCT-101 to ACCT-103, ACCT-106,
   ACCT-107).
2. One kit component draws the rating badge on the detail page, the hero and the billboard
   on every surface (ACCT-105, ACCT-108).
3. The account's ratings country, and the per-profile ceiling enforced by the server on
   every route ACCT-112 and ACCT-113 name (ACCT-104, ACCT-109 to ACCT-116, BROWSE-62,
   BROWSE-63).
4. Per-profile blocks and allows (ACCT-117 to ACCT-121).
5. An admin creates a Kids profile, and the picker opens it (ACCT-122 to ACCT-130).
6. The Kids look, and what a Kids session loses (ACCT-136 to ACCT-140).
7. The PIN offer, the inbox notice and the lock on the picker (ACCT-131 to ACCT-135).

## What this costs

- **A second authorisation rule** beside the grant, on every route that serves a title.
  Every new route has to apply both, and a route that forgets the ceiling leaks a title to a
  child. Integration tests per route are the only defence, as they are for the grant.
- **A table to keep.** About 430 labels over 52 countries. A country that changes its system
  (Italy added 10+ in 2025) needs a row, and until then its new label counts as unrated, so
  the failure hides a title rather than showing one.
- **More stored per title.** Every country's label instead of one, about fifty short rows
  for a well-known film.
- **An account that cannot sign in and is not waiting.** Every way in has to refuse a Kids
  profile, as each refuses a waiting account today.
- **A second look.** The Kids theme is a second set of token values every component has to
  render well in.
- **Hiding is the default for unrated titles.** A household with home videos or a library
  the provider never matched sees them vanish from a Kids profile until an admin allows them.
  That is the safe side, and it is a chore.

## Compatibility

- **Existing libraries.** A title's labels per country arrive at its next metadata refresh.
  Until then it keeps the one label it has, counted under the server's metadata country.
- **Existing accounts.** Every account starts at 18+, which hides nothing. Nobody's home
  changes on upgrade.
- **Older clients.** The bare label stays on the wire beside the new rating, so an old app
  keeps drawing it. An old app opened on a profile under a ceiling still sees only what the
  server lets through, because the server does the cutting.
- **Installed modules.** A module's routes refuse a Kids session. A module that lists titles
  to a profile under a ceiling, rather than to a Kids session, is not filtered by the core;
  that is the reason Kids has no module pages.
- **Paired devices.** Unaffected. A Kids session is a new session on a device that already
  has one.
- **Backups.** A backup carries ratings, ceilings, blocks, allows and Kids profiles as it
  carries every other row.

## Alternatives

- **Do nothing.** A household sorts a children's library by hand and hopes nothing is
  misfiled.
- **Filter in the clients.** A filter the client applies is one the API does not, so a
  pasted link or an old app shows everything.
- **A genre filter on Family and Animation.** A genre describes tone, not suitability.
- **Profiles under an account.** The way Netflix models it, and what ACCT-4 refuses. A Kids
  profile as an account keeps one identity mechanism.
- **A Kids-only exit lock.** Netflix has none, and a PIN on the adult profiles does the same
  job without a second secret to forget.
- **The strictest country decides.** Safer on paper, and it hides titles behind a rating the
  parent never sees.

## Unresolved

- Whether a Kids profile can carry its own PIN. Netflix allows a lock on any profile. Nobody
  asked, and a child's PIN is one more thing for a parent to reset.
- Whether a member who is not an admin may open a Kids profile on their device. This RFC
  says any member may, as YouTube Kids lets a signed-in parent. The owner decides if that
  should be admins only.
- A daily watch timer, a Kids profile that grows into an account, a rating per season and
  content advisories are listed under "Later" in the chapter.
