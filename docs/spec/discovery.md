# Discovery

Status: **DRAFT** — skeleton only, nothing here is agreed yet.

How a client finds a server it was never told about, and how a television — which has no
keyboard worth using — becomes signed in.

## Scope

- Finding a server on the local network, and what "the same network" is allowed to mean
- Which shells can listen on the link themselves, and which must be told an address
- Manual connection: address entry, remote access, what is supported outside the LAN
- The pairing handshake: initiating, displaying, confirming, expiring
- Trust: what a paired television may do without further confirmation

## Existing material

`docs/tv-pairing.md` already documents the three roads a television takes to an account.
That document is the raw material for this spec file — this file should state the
*product* rules and defer the mechanics to it, not duplicate them.

## Must answer

- [ ] What a user does when discovery finds nothing, on each shell
- [ ] Pairing code lifetime, and what a user sees when it expires mid-flow

## Not in scope

What the account itself means is [`accounts.md`](accounts.md).
