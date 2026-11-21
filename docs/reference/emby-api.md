# Emby API: what the importer relies on

What `tv.kroma.import.emby` relies on in an Emby server: where its API lives, how
a client names itself, and each endpoint the importer calls with the fields it
reads. The module reads Emby through the Jellyfin importer's Emby dialect
(`EMBY` in `modules/tv.kroma.import.jellyfin/server/src/dialect.rs`), so this
page says where Emby differs from [`jellyfin-api.md`](jellyfin-api.md) and
leans on it for the rest. Each fact names its source. Read 2026-11-21.

**No fact here was checked against a running server.** Each one was read in
Emby's developer documentation. The module's tests run against answers written
from these shapes.

## Sources

- **I**: "REST API Documentation",
  <https://dev.emby.media/doc/restapi/index.html>.
- **U**: "User Authentication",
  <https://dev.emby.media/doc/restapi/User-Authentication.html>.
- **B**: "Browsing the Library",
  <https://dev.emby.media/doc/restapi/Browsing-the-Library.html>.
- **R**: the API reference, one page per operation, under
  <https://dev.emby.media/reference/RestAPI/>. A fact names the page, such as
  `UserService/getUsersQuery`.
- **M**: the API reference, one page per type, under
  <https://dev.emby.media/reference/pluginapi/>. A fact names the type, such as
  `MediaBrowser.Model.Users.UserPolicy`.

## Versions

None of these pages names the server version it describes. Their footer reads
"Copyright 2022".

## Where the API is

- "The Emby Server API can be reached via: `http[s]://hostname:port/emby/{apipath}`"
  (I). Every path the importer calls starts with `/emby/`.
- The documentation's examples call `http://localhost:8096/emby/...` (B). The
  importer looks for an Emby on the machine KROMA runs on at
  `http://127.0.0.1:8096`, as it does for a Jellyfin.

## How a client names itself

- The header is named `Authorization` or `X-Emby-Authorization`, and its value
  is `Emby UserId="(guid)", Client="(string)", Device="(string)",
  DeviceId="(string)", Version="string", Token="(string)"` (R
  `UserService/postUsersAuthenticatebyname`). U gives the same pairs without
  `Token`, and `UserId` only "if there is one".
- After the sign-in, U says to send the token in `X-Emby-Token`. R puts it in
  the header as `Token`. The importer sends one header, `Authorization: Emby`,
  with `Token` once it has one, which is how it talks to Jellyfin too, under
  Jellyfin's scheme. It sends no `UserId`.
- Neither page says whether a value is URL-decoded. The importer encodes each
  value as it does for Jellyfin. The values it makes up (`KROMA`, a hexadecimal
  device id, its version) hold no character that encoding changes. The token is
  Emby's own.

## Finding the server

- `GET /System/Info/Public` answers `PublicSystemInfo`: `LocalAddress`,
  `LocalAddresses`, `WanAddress`, `RemoteAddresses`, `ServerName`, `Version` and
  `Id` (R `SystemService/getSystemInfoPublic`). It has no `ProductName`, which
  is what the Jellyfin importer checks. The Emby importer takes any answer with
  an `Id` that does not call itself `Jellyfin Server`, and the Jellyfin importer
  refuses one that names no product.
- U says to keep a token with the server's `Id`, from the `SystemInfo` object.
  The importer keeps the token with the `Id` of `PublicSystemInfo`.

## Sign-in

- `POST /Users/AuthenticateByName` with a JSON body `Username` and `Pw` (R
  `UserService/postUsersAuthenticatebyname`). U says "pw - password in plain
  text".
- "A 200 status code indicates success, while anything in the 400 or 500 range
  indicates failure" (U, R).
- The answer is `AuthenticationResult`: `User`, `SessionInfo`, `AccessToken` and
  `ServerId` (R, same page). The importer reads `AccessToken`, `User.Id` and
  `User.Policy.IsAdministrator`.
- `POST /Sessions/Logout` revokes the token (U). The importer never calls it,
  as it never signs out of Jellyfin.
- A 401 on a later call "is generally an indication that the access token has
  been revoked" (U). `GET /System/Info` needs a signed-in user (R
  `SystemService/getSystemInfo`), and the importer calls it to tell a revoked
  token from a library its user may not open. The reference has no
  `/Users/Me`, which Jellyfin answers to the same question.

## What the importer reads

| The importer asks | Emby call | What it reads | Source |
| --- | --- | --- | --- |
| the users | `GET /Users/Query` | `Items[]`: `Id`, `Name`, `Policy` | R `UserService/getUsersQuery`, "Requires authentication as administrator" |
| the libraries | `GET /Library/VirtualFolders/Query` | `Items[]`: `Name`, `Locations`, `CollectionType`, `ItemId` | R `LibraryStructureService/getLibraryVirtualfoldersQuery` |
| how much there is | `GET /Items/Counts` | `MovieCount`, `EpisodeCount`, `BoxSetCount`, `ProgramCount` | R `LibraryService/getItemsCounts` |
| titles, watch state, plays, counts | `GET /Items` | `Items[]` and `TotalRecordCount` | R `ItemsService/getItems` |

- Emby lists users and libraries as a page, `{ Items, TotalRecordCount }`, where
  Jellyfin answers `GET /Users` and `GET /Library/VirtualFolders` with a bare
  array. The reference has no `GET /Users` and no `GET /Library/VirtualFolders`.
  The importer reads either shape.
- `GET /Items` takes `UserId`, `Recursive`, `IncludeItemTypes`, `ParentId`,
  `Ids`, `Fields`, `Filters`, `SortBy`, `SortOrder`, `StartIndex`, `Limit`,
  `EnableImages` and `EnableUserData` (R `ItemsService/getItems`). The importer
  writes them in Jellyfin's spelling (`userId`, `parentId`). B writes the same
  parameter both ways, `parentId={ViewId}` and `ParentId=20aef3be-...`.
- `Filters` takes `IsPlayed`, `IsUnplayed` and `IsResumable`, among others.
  `SortBy` takes `DateCreated` and `SortName`. `Fields` takes `Path` and
  `ProviderIds` (R, same page).
- A user's `Policy` is `UserPolicy` (M `MediaBrowser.Model.Users.UserPolicy`):
  `IsAdministrator`, `IsDisabled`, `EnableAllFolders`, `EnabledFolders`,
  `MaxParentalRating`, `BlockUnratedItems`, `BlockedTags`, `IncludeTags`,
  `IsTagBlockingModeInclusive`, `AccessSchedules` and `ExcludedSubFolders`. The
  reference describes none of the last five beyond its name and type. The
  importer names a user with any of `MaxParentalRating`, `BlockUnratedItems`,
  `BlockedTags`, `IncludeTags`, `AccessSchedules` or `ExcludedSubFolders` set as
  limited by `rating`, `tag`, `schedule` or `blockedFolders`, and the core gives
  that user no library until the owner chooses. Emby has no
  `BlockedMediaFolders`, `AllowedTags` or `MaxParentalSubRating`, which Jellyfin
  has.
- An item is `BaseItemDto` (M `MediaBrowser.Model.Dto.BaseItemDto`): `Id`,
  `Name`, `Type`, `Path`, `ProductionYear`, `ProviderIds`, `IndexNumber`,
  `ParentIndexNumber`, `SeriesName`, `SeriesId`, `RunTimeTicks`, `MediaSources`
  and `UserData`.
- `UserData` is `UserItemDataDto` (M `MediaBrowser.Model.Dto.UserItemDataDto`):
  `PlaybackPositionTicks`, `PlayCount`, `IsFavorite`, `Played` and
  `LastPlayedDate`. As with Jellyfin, the last play is the only one, so an
  import brings one play per title per person.

## Open questions

- R marks every operation "Requires authentication as user", the sign-in and
  `GET /System/Info/Public` included. That reads as a default the reference
  prints on each page: U has a client call `/Users/Public` and the sign-in
  before it holds a token. The importer calls `/System/Info/Public` before the
  sign-in, with no header.
- `EnableTotalRecordCount` is not a parameter of `GET /Items` in R. The importer
  sends it as it does to Jellyfin, and counts read `TotalRecordCount`. Whether
  Emby fills it when `Limit` is `0` is not said.
- `BaseItemDto` has no `MediaSourceCount`, and `MediaSources` is not among the
  `Fields` options. The importer finds a title kept in two versions by
  `MediaSourceCount`, so an Emby title comes over with the path `Path` names
  and no other.
- Whether a user's `EnabledFolders` holds the same ids as a library's `ItemId`.
  Jellyfin's do. M gives both as strings and says nothing more.
- Finding an Emby on the network, as for Jellyfin, waits on a module holding a
  socket (#757).
