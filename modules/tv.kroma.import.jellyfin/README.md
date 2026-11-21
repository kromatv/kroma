# Jellyfin import

Brings a household over from a Jellyfin server. The module answers the core's
`importer` point: it signs in to Jellyfin as an administrator and describes what
it finds. The core decides what each thing becomes and does every write, so the
module holds no account, no library and no watch state of KROMA.

Layout: `server/` (the crate), `module.json` (manifest), `audit.json` (what
`kroma audit` asks of it). See `modules/README.md` for the authoring guide, and
[the point's contract](../README.md#answering-the-importer-point).

## What it reads

| The core asks | The module calls | It answers |
| --- | --- | --- |
| `connect` | `GET /System/Info/Public`, then `POST /Users/AuthenticateByName` | the sign-in it keeps, and the one server it reaches |
| `survey` | `GET /Library/VirtualFolders`, `GET /Users`, `GET /Items/Counts`, `GET /Items` to count | libraries with folders and kind, users with their libraries and limits, counts, what stays behind |
| `titles` | `GET /Items` | films and episodes with their files, ids, and the show of each episode, then each whole show, for the favourite on it |
| `states` | `GET /Items` with the user's data | watched, play count, resume point, last played, favourite |
| `plays` | `GET /Users`, `GET /Items` | one play for each title a user watched or started |
| `unlock` | nothing | `refused` as `notLocked`: an administrator reads every user, so no user is locked |
| `forget` | nothing | nothing: the sign-in is deleted here |

Every endpoint, with the fields read and the source of each fact, is in
[`docs/reference/jellyfin-api.md`](../../docs/reference/jellyfin-api.md).

## It only reads

Each call the module can make is a row of one table, `server/src/dialect.rs`.
All of them are a `GET` but the sign-in. The sign-in is the one call that
leaves something on the Jellyfin server: a device named KROMA and its token,
as for any client that signs in. A test holds the table to that, and another
runs a whole import and checks each call against the table.

The module does not sign out, because that would be a second write. A later
sign-in from the same KROMA makes Jellyfin replace the token. An administrator
can also remove the device named KROMA in Jellyfin.

It sends the token in `Authorization: MediaBrowser` and in no other place.
Jellyfin 12.0 reads the older headers only when its legacy setting is on.

## The sign-in

- **Address.** Left empty, the module looks for a Jellyfin on the machine
  KROMA runs on, at `http://127.0.0.1:8096`. A KROMA in a container does not
  see the NAS there, and the owner types the address.
- **Who.** The account must be an administrator of the Jellyfin server. Only
  an administrator reads the libraries' folders and every user's watch state.
- **What is kept.** The address, the server's id, the user's id and the token,
  in the module's own database. The password is sent once and not kept.
  Removing the module removes all of it.
- **A redirect is not followed.** The password and the token go to the address
  the owner gave. When that address redirects, the refusal says where to.

A refusal carries one of the point's reasons, for the client to word in the
owner's language. Its `message`, when there is one, is a name or an address and
no sentence: the point gives an importer no language to write one in.

## What does not come over exactly

- **Plays.** Jellyfin keeps the last play of each title for each person, and
  no older one. A title watched three times comes over as one play.
- **Watch state on a later import.** Jellyfin cannot list what changed since a
  time, so the module answers every state again. The core's merge makes the
  repeat harmless.
- **A user limited by more than libraries** is named with each limit:
  `rating`, `tag`, `schedule`, `blockedFolders`, and `disabled` for an account
  that is switched off. The core gives that user no library until the owner
  chooses.
- **E-mail addresses.** Jellyfin has none for a user.

## Another dialect

Emby speaks an API of the same family. The paths, how the server says what it
is, the default address and the authorization scheme are the rows of `Dialect`
in `server/src/dialect.rs`, and `EMBY` is the second one. The module
`tv.kroma.import.emby` runs this crate's routes with it (`routes_for`). A change
here reaches both importers; a change to the Emby module alone reaches Emby
alone.
