# Bringing another server over

Status: **AGREED**, from [RFC 719](../../rfcs/719-guided-setup-and-import.md).

Most people who install KROMA already run Plex or Jellyfin. That server knows what each
person watched, where they stopped, who has an account and which libraries each of them may
see. A household does not switch if switching loses Continue Watching. This chapter is what
comes over, what does not, and what running it twice does.

## What the import is

Status: **AGREED**

**ADMIN-128** (AGREED) - The owner can bring a household over from another media server.
Plex and Jellyfin are the first two.

**ADMIN-129** (AGREED) - The import is the same in the guided setup ([`setup.md`](setup.md))
and in the admin console, where an owner who set KROMA up first finds it later, under its own
entry among the media pages.

**ADMIN-130** (AGREED) - The import reads the other server and changes nothing on it. The
household can keep using that server during the import and after it.

**ADMIN-131** (AGREED) - The owner signs in to the other server as its owner or one of its
administrators.

**ADMIN-132** (AGREED) - That sign-in is kept to run the import again (MOD-106), and
forgotten when the owner says so.

**ADMIN-210** (AGREED) - Once signed in, the import says that KROMA keeps the sign-in and
offers to forget it. Forgetting it starts the import over.

**ADMIN-211** (AGREED) - The import screen of the admin console lists each sign-in KROMA
keeps, under the name of the server it reaches, and forgets one in one press.

**ADMIN-133** (AGREED) - The owner types the other server's address only when KROMA cannot
know it.

**ADMIN-134** (AGREED) - A Plex account lists its own servers once the owner has signed in
to Plex, and the owner picks one.

**ADMIN-135** (AGREED) - A Jellyfin server on the machine KROMA runs on is found at its
usual address.

## The review

Status: **AGREED**

**ADMIN-136** (AGREED) - Before the import writes anything, one review screen lists what
will come over:

- each library, with its folders and its kind
- each user, with the libraries they could see
- how much watch state and how many plays there are

**ADMIN-137** (AGREED) - The owner can leave any library or any user out on the review
screen.

**ADMIN-138** (AGREED) - The review screen lists what does not come over, so nobody finds
out later:

- passwords
- transcoder settings
- the other server's plugins and agents
- Live TV and DVR
- playlists and collections
- the Plex watchlist
- libraries of a kind KROMA does not play

**ADMIN-139** (AGREED) - One action on the review screen starts the import.

## Libraries and paths

Status: **AGREED**

**ADMIN-140** (AGREED) - Each library of films or shows the owner kept becomes a source with
the same folders and the same kind.

**ADMIN-141** (AGREED) - Where KROMA already has a source over the same folders, the import
uses it and adds none. A second import therefore adds no second source.

**ADMIN-142** (AGREED) - A folder that does not exist on this machine under the name the
other server gives it is asked for once on the review screen, with the folder picker. Every
path below it is translated the same way.

A Plex in a container often sees `/data/movies` where KROMA sees `/volume1/video/movies`.
One answer covers the whole library.

**ADMIN-143** (AGREED) - The translation is kept, so a later import asks nothing again.

## People

Status: **AGREED**

**ADMIN-144** (AGREED) - Each user the owner kept becomes an account that waits on an
invitation (ACCT-94).

**ADMIN-145** (AGREED) - That account sees the libraries its user could see on the other
server (ACCT-20). A user who could see every library there sees every library here.

**ADMIN-146** (AGREED) - The person who signed in to the other server is the owner running
the import. Their own watch state there comes to the owner's account, and no account is
created for them.

**ADMIN-147** (AGREED) - The owner can attach a user of the other server to an account
KROMA already has, instead of creating one. KROMA proposes the account with the same
address.

**ADMIN-148** (AGREED) - A user brought over once is found again by a later import, which
adds no second account for them.

**ADMIN-149** (AGREED) - A user the other server limited more finely than by library, by
rating, label or tag, comes over with a grant of no library (ACCT-20). The review screen
names that user and says why, and the owner chooses their libraries.

KROMA limits by library and has nothing finer to carry the old limit. Showing a child the
whole library their parent had filtered is worse than showing them none. A grant of no
library is not the absence of a grant, which would show everything.

**ADMIN-150** (AGREED) - A user whose watch state the other server gives only against that
user's own PIN is listed on the review screen with a field for it. Without the PIN that
user comes over with an account and libraries, and no watch state.

## Watch state

Status: **AGREED**

**ADMIN-151** (AGREED) - Each person's watched flags come over (ACCT-24).

**ADMIN-152** (AGREED) - Each person's resume points come over, and a resume point lands at
the second the person stopped.

**ADMIN-153** (AGREED) - A title on the other server is matched to a KROMA title by its file
first, through the path translation.

**ADMIN-154** (AGREED) - A title whose file matches nothing is matched by the external
identifiers the other server holds for it, and failing that by title and year, or by
series, season and episode.

**ADMIN-155** (AGREED) - Watch state for a file the scan has not reached yet shows on its
title as soon as the scan reaches it, while the scan is still running.

**ADMIN-156** (AGREED) - A title a person marked as a favourite on the other server is saved
to that person's list (BROWSE-32).

**ADMIN-157** (AGREED) - When the import ends, a report lists what matched nothing, each
title by its name on the other server and its file. Those files are in Unmatched like any
other (LIB-32).

The identity the other server held for each file comes over too, and is
[`library/`](../library/)'s (LIB-78).

## Plays

Status: **AGREED**

**ADMIN-158** (AGREED) - The plays the other server recorded come into watch history
(ADMIN-57), each with its account, its title and when it was played.

**ADMIN-159** (AGREED) - A row that came from an import says so and names the server it came
from.

**ADMIN-160** (AGREED) - An imported row leaves blank what the other server did not record:
the device, the player, the network class, whether it was transcoded.

**ADMIN-161** (AGREED) - An imported play that carries no duration counts for its title's
runtime wherever the dashboard adds up time watched, and its row says the time is the
runtime.

Plex records when a title was played and not for how long. Jellyfin keeps only the last
play of each title per person, so one play per title per person is all it can give, and the
review screen says so.

**ADMIN-162** (AGREED) - A play brought over once is not brought again by a later import.

## Running it, and running it again

Status: **AGREED**

**ADMIN-163** (AGREED) - The import runs in the background as a job with progress
([Jobs](README.md#jobs)).

**ADMIN-164** (AGREED) - The owner can cancel the import, and a cancelled import keeps what
it had already brought.

**ADMIN-165** (AGREED) - A second import, run when nothing changed on the other server,
changes nothing in KROMA.

A household that keeps Plex for a week while it tries KROMA runs the import again at the
end of the week, and gets that week.

**ADMIN-166** (AGREED) - Where KROMA and the other server both hold watch state for one
title and one person, the newer one wins. KROMA's wins a tie.

**ADMIN-167** (AGREED) - An import only adds watch state or moves it forward. It removes
none: a title someone marked unwatched on the other server stays as KROMA has it.

**ADMIN-181** (AGREED) - A title a person finished on the other server after they stopped
in it on KROMA leaves Continue Watching, and the next episode of its series is offered.

The finish is the newer state, so it wins (ADMIN-166), as it does when the person marks
the title as watched on KROMA. A resume point newer than the finish stays: the person
started the title again.

## After the import

Status: **AGREED**

The importer is installed when the owner chooses to bring a server over (MOD-103). What it
brought belongs to KROMA from then on. What the importer still holds is the sign-in to the
other server, and for Plex that sign-in is the owner's own account.

**ADMIN-168** (AGREED) - The importer stays installed after an import, so the owner can run
the import again. Nothing removes it on its own.

**ADMIN-169** (AGREED) - The report at the end of an import, and the import screen of the
admin console, offer to remove the importer.

**ADMIN-170** (AGREED) - Removing the importer forgets the sign-in to the other server
(MOD-106). Everything the import brought stays: sources, accounts, watch state, plays and the
path translation.

**ADMIN-171** (AGREED) - An import after the importer was removed installs it again and asks
the owner to sign in again. It still brings only what changed since the last import
(ADMIN-165).

A household that tried KROMA for a week and left Plex for good removes the importer, and no
KROMA server keeps a key to an account it no longer uses.

## Deliberately not done

Status: **DESIGN, NOT IMPLEMENTED**

- **Reading the other server's own files.** It would cover a server that is already gone.
  It would also tie the import to an internal layout that changes between releases, and
  both servers changed theirs recently. The import asks the other server, so that server
  has to be running.
- **Finding the other server on the network.** Plex and Jellyfin each announce themselves
  in their own way, and a module cannot listen for either today. ADMIN-133 to ADMIN-135 are
  what the owner gets instead.
- **Emby.** It is close enough to Jellyfin that one importer could speak both. It is not
  promised here and has its own issue. An Emby household starts fresh until then.

## Not in scope

Status: **AGREED**

- **That an importer is a module, and what it may touch** is [`modules/`](../modules/)
  (MOD-103 to MOD-106).
- **The account that waits on an invitation** is [`accounts/`](../accounts/) (ACCT-94 to
  ACCT-100).
