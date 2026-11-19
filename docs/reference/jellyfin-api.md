# Jellyfin API: what the importer relies on

What `tv.kroma.import.jellyfin` relies on in a Jellyfin server: how a client
names itself, where the server is found, and each endpoint the importer calls
with the fields it reads. Each fact names its source. Read 2026-11-18.

**No fact here was checked against a running server.** Each one was read in the
server's source or in a document of the Jellyfin project. The module's tests
run against answers written from these shapes.

## Sources

- **S**: the Jellyfin server source at tag `v12.4`,
  <https://github.com/jellyfin/jellyfin/tree/v12.4>. A fact names the file it
  was read in, by its path in that tree.
- **A**: "Jellyfin API Authorization", by a member of the Jellyfin team,
  <https://gist.github.com/nielsvanvelzen/ea047d9028f676185832e51ffaf12a6f>.
- **N**: Jellyfin documentation, "Networking",
  <https://jellyfin.org/docs/general/post-install/networking/>.
- **L**: Jellyfin documentation, "Libraries",
  <https://jellyfin.org/docs/general/server/libraries/>.
- **R**: the release list of the server,
  <https://github.com/jellyfin/jellyfin/releases>.
- **T**: .NET documentation, `TimeSpan.Ticks`,
  <https://learn.microsoft.com/en-us/dotnet/api/system.timespan.ticks>.

## Versions

- 12.4 is the newest release, published 2026-10-26. 12.0 was published
  2026-09-08 (R).
- Every fact marked S was read at `v12.4`. A server older than 12.0 was not
  read.

## How a client names itself

- The header is `Authorization: MediaBrowser`, then pairs separated by commas:
  `Client`, `Device`, `DeviceId`, `Version` and `Token` (A).
- A value is in double quotes and URL-encoded. The server trims the quotes and
  URL-decodes it (A; S `Jellyfin.Server.Implementations/Security/AuthorizationContext.cs`).
- `Token` is the access token or an API key. A gives the header with no
  `Token` as the form for a call made before the sign-in.
- The server accepts the `MediaBrowser` scheme always. It accepts the `Emby`
  scheme only when its `EnableLegacyAuthorization` setting is on (S, same file).
- The older places for a token are the headers `X-Emby-Authorization`,
  `X-Emby-Token` and `X-MediaBrowser-Token` and the query parameter `api_key`.
  They "have subsequently been removed in Jellyfin 12.0" (A). At `v12.4` the
  server reads them only when `EnableLegacyAuthorization` is on (S, same file).
  The importer sends none of them.
- The server finds the token among its devices, then among its API keys. A
  call with a device's token sets that device's `DateLastActivity` when more
  than three minutes have passed, and stores the `Device` and `Version` of the
  header when they differ (S, same file). So a read leaves that trace.
- "Currently, the server permits only a single access token for each
  `deviceId`" (A). A sign-in looks up the devices with the same `DeviceId` and
  user, deletes each one with its token, and creates a new device
  (S `Emby.Server.Implementations/Session/SessionManager.cs`,
  `GetAuthorizationToken`).
- A recommends a `DeviceId` that is unique for each device and user, made from
  a hash of the user name. The importer makes its own from a random value it
  keeps and the user name.

## Finding the server

- The default port is 8096 over HTTP. Port 8920 is for HTTPS and "by default
  this port will not be used" (N).
- `GET /System/Info/Public` needs no sign-in (S
  `Jellyfin.Api/Controllers/SystemController.cs`). It answers
  `PublicSystemInfo`: `LocalAddress`, `ServerName`, `Version`, `ProductName`,
  `Id` and `StartupWizardCompleted` (S
  `MediaBrowser.Model/System/PublicSystemInfo.cs`).
- `ProductName` is the product name of the server's own assembly, which is
  `Jellyfin Server` (S `Emby.Server.Implementations/SystemManager.cs`,
  `Emby.Server.Implementations/ApplicationHost.cs`,
  `Jellyfin.Server/Properties/AssemblyInfo.cs`). The importer refuses a server
  that gives another name.
- `Id` is the server's own id. The sign-in answers the same value as
  `ServerId` (S `SystemManager.cs`, `SessionManager.cs`).

## Sign-in

- `POST /Users/AuthenticateByName` needs no sign-in. Its body is
  `{ "Username", "Pw" }` (S `Jellyfin.Api/Controllers/UserController.cs`,
  `Jellyfin.Api/Models/UserDtos/AuthenticateUserByName.cs`).
- It reads `Client`, `Version`, `DeviceId` and `Device` from the header, and
  refuses a sign-in that lacks one of them (S `UserController.cs`,
  `SessionManager.cs`).
- It answers `AuthenticationResult`: `User`, `SessionInfo`, `AccessToken` and
  `ServerId` (S `SessionManager.cs`).
- A wrong name or password is an `AuthenticationException`, which is HTTP 401.
  A device the user may not use, or too many sessions, is a
  `SecurityException`, which is HTTP 403 (S `SessionManager.cs`,
  `Jellyfin.Api/Middleware/ExceptionMiddleware.cs`).
- The body of an error is the plain text `Error processing request.`, not JSON
  (S `ExceptionMiddleware.cs`).
- **This is the one call that changes the server.** It creates a device with
  its token, deletes the device the same `DeviceId` and user had, and records a
  session for it (S `SessionManager.cs`). The importer has no call that signs
  out.

## Users

- `GET /Users` needs a sign-in and no more. It answers every user, ordered by
  name, as `UserDto` (S `UserController.cs`).
- `GET /Users/Me` answers the user of the token (S `UserController.cs`). The
  importer uses it to learn if a token still holds.
- `UserDto` has `Id`, `Name` and `Policy`. It has no e-mail address (S
  `MediaBrowser.Model/Dto/UserDto.cs`).
- `UserPolicy` (S `MediaBrowser.Model/Users/UserPolicy.cs`) has:
  - `IsAdministrator` and `IsDisabled`
  - `EnableAllFolders`, true for a new policy, and `EnabledFolders`, the ids of
    the libraries the user may open
  - `MaxParentalRating` and `MaxParentalSubRating`, each a number or absent
  - `BlockUnratedItems`, `BlockedTags` and `AllowedTags`
  - `AccessSchedules`, the hours the user may sign in
  - `BlockedMediaFolders`, a list of ids
- What `BlockedMediaFolders` does was not read. The importer treats a list
  that is not empty as a limit finer than a library.

## Libraries

- `GET /Library/VirtualFolders` needs an administrator (policy
  `FirstTimeSetupOrElevated`). It answers a list of `VirtualFolderInfo` (S
  `Jellyfin.Api/Controllers/LibraryStructureController.cs`).
- `VirtualFolderInfo` has `Name`, `Locations` (the folders), `CollectionType`
  and `ItemId` (S `MediaBrowser.Model/Entities/VirtualFolderInfo.cs`).
- `ItemId` is set only when the server has a library folder for the entry (S
  `Emby.Server.Implementations/Library/LibraryManager.cs`). The importer leaves
  out an entry with none.
- `CollectionType` is one of `movies`, `tvshows`, `music`, `musicvideos`,
  `homevideos`, `boxsets`, `books` and `mixed` (S
  `MediaBrowser.Model/Entities/CollectionTypeOptions.cs`). It is absent when the
  library has no type on disk (S `LibraryManager.cs`).
- The mixed type holds films and shows together, and the documentation
  discourages it (L).
- Inferred, not read: a library with no `CollectionType` is a mixed library.
  The importer reads `mixed` and an absent type as mixed.

## Items

`GET /Items` needs a sign-in (S `Jellyfin.Api/Controllers/ItemsController.cs`).
It answers `{ Items, TotalRecordCount, StartIndex }`.

The parameters the importer sends:

| Parameter | What it does | Source |
|---|---|---|
| `userId` | whose view and whose user data. Another user's id needs an administrator, else HTTP 403 | S `Jellyfin.Api/Helpers/RequestHelpers.cs` |
| `parentId` | the folder to list below. A library id is one | S `ItemsController.cs` |
| `recursive` | every item below, not only the children | S `ItemsController.cs` |
| `includeItemTypes` | `Movie`, `Episode`, `Playlist`, separated by commas | S `ItemsController.cs`, `Jellyfin.Data/Enums/BaseItemKind.cs` |
| `fields` | the optional fields to add, separated by commas | S `MediaBrowser.Model/Querying/ItemFields.cs` |
| `filters` | `IsPlayed`, `IsUnplayed`, `IsResumable` and others. Each one narrows the listing | S `MediaBrowser.Controller/Entities/InternalItemsQuery.cs` |
| `sortBy`, `sortOrder` | `DateCreated`, `SortName` and others. `SortName` is added last when it is not named | S `Jellyfin.Data/Enums/ItemSortBy.cs`, `Jellyfin.Server.Implementations/Item/BaseItemRepository.QueryBuilding.cs` |
| `startIndex`, `limit` | the page | S `BaseItemRepository.QueryBuilding.cs` |
| `enableTotalRecordCount` | count every row before the page is cut | S `Jellyfin.Server.Implementations/Item/BaseItemRepository.Querying.cs` |
| `enableUserData` | add `UserData` for the user | S `Emby.Server.Implementations/Dto/DtoService.cs` |
| `enableImages` | add image tags. The importer turns it off | S `ItemsController.cs` |
| `ids` | these items only, separated by commas | S `ItemsController.cs` |

- A parameter that takes a list reads values separated by commas (S
  `ItemsController.cs`, `CommaDelimitedCollectionModelBinder`).
- A `limit` of 0 answers no row. With a `limit`, `TotalRecordCount` is the
  count before the page is cut (S `BaseItemRepository.QueryBuilding.cs`,
  `BaseItemRepository.Querying.cs`).
- When the user may not see the folder `parentId` names, the answer is
  **HTTP 401**, the same status as a token the server no longer accepts (S
  `ItemsController.cs`). The importer tells the two apart with `GET /Users/Me`.
- The server does not check that `userId` names an enabled user (S
  `ItemsController.cs`).
- `IsPlayed` reads the user's `Played` flag. `IsResumable` reads a
  `PlaybackPositionTicks` above 0 (S
  `Jellyfin.Server.Implementations/Item/BaseItemRepository.TranslateQuery.cs`).
- `IsPlayed` and `IsUnplayed` together are refused (S `InternalItemsQuery.cs`).
- **No parameter lists the watch states that changed since a time.**
  `minDateLastSavedForUser` compares the item's own `DateLastSaved` and not the
  user's data (S `BaseItemRepository.TranslateQuery.cs`).
- An item that is a second version of another in the same library is left out
  of a listing (S `BaseItemRepository.QueryBuilding.cs`,
  `ApplyAlternateVersionFiltering`). A listing with `IsResumable` is the
  exception: it keeps the version played last (S
  `BaseItemRepository.TranslateQuery.cs`).

The fields of an item the importer reads (S `MediaBrowser.Model/Dto/BaseItemDto.cs`,
and `DtoService.cs` for when each is set):

| Field | When it is there |
|---|---|
| `Id`, `Name`, `Type` | always. `Type` is `Movie`, `Episode`, `Series` and others |
| `ProductionYear`, `RunTimeTicks` | always, when the server knows them |
| `IndexNumber`, `ParentIndexNumber` | always. For an episode they are the episode and the season |
| `SeriesName`, `SeriesId` | always, for an episode |
| `Path` | with `fields=Path` |
| `ProviderIds` | with `fields=ProviderIds`. The keys are `Imdb`, `Tmdb`, `Tvdb` and others (S `MediaBrowser.Model/Entities/MetadataProvider.cs`) |
| `MediaSourceCount` | with `fields=MediaSourceCount`, for a video, and only when it is not 1 |
| `MediaSources` | with `fields=MediaSources`. Each has a `Path` |
| `UserData` | with `enableUserData=true` and a user |

- `UserData` has `Played`, `PlayCount`, `PlaybackPositionTicks`, `IsFavorite`
  and `LastPlayedDate` (S `MediaBrowser.Model/Dto/UserItemDataDto.cs`).
- A tick "is equal to 100 nanoseconds", and "there are 10,000 ticks in a
  millisecond" (T).
- The user data of a title holds one count and one date. RFC 719 records that
  Jellyfin keeps no log of plays. So the importer gives one play for each title
  a user watched or started, at its `LastPlayedDate`.
- Not read: if a title marked as watched by hand gets a `LastPlayedDate`. The
  importer gives a title with no date a watch state and no play.

## Counts

- `GET /Items/Counts` needs a sign-in. It answers `ItemCounts` (S
  `Jellyfin.Api/Controllers/LibraryController.cs`,
  `MediaBrowser.Model/Dto/ItemCounts.cs`).
- `MovieCount` counts items of type `Movie`, `EpisodeCount` of `Episode`,
  `BoxSetCount` of `BoxSet` and `ProgramCount` of `LiveTvProgram` (S
  `Jellyfin.Server.Implementations/Item/ItemCountService.cs`).
- The importer reads a `BoxSetCount` above 0 as collections, and a
  `ProgramCount` above 0 as a television guide, which is Live TV in use.

## How an answer is written

- A property keeps the name it has in the source, such as `AccessToken`. A
  property that is null is left out (S
  `src/Jellyfin.Extensions/Json/JsonDefaults.cs`).
- An id is 32 hexadecimal digits with no dash (S
  `src/Jellyfin.Extensions/Json/Converters/JsonGuidConverter.cs`). A library's
  `ItemId` and the ids in `EnabledFolders` are written the same way, so the
  importer compares them as text.
- A date with no milliseconds is written `yyyy-MM-ddTHH:mm:ss.fffffffZ`. Any
  other date goes to the default writer, whose form was not read (S
  `src/Jellyfin.Extensions/Json/Converters/JsonDateTimeConverter.cs`). The
  importer reads any number of fraction digits, then `Z`, an offset or nothing,
  and reads nothing as UTC.

## What the importer does not call

- `GET /Plugins` lists the installed plugins for an administrator (S
  `Jellyfin.Api/Controllers/PluginsController.cs`). It was not read if the list
  holds the plugins a server ships with, so the importer does not name plugins
  from it.
- `GET /LiveTv/Info` answers `Services`, `IsEnabled` and `EnabledUsers` (S
  `MediaBrowser.Model/LiveTv/LiveTvInfo.cs`). How `IsEnabled` is set was not
  read. The importer uses `ProgramCount`.
- No call signs out or deletes a device. A sign-in the owner forgets stays on
  the Jellyfin server until a later sign-in from the same KROMA replaces it, or
  until an administrator removes the device there.

## Open questions

- A title kept in two versions and stopped part-way. The `IsResumable` listing
  can answer the id of the second version, which the listing of titles leaves
  out. The play of such a title then names an id the core did not get.
- A server older than 12.0. The same paths are in use by older clients, but
  the source of an older tag was not read.
- Emby. RFC 719 expects its API to be close. Nothing here was read in Emby's
  documentation.
