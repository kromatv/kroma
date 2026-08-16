# Accounts

Who is using the server, what they may see, and how a device proves it is them.

One server, one household. The account model is sized for that: a person who owns
the NAS, the people they let in, and the screens each of them signs into. Anything
grander is a cost this product declines to pay.

## The account model

Status: **AGREED**

An **account** is a person. It has credentials, its own watch state, its own
settings, and a set of signed-in devices. Nothing else hangs off it.

The first account created at first-run is the **owner**. The owner is an account
like any other that additionally holds the server itself — see the roles below.
Every subsequent account is an ordinary **user**, created by invitation from
[`admin.md`](../admin/README.md); a KROMA server is never self-signup.

**There are no profiles under an account, and there will not be.** A "profile"
in other media servers is a login you do not have to type a password for: a way
to split one household login into several viewing identities. KROMA already gives
every person their own account, so a profile would be a second, weaker identity
mechanism sitting beside the real one — two ways to be "someone", one of which
carries no authentication. For a single-NAS household where making an account is
one invitation, that buys nothing and costs the confusion of two overlapping
concepts. A person who wants their own Continue Watching gets an account. A shared
screen in the kitchen signs into one account and stays there. Profiles and users
are the same thing named twice, so we keep the name that already carries a password.

The honest cost: a genuinely shared device (one television, several viewers) mixes
everyone's watch state under whichever account it holds. We accept that. The fix
is switching accounts on the device, not inventing passwordless sub-identities to
avoid it.

## Authentication

Status: **AGREED**

A person proves who they are with a **username and password**. That is the only
credential the server stores, and it stores only a verifier for it, never the
password. Password strength, reset, and lockout policy are the server operator's
concern and live in [`admin.md`](../admin/README.md).

A successful authentication mints a **session**: a long-lived, server-issued token
bound to one device. Every request carries the session; the password is typed once
per device and, in the ordinary case, never again.

**Sessions do not expire on a clock.** A session lives until it is revoked — by the
account that owns it, by an admin, or by the person signing out. There is no forced
periodic re-authentication. A session can be individually revoked without disturbing
any other session the same account holds, because a session is per-device, not
per-account.

Rationale — see the television rule below, which is the hard case this policy is
built around.

## Devices and pairing

Status: **AGREED**

A **device** is where a session lives. Signing in on a phone, a browser, or a
television each produces one session, and each shows up in the account's **device
list** with enough to recognise it (shell, rough location, last-seen) and one
action: revoke.

A television binds to an account through the pairing handshake, not a typed
password — the mechanics of that handshake are [`discovery.md`](../discovery/README.md), and
its raw material [`tv-pairing.md`](../../tv-pairing.md). The product rule that matters
here: **pairing ends in an ordinary session.** A paired television is not a special
class of trust; it lands in the same device list as everything else and revokes the
same way. There is nothing you can do to a paired television that you cannot do to a
phone, and nothing you must do differently to unbind it.

**Unbinding is revocation.** Revoke a device's session and its access ends at the
next request it makes. The device is not consulted, wiped, or asked to cooperate;
the server simply stops honouring its token. A revoked device that returns must
pair or sign in afresh.

### Session lifetime on a television

Status: **AGREED**

A television session is long-lived and revocable, and **is never forced to
re-authenticate on a schedule.** A television has no keyboard worth using and often
no practical way to re-run the pairing dance unattended; an expiring session would
mean a screen that silently signs itself out and a person hunting for a phone to fix
it. So the television keeps its session until a human revokes it. The revocation
path — the device list — is the control that replaces expiry: security comes from
being able to cut a specific screen off instantly from any other device, not from
making every screen prove itself again on a timer. This is the same rule as every
other device; the television is only the case that makes forced expiry obviously
wrong.

## Authorisation

Status: **AGREED**

Two roles, and a per-user visibility rule layered on top.

- **Owner / admin** — runs the server. Manages users, settings, jobs, and modules.
  The owner is the founding admin; the owner may grant admin to another account, and
  there is always at least one admin. Admin rights are server-wide, not per-library.
- **User** — uses the server. Browses and plays what they are permitted to see,
  owns their own watch state and preferences, and manages their own devices.

**Library visibility is per-user.** An admin decides which libraries a given user
may see; a user sees exactly those and cannot discover the rest. Visibility gates
browsing, search, and playback alike — a title a user cannot see is a title they
cannot play, resume, or find.

Module installation is an **admin** right, because installing a module runs new
out-of-process code on the server — see [`modules.md`](../modules/README.md). A plain user
may use whatever modules an admin has installed and enabled, within their own
library visibility; they may not install, update, or remove them.

### Permission matrix

Status: **AGREED**

| Capability | Owner / admin | User |
|---|---|---|
| Browse permitted libraries | ✓ | ✓ |
| Play permitted titles | ✓ | ✓ |
| Manage own watch state (resume, mark, Continue Watching) | ✓ | ✓ |
| Manage own settings and preferences | ✓ | ✓ |
| Manage own devices (list, revoke) | ✓ | ✓ |
| Pair a television to own account | ✓ | ✓ |
| See all libraries | ✓ | only those granted |
| Invite / remove users | ✓ | — |
| Set another user's library visibility | ✓ | — |
| Revoke another account's device | ✓ | — |
| Grant / revoke admin | owner | — |
| Install / update / remove modules | ✓ | — |
| Change server settings, run and cancel jobs | ✓ | — |

A user's power over their own account is total; their power over anyone else's, or
over the server, is none. Everything in the admin column is [`admin.md`](../admin/README.md)'s
subject in depth.

## Per-user versus per-server

Status: **AGREED**

The dividing line is ownership of the experience versus ownership of the machine.

**Per-user** — watch state (resume points, watched flags, Continue Watching),
personal preferences (playback defaults, language, subtitle choices, interface
settings), the device list, and library visibility as it applies to them. Two
people on one server share nothing here.

**Per-server** — the libraries and their contents, metadata and artwork, the set of
installed modules, transcode and job policy, and every setting under
[`admin.md`](../admin/README.md). One person's Continue Watching is theirs; the library that
row points into is everyone's.

Watch state is deliberately per-user and never per-device: resume a film on the
television, finish it on the phone. The device is where a session lives, not where
progress is kept.

## Account deletion

Status: **AGREED**

Deleting an account destroys the person, not the media.

**Destroyed** — the account's credentials, all of its sessions and paired devices
(every one is revoked in the act of deletion), its watch state, and its personal
preferences. After deletion the person cannot sign in, and none of their screens can
refresh access.

**Survives** — everything per-server. Libraries, media, metadata, and installed
modules are untouched, because they were never the deleted account's to take.
Another user's watch state is untouched even where it points at the same titles.

The owner account cannot be deleted while it is the only admin; ownership must first
pass to another account, so a server is never left with no one able to run it.
An admin deleting another user is an [`admin.md`](../admin/README.md) action; a user may
request deletion of their own account, which revokes their access on the spot.

### Does a revoked or deleted device lose downloaded content?

Status: **AGREED**

Honestly: not immediately, and the server cannot make it. Revocation stops a
session from doing anything new — it cannot fetch, refresh, or stream another byte.
But bytes already downloaded for offline viewing sit in local storage on the device,
and the server has no reach into that storage. What enforces removal is the **app**:
on discovering its session is dead, the client is required to purge downloaded media
before it will run again. So the guarantee is "a revoked device gains nothing new and
loses its downloads the next time the app runs", not "the download evaporates the
instant you tap revoke". We state it plainly rather than pretend to a control we do
not hold; the offline-download reality is [`modules.md`](../modules/README.md)'s and the mobile
client's to enforce, and the account model's job is only to kill the session that
would let those downloads be refreshed.
