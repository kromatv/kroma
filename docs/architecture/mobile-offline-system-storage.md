# Mobile offline downloads in the OS storage manager (Netflix-style)

Status: DESIGN, NOT IMPLEMENTED. What shipped instead (2026-07): platform
background transfers (`@kesha-antonov/react-native-background-downloader`) that
survive backgrounding and app kills, with re-adoption and requeueing on launch
(`clients/mobile/src/lib/downloads/`). This document records why the last step
(per-title rows in iOS Settings ▸ General ▸ iPhone Storage, deletable by the OS
like Netflix's) is an architecture change, and what it would take.

## 1. What Netflix actually uses

The per-video list with swipe-to-delete under iPhone Storage is not a general
facility. iOS only shows it for **system-managed assets** downloaded through
`AVAssetDownloadURLSession` / `AVAssetDownloadTask`, and that API downloads
**HLS streams exclusively** (an `AVURLAsset` pointing at a `.m3u8`), storing
them as `.movpkg` bundles in a system-owned location
(`Library/com.apple.UserManagedAssets.*`). Title and artwork of the Settings
row come from `AVAssetDownloadConfiguration` (iOS 15+). There is no equivalent
API for arbitrary files: our progressive MP4s in Documents can only ever appear
as the app's aggregate "Documents & Data".

Android has no per-item OS storage UI at all ("Clear storage" nukes the app);
the in-app Downloads screen is already the parity story there.

## 2. The gap on our side

Mobile downloads are progressive files: the raw original when the device
direct-plays it, else the server's `/download` endpoint remuxing to one fMP4
over a chunked response. The server's HLS infra
(`server/crates/kroma-engine/src/infra/hls/`) is the opposite of downloadable:
per-(item, mode, anchor) **live transcode sessions**, LRU-reaped, whose
playlists grow as ffmpeg produces segments. `AVAssetDownloadTask` needs a
stable, finite, complete **VOD playlist** whose every URL stays valid for the
whole (possibly hours-long, backgrounded) download, and auth it can present
(cookie / token in the playlist URLs; the system downloader does not attach our
bearer header per request).

## 3. What it would take

Server:

- A new offline-HLS endpoint, separate from the live session registry: for a
  given item + codec caps, produce a **complete VOD master** (video + every
  audio rendition) with all segments enumerated up front. Two viable shapes:
  byte-range playlists over the finished remux file (`EXT-X-MAP` +
  `EXT-X-BYTERANGE`, needs the remux run to completion first, so a
  prepare-then-poll job), or real segment files from a bounded ffmpeg run.
- Tokenized segment URLs (query-string auth, long-lived for the download, scoped
  to the item) since NSURLSession background tasks won't carry our header auth.

Mobile (iOS only):

- A local Expo native module wrapping `AVAssetDownloadURLSession`:
  `AVAssetDownloadConfiguration` with title + artwork (that's the Settings row),
  progress via `AVAssetDownloadDelegate`, persistence of the `.movpkg` location,
  restore with `sessionWithIdentifier` on relaunch.
- Reconcile OS-side deletes: the user can remove a title from Settings while
  the app is dead, so every launch must diff the index against surviving
  bookmarks (this is a hard requirement of the API, not a nicety).
- Playback from the `.movpkg` via AVPlayer: expo-video accepts a file URL, but
  offline `.movpkg` + subtitle sidecars + storyboard integration needs a real
  verification pass; offline subs likely have to move into the HLS master as
  WebVTT renditions to live inside the managed asset.
- Keep the current pipeline as-is for Android and as the iOS fallback (old
  servers without the offline-HLS endpoint).

## 4. Why it didn't ship with the background-transfer work

Every piece above is load-bearing: without the finite VOD playlist there is
nothing for `AVAssetDownloadTask` to download; without tokenized URLs it 401s;
without delete-reconciliation the index lies. That is a server + native + player
project (roughly: prepare-job endpoint, auth tokens, native module, playback
verification), not an increment on the current downloader, and the current
downloader already delivers the other half of the Netflix behavior (transfers
that outlive the app). Sequencing it separately keeps this feature reviewable.
