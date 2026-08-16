# Accounts

Status: **DRAFT** — skeleton only, nothing here is agreed yet.

Who is using the server, what they may see, and how a device proves it is them.

## Scope

- Account model: owner vs additional users, and whether profiles exist under an account
- Authentication: credentials, sessions, session lifetime, revocation
- Devices: how a device is bound to an account and how it is unbound
- Authorisation: per-user library visibility, admin rights, module install rights
- What is per-user and what is per-server (watch state, settings, preferences)
- Account deletion: what is destroyed, what survives

## Open questions

- Are profiles a separate concept from users, or the same thing named twice?
- Does a revoked device lose downloaded content, and can it?

## Must answer

- [ ] The permission matrix: which roles may do what
- [ ] Session lifetime on a television, which cannot practically re-authenticate often

## Not in scope

The pairing handshake itself is [`discovery.md`](discovery.md).
