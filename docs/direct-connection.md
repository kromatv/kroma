# Reaching the server directly at home

A server published through a tunnel (`https://kroma.example`, cloudflared on the
NAS) is slow to reach from the house it sits in: every request leaves for the
tunnel provider's edge and comes back down the tunnel. A client that is signed in
through the public address and can reach the same server on its own network
switches to that address, and goes back to the public one when it stops
answering. No certificate is involved: the direct route is plain http to a
private address.

## The offer

`GET /api/server/direct` (bearer) answers on the base the client was configured
with, never on a direct route:

```json
{
  "instanceId": "…",
  "routes": ["http://192.168.1.2:4040"],
  "nonce": "64 hex",
  "answer": "64 hex",
  "sameNetwork": true
}
```

- `routes` are this machine's private IPv4 addresses (RFC 1918) on the port the
  server listens on, the one the routing table leads with first. Loopback,
  link-local and container or tunnel interfaces (`docker*`, `br-*`, `veth*`,
  `tun*`, `wg*` and the like) are left out. A server bound to loopback has none,
  one bound to a single address has that one.
- `nonce` and `answer` are a challenge, held in memory for a minute and good once.
- `sameNetwork` is true when the caller's address (after the trusted-proxy rules
  in [server/README.md](../server/README.md#behind-a-reverse-proxy)) is itself
  private, is this server's own public IPv4, or shares a `/64` with one of this
  machine's global IPv6 addresses. The public IPv4 comes from an echo
  (`KROMA_PUBLIC_IP_URL`, `https://api.ipify.org` by default, empty to never
  ask), asked through the core's `Fetch` under the `address` purpose, kept ten
  minutes, and unknown when it does not answer.

Admin → Réseau → Réglages → *Connexion directe à la maison* (`directConnections`, on by
default) turns it off: `routes` is then empty and the echo is never asked.

## The proof

A client does not trust a route because something answered at that address. A
hotel network can have its own `192.168.1.2`, and a host there can copy this
server's `/api/health`, `instanceId` included, since that route is public.

So the client sends the nonce down the route,
`GET <route>/api/server/direct/proof?nonce=` (public, 30 a minute per address),
and takes the route only if the body carries the offer's `answer`. The server
gives the answer once, and only to a request that:

- comes from a private address that is not this machine itself, and
- carries no forwarding header (`X-Forwarded-For`, `CF-Connecting-IP`, `CF-Ray`,
  `Forwarded`, `Via`, …) from a peer the server has not been told to trust.

A host elsewhere that relays the nonce to the public address arrives with a
public `CF-Connecting-IP` and is told nothing. A host that answers by itself
cannot know the answer. The second rule covers a proxy nobody named in
`KROMA_TRUSTED_PROXIES`: its requests arrive from a private bridge address, and
without the rule a relay through it would look like a neighbour.

The design first asked for a `204`. A bare status proves nothing, because any
host can send one, so the proof answers with the secret instead.

## Which browsers may read the LAN answers

The web client on `https://kroma.example` reads answers from
`http://192.168.1.2:4040`, a different origin, so the LAN listener's CORS policy
also admits the origins this server is served at publicly:

- the origin of `KROMA_WEB_URL`, when it is set;
- the `https://<Host>` of an offer request that reached the server through a
  trusted proxy with `X-Forwarded-Proto: https`, remembered in memory (eight at
  most). A request from any other peer teaches nothing.

Preflights are cached for two hours (`Access-Control-Max-Age: 7200`, Chromium's
ceiling), so the `Authorization` header does not cost a second round trip on
every request.

## The client

`@kromatv/client` carries a route (`client.route`): the configured base, and a
direct base once one is in use. API requests go to the direct base; a request
there that fails before an answer, or is still waiting when the route is dropped,
drops the route and is sent again on the configured base when it is idempotent
(`GET`, `HEAD`, `OPTIONS`, `PUT`, `DELETE`). A `POST` is not sent twice: the
server may already have acted on it.

Media URLs (streams, artwork) follow the direct route only when the client was
built with `directMedia`. `client.baseUrl` stays the configured base: it names
the server in storage and in query keys.

`connectDirect` in `@kromatv/core` is one attempt: ask the offer, race
`/api/health` on every route for the same `instanceId` (1.5 s each), require the
answer from the first that replies, then switch. `startDirectConnection` decides
when to try: on sign-in, when told the network is back, on coming back to the
foreground after a minute away, and every five minutes while on the configured
base. Signing out drops the route. `useDirectConnection` in `@kromatv/ui` binds
it to React with the engine's foreground and `online` signals.

## What each shell does

| shell | direct API | direct media | when |
| --- | --- | --- | --- |
| web, on a public https origin | yes | no | Chrome's `local-network` permission is `granted`; on `prompt`, an offer whose button runs the probe |
| web, served on a private address or `.local` | already direct | already direct | nothing to do |
| tv-web (`https://tv.kroma.tv`) | yes | no | only once `local-network` is `granted`; no offer on a television |
| Tizen, webOS (packaged, loaded off the set) | yes | yes | always |
| desktop (Tauri) | yes | yes | always |
| tv-native (Apple TV, Android TV) | yes | yes | always |
| mobile (iOS, Android) | yes | yes | always, and again on every network change (expo-network) |

Every television shell, and the desktop one, shares `@kromatv/tv`, which also
asks again whenever its health loop sees the server come back.

Safari and Firefox have no Local Network Access permission, so an https page
there cannot reach an `http://` address at all; the web shell does nothing. The
platform facts behind this table are in
[reference/direct-connection-platforms.md](reference/direct-connection-platforms.md).

The web shell names the route in the sidebar, under the build stamp:
*Connexion directe (192.168.1.2)*.

## The trade-off

On the LAN the bearer and the media travel over plain http, exactly as when the
server is opened at `http://192.168.1.2:4040`. Anyone who can watch or redirect
traffic on that network can read them. The proof keeps a client from handing
its bearer to a host on another network; it does nothing against someone already
on yours. An operator who does not accept that turns the setting off.

Two narrower limits:

- a router that rewrites the source of port-forwarded traffic to its own LAN
  address makes a request from the internet look private. A relay would then
  pass the proof, provided it also sits on the client's network at the route's
  address. Do not forward the server's port with source NAT.
- a media URL built while direct keeps the LAN address. A film started at home
  stops if the phone leaves the network mid-play; the next one is built on the
  public base.
