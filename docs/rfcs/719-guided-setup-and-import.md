# RFC 719: a first run that guides, and a household that comes over from Plex or Jellyfin

- Status: **DRAFT**
- PR: #719 (the issue)
- Affects: `docs/spec/admin/README.md` (First-run), two new chapters,
  `docs/spec/admin/setup.md` (ADMIN-96 to ADMIN-127) and `docs/spec/admin/import.md`
  (ADMIN-128 to ADMIN-167), `docs/spec/accounts/README.md` (ACCT-94 to ACCT-100),
  `docs/spec/library/README.md` (LIB-78), `docs/spec/modules/README.md` (MOD-103 to
  MOD-106), `docs/spec/surfaces/README.md` (SURF-61, SURF-62), `docs/spec/browse/README.md`
  (BROWSE-61), a sixth bare point, `importer`, and two new modules, `tv.kroma.import.plex`
  and `tv.kroma.import.jellyfin`. Areas `area/server`, `area/modules`, `area/web`,
  `area/ui-kit`

## Summary

A server with no account opens a guided setup: one decision per screen, every screen after
the owner's account skippable, and a checklist on the admin dashboard for whatever was
skipped. The setup can start by bringing a Plex or Jellyfin server over: its libraries, its
users, each person's watch state and the plays it recorded. An importer is a module that
only reads the old server and describes it. The core decides what that becomes and does
every write, so no module ever holds access to accounts or watch state.

## Motivation

Issue #719 has the full case. In short, two things keep a Plex or Jellyfin household
where it is.

Leaving costs the household its history. The old server knows what each person watched,
where they stopped, who has an account and which libraries each of them may see. KROMA can
read the same folders and knows none of it.

First run ends at a registration form. On an empty server the owner creates an account and
lands on an empty home. Sources are under Admin, modules in the Store, people under Users,
televisions under pairing. The base build ships no module (MOD-1), so a television on the
same network cannot find the server until the owner learns that a discovery module exists.
Nothing says so.

## Proposal

### The setup

The setup is the web client's. The order of its screens is the one the issue gives:

1. Language, and one choice: start fresh, or bring another server over.
2. The owner account.
3. The import, for an owner who chose it.
4. Media.
5. Modules.
6. People.
7. Devices.
8. Being counted.
9. Home.

**Nothing happens on the server before the owner exists.** The first screen records a
choice and nothing else. Installing an importer, signing in to another server and reading a
household's data are admin acts, and until an account exists the server has nobody to hold
them against. So the import runs at step 3, after the account, although the owner chose it
at step 1. The cost is one line of the issue: the owner form is not filled in from the old
server's owner. The owner types a name and a secret, and the import then gives the old
owner's watch state to that account (ADMIN-146).

The alternative was a set of admin routes that also answer an unauthenticated visitor on
the LAN while the server is empty. Each one would have to close at the instant the owner
exists, and one that did not would be a way in. A typed name is cheaper than that.

**The shortest path gets shorter.** Today a new owner passes the register form, an empty
home, Admin, Libraries and the add dialog. With the setup it is three screens: the first
one, the owner, the media. "Finish later" is on every screen after the owner's account
(ADMIN-100, ADMIN-101).

**The setup's state is the server's.** Which step the owner reached, and which steps are
done or dismissed, are kept by the server. That is what lets a closed tab resume on another
browser (ADMIN-102) and what the dashboard checklist reads (ADMIN-121 to ADMIN-124). A step
counts as done when its result exists, wherever it was done: a source added under Admin
ticks the media step.

**A server that already has an owner sees none of this.** No setup opens on it and no
checklist appears (ADMIN-104). The same rule covers a source that exists before the setup
starts: the Synology package asks for folders in its own installer, and the media step shows
them as already added (ADMIN-108).

**Modules are offered by the registry, not by the client.** Nothing in the web client names
a module, and the setup does not change that. A module says in its own manifest, in one
translated sentence, what it does for a household. The official registry says which modules
the setup offers and in what order. The setup renders that list with each module's size,
permissions and this server's verdict (MOD-23), nothing ticked. Adding a module to the offer
is a registry change. A registry the operator added cannot put a module in the setup.

**The home fills while the owner answers.** The home does not refresh during a scan today.
It reads once and keeps the answer for 30 seconds. BROWSE-61 makes the home gain each title
as the scan matches it, and ADMIN-120 shows the same arrival on the setup's own screens.

**Two things the issue asked for are not in this setup.**

- *A backup switch.* The server has no scheduled backup, only an export and an import by
  hand, so there is nothing for a switch to turn on. Scheduled backups are their own
  feature and get their own issue. Step 8 holds the statistics switch alone until then.
- *The desktop shell.* The issue lists it among the shells that render the web client. It
  renders the television experience (`mountTv` in `clients/desktop/src/main.tsx`), so the
  setup never runs there. What it and a television owe an empty server is one sentence and
  an address to open in a browser (SURF-61).

### The import

#### Who writes

An importer answers a new bare point, `importer`, and the core calls it. The name passes
the test in `docs/module-plugin-model.md`: the core needs another server's household
described in neutral terms, and the word names neither a vendor nor a module. It is the
sixth bare point, after `acquisition`, `transcriber`, `embedder`, `network` and `trailer`.

The core runs the import as one of its own jobs and pulls from the importer page by page.
That gives the import the progress and the cancel of a core job, which a module job does
not have today, and it keeps every call inside a module's time limits.

| Method | The core sends | The importer answers |
|---|---|---|
| `connect` | the sign-in fields the owner filled, or the id of a sign-in in progress | `ready` with the servers this sign-in reaches, `pending` with a link for the owner to open, or `refused` with a reason |
| `survey` | a server | its libraries (name, kind, folders), its users (name, address, owner or not, libraries seen, finer limits, whether their state is readable), and what the server holds that an import leaves behind |
| `titles` | a library and a cursor | a page of titles: file paths, kind, title, year or season and episode, external ids |
| `states` | a user, a library, a cursor, an optional "changed since" | a page of watch state: watched, position, last played, favourite |
| `plays` | a cursor, an optional "changed since" | a page of plays: user, title, when, duration where the server kept one |
| `forget` | a sign-in | nothing; the importer has deleted it |

An importer ships no frontend. Its contribution lists the fields of its sign-in form, and
the core renders them, the way the download-client dialog renders an engine's fields today.
`pending` covers Plex, whose sign-in is a page on plex.tv that the owner opens while the
importer polls.

An importer declares outbound access to the old server and to that vendor's account
service, and a database of its own for the sign-in. It declares no slice of the core
database (MOD-105, MOD-106).

The core treats every answer as untrusted input. It bounds each page, it creates a source
only over folders the owner confirmed on the review screen, and it never takes a path, a
name or an id from an importer as a reason to skip a check.

#### What the core gains

Four things do not exist today, and each is its own story.

- **An account that waits** (ACCT-94 to ACCT-100). Today a user row appears only when an
  invitation is redeemed, and an invitation carries permissions and an expiry and nothing
  else. Imported watch state needs somebody to belong to before that person has signed in.
  A waiting account has a name, its library visibility and its watch state, and no
  credential. Its invitation gives it one.
- **An identity per file** (LIB-78). The acquisition module already tells the core which
  title a file it imported is, by path. The import uses the same route for every file the
  old server had identified. Neither Plex nor Jellyfin records which matches a person fixed
  by hand, so there is no "fixed" set to bring: every identity comes over, and the fixed
  ones with them.
- **A merge rule for watch state** (ADMIN-166, ADMIN-167). Today a write always stamps
  now. The import writes with the old server's time, and the newer state wins.
- **A play that was not played here** (ADMIN-158 to ADMIN-162). Watch history has no notion
  of where a row came from. An imported row says so, names its server and carries the old
  server's key for it, which is what stops a second import from adding it twice.

#### What the two servers give

Each fact below was read in a primary source. The importers' stories copy them, with the
endpoints, into `docs/reference/`.

**Plex.** The owner's token is enough for every shared user. plex.tv lists the people the
server is shared with, each with a token for that server and the libraries they may open,
and that token reads the person's watched flags and resume offsets in milliseconds.
python-plexapi does exactly this (`MyPlexUser.get_token` in `plexapi/myplex.py`), and so do
Tautulli and JellyPlex-Watched. Nobody's password is involved. The server's history lists
every account's plays with a time and no duration.

A Plex Home user protected by a PIN is the exception: switching to that user asks for the
PIN (ADMIN-150).

**Jellyfin.** An administrator's sign-in reads every user's state, in ticks of 100
nanoseconds. A user's policy lists the libraries they may open. Jellyfin keeps no log of
plays, only the last play of each title per person and a play count, so the import brings
one play per title per person. The review screen says so.

Neither server exposes passwords, which is why every imported user sets their own.

#### Finding the old server

The issue has the owner pick the old server "from the ones KROMA found on the network".
Plex and Jellyfin each announce themselves over their own UDP protocol, and a component
holds no socket: the host's discovery interface knows mDNS and SSDP and nothing else.
Teaching the host two vendors' protocols would put a module's meaning into the mechanism.

So the owner types an address only when KROMA cannot know it (ADMIN-133 to ADMIN-135):

- A Plex account lists its own servers and how to reach each one. Signing in to Plex is the
  discovery.
- A Jellyfin server on the machine KROMA runs on answers at its default port, which covers
  the NAS that runs both.
- Otherwise the owner types the address.

Raw sockets for modules are in RFC 567. When they land, an importer gains real discovery
with no change to the core.

### The issue's open questions

| Question | Decision |
|---|---|
| The spec says first run asks for the owner and the media "and nothing more" | That sentence goes. The minimum path stays, word for word, and everything after it is offered and skippable. This PR moves the spec. |
| Does "one click" hold for a household on Plex? | Yes. The owner's token reads every shared user. Only a PIN-protected Home user needs something more, and the review screen asks for it. |
| Read the old server's database file? | No. It is a private schema that changes between releases. Plex's repair guide opens the file with a SQLite build Plex ships, and stock SQLite is reported to fail on it. Jellyfin moved its whole library store in 10.11. A server that is already gone cannot be imported. Because an importer is a module behind a neutral contract, a database-file importer can be added later without touching the core. |
| Watchlist, favourites, collections, playlists | Jellyfin favourites go to the person's saved list, which KROMA has (BROWSE-32). The Plex watchlist stays behind: it lives on the Plex account, not the server, and a shared user's server token cannot read it. Collections and playlists stay behind, since KROMA has neither. The review screen names all three (ADMIN-138). |
| Emby | Not in this epic. Its API is close enough to Jellyfin's that one importer with a dialect switch can speak both, as JellyPlex-Watched does. The Jellyfin importer keeps its calls behind one table for that reason, and Emby gets its own issue. |
| Where the importers live | In modules, behind the `importer` point. The core does every write. |

Two decisions the issue did not ask for, because they could hurt someone:

- A user the old server limited by rating, label or tag comes over seeing no library
  (ADMIN-149). KROMA limits by library only. Giving a child the whole library their parent
  had filtered is the wrong default, and the owner fixes it in one place on the review
  screen.
- An imported play with no duration counts for its title's runtime (ADMIN-161). Without
  that, the dashboard's time watched opens empty, which is what the issue wanted to avoid.
  The row says the time is the runtime.

## What this costs

- A sixth bare point. Its JSON is a contract between a core and modules that release on
  separate tags, and it has to stay readable in both directions for as long as importers
  exist.
- Two modules that follow two APIs KROMA does not control. Plex now recommends tokens that
  expire after seven days. Jellyfin plans to remove its legacy authorization headers in
  10.12.
- A new account state. Every way in has to refuse a waiting account: password, passkey,
  sign-in provider, pairing, credential reset. The user list, the member editor and the
  backup have to show or carry it.
- State for the setup on the server, and a checklist that grows a line each time the setup
  grows a step.
- A manifest field for the sentence a module shows in the setup, and a registry field for
  the offer.
- Durations in the dashboard that are estimates, marked as such.
- The admin chapter loses "and nothing more". First run now offers things. It still
  requires only two.

## Compatibility

- **Existing libraries.** Untouched. An import that finds a source over the same folders
  uses it.
- **Existing servers.** A server that has its owner opens no setup and shows no checklist.
- **Installed modules.** Unaffected. `importer` is a new name, and the manifest field is
  additive.
- **Paired devices and older clients.** Unaffected. A waiting account cannot sign in
  anywhere, so no client meets one.
- **Backups.** A backup carries waiting accounts, the path translation and imported plays as
  it carries every other row.

## Alternatives

- **Do nothing.** People keep Plex for the history and never try KROMA with their real
  household.
- **Importers in the core.** One release fixes nothing when Plex moves its API on a
  Tuesday, and every server carries code most will run once or never.
- **Importers that write.** A module with a write grant on accounts and watch state could
  do the whole job alone. No module holds such a grant today, RFC 657 states that a module
  cannot mint a session, and two importers would each reimplement matching and merging.
- **Import before the owner exists.** It keeps the prefilled owner form and opens admin
  routes to an unauthenticated visitor. See above.
- **A two-way sync.** Useful to a household that runs both for months. It writes to the old
  server, which the import never does, and it is a different product.
- **Trakt, a script, a checklist without a setup.** Argued in the issue.

## Unresolved

- Whether a managed Plex Home user without a PIN appears in the owner's shared list with a
  token, like a friend does. The sources read for this RFC do not say. The Plex importer's
  first story checks it against a real server. The fallback is the Home switch call, which
  the owner's token may make.
- A KROMA in a container does not see a Jellyfin on the same NAS at the default port. The
  owner types the address there.
- Scheduled backups, Emby, and discovery of the old server over the network each wait on
  something named above.
