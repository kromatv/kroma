# RFC 448: remote access a television can reach, and a phone that puts it there

- Status: **DRAFT**
- PR: #448
- Issue: #408
- Affects: `docs/spec/discovery/`, `docs/spec/accounts/` and `docs/tv-pairing.md`; the
  `quickconnect` endpoints and device-token minting in `server/src/api/accounts/`; a new
  core-called point and a server identity key; `modules/tv.kroma.remote`; the saved-profile
  store in `packages/client/src/api/accounts/remembered.ts`; the TV connection owner in
  `packages/tv/src/app/`; `clients/mobile` sessions; a coordination service this project
  would operate. Areas `area/server`, `area/tv`, `area/mobile`, `area/modules`, `area/web`,
  `area/desktop`, `area/synology`

## Summary

A television outside the server's home network cannot sign in today, because every road
into an account assumes the television can already reach the server. This proposes the
missing half: a **bootstrap that carries no server address**, approved on a phone that is
already signed in, delivering a sealed blob the coordination service cannot read, after
which the television brings up a transport and redeems a one-time grant for its own
session.

It makes six decisions the issue leaves open: who operates the coordinator and which
overlay it drives, whether a gateway may terminate TLS, how enrollment proves possession
and binds the server's identity, which half of the work is the remote module's and which
is the core's, what a saved profile is once a URL is no longer its name, and what ships in
which order.

## Motivation

Quick Connect is the floor for signing a television in, and it is deliberately universal:
four digits carried between two screens, working across subnets and over a tunnel
(`docs/tv-pairing.md`). It has one precondition that the document does not dwell on and
that defeats remote use entirely.

`TvQuickConnect` only runs once `useConnection()` hands it a `client` and an
`activeServerUrl`. `TvAddProfile` is the step before it, and it asks the viewer to pick a
server from LAN discovery or type a URL with a remote. `useCatalogue` builds the API client
straight from that URL. So the first question a fresh television asks is "which address",
and the only answers are "one this living room can see" or "one you will now type".

Three more things break the moment the server is not directly reachable:

- `useServersHealth` probes `<url>/api/health` and `TvProfiles` refuses a profile whose
  probe failed. A private server is always "offline" by that test, so its profile is
  unselectable, and connecting to it is exactly what selecting it should do.
- The TV auth provider drops to the profile picker whenever a credential exchange fails,
  and a transport that is not up yet fails exactly like an unreachable server. The account
  is only forgotten when the server says the token is revoked, which is the one case the
  viewer cannot tell apart from the other two.
- `remembered.ts` names a profile by `(normalized URL, user id)`. A server reachable at a
  LAN address today and an overlay address tomorrow is two profiles, and two servers behind
  the same tunnel address are one.

Meanwhile the shipped remote path is `tv.kroma.remote`: a public HTTPS URL and a supervised
`cloudflared` connector. It works, and every byte of it is readable by Cloudflare. That is
a reasonable default and a bad only option.

## What exists to build on

Checked against `main` at the time of writing, because the issue's table warns these move.

| What | Where | What it already does |
|---|---|---|
| Quick Connect | `server/src/api/accounts/quick_connect.rs` | A device initiates, holds a private polling secret, a signed-in account approves by code, the device collects a session, a device access token and a media ticket on its next poll |
| Device tokens | `mint_device_tokens` in `server/src/api/accounts/` | The minting and orphan cleanup an enrollment grant needs, already written |
| Server identity | `instance_id`, served on `/api/health` | An identifier, not a key: it proves nothing and anyone can echo it |
| A core-only secret | `mediaTicketKey` (`services/media_ticket.rs`) | The pattern for a key the core mints, persists, and the module host callback refuses to hand out |
| Connector lifecycle | `modules/tv.kroma.remote/server/src/` | Provision a pinned third-party binary, validate it by running it, supervise it, take it down with the module |
| A second one | `modules/tv.kroma.vpn/server/src/provision.rs` | The same pattern for `wireproxy`, userspace WireGuard, pinned to a version on purpose |
| A sealed grant | `packages/push-relay/` | A service this project operates that issues a blob naming exactly one device, which it cannot read back and a leaked server database does not expose |
| Beacon trust | `docs/tv-pairing.md` | What "the same network" is worth, and why a television that nobody can place types five characters |

The push relay is the closest precedent and the shape to copy. It exists because a
self-hosted server cannot hold the published app's credentials, it hands out capabilities
rather than secrets, and compromising one server yields grants for that server's own users
and nothing else.

## Proposal

### Decision 1: a coordinator this project operates, driving a maintained overlay

The target is a viewer who configures no router and installs no VPN app. That needs
somebody to run enrollment, rendezvous and a relay for the connections NAT traversal
cannot make direct. The alternatives:

- **Self-operated per install.** The operator runs the control server too. Honest for the
  self-hosting audience and useless for the stated goal: the household that cannot forward
  a port cannot run a control plane either.
- **A third-party managed account.** Each household signs into a vendor and KROMA rides
  it. Fastest prototype, and it puts a second account and a second app between a viewer and
  their television, which is the burden this feature exists to remove.
- **Operated by this project.** A coordinator at a known name, free for enrollment and
  rendezvous, with relays only where a direct connection fails.

**Recommendation: operated by this project, self-operable by configuration.** A server may
be pointed at another coordinator, and an install that names its own gets no relay from
us. That keeps the default honest for a nontechnical household without making the product
depend on a service only we can run.

For the overlay itself, the choice is between writing a control plane and adopting one:

- **Plain `wireguard-go` or `boringtun` with our own control plane.** No dependency and no
  vendor, and we would own key distribution, rekeying, NAT traversal, and a relay protocol.
  That is the part the issue says to defer, and it should stay deferred.
- **Tailscale's data plane with its hosted coordinator (`tsnet` plus auth keys).** The
  shortest road to a working spike. It reintroduces the per-household vendor account.
- **Tailscale's data plane with a self-hosted control server (`headscale`).** Maintained
  NAT traversal and relays, a control plane we can operate, and the server leg is a Go
  binary provisioned and supervised exactly as `cloudflared` and `wireproxy` already are.

**Recommendation: the third.** With two conditions, both of which belong to the stage-one
spike rather than to this RFC: confirm the embedding and licence terms for everything we
would ship or operate, and record the maintenance risk of the control server in writing
before any of it is a product promise. If either fails, the fallback is the second option
for the prototype and a re-opened decision before stage three.

### Decision 2: a gateway may terminate TLS, and says so by name

A television running Tizen or webOS cannot bring up a tunnel at all. If private transport
were the only remote path, those sets would lose remote access the day it shipped. So
termination stays, and the dishonesty is what gets removed.

The server gets three named access modes, set by its owner:

| Mode | What it means | Who can use it |
|---|---|---|
| `lan-only` | No remote access. Today's default, unchanged | everyone on the network |
| `public-https` | A gateway terminates TLS and forwards to the connector. Today's remote module | every client |
| `private-only` | Only transports where nothing between the client and the server reads the stream | clients that can hold a tunnel |

Three rules make the names mean something:

1. **No silent downgrade.** A client that cannot satisfy `private-only` is refused with a
   named reason, never quietly routed through a gateway.
2. **The admin is told the cost before switching**, listing the shells that will lose
   remote access by name.
3. **The mode is the server's, not the client's.** A client cannot ask for termination on
   a server that forbids it.

End-to-end TLS passthrough, where the gateway forwards bytes it cannot read, is a fourth
mode worth evaluating later. It is not a guarantee this product has today and must not be
described as one.

### Decision 3: enrollment is a sealed grant, addressed to one device

The protocol, in the properties it has to hold rather than in bytes:

1. **The television starts with no server.** It generates a keypair, keeps the private
   half, and asks the coordinator for a bootstrap reference. On a platform with native
   transport it also generates its tunnel key here, and that key never leaves the device.
2. **The QR carries the reference and a digest of the television's public key**, nothing
   else. The redemption secret stays on the television, as Quick Connect's polling secret
   already does.
3. **The phone chooses the server.** It is signed in, it picks which of its servers this
   television joins, and it approves under that server's device policy. Scanning never
   selects a server by itself, which is what closes the cross-server confusion the issue
   names.
4. **The server signs the binding.** It mints a one-time login grant bound to the
   television's public key, and signs a statement covering the bootstrap reference, that
   key's digest, its own identity key and the account. This requires a real **server
   identity keypair**, minted on first run and withheld from modules exactly as
   `mediaTicketKey` is. `instanceId` is not that: it is a string anyone can repeat.
5. **The coordinator carries ciphertext.** The phone seals the connection details and the
   grant to the television's public key and posts the blob addressed to the bootstrap
   reference. The coordinator stores and forwards it. It never holds a reusable credential
   and never learns an account.
6. **The television verifies before it spends anything.** It decrypts, checks the
   signature against the identity key it was handed, brings up the transport, and only then
   redeems the grant.
7. **The grant is one-time, device-bound and short-lived.** Five minutes, matching Quick
   Connect, redeemable once, and only by a connection presenting the key it was bound to.
   It lands in the device list and revokes like any other session.

What this does not do: copy the phone's bearer token or private key to the television, let
a coordinator compromise yield anything but ciphertext, or let a matching URL or instance
id stand in for proof of identity.

The fallback for a television with no camera on the other side stays a code typed **on a
phone or a computer**, never on the television. The existing four-digit Quick Connect is
untouched and keeps working for servers the television can already reach.

### Decision 4: the module owns the connector, the core owns the grant

- **`tv.kroma.remote`** owns the overlay node: provisioning the connector binary,
  supervising it, registering with the coordinator, the external reachability check behind
  "Ready", and the admin page. It already does all of this for `cloudflared`, including
  taking the connector down when the module is disabled, which is the behaviour that keeps
  a disabled module from leaving a box reachable.
- **The core** owns accounts, devices, the enrollment grant and its revocation, the server
  identity key, and the access mode policy. None of that may live in a sidecar: a grant is
  an account credential, and the identity key is the thing every binding rests on.
- **`tv.kroma.vpn` gets nothing.** It is an outbound bridge for downloads and must not
  acquire ambient account access.

The seam between them is the one piece of the module model this changes. The core needs to
ask "how is this server reachable, and what should a television be told", and the core
calls a point by a bare name because it has no manifest to define one in. Adding
**`remote-access`** as a fourth bare core-called point, beside `acquisition`,
`transcriber` and `embedder`, is a deliberate extension and should be reviewed as one. The
core calls it with no module id and gets endpoints back; when no module answers, remote
access is simply not configured, which is the same shape every other consumer already
handles.

### Decision 5: a profile is a server identity plus an account

`remembered.ts` keys a profile on `(normalized URL, user id)`, which stops being a name the
moment a server has more than one address. It becomes `(server identity, account id)`, with
the URL demoted to a hint:

- A saved profile gains the server's identity fingerprint and a transport reference.
- Migration stamps the fingerprint on the first verified connection; until then the URL
  key still matches, so nothing is lost and nobody signs in again.
- De-duplication prefers the fingerprint and falls back to the URL, so two servers behind
  identical tunnel addresses stay two profiles.

Above it sits one **transport manager**, in `@kromatv/core` where the rules live rather
than in the wire-types package. It resolves a profile to a reachable base URL, brings the
transport up when a profile is selected, and hands the client its address. Three
consequences follow, and each is a bug fixed:

- `useCatalogue` stops building a client from a URL and asks the manager instead.
- Health probing moves behind the manager. "Not connected" and "offline" stop being the
  same answer, and a private server stays selectable while disconnected.
- The TV auth provider separates transport failure from a refused credential, so a tunnel
  that is not up never reads as a revoked device.

API, websockets, playback, subtitles, images and downloads all follow the resolved address,
including the media ticket in a URL, which is per-device and per-account already.

### Decision 6: four stages, and the first one may say no

The issue's staging is right. The change is that stage one ends in a written verdict.

1. **Spike.** Cross-network playback, CGNAT, blocked UDP, a measured NAS figure, and the
   licence and maintenance findings from Decision 1. It ends by confirming or replacing
   the overlay choice.
2. **Pairing and the compatibility path.** The bootstrap, phone approval, grant
   redemption, the profile UX, and `public-https`. Existing LAN, manual and Quick Connect
   flows stay exactly as they are.
3. **Native private access.** Desktop first, then mobile and native TV. `private-only`
   becomes selectable, and the mode list is honest about which shells it excludes.
4. **Reliability and rollout.** Revocation and outage behaviour, hardware measurements,
   opt-in beta, diagnostics, rollback. Concurrent private transports are a separate gate
   and do not block this.

## What this costs

- **A service we operate forever.** Enrollment, rendezvous and relays, plus their
  regions, limits and a privacy disclosure. At a constant 20 Mbit/s a stream moves about
  9 GB per hour, so relayed 4K is a cost decision before it is an engineering one.
- **A second long-lived process on the NAS**, provisioned and updated by us, on the same
  box that is already transcoding.
- **A protocol we keep.** The bootstrap, the grant and the identity key become compatibility
  promises for televisions that will not be updated.
- **A fourth bare core point**, which is a small widening of the rule that the core names
  nothing.
- **Support surface.** "It says Ready but my television cannot connect" is a class of
  report that needs diagnostics designed in, not added later.
- **Store and platform risk.** A VPN entitlement on iOS and tvOS, and background execution
  rules, are reviewed per platform and can reject a build for reasons unrelated to KROMA.

## Compatibility

- Saved URLs, LAN discovery, Quick Connect, nearby handoff and profile locks keep working.
  Nothing here removes a road into an account.
- `public-https` is what the remote module already does, under a name.
- A profile saved before this stays valid and gains its fingerprint on first connection.
- A client built before this ignores the new fields and keeps using the URL it has.
- A server with no remote module installed answers the new point with nothing, and remote
  access is reported as not configured rather than failing.

## Alternatives

- **Do nothing.** Remote access stays a terminating gateway or a hand-built tunnel, and a
  television outside the home still cannot sign in without a URL typed on a remote.
- **Manual WireGuard profiles.** Fine for an operator who wants them, and no answer for
  discovery, relays or a television's keyboard.
- **A separate overlay application per household.** A pilot, not a product: two accounts
  and two apps for one television.
- **HTTPS only, forever.** The cheapest broad compatibility and a permanent trust
  boundary at someone else's gateway.
- **Our own overlay.** Defer until a maintained one fails the spike.

## Unresolved

- First native targets and minimum platform versions, and whether the native OS provider
  or an application-local transport is used on each.
- Relay regions, per-household limits and what the privacy disclosure says.
- Who may approve a device, how long an authorization lease lasts, and what happens during
  a coordinator outage beyond "new enrollment fails closed and LAN keeps working".
- Whether concurrent private connections to independent servers ship at all, and on which
  platforms they can.
- Whether end-to-end TLS passthrough becomes a fourth access mode.
