# Discovery

Status: **SHIPPED**, with one deliberate deferral at the end. Sections carry their own
status below.

How a client finds a server it was never told about, and how a television, which has no
keyboard worth using, becomes signed in.

Discovery ends where [`accounts/`](../accounts/) begins: its job is to get a device
*attached* to a server and *pointed at* an account. What the account then means, and what
the resulting session may do, is that file. The mechanics, meaning the wire records, the trust
proofs and the per-shell APIs, are [`../tv-pairing.md`](../../tv-pairing.md); this file states
the product rules and links there rather than repeating them.

## Finding a server on the local network

Status: **SHIPPED**

**DISC-1** (SHIPPED) - A client on the same network as a server is never told the server's
address. The server announces itself, the client listens, and the server appears in a list.
Choosing it is the whole of setup on the happy path.

"The same network" is a claim the product makes carefully, because it decides who is shown
which television. A server is a rendezvous, not a resident: a television and a phone in one
room can pair through a server in another country, so the only addresses that matter are the
two devices'. Specified in full in
[`../tv-pairing.md`](../../tv-pairing.md#what-the-same-network-means):

- **DISC-2** (SHIPPED) - On a private network the server sits inside, "the same network" means
  the same local block: one home, whether a device is on ethernet or on wifi.
- **DISC-3** (SHIPPED) - When the server is reached from outside, it means the *exact* same
  public address, because a household leaves through one and a looser rule would rope in
  strangers.
- **DISC-4** (SHIPPED) - Over IPv6, it means the same delegated prefix: one home's allocation.

**DISC-5** (SHIPPED) - A home this cannot place, split across subnets, dual-stack with the two
devices on different families, or behind carrier-grade NAT, falls back to Quick Connect rather
than being guessed at. The product would sooner ask a human to carry four digits than list a
stranger's television.

## Who listens, and who must be told

Status: **SHIPPED**

Listening on the network needs an API not every platform grants a sandboxed app, so shells
divide by capability rather than by preference. The per-shell table is in
[`../tv-pairing.md`](../../tv-pairing.md#what-each-shell-can-do):

- **DISC-6** (SHIPPED) - Native mobile shells, iOS and Android, can *browse*: they find nearby
  televisions and show them in a list. This is where a person usually pairs a TV.
- **DISC-7** (SHIPPED) - Native TV shells, Apple TV and Android TV, and webOS can *announce*:
  they put themselves on the network so a phone can find them.
- **DISC-32** (SHIPPED) - Native TV shells also *browse* for a server, so a television that was
  never told an address finds one itself. Where the platform ships no browser the shell falls
  back to a typed address.
- **DISC-8** (SHIPPED) - Web, desktop and TV-web shells can do neither from the browser
  sandbox. They learn a server only from what the server itself tells them, or from an address
  a person enters.
- **DISC-9** (SHIPPED) - Tizen cannot announce at all, because its TV profile ships no way to.
  A Samsung set is therefore only ever found *through the server*, and confirmed by a check
  string. This is a platform limit, not a gap we mean to close.

**DISC-10** (SHIPPED) - Browsing and announcing settle *reach*, whether two devices are near
enough to pair, and nothing more. Being near is necessary, never sufficient: a listed device a
server could not physically place still has to prove itself with a check string before it may
be granted.

## Manual connection

Status: **SHIPPED**

**DISC-11** (SHIPPED) - Every shell offers a manual path: a person can always type an address,
hostname or IP with an optional port, and connect directly. Automatic discovery is a
convenience, not a dependency, because networks lie: multicast is filtered on guest wifi, the
server is across a VPN, the phone is on cellular.

**DISC-12** (SHIPPED) - Manual connection is the only supported path from *outside* the local
network. KROMA runs no relay and no discovery cloud, so reaching a server across the internet
means the operator has published it, by a port forward, a reverse proxy or a tunnel, and the
person knows its address. Remote access is a property of the server's deployment, documented in
[`admin/`](../admin/).

**DISC-13** (SHIPPED) - Once an address is reachable, every sign-in road below works over it,
Quick Connect especially, which is built to.

## The pairing handshake

Status: **SHIPPED**

Signing in a television is the hard case discovery exists for: a device with a screen, a
network, and no usable keyboard. There are three roads to it, and a television takes whichever
ones its platform allows.

**DISC-14** (SHIPPED) - All three roads end in the same place. The server holds a pending
request until a signed-in account approves it, then hands the television an ordinary session
that appears in the account's device list and revokes like any other
([`accounts/`](../accounts/)).

**DISC-15** (SHIPPED) - **Quick Connect is the floor.** The television prints a short code; the
person reads it and enters it into an already-signed-in client. It is slow by design, which is
exactly why it works from anywhere: across subnets, over a tunnel, from a phone on cellular, on
a set that can do nothing else. It is never removed, on any shell.

**DISC-33** (SHIPPED) - A client with a camera may read the code from the television's QR
instead of asking a person to type it. Scanning is an input method for Quick Connect, not a
fourth road, so a shell without a camera loses nothing but the typing.

**DISC-16** (SHIPPED) - **Nearby handoff** is the shortcut for televisions the platform lets us
find. The person opens their phone, sees the television in a list, and taps its row; the tap is
the approval. This is the fast path, and the one most people use.

**DISC-17** (SHIPPED) - **Confirmed handoff** covers the listed television a server cannot
physically place. It is listed, but tapping it is not enough: the person is asked for a short
check string the television is already printing on its own screen. Why a raw tap is unsafe
there is [`../tv-pairing.md`](../../tv-pairing.md#who-may-raise-a-beacon).

### When discovery finds nothing

Status: **SHIPPED**

**DISC-18** (SHIPPED) - Discovery finding nothing is a normal state, not an error, and every
shell has a designed fallback into a road above.

- **DISC-19** (SHIPPED) - A TV shell that can announce but not browse is *already* showing its
  Quick Connect code. Announcing is a bonus for the phone, and the code stands on its own.
- **DISC-20** (SHIPPED) - A TV shell that cannot announce shows Quick Connect and, when it is
  reached through the server, its confirmed-handoff check string. Both are on screen from the
  start.
- **DISC-21** (SHIPPED) - A mobile shell that browses and sees an empty list offers, in that
  same space, "enter a server address" and "sign a TV in with a code". The empty list is a
  prompt, not a dead end.
- **DISC-22** (SHIPPED) - Web and desktop, which never browse, present the manual address field
  first, with Quick Connect for pairing a television afterwards.

**DISC-23** (SHIPPED) - No shell ever traps a person on a road that failed. There is always a
manual address to type and always Quick Connect to fall to.

### Code lifetime and expiry

Status: **SHIPPED**

**DISC-24** (SHIPPED) - A Quick Connect or handoff code is valid for **five minutes**, because
a short window is what keeps a guessable code safe. While it is live the television polls
quietly and shows the code plainly.

**DISC-25** (SHIPPED) - A code that expires mid-flow is replaced on the television by a clear
"this code expired" message and a single "show a new code" action, which mints a fresh code and
resets the clock.

**DISC-26** (SHIPPED) - A code already consumed by a successful sign-in vanishes rather than
lingering.

**DISC-27** (SHIPPED) - An expired code is visibly dead and one tap from being alive again,
never silently accepted late.

## Trust: what a paired television may do

Status: **SHIPPED**

**DISC-28** (SHIPPED) - Approval is one-time. The moment an account approves a pairing, the
television holds an ordinary session and needs no further confirmation for ordinary use. It
browses, plays and resumes as that account without asking anyone to re-approve. This is the
whole point of pairing a device that cannot type: sign in once, stay signed in.

**DISC-29** (SHIPPED) - A paired television is a *device*, not a second key to the account. It
can act as its account, but it cannot approve other devices, change credentials, or do anything
that would let a set in a guest room mint further sessions.

**DISC-30** (SHIPPED) - Revocation is symmetrical with every other device. The account sees the
television in its device list and can end its session at any time, from anywhere, and the
television falls back to unpaired ([`accounts/`](../accounts/)).

## Why Tizen and webOS stop at the server

Status: **DESIGN, NOT IMPLEMENTED**

**DISC-31** (DESIGN, NOT IMPLEMENTED) - Samsung and LG televisions do not reach the deeper
integration a native set could, meaning being *heard on the link* to settle reach without a
check string, through each vendor's own multiscreen stack.

Both pair today, through the server, with a check string where needed. The deeper integration is
deferred, not overlooked, because it costs more than it buys. Each vendor's stack is a separate
protocol with no shared discovery, needing a phone-side integration built and tested per vendor,
against television hardware, some of it documented only for models years old. Against that cost
the gain is narrow: the beacon already reaches the server and the grant already travels through
it, so vendor integration would only remove a check string in the minority of homes where the
two devices' addresses disagree. The product would rather ship the check string everywhere than
a fragile fast path on two vendors' terms. The full argument, and the seam left open should it
ever pay off, is
[`../tv-pairing.md`](../../tv-pairing.md#why-tizen-and-webos-stop-at-the-server).
