# Discovery

How a client finds a server it was never told about, and how a television, which has no
keyboard worth using, becomes signed in.

Discovery ends where [`accounts.md`](../accounts/README.md) begins: its job is to get a device
*attached* to a server and *pointed at* an account. What the account then means, and what
the resulting session may do, is that file. The mechanics, meaning the wire records, the trust
proofs and the per-shell APIs, are [`../tv-pairing.md`](../../tv-pairing.md); this file states
the product rules and links there rather than repeating them.

## Finding a server on the local network

Status: **SHIPPED**

A client on the same network as a server should not have to be told the server's address.
It announces itself; a client listens; the server appears in a list. Choosing it is the
whole of setup on the happy path.

"The same network" is a claim the product makes carefully, because it decides who is shown
which television. A server is a rendezvous, not a resident: a television and a phone in one
room can pair through a server in another country, so the only addresses that matter are
the two devices'. The product's rule, stated plainly and specified in full in
[`../tv-pairing.md`](../../tv-pairing.md#what-the-same-network-means):

- **On a private network the server sits inside**, "same network" means the same local
  block: one home, whether a device is on ethernet or on wifi.
- **When the server is reached from outside**, it means the *exact* same public address,
  because a household leaves through one and a looser rule would rope in strangers.
- **Over IPv6**, it means the same delegated prefix: one home's allocation.

Three homes this cannot place, those split across subnets, dual-stack with the two devices on
different families, or behind carrier-grade NAT, fall back to Quick Connect below rather
than guess. This is deliberate: the product would sooner ask a human to carry four digits
than list a stranger's television.

## Who listens, and who must be told

Status: **SHIPPED**

Listening on the network needs an API not every platform grants a sandboxed app, so shells
divide by capability, not by preference. The product view, with the mechanics and the per-shell
table are in [`../tv-pairing.md`](../../tv-pairing.md#what-each-shell-can-do):

- **Native mobile shells** (iOS, Android) can *browse*: they find nearby televisions and
  show them in a list. This is where a person usually pairs a TV.
- **Native TV shells** (Apple TV, Android TV) and webOS can *announce*: they put themselves
  on the network so a phone can find them. They do not browse for servers themselves.
- **Web, desktop, and TV-web shells** can do neither from the browser sandbox. They learn a
  server only from what the server itself tells them, or from an address a person enters.
- **Tizen** cannot announce at all: its TV profile ships no way to. A Samsung set is
  therefore only ever found *through the server*, and confirmed by a check string (below).
  This is a platform limit, not a gap we mean to close; see the deferral section.

The rule the product holds to: browsing and announcing settle *reach*, whether two devices
are near enough to pair, and nothing more. Being near is necessary, never sufficient. A
listed device a server could not physically place still has to prove itself with a check
string before it may be granted.

## Manual connection

Status: **SHIPPED**

Automatic discovery is a convenience, not a dependency. Every shell offers a manual path,
because networks lie: multicast is filtered on guest wifi, the server is across a VPN, the
phone is on cellular. A person can always type an address, hostname or IP with an optional
port, and connect directly.

Manual connection is also the only supported path from *outside* the local network. KROMA
does not run a relay or a discovery cloud; reaching a server across the internet means the
operator has published it (a port forward, a reverse proxy, a tunnel) and the person knows
its address. Remote access is thus a property of the *server's* deployment, documented in
admin, not a discovery feature. What discovery guarantees is that once an address is
reachable, every sign-in road below works over it, Quick Connect especially, which is
built to.

## The pairing handshake

Status: **SHIPPED**

Signing in a television is the hard case discovery exists for: a device with a screen, a
network, and no usable keyboard. There are three roads to it, and a television takes
whichever ones its platform allows. All three end in the same place: the server holds a
pending request until a signed-in account approves it, then hands the television an ordinary
session that appears in the account's device list and revokes like any other
([`accounts.md`](../accounts/README.md)).

**Quick Connect is the floor.** The television prints a short code; the person reads it and
types it into an already-signed-in client. It is slow by design, and that is exactly why it
works from anywhere: across subnets, over a tunnel, from a phone on cellular, on a set that
can do nothing else. It is never removed, on any shell.

**Nearby handoff** is the shortcut for televisions the platform lets us find. Instead of
reading a code, the person opens their phone, sees the television in a list, and taps its
row. The tap is the approval. This is the fast path, and the one most people use.

**Confirmed handoff** covers the listed television a server cannot physically place. The
Samsung set found only through the server, or any beacon whose position the server cannot
vouch for. It is listed, but tapping it is not enough: the person is asked for a short check
string the television is already printing on its own screen. This is Quick Connect's
guarantee kept *inside* the list rather than replacing it: one confirmation, on exactly the
platforms that have no safer road in. Why a raw tap is unsafe there, and why the check
string is the right price, is [`../tv-pairing.md`](../../tv-pairing.md#who-may-raise-a-beacon).

### When discovery finds nothing

Discovery finding nothing is a normal state, not an error, and every shell has a designed
fallback into a road above:

- **A TV shell that can announce but not browse** (Apple TV, Android TV, webOS) is *already*
  showing its Quick Connect code. Announcing is a bonus for the phone, and the code stands
  on its own. Nothing found means nothing lost.
- **A TV shell that cannot announce** (Tizen) shows Quick Connect and, when it is reached
  through the server, its confirmed-handoff check string. Both are on screen from the start.
- **A mobile shell** that browses and sees an empty list offers, in that same space, "enter
  a server address" and "sign a TV in with a code". The empty list is a prompt, not a
  dead end.
- **Web and desktop**, which never browse, present the manual address field first, with
  Quick Connect for pairing a television afterwards.

The through-line: no shell ever traps a person on a road that failed. There is always a
manual address to type and always Quick Connect to fall to.

### Code lifetime and expiry

A Quick Connect or handoff code is short-lived on purpose, because a short window is what keeps a
guessable code safe. **A code is valid for five minutes.** While it is live the television
polls quietly and shows the code plainly.

When it expires mid-flow the person is not left staring at a stale number wondering why
approval did nothing. The television replaces the expired code with a clear "this code
expired" message and a single "show a new code" action; taking it mints a fresh code and
resets the clock. A code already consumed by a successful sign-in likewise vanishes rather
than lingering. The rule: an expired code is visibly dead and one tap from being alive
again, never silently accepted late.

## Trust: what a paired television may do

Status: **SHIPPED**

Approval is one-time and total, then boundaried. The moment an account approves a pairing,
the television holds an ordinary session and needs no further confirmation for ordinary use
It browses, plays, and resumes as that account, without asking anyone to re-approve. This
is the whole point of pairing a device that cannot type: sign in once, stay signed in.

The boundary is that a paired television is a *device*, not a second key to the account. It
can act as its account, but it cannot approve *other* devices, change credentials, or do
anything that would let a set in a guest room mint further sessions. What a session may do,
and how a television, which cannot practically re-authenticate often, stays valid, is
[`accounts.md`](../accounts/README.md). Revocation is symmetrical with every other device: the
account sees the television in its device list and can end its session at any time, from
anywhere, and the television falls back to unpaired.

## Why Tizen and webOS stop at the server

Status: **DESIGN, NOT IMPLEMENTED**

Both Samsung (Tizen) and LG (webOS) televisions pair today, through the server, with a
check string where needed. What they deliberately do *not* do is reach the deeper
integration a native set could: being *heard on the link* to settle reach without a check
string, via each vendor's own multiscreen stack.

This is deferred, not overlooked, because it costs more than it buys. Each vendor's stack is
a separate protocol with no shared discovery, needing a phone-side integration built and
tested per vendor, against television hardware, some of it documented only for models years
old. Against that cost, the gain is narrow: the beacon already reaches the server and the
grant already travels through it, so vendor integration would only remove a check string in
the minority of homes where the two devices' addresses disagree. The product would rather
ship the check string everywhere than a fragile fast path on two vendors' terms. The full
argument, and the seam left open should it ever pay off, is
[`../tv-pairing.md`](../../tv-pairing.md#why-tizen-and-webos-stop-at-the-server).
