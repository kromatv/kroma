# Accounts

Status: **SHIPPED** in part. Sections carry their own status below, and requirements carry
theirs, because the model ships while a few of its edges are still only agreed.

Who is using the server, what they may see, and how a device proves it is them.

One server, one household. The account model is sized for that: a person who owns
the NAS, the people they let in, and the screens each of them signs into. Anything
grander is a cost this product declines to pay.

What the server tells each of those people about, and the inbox they read it in, has its own
chapter: [`notifications.md`](notifications.md).

## The account model

Status: **SHIPPED**

**ACCT-1** (SHIPPED) - An **account** is a person. It has credentials, its own watch state,
its own settings, and a set of signed-in devices. Nothing else hangs off it.

**ACCT-2** (SHIPPED) - The first account created at first-run is the **owner**, an account
like any other that also holds the server itself.

**ACCT-3** (SHIPPED) - Every subsequent account is an ordinary **user**, admitted by an admin:
by invitation from [`admin/`](../admin/), or through a sign-in provider under the rules an
admin set for it (ACCT-79). A KROMA server is never self-signup.

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

**ACCT-5** (SHIPPED) - A person proves who they are with a **username and password**, a
**passkey**, or a **sign-in provider** the operator added. The server stores a verifier for
the password and never the password, the public half of a passkey, and for a provider only
which person there the account is. Strength, reset and lockout policy are the operator's
concern ([`admin/`](../admin/)).

**ACCT-6** (SHIPPED) - A successful authentication mints a **session**: a long-lived,
server-issued token bound to one device. Every request carries the session, so the password is
typed once per device and, in the ordinary case, never again.

**ACCT-7** (SHIPPED) - **Sessions do not expire on a clock.** A session lives until it is
revoked, by the account that owns it, by an admin, or by the person signing out. There is no
forced periodic re-authentication.

**ACCT-8** (SHIPPED) - A session is per device, not per account, so one can be revoked without
disturbing any other session the same account holds.

The television rule below is the hard case this policy is built around.

### Sign-in providers

Status: **SHIPPED** on the web and the phone. The desktop app is **AGREED**.

A household that already runs an identity provider can let it prove who people are
([RFC 657](../../rfcs/657-oidc-sign-in.md)). The provider says who someone is. Whether they come
in, and what they may see, stays this server's decision.

**ACCT-75** (SHIPPED) - An admin may add sign-in providers that speak OpenID Connect. Each one
adds a "Continue with" button to the sign-in screen.

**ACCT-76** (SHIPPED) - A provider's button appears only after an admin's test sign-in passed
with the provider's current connection. Changing the connection takes the button away until
a test passes again.

**ACCT-77** (SHIPPED) - A provider sign-in ends in an ordinary session (ACCT-6), like a
password sign-in. The server keeps nothing the provider issued.

**ACCT-78** (SHIPPED) - An account is tied to a person at a provider by that provider's own
identifier for them, never by an email address. An existing account gains a provider by
linking it while signed in.

**ACCT-79** (SHIPPED) - A person the provider vouches for and the server has never seen gets
what the admin chose for that provider: a join request an admin approves (the default), an
account at once, or a refusal unless they hold an invitation.

**ACCT-80** (SHIPPED) - A provider may require a group. A person outside it is refused at every
sign-in, account or not.

**ACCT-81** (SHIPPED) - An admin who declines a join request stops that person asking again,
until the admin lifts it.

**ACCT-82** (SHIPPED) - An admin may turn password sign-in and passkey sign-in off. Passwords
go off only while a provider is live.

**ACCT-87** (SHIPPED) - Passwords, passkeys and each provider are one list of sign-in methods.
The sign-in screen draws the buttons as one group and the password form as another. The
group an admin listed first comes first and carries the main action, and the buttons keep
the list's order.

**ACCT-88** (SHIPPED) - A provider's button shows the logo of the provider it was set up as,
or a picture an admin uploaded in its place, or an icon when it has neither.

**ACCT-83** (SHIPPED) - An account that can change server settings keeps its password
whatever ACCT-82 says, so a provider that is down never locks the server.

**ACCT-84** (SHIPPED) - An account cannot remove its last way to sign in.

**ACCT-85** (SHIPPED) - No claim from a provider grants a permission or a library.
Authorisation is set in KROMA.

**ACCT-86** (SHIPPED) - The phone app offers the provider buttons. It opens the provider in
the system browser and comes back signed in.

**ACCT-89** (AGREED) - The desktop app offers the provider buttons the same way.

Removing a person at the provider does not end the sessions they already hold here: sessions
do not expire on a clock (ACCT-7). A required group stops their next sign-in, and deleting
the account ends everything at once (ACCT-27).

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

**ACCT-72** (AGREED) - The device list shows the app version each device last used
([RFC 627](../../rfcs/627-version-compatibility.md)).

**ACCT-73** (AGREED) - A device whose app is older than the oldest version its server serves
([SURF-54](../surfaces/README.md)) is marked outdated.

**ACCT-74** (AGREED) - A device that never sent its app version shows "version unknown", never
outdated.

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

Status: **SHIPPED** in part; each requirement carries its own.

**ACCT-17** (SHIPPED) - An **owner or admin** runs the server: users, settings, jobs and
modules. Admin rights are server-wide, never per-library.

**ACCT-18** (AGREED) - The owner is the founding admin, the owner may grant admin to another
account, and there is always at least one admin.

**ACCT-19** (SHIPPED) - A **user** uses the server: browses and plays what they are permitted
to see, owns their own watch state and preferences, and manages their own devices.

**ACCT-20** (SHIPPED) - **Library visibility is per user.** An admin decides which libraries a
given user may see; that user sees exactly those and cannot discover the rest.

An account with no grant on record sees every library, which is what every account on an
existing server reads as: narrowing is something an admin does, never something an upgrade
does for them. A library nobody has been granted therefore stays visible to the unrestricted
accounts and invisible to the narrowed ones.

**ACCT-21** (SHIPPED) - Visibility gates browsing, search and playback alike. A title a user
cannot see is a title they cannot play, resume or find.

The rule holds in two halves, and both of them ship: the catalogue below, and the bytes behind
it.

**ACCT-34** (SHIPPED) - A title outside a person's grant is absent from browse, search, every
home row and their watch state, and is refused by its id on every endpoint that presents a
session. An unknown id and an ungranted one refuse identically, so probing cannot tell a title
that is hidden from one that was never scanned.

**ACCT-35** (SHIPPED) - Every request for media bytes carries a credential the grant can be
enforced against, and one carrying none is refused before the id is read. A `<video>` element,
hls.js, a television's own player and the mpv a desktop shell hands a URL to can none of them
send a header, so the credential rides in the URL: a **media ticket**, handed over beside every
session token and naming the signed-in device it belongs to. The server reads the account off
the ticket and the grant out of the database, so narrowing a grant bites on the next request
rather than when the ticket lapses, and revoking the device stops every ticket it left behind.

A ticket is scoped to an account rather than to one title, so a URL that escapes reaches
whatever that account may see until the ticket runs out. Twelve hours is that limit: longer
than a feature film and shorter than a day, which is what a credential written into an access
log and a browser history can be trusted with. The cost is that a title left paused longer than
that needs its source rebuilt, which a reload does. Scoping each ticket to one title instead
would buy a narrower leak for a round trip before every playback URL, and those URLs are built
in one synchronous step by six players that are handed nothing but a string.

One thing is deliberately left open, and it is the bytes this requirement covers that bound it:
a title's **artwork** stays reachable by id (`/items/<id>/poster`, `/items/<id>/card`,
`/images/<hash>`), because the sign-in screen's slideshow and a television's launcher cards are
drawn before there is any account to hold. Someone who already has an id learns a hidden
title's name and cover that way. They reach none of its bytes.

That is a real edge on **ACCT-20**, which says a narrowed account cannot discover the rest: for
an id already in hand, artwork confirms the title exists and shows its cover. The id is the
gated half, and ACCT-34 closed every path that hands one out, so the leak needs an id carried in
from outside the product. This is how artwork has always been served and nothing here changed
it; it is written down so neither ACCT-20 nor ACCT-21 has to be read charitably to be true.
Closing it means a credential on the art routes too, which costs the sign-in slideshow and the
launcher cards, and that trade has not been made.

**ACCT-22** (SHIPPED) - Installing a module is an **admin** right, because it runs new
code on the server ([`modules/`](../modules/)). A plain user may use whatever
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
| Monitor and unmonitor titles, edit quality rules | ✓ | no |
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

Status: **SHIPPED** in part; each requirement carries its own.

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
