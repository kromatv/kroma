# KROMA Server

> Part of the [KROMA](../README.md) monorepo: self-hosted, direct-play media streaming.

Think a minimal, Plex-like backend.

It does four things:

1. Scans one or more media library roots, detecting movies vs TV shows
   (Plex-style) and grouping episodes into shows → seasons → episodes.
2. Exposes metadata over a small JSON REST API.
3. Range-streams the original media files to clients.
4. Hosts the modules: it runs each installed `.kmod` as a WebAssembly component
   and reverse-proxies `/api/module/<id>/*` to it. See
   [`modules/README.md`](../modules/README.md).

`server/` is a cargo workspace, and the layers are its crates: `kroma-domain`
holds the entities below, `kroma-db` all the SQL, `kroma-media` reading and
re-encoding one input, `kroma-engine` the business logic, and `src/api/` only
translates HTTP. [`ARCHITECTURE.md`](../ARCHITECTURE.md) draws the whole shape.

**Direct play is the default**: the client (web / TV) decodes HEVC/H.265, AV1,
H.264, etc. itself and the server ships the original bytes. What a client cannot
decode goes through an on-demand HLS session instead (MKV→fMP4 repackaging,
AC3/EAC3/DTS→AAC, HEVC→H.264, language switching), the only path that re-encodes.
See [Hardware transcoding](../docs/setup/hardware-transcoding.md). `ffprobe` reads metadata and
nothing else, and without it the server still runs and infers the codec from the
file extension. None of that machinery is the core's alone: it is `kroma-media`,
which links no database, so a module holding a media file describes and
re-encodes it with the same engine (`kroma-module-sdk/transcode`).

To install and run the server, follow the
[setup guides](../docs/setup/README.md). This page is the developer's view:
how the server reads a library, how to run it from source, and its API.

SQLite holds the library (`<data>/kroma.db`, WAL mode). A scan computes the full
set of libraries/shows/items and swaps it in atomically, and reads run on a small
hand-rolled WAL pool over `rusqlite` (bundled SQLite), so no system libsqlite3 is
required.

With no media dirs configured, or when a scan finds nothing, the server seeds
built-in demo content (movies + two shows) so clients render out of the box.
Demo items cannot be streamed: their `/stream` endpoint returns a JSON 404.

## Library detection (Plex-style)

The naming rules for users are in
[Media folders and permissions](../docs/setup/media-folders.md#name-your-files).

The scanner recognises these layouts and naming cues:

- Movies: `Movies/Blade Runner 2049 (2017)/Blade Runner 2049 (2017) 2160p BluRay x265.mkv`
  or flat `The.Matrix.1999.1080p.x264-GROUP.mp4`. A parenthesised `(YYYY)` is the
  authoritative year, so "Blade Runner 2049 (2017)" → title *Blade Runner 2049*,
  year *2017* (not 2049). The scanner strips release junk (resolution / source /
  codec / group) from titles, and falls back to the `Title (Year)` folder name
  when the filename is generic.
- Episodes: `S01E02`, `s1e2`, `S01E02-E03` (multi-episode), `1x02`, with the text
  after the marker becoming the episode title. Episodes are grouped into shows and
  seasons.

  A `Season 01` / `Saison 1` / `Specials` folder is what proves the folder above it
  is a show folder, so that folder names the show and every release convention
  inside it collapses to one series
  (`TV Shows/The Office (2005)/Season 02/The Office - S02E01 - The Dundies.mkv`).
  Intermediate folders are stepped over, so `TV Shows/4K/The Office (2005)/Season 02/…`
  reaches the same show.

  With no season folder to vouch for one, the path proves nothing (a flat folder
  holds many shows side by side), so the filename names the show:
  `dump/Breaking.Bad.S01E01.mkv` and `dump/The.Office.S01E01.mkv` are two series,
  not one folder's worth. A file that carries no name of its own (`S01E01.mkv`) falls
  back to the folder holding it, and at the library root to the library folder, so
  such episodes land in one series rather than one series each.

A library's `kind` (`movies` / `shows` / `mixed`) follows from what it holds.

Symlinks are followed, so a curated library of links into a shared dump scans as if
the files sat there: the link's own name is what gets parsed, and the target is what
gets streamed. A link whose target is not mounted (the usual shape in a container that
mounts the library but not the dump) cannot be read at all; the scan logs how many
entries it skipped and one offending path rather than reporting an empty library.

## Run from source

```bash
# From server/ runs with demo content (no media dirs configured):
cargo run

# Point it at real libraries (OS path-separator OR comma separated):
KROMA_MEDIA_DIRS="/mnt/movies:/mnt/tv" cargo run

# Then, in another shell:
curl -s http://localhost:4040/api/health | jq
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4040/api/items | jq
```

The server logs the bound address on startup and listens on
`http://0.0.0.0:4040` by default. `/api/health` is public, but the library is not
listable anonymously: create an account in the web app and use its session
token.

## Configuration

Every environment variable an operator sets is in the
[configuration reference](../docs/setup/configuration.md), with HTTPS, reverse
proxies and remote access in [network](../docs/setup/network.md) and hardware
encoders in [hardware transcoding](../docs/setup/hardware-transcoding.md).

A fork shipping its own published app also reads `KROMA_APNS_KEY_P8`,
`KROMA_APNS_KEY_ID`, `KROMA_APNS_TEAM_ID`, `KROMA_APNS_TOPIC` and
`KROMA_FCM_SERVICE_ACCOUNT`, each falling back to the matching admin setting.
KROMA's own builds push through the relay instead, see
[`packages/push-relay`](../packages/push-relay/README.md).

## Which browsers are answered

A page open in a browser on your network reaches this server from inside it, so
the address it arrives from says nothing about who wrote it. CORS decides
whether it may READ the answer, and the policy is a list, not a wildcard:

- this machine and this network: `localhost`, anything under `.localhost`, a
  loopback address, and any address nothing routes across the internet
  (`10.x`, `172.16-31.x`, `192.168.x`, link-local, IPv6 unique- and link-local).
- a shell loaded off the device it runs on, which carries its own scheme rather
  than `http(s)`: `file://`, `tauri://localhost`.
- `null`, which a current browser engine reports for that same device-loaded
  document, and which any page on the web can present by sandboxing an iframe.
- KROMA's own hosted TV client, `https://tv.kroma.tv`.
- whatever you name in `KROMA_ALLOWED_ORIGINS`.
- the origin of `KROMA_WEB_URL`, and the `https` origin a trusted proxy was seen
  serving this server at, so the web client can use the
  [direct route](../docs/direct-connection.md) on your network.

Everything else gets its request served but no `Access-Control-Allow-Origin`, so
the browser refuses to hand the answer to the script that asked for it. Native
clients (iOS, Android, Apple TV, Android TV) send no `Origin` and never meet
this policy, and neither does the web client, served on the server's own origin.

Name an origin when you serve a KROMA client from somewhere else: the SPA behind
its own hostname, `VITE_KROMA_SERVER` / `window.__KROMA_API__` pointed at this
server from another origin, or your own front end.

```bash
KROMA_ALLOWED_ORIGINS="https://kroma.example"
KROMA_ALLOWED_ORIGINS="https://kroma.example, https://tv.kroma.example"
```

Anything named here can act as a client of this server, so name only origins you
publish yourself.

The one place the list means more than reading is `/api/handoff/*`, the beacon a
television raises to be signed in by tapping a row on a phone. The route refuses
a page on the open web outright, and flags a `null` announce: because it names
nobody, the phone must enter the check string printed on the television's own
screen before the grant goes through, and three wrong answers take the beacon
down. Naming `null` yourself places it and drops that confirmation, a trade
rather than a fix. The route is also capped at 30 announces a minute per address,
far above any cadence a television keeps. See
[tv-pairing](../docs/tv-pairing.md#who-may-raise-a-beacon).

## Data model

`MediaItem`:

```jsonc
{
  "id": "string",
  "title": "string",
  "kind": "movie" | "episode" | "video",
  "year": 2017,
  "durationMs": 9780000,
  "container": "mkv",
  "video": { "codec": "hevc", "width": 3840, "height": 2160, "hdr": true, "bitDepth": 10 },
  "audio": { "index": 0, "codec": "truehd", "channels": 8, "language": "eng", "default": true },
  "audioTracks": [ /* every audio stream, each shaped like `audio` */ ],
  "subtitles": [ { "language": "eng", "codec": "subrip" } ],
  "library": "string",
  // show/episode fields null for movies:
  "showId": "string", "showTitle": "The Office",
  "season": 2, "episode": 1, "episodeEnd": null, "episodeTitle": "The Dundies",
  "relPath": "The Office (2005)/Season 02/The Office - S02E01.mkv" /* or null for demo items */,
  "addedAt": "2026-06-27T12:00:00Z",
  // One entry per physical file behind the item: Director's Cut + Theatrical,
  // 1080p + 4K. The stream fields above mirror `defaultFileId`'s file.
  "files": [ { "id": "string", "relPath": "…", "container": "mkv", "durationMs": 9780000,
               "video": {}, "audio": {}, "audioTracks": [], "subtitles": [],
               "size": 42, "probed": true } ],
  "defaultFileId": "string"
}
```

`Show` is an aggregate built by grouping episodes. `GET /api/shows/:id` returns
`{ "show": <Show>, "seasons": [ { "number": 2, "episodes": [<MediaItem>] } ] }`:

```jsonc
{ "id": "string", "title": "The Office", "year": 2005, "library": "string",
  "seasonCount": 1, "episodeCount": 2,
  "video": { "codec": "h264", "width": 1280, "height": 720, "hdr": false, "bitDepth": 8 },
  "addedAt": "2026-06-27T12:00:00Z" }
```

`Library`:

```jsonc
{ "id": "string", "name": "Movies", "kind": "movies" | "shows" | "mixed", "path": "/mnt/movies", "itemCount": 42 }
```

Codec strings are lowercase: `hevc`, `h264`, `av1`, `vp9`, `aac`, `eac3`, `ac3`,
`dts`, etc.

## API

All routes are prefixed with `/api`. This table is the catalog core, not the
whole API: auth, admin, playback, cast, handoff, HLS, requests, notifications and
the module proxy add routes it does not list. Which browser origins may read the
answers is a list, not a wildcard: see
[Which browsers are answered](#which-browsers-are-answered).

Only `/api/health`, `/api/status`, `/api/splash`, the two `/poster` routes and
`/api/items/:id/stream` answer without a session. Everything else needs an
`Authorization: Bearer <token>` header.

| Method | Path                       | Description                                   |
| ------ | -------------------------- | --------------------------------------------- |
| GET    | `/api/health`              | Health + ffprobe presence + counts.           |
| GET    | `/api/libraries`           | All scanned libraries.                        |
| GET    | `/api/items`               | All playable items (`?library=<id>` filter).  |
| GET    | `/api/movies`              | Movies only (`?library=<id>` to filter).      |
| GET    | `/api/shows`               | TV shows (`?library=<id>` to filter).         |
| GET    | `/api/shows/:id`           | `{ show, seasons[] }`, each season `{ number, episodes }`. |
| GET    | `/api/shows/:id/poster`    | Deterministic SVG show poster.                |
| GET    | `/api/shows/:id/metadata`  | TMDB details + IDs for the show.              |
| GET    | `/api/items/:id`           | One item, movie or episode (404 if missing). |
| GET    | `/api/items/:id/stream`    | Range-streamed original file.                 |
| GET    | `/api/items/:id/poster`    | Deterministic SVG placeholder poster.         |
| GET    | `/api/items/:id/metadata`  | TMDB details + IDs (episode → parent show).   |
| POST   | `/api/scan`                | Triggers the `library.scan` job → `{"runId"}`. 409 while one runs. |

## Metadata (TMDB)

KROMA enriches items from [TMDB](https://www.themoviedb.org). It ships a built-in
application key (`BUILTIN_TMDB_API_KEY` in `crates/kroma-config/src/lib.rs`), so
this works with no per-install token, the same approach Overseerr/Jellyseerr/Seerr
take. Override it for your own install with `KROMA_TMDB_API_KEY`.

The server resolves a movie/show by its parsed title + year, then returns the
overview, poster/backdrop URLs, genres, rating, and both the TMDB and IMDb IDs
(via TMDB's `external_ids`). It caches lookups in memory.

The lookup shells out to `curl` (HTTPS) rather than adding a dependency, the same
as `ffprobe` for media metadata. With no key set, the `/metadata` routes return
`503` and nothing else changes.

```jsonc
// GET /api/items/<id>/metadata
{
  "provider": "tmdb",
  "tmdbId": 542178,
  "imdbId": "tt8847712",
  "title": "The French Dispatch",
  "tagline": "Read all about it.",
  "overview": "…",
  "releaseDate": "2021-10-21",
  "genres": ["Comedy", "Drama"],
  "rating": 7.4,
  "posterUrl": "https://image.tmdb.org/t/p/w500/….jpg",
  "backdropUrl": "https://image.tmdb.org/t/p/w1280/….jpg",
  "tmdbUrl": "https://www.themoviedb.org/movie/542178"
}
```

### Examples

```bash
# Health is public. `name` comes back for a LAN caller only.
curl -s http://localhost:4040/api/health
# {"status":"ok","name":"Salon","instanceId":"…","version":"0.1.39","build":3488516,"commit":"1fadb4f","ffprobe":true,"libraries":2,"items":10,"shows":2}

# Everything below needs a session token.
AUTH=(-H "Authorization: Bearer $TOKEN")

# Libraries
curl -s "${AUTH[@]}" http://localhost:4040/api/libraries

# Movies and shows (optionally ?library=<id>)
curl -s "${AUTH[@]}" http://localhost:4040/api/movies
curl -s "${AUTH[@]}" http://localhost:4040/api/shows

# One show with its seasons + episodes
curl -s "${AUTH[@]}" http://localhost:4040/api/shows/<showId> | jq

# All items (movies + episodes), or filtered by library id
curl -s "${AUTH[@]}" http://localhost:4040/api/items
curl -s "${AUTH[@]}" "http://localhost:4040/api/items?library=<libraryId>"

# One item (movie or episode)
curl -s "${AUTH[@]}" http://localhost:4040/api/items/<id>

# Poster (SVG), public
curl -s http://localhost:4040/api/items/<id>/poster -o poster.svg

# Metadata
curl -s "${AUTH[@]}" http://localhost:4040/api/items/<id>/metadata | jq

# Stream full file, public
curl -s http://localhost:4040/api/items/<id>/stream -o out.mkv

# Stream byte range (note the 206 + Content-Range)
curl -s -D - -H "Range: bytes=0-1048575" \
  http://localhost:4040/api/items/<id>/stream -o /dev/null

# Rescan
curl -s -X POST "${AUTH[@]}" http://localhost:4040/api/scan
# {"runId":"…"}
```

## Docker

How to run the published image, mount media and set permissions is in
[Install KROMA with Docker](../docs/setup/docker.md). The image is multi-arch
(`linux/amd64` and `linux/arm64`) and carries the static `kroma-server`, the web
app and a static ffmpeg. It runs as `root` unless the operator sets a user.

### Build the image yourself

The from-source build needs the repo root as context (the server embeds the
shared locale catalogs from `packages/` and the web SPA from `clients/`):

```bash
docker build -f server/Dockerfile \
  --build-arg KROMA_GIT_HASH="$(git rev-parse --short HEAD)" \
  --build-arg KROMA_GIT_HASH_FULL="$(git rev-parse HEAD)" \
  --build-arg KROMA_GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD)" \
  --build-arg KROMA_GIT_REMOTE="$(git config --get remote.origin.url)" \
  --build-arg KROMA_BUILD_DIRTY="$(test -z "$(git status --porcelain)" && echo 0 || echo 1)" \
  -t kroma .
```

`.git` is not in the build context, so these arguments are the only way the
commit reaches the image: the server's admin page and heartbeat read
`KROMA_GIT_HASH`, and the web client's settings read all of them. Each is
optional, and one left out reads as `unknown`.

It builds on either arch natively. Use `docker buildx build --platform
linux/arm64` to cross-build. CI assembles the published image from prebuilt
static payloads instead (see `server/Dockerfile.runtime`).

## Server updates

Admin → Server updates checks Stable or Canary and offers an owner-initiated
update with a backup and restart notice. The Synology package installs updates
by itself, and by default does so automatically when no one is watching. Docker
Compose uses a separate host updater, with a command adapter for other
deployments. See [setup and recovery](updater/README.md) and the
[implementation plan](../docs/server-updates-plan.md).
