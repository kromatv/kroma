# Plex import

Brings a household over from a Plex Media Server. The module answers the core's
`importer` point: it signs in to plex.tv, reads one of the account's servers,
and describes what it found. The core decides what each thing becomes and does
every write. See [RFC 719](../../docs/rfcs/719-guided-setup-and-import.md) and
[the contract](../README.md#answering-the-importer-point).

Layout: `server/` is the crate, `server/fixtures/` the Plex answers its tests
run against, `module.json` the manifest, `audit.json` what `kroma audit` asks
it. Every Plex call the code makes is in
[`docs/reference/plex-api.md`](../../docs/reference/plex-api.md), with its
source.

## What it reads

| Method | From Plex |
|---|---|
| `connect` | a PIN sign-in on plex.tv, then the servers the account owns |
| `survey` | the libraries with their folders and kind, the people the server is shared with, how many titles and plays there are |
| `titles` | films and episodes with their files, year and TMDB, IMDb and TVDB ids |
| `states` | watched flags, play counts and resume points, per user |
| `plays` | the server's play history, for every user |
| `forget` | nothing. It deletes the sign-in from its own database |

The owner never types a password into KROMA. `connect` answers a link to
plex.tv, the owner approves the sign-in there, and the core asks again until
plex.tv says so. The module stops asking after 15 minutes.

## It only reads

One call creates something: `POST /api/v2/pins`, the PIN that is the sign-in.
Plex shows the result as a device named KROMA under the account's authorized
devices. Every other call is a `GET`. The test
`a_whole_import_changes_nothing_at_plex_the_pin_of_the_sign_in_apart` runs a
whole import and fails on any other verb.

`forget` does not sign out at plex.tv, because that call would change the
account. The token is gone from KROMA, and the owner can remove the device on
plex.tv.

## What it may reach

```json
{ "purpose": "plex-account", "to": ["plex.tv"], "ports": [443] }
{ "purpose": "plex-server", "to": ["lan", "*.plex.direct"] }
```

plex.tv lists each server at a `*.plex.direct` name, and at its address on the
local network. The module tries the local address first, then the remote one,
then Plex's relay. Before a token goes to an address, the module asks
`/identity` there and checks it is the server the owner picked.

Two limits follow from that declaration:

- A server reachable only at a custom address, such as a reverse proxy on the
  owner's own domain, is not reached from outside its network.
- Plain HTTP is used only on the local network. No token crosses the internet
  unencrypted.

The module has its own database for the sign-in and declares no slice of the
core database. It keeps the account's token, each server's token, and the token
plex.tv lists for each shared user, so that a page of watch state costs one
call. Removing the module removes all of them.

## People

The owner's sign-in reads every shared user: plex.tv lists a token per user for
the server, and that token reads the user's own watch state.

- A user limited by rating or label comes with `finerLimits`, and the core
  gives them no library until the owner chooses.
- A Home user protected by a PIN comes with `stateLocked` and
  `stateNeeds: "pin"`. The module reads none of their watch state. Issue #774
  adds the PIN.
- A Home user plex.tv lists no token for comes with `stateLocked` and nothing
  to open it.

## Not checked against a real server

No test here talks to plex.tv or to a server, so the Plex facts come from
Plex's documentation and from python-plexapi and Tautulli. The reference lists
five open questions. The first is the one issue #750 asks for: whether a
managed Home user with no PIN appears in the owner's list of shared users with
a token. If not, that user's watch state stays behind until the module makes
the Home switch call.

## What stays behind

Playlists, collections and Live TV are named in the survey when the server has
them. The Plex watchlist is always named: it is on the account, where the
module does not look. Plex has no favourite on a film, so none is reported. A
library still on one of Plex's old agents gives no external id, and its titles
match by file or by name.

The module has no page and no text of its own to translate. A refusal carries a
reason the core words, and the contract passes no language to word one in.

The icon is the Plex mark from [Simple Icons](https://simpleicons.org).
