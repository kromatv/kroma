# Plex: what the Plex importer relies on

What `tv.kroma.import.plex` relies on when it signs in to plex.tv and reads a
Plex Media Server. Each fact names its source and how it is known. Read
2026-11-18.

**Nothing here was run against plex.tv or a real server.** Each fact is either
documented by Plex or read in the source of a project that ships against Plex.
The answers in the module's tests are written from these shapes. The
[open questions](#open-questions) list what a real server has to confirm, and
the first one is the check issue #750 asks for.

## Sources

- **F**: "Authenticating with Plex", a post by a Plex forum administrator,
  2020-07-01, <https://forums.plex.tv/t/authenticating-with-plex/609370>.
  Plex's own description of the PIN sign-in.
- **D**: Plex Media Server API documentation, version 1.2.3,
  <https://developer.plex.tv/pms/>. The conventions chapter was read: headers,
  the response format and pagination. The page shows an endpoint's detail only
  in a browser, so no endpoint below is cited from it.
- **P**: [python-plexapi](https://github.com/pushingkarmaorg/python-plexapi) at
  `aa5bf674` (master on 2026-10-26, after release 4.18.3). Files are under
  `plexapi/`.
- **T**: [Tautulli](https://github.com/Tautulli/Tautulli) at `5bab508b` (master
  on 2026-11-10). Files are under `plexpy/`.

P and T parse XML, which is the default format of both plex.tv and a server
(D: "The default is XML, so JSON will only be returned if it's explicitly
requested"). The importer reads XML everywhere for that reason: every element
and attribute name below is one P or T reads. An attribute is a string, a flag
is `1` or `0`, a time is unix seconds and a duration or an offset is
milliseconds.

## Every call the importer makes

One call creates something: the PIN, which is the sign-in itself. Every other
call is a `GET`.

| # | Call | Host | For |
|---|---|---|---|
| 1 | `POST /api/v2/pins` | plex.tv | start a sign-in |
| 2 | `GET /api/v2/pins/{id}` | plex.tv | ask whether the owner approved it |
| 3 | `GET /api/v2/user` | plex.tv | who signed in |
| 4 | `GET /api/v2/resources` | plex.tv | the account's servers and how to reach each |
| 5 | `GET /api/users` | plex.tv | the people the account shares with, and its Home |
| 6 | `GET /api/servers/{machineId}/shared_servers` | plex.tv | each person's token and libraries for one server |
| 7 | `GET /identity` | server | prove an address is the server that was picked |
| 8 | `GET /library/sections` | server | the libraries, their kind and folders |
| 9 | `GET /library/sections/{key}/all` | server | titles, watch state, and how many there are |
| 10 | `GET /library/metadata/{ids}` | server | the shows of a page of episodes |
| 11 | `GET /status/sessions/history/all` | server | the plays |
| 12 | `GET /playlists` | server | whether playlists exist |
| 13 | `GET /livetv/dvrs` | server | whether Live TV is set up |

The importer never calls `DELETE /status/sessions/history/{id}` (P,
`base.py`, `PlexHistory.delete`), `POST /api/v2/users/signout`, the device
endpoints T deletes through, or any `PUT`.

## Headers

- `X-Plex-Token` carries the token, as a header (D: "the token is expected to
  be sent in the `X-Plex-Token` header"; P, `server.py`, `_headers`). The
  importer never puts it in a URL, so it reaches no log and no journal.
- `X-Plex-Client-Identifier` is "an opaque identifier unique to the client" and
  "typically required" (D). F: "A random string or UUID is sufficient", and
  "the client should store and re-use this identifier". The importer makes one
  per install and keeps it.
- `X-Plex-Product` names the app. F: it "will be visible in the user's
  Authorized Devices view" and "should be different from any existing Plex
  products". The importer sends `KROMA`.
- `X-Plex-Container-Start` and `X-Plex-Container-Size` ask for a window of a
  list (D: "add two headers to specify the starting offset and the number of
  desired items"; P, `base.py`, `fetchItems`). The answer's `MediaContainer`
  has `size`, and "an optional `totalSize` attribute for the total number of
  elements in the collection" (D).

## The sign-in

Sources: F for the flow, P `myplex.py` `MyPlexPinLogin` and T `plextv.py`
`get_plextv_pin` for the fields.

1. `POST https://plex.tv/api/v2/pins` with the form field `strong=true` and the
   client identifier and product headers. The answer is a `pin` element. The
   importer reads `id` and `code` (P `_getCode`, T `get_pin`).
2. The owner opens
   `https://app.plex.tv/auth#?clientID=<identifier>&code=<code>&context%5Bdevice%5D%5Bproduct%5D=<product>`
   (F) and approves the sign-in there. Nobody types a password into KROMA.
3. `GET https://plex.tv/api/v2/pins/{id}` with `code` and the same client
   identifier (F). `authToken` is empty until the owner approves, then holds
   the account's token (F: it "will remain `null`" on a failed sign-in; P
   `_checkLogin`, T `get_pin`).

How long a PIN lives is not in F, P or T. F says only that it is
"time-limited". The importer stops asking after 15 minutes, which is its own
limit and not Plex's. Inferred: a `404` on step 3 means the PIN is gone, and
the importer answers that the sign-in expired.

`GET https://plex.tv/api/v2/user` answers `200` for a valid token and `401` for
an invalid one (F). The `user` element has `id`, `uuid`, `username`, `title`
and `email` (P `myplex.py`, `MyPlexAccount._loadData`).

A token from this flow does not expire by date. D says a JWT token, the newer
kind, "expire[s] after 7 days but can be refreshed at any time", and that flow
needs a device key the importer does not have (P `MyPlexJWTLogin`). When
plex.tv answers `401`, the importer says the sign-in is no longer valid, and
the owner signs in again.

## The account's servers

`GET https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1&includeIPv6=1`
(P `myplex.py`, `MyPlexResource.key`). Each `resource` element has `name`,
`clientIdentifier`, `provides`, `owned` and `accessToken`, and a `connections`
child holding `connection` elements with `protocol`, `address`, `port`, `uri`,
`local`, `relay` and `IPv6` (P `MyPlexResource._loadData`,
`ResourceConnection._loadData`).

- A server is a resource whose `provides` holds `server`. Its
  `clientIdentifier` is the server's machine identifier, the same value
  `/identity` answers (P `server.py`, `Identity`; T `get_server_connections`).
- `owned="1"` marks a server the account owns (T `discover`). The importer
  offers only those: the list of shared users (call 6) is the owner's to read.
- `accessToken` is the token for that server (P, T `get_server_token`).
- P tries connections in the order local, remote, relay, and `https` before
  `http` (`DEFAULT_LOCATION_ORDER`, `DEFAULT_SCHEME_ORDER`), and builds
  `http://{address}:{port}` beside the listed `uri` (`httpuri`). The importer
  keeps that order, with two rules of its own: plain `http` only for a
  connection marked `local`, and outside the local network only a
  `*.plex.direct` name, which is what `includeHttps=1` lists.
- Before it sends a token to an address, the importer asks `GET /identity`
  there and compares `machineIdentifier` with the server that was picked (P
  `server.py`, `identity`: `claimed`, `machineIdentifier`, `version`; T
  `get_local_server_identity`).

## The people

`GET https://plex.tv/api/users` (P `MyPlexUser.key`, T `get_plextv_friends`).
Each `User` element has `id`, `title`, `username`, `email`, `home`,
`restricted`, `protected`, `filterAll`, `filterMovies` and `filterTelevision`,
and one `Server` child per server shared with that person, with
`machineIdentifier`, `allLibraries`, `numLibraries`, `owned` and `pending` (P
`MyPlexUser._loadData`, `MyPlexServerShare._loadData`).

- Home users are in this list: P finds the user to switch to in it
  (`switchHomeUser` calls `user`, which reads `users`), and T reads `home` and
  `restricted` from it.
- `restricted="1"` is a managed user, who has a `title` and no `username` or
  `email`. Inferred from P `user`, which matches a home user by `title` alone.
- `protected="1"` is a Home user with a PIN. P's own docstring calls the
  attribute "Unknown", but `switchHomeUser` documents the PIN as "required if
  the home user has a PIN set". That `protected` is that flag is inferred from
  the name and from `MyPlexAccount._loadData`, which reads `protected` beside
  `pin`. See the open questions.
- A filter is a string such as `contentRating=G%2CPG|label=foo`: keys
  `contentRating` and `label`, each optionally ending in `!`, joined by `|` (P
  `_filterDictToStr`). A person with a non-empty `filterAll`, `filterMovies` or
  `filterTelevision` is limited more finely than by library.

`GET https://plex.tv/api/servers/{machineId}/shared_servers` (P
`MyPlexAccount.FRIENDINVITE`, read by `MyPlexUser.get_token`; T
`get_plextv_shared_servers`). Each `SharedServer` element has `userID`,
`accessToken`, `username`, `email` and `allLibraries`, and `Section` children
with `key`, `title`, `type` and `shared`.

- `accessToken` is that person's token for the server. P returns it from
  `get_token` for the row whose `userID` is the user's `id`. T joins the two
  lists the same way and uses it as the user's `server_token`.
- A person's libraries are the `Section` children with `shared="1"`, by `key`
  (T `get_full_users_list`). `key` is the library's `key` in
  `/library/sections`: P asks the history of one shared library with it as
  `librarySectionID` (`Section.history`).
- That token reads the person's own watch state: a server answers
  `viewCount`, `viewOffset` and `lastViewedAt` for the account whose token the
  call carries. RFC 719 found this. T asks the server with a user's
  `server_token` in place of the owner's for the same reason (`pmsconnect.py`,
  `PmsConnect.__init__`).

## Libraries, titles and watch state

`GET /library/sections` answers `Directory` elements with `key`, `type` and
`title`, and `Location` children with `path` (P `library.py`,
`LibrarySection._loadData` and `locations`; T `get_libraries_list`). `type` is
`movie` or `show` for what KROMA plays (P `MovieSection.TYPE`,
`ShowSection.TYPE`).

`GET /library/sections/{key}/all?type=N&includeGuids=1` (P `library.py`,
`LibrarySection.search`; T `get_library_list`). `type` is `1` for films, `2`
for shows, `4` for episodes and `18` for collections (P `utils.py`,
`SEARCHTYPES`). Each `Video` element has:

- `ratingKey`, `type`, `title`, `year`, `duration`, `viewCount`, `viewOffset`
  and `lastViewedAt` (P `video.py`, `Video._loadData` and `Movie._loadData`).
  `viewCount` defaults to 0 and `viewOffset` to 0.
- for an episode, `index`, `parentIndex`, `grandparentTitle` and
  `grandparentRatingKey` (P `Episode._loadData`). The season number is
  `parentIndex` (P `seasonNumber`).
- `Media` children with `Part` children, whose `file` is the path as the
  server sees it (P `media.py`, `MediaPart`; `video.py`, `locations`).
- `Guid` children whose `id` is `imdb://tt0944947`, `tmdb://1399` or
  `tvdb://121361` (P `media.py`, `Guid`; `library.py`, the `getGuid`
  docstring). `includeGuids=1` asks for them (P `base.py`, `_buildQueryKey`).

`GET /library/metadata/{id},{id},...?includeGuids=1` answers several items at
once (P `base.py`, `fetchItems`: a list of ids "will be translated to
/library/metadata/<key1,key2,key3>"). The importer reads a page's shows this
way, for the year a show started and its ids, which an episode does not carry.

With `X-Plex-Container-Size: 0` the answer holds no item and still has
`totalSize`, which is how P counts a library (`totalViewSize`).

Plex has no favourite on a film or an episode, so the importer reports none.
A library whose agent is one of the old ones gives a title no `Guid` child.
Its id is then in the `guid` attribute, in a form none of the sources above
describes, and the importer does not read it. Such a title is matched by its
file, or by its name.

## Plays

`GET /status/sessions/history/all?sort=viewedAt:desc`, with `viewedAt>=N` for
the plays at or after a time (P `server.py`, `history`). Each element has
`historyKey`, `ratingKey`, `type`, `viewedAt` and `accountID` (P `base.py`,
`PlexHistory._loadData`; `video.py`, `Video._loadData`).

- `historyKey` is `/status/sessions/history/<id>` and names one play (P, the
  `PlexHistory` docstring). The importer uses it as the play's id.
- The history has a time and no duration (RFC 719).
- `accountID` is the person's plex.tv id, except that on the server the owner
  is account `1` (P `server.py`, `bandwidth`: "The admin account is
  accountID=1"; T `pmsconnect.py`, `get_session_each`: `if user_id == '1':  #
  Admin user`). The importer answers the owner's plex.tv id for it.
- Inferred: a play of a title that was deleted since has no `ratingKey`. The
  importer skips a play with none.

`GET /playlists` lists the playlists (P `server.py`, `playlists`).
`GET /livetv/dvrs` lists the tuners (T `pmsconnect.py`, `get_dvrs`). The shape
of that second answer is in neither source: the importer reads only whether the
container holds anything.

## Open questions

Each one needs a real server. None was answered here.

1. **Does a managed Home user with no PIN appear in call 6 with a token?**
   This is the check issue #750 puts first, and RFC 719 could not settle it. T
   gives every user of call 5 the token of the call 6 row with the same id, and
   tracks managed users, which suggests yes. To check: with the owner's token,
   read call 5 and note the `id` of a user with `home="1"`, `restricted="1"`
   and `protected="0"`. Then read call 6 and look for a `SharedServer` whose
   `userID` is that id and whose `accessToken` is not empty.
   - If yes, the importer already brings that person's watch state.
   - If no, the importer lists that person with a locked state, and the
     fallback is `POST https://plex.tv/api/home/users/{id}/switch`, which
     answers `authenticationToken` (P `switchHomeUser`). The importer does not
     make that call today.
2. **Is `protected="1"` the PIN flag, and does call 6 still give that person's
   token?** The importer reports a `protected` Home user as needing a PIN and
   reads none of their watch state, whether or not call 6 lists a token for
   them. Issue #774 adds the PIN.
3. **Does a PIN that ran out answer `404` on call 2?**
4. **What does `/livetv/dvrs` answer on a server with no tuner, and on one with
   no Plex Pass?**
5. **Does `sort=viewedAt:desc` keep one order between two pages when two plays
   share a second?** A play seen twice is harmless, since its id is the same.
