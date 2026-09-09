# Accounts

Status: **AGREED**. Sections carry their own status below, and requirements carry
theirs, because much of this model already ships while library visibility does not.

Who is using the server, what they may see, and how a device proves it is them.

One server, one household. The account model is sized for that: a person who owns
the NAS, the people they let in, and the screens each of them signs into. Anything
grander is a cost this product declines to pay.

## The account model

Status: **SHIPPED**

**ACCT-1** (SHIPPED) - An **account** is a person. It has credentials, its own watch state,
its own settings, and a set of signed-in devices. Nothing else hangs off it.

**ACCT-2** (SHIPPED) - The first account created at first-run is the **owner**, an account
like any other that also holds the server itself.

**ACCT-3** (SHIPPED) - Every subsequent account is an ordinary **user**, created by invitation
from [`admin/`](../admin/). A KROMA server is never self-signup.

**ACCT-4** (SHIPPED) - There are no profiles under an account, and there will not be. A person
who wants their own Continue Watching gets an account; a shared screen in the kitchen signs
into one account and stays there.

A "profile" in other media servers is a login you do not have to type a password for: a way to
split one household login into several viewing identities. KROMA already gives every person
their own account, so a profile would be a second, weaker identity mechanism sitting beside the
real one, one of which carries no authentication. For a single-NAS household where making an
account is one invitation, that buys nothing and costs the confusion of two overlapping
concepts.

The honest cost: a genuinely shared device, one television with several viewers, mixes
everyone's watch state under whichever account it holds. We accept that. The fix is switching
accounts on the device, not inventing passwordless sub-identities to avoid it.

## Authentication

Status: **SHIPPED**

**ACCT-5** (SHIPPED) - A person proves who they are with a **username and password**. That is
the only credential the server stores, and it stores only a verifier for it, never the
password. Strength, reset and lockout policy are the operator's concern
([`admin/`](../admin/)).

**ACCT-6** (SHIPPED) - A successful authentication mints a **session**: a long-lived,
server-issued token bound to one device. Every request carries the session, so the password is
typed once per device and, in the ordinary case, never again.

**ACCT-7** (SHIPPED) - **Sessions do not expire on a clock.** A session lives until it is
revoked, by the account that owns it, by an admin, or by the person signing out. There is no
forced periodic re-authentication.

**ACCT-8** (SHIPPED) - A session is per device, not per account, so one can be revoked without
disturbing any other session the same account holds.

The television rule below is the hard case this policy is built around.

## Devices and pairing

Status: **SHIPPED**, with the device list itself **AGREED**.

**ACCT-9** (SHIPPED) - A **device** is where a session lives. Signing in on a phone, a browser
or a television each produces one session.

**ACCT-10** (AGREED) - Every session appears in the account's **device list** with enough to
recognise it, meaning shell, rough location and last-seen, and one action: revoke.

**ACCT-11** (SHIPPED) - A television binds to an account through the pairing handshake rather
than a typed password ([`discovery/`](../discovery/),
[`tv-pairing.md`](../../tv-pairing.md)), and **pairing ends in an ordinary session**.

**ACCT-12** (AGREED) - A paired television is not a special class of trust. It lands in the
same device list as everything else and revokes the same way. There is nothing you can do to a
paired television that you cannot do to a phone.

**ACCT-13** (SHIPPED) - **Unbinding is revocation.** Revoking a device's session ends its
access at the next request it makes. The device is not consulted, wiped or asked to cooperate;
the server simply stops honouring its token.

**ACCT-14** (SHIPPED) - A revoked device that returns must pair or sign in afresh.

### Session lifetime on a television

Status: **SHIPPED**

**ACCT-15** (SHIPPED) - A television session is long-lived and revocable, and is **never
forced to re-authenticate on a schedule**. It keeps its session until a human revokes it.

**ACCT-16** (AGREED) - The device list is the control that replaces expiry: security comes
from cutting a specific screen off instantly from any other device, not from making every
screen prove itself again on a timer.

A television has no keyboard worth using and often no practical way to re-run the pairing dance
unattended. An expiring session would mean a screen that silently signs itself out and a person
hunting for a phone to fix it. This is the same rule as every other device; the television is
only the case that makes forced expiry obviously wrong.

## Authorisation

Status: **SHIPPED** for the two roles, **AGREED** for library visibility.

**ACCT-17** (SHIPPED) - An **owner or admin** runs the server: users, settings, jobs and
modules. Admin rights are server-wide, never per-library.

**ACCT-18** (AGREED) - The owner is the founding admin, the owner may grant admin to another
account, and there is always at least one admin.

**ACCT-19** (SHIPPED) - A **user** uses the server: browses and plays what they are permitted
to see, owns their own watch state and preferences, and manages their own devices.

**ACCT-20** (AGREED) - **Library visibility is per user.** An admin decides which libraries a
given user may see; that user sees exactly those and cannot discover the rest.

**ACCT-21** (AGREED) - Visibility gates browsing, search and playback alike. A title a user
cannot see is a title they cannot play, resume or find.

**ACCT-22** (SHIPPED) - Installing a module is an **admin** right, because it runs new
out-of-process code on the server ([`modules/`](../modules/)). A plain user may use whatever
modules an admin has installed and enabled, within their own library visibility, and may not
install, update or remove them.

### Permission matrix

Status: **AGREED**

**ACCT-23** (AGREED) - The matrix below is the whole of what each role may do. A user's power
over their own account is total; their power over anyone else's, or over the server, is none.

| Capability | Owner / admin | User |
|---|---|---|
| Browse permitted libraries | ✓ | ✓ |
| Play permitted titles | ✓ | ✓ |
| Manage own watch state (resume, mark, Continue Watching) | ✓ | ✓ |
| Manage own settings and preferences | ✓ | ✓ |
| Manage own devices (list, revoke) | ✓ | ✓ |
| Pair a television to own account | ✓ | ✓ |
| See all libraries | ✓ | only those granted |
| Invite / remove users | ✓ | no |
| Set another user's library visibility | ✓ | no |
| Revoke another account's device | ✓ | no |
| Grant / revoke admin | owner | no |
| Install / update / remove modules | ✓ | no |
| Change server settings, run and cancel jobs | ✓ | no |

Everything in the admin column is [`admin/`](../admin/)'s subject in depth.

## Per-user versus per-server

Status: **SHIPPED**

The dividing line is ownership of the experience versus ownership of the machine.

**ACCT-24** (SHIPPED) - **Per-user**: watch state, meaning resume points, watched flags and
Continue Watching; personal preferences, meaning playback defaults, language, subtitle choices
and interface settings; and the device list. Two people on one server share nothing here, and
library visibility (ACCT-20) applies per person on top.

**ACCT-25** (SHIPPED) - **Per-server**: the libraries and their contents, metadata and
artwork, the set of installed modules, transcode and job policy, and every setting under
[`admin/`](../admin/).

**ACCT-26** (SHIPPED) - Watch state is per user and never per device: resume a film on the
television, finish it on the phone. The device is where a session lives, not where progress is
kept.

## Account deletion

Status: **SHIPPED**

Deleting an account destroys the person, not the media.

**ACCT-27** (SHIPPED) - Deletion destroys the account's credentials, all of its sessions and
paired devices, its watch state and its personal preferences. Afterwards the person cannot sign
in, and none of their screens can refresh access.

**ACCT-28** (SHIPPED) - Everything per-server survives. Libraries, media, metadata and
installed modules are untouched, because they were never the deleted account's to take, and
another user's watch state is untouched even where it points at the same titles.

**ACCT-29** (AGREED) - The owner account cannot be deleted while it is the only admin.
Ownership must first pass to another account, so a server is never left with no one able to run
it.

**ACCT-30** (AGREED) - A user may request deletion of their own account, which revokes their
access on the spot. An admin deleting another user is an [`admin/`](../admin/) action.

### Does a revoked or deleted device lose downloaded content?

Status: **AGREED**

Honestly: not immediately, and the server cannot make it.

**ACCT-31** (SHIPPED) - Revocation stops a session doing anything new. It cannot fetch, refresh
or stream another byte.

**ACCT-32** (AGREED) - Bytes already downloaded for offline viewing sit in local storage the
server cannot reach, so on discovering its session is dead the client is required to purge
downloaded media before it will run again.

**ACCT-33** (AGREED) - The guarantee is that a revoked device gains nothing new and loses its
downloads the next time the app runs, not that the download evaporates the instant revoke is
tapped.

We state it plainly rather than pretend to a control we do not hold. Enforcing the purge is the
mobile client's job; the account model's is only to kill the session that would let those
downloads be refreshed.
