# KROMA Server

> Part of the [KROMA](../README.md) monorepo: self-hosted, direct-play media streaming.

Think a minimal, Plex-like backend.

It does four things:

1. Scans one or more media library roots, detecting movies vs TV shows
   (Plex-style) and grouping episodes into shows → seasons → episodes.
2. Exposes metadata over a small JSON REST API.
3. Range-streams the original media files to clients.
4. Hosts the modules: it spawns each installed `.kmod` as its own process and
   reverse-proxies `/api/module/<id>/*` to it. See
   [`modules/README.md`](../modules/README.md).

`server/` is a cargo workspace, and the layers are its crates: `kroma-domain`
holds the entities below, `kroma-db` all the SQL, `kroma-engine` the business
logic, and `src/api/` only translates HTTP. [`ARCHITECTURE.md`](../ARCHITECTURE.md)
draws the whole shape.

**Direct play is the default**: the client (web / TV) decodes HEVC/H.265, AV1,
H.264, etc. itself and the server ships the original bytes. What a client cannot
decode goes through an on-demand HLS session instead (MKV→fMP4 repackaging,
AC3/EAC3/DTS→AAC, HEVC→H.264, language switching), the only path that re-encodes.
See [Hardware transcoding](#hardware-transcoding). `ffprobe` reads metadata and
nothing else, and without it the server still runs and infers the codec from the
file extension.

SQLite holds the library (`<data>/kroma.db`, WAL mode). A scan computes the full
set of libraries/shows/items and swaps it in atomically, and reads run on a small
hand-rolled WAL pool over `rusqlite` (bundled SQLite), so no system libsqlite3 is
required.

With no media dirs configured, or when a scan finds nothing, the server seeds
built-in demo content (movies + two shows) so clients render out of the box.
Demo items cannot be streamed: their `/stream` endpoint returns a JSON 404.

## Library detection (Plex-style)

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

## Quickstart

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

Environment variables carry all configuration:

| Variable           | Default     | Description                                                            |
| ------------------ | ----------- | --------------------------------------------------------------------- |
| `KROMA_HOST`        | `0.0.0.0`   | Interface to bind.                                                     |
| `KROMA_PORT`        | `4040`      | TCP port to listen on.                                                 |
| `KROMA_MEDIA_DIRS`  | *(empty)*   | Library roots to scan. OS-path-separator (`:` / `;`) or comma list.    |
| `KROMA_MOVIES_DIRS` | *(empty)*   | Roots scanned as movies only. Same list format.                       |
| `KROMA_SERIES_DIRS` | *(empty)*   | Roots scanned as shows only. Same list format.                        |
| `KROMA_DATA_DIR`    | `./data`    | Where the SQLite database (`kroma.db`) lives.                          |
| `KROMA_DEMO_MEDIA`  | `1`         | Writes the demo library to `<data>/demo-media` so a first look has files it can play. `0` leaves demo rows with no bytes behind them. |
| `KROMA_TMDB_API_KEY`| *(empty)*   | TMDB API key → enables movie/show metadata. Unset falls back to the built-in key. |
| `KROMA_TMDB_LANGUAGE`| `en-US`    | TMDB language for titles/overviews, e.g. `fr-FR`.                      |
| `KROMA_TMDB_ENRICH` | `1`         | Set to `0` to skip TMDB enrichment during a scan.                     |
| `KROMA_HTTPS`       | `0`         | Set to `1` to *also* serve HTTPS with an auto self-signed cert (off by default). |
| `KROMA_HTTPS_PORT`  | `4443`      | Port for the HTTPS listener (only used when `KROMA_HTTPS=1`).          |
| `KROMA_TLS_SANS`    | *(empty)*   | Extra cert names/IPs, comma/space separated. See [HTTPS](#https-on-the-lan-optional). |
| `KROMA_HTTPS_REDIRECT`| `0`       | Set to `1` to redirect all HTTP traffic to HTTPS (needs `KROMA_HTTPS=1`). |
| `KROMA_TRUSTED_PROXIES`| *(empty)* | Proxies whose forwarding headers may be believed. See [Behind a reverse proxy](#behind-a-reverse-proxy). |
| `KROMA_ALLOWED_ORIGINS`| *(empty)* | Extra browser origins allowed to read the API. See [Which browsers are answered](#which-browsers-are-answered). |
| `KROMA_WEB_URL`    | *(`:<port>`)* | Public address written into invite and account links.                |
| `KROMA_WEB_DIR`    | *(empty)*   | Built SPA served as the fallback route. Ignored unless it holds `_shell.html`, which is why dev leaves it unset. |
| `KROMA_INSTALL`    | `unknown`   | How this server was installed: `docker`, `synology` or `binary`. The Docker images and the Synology package set their own; `binary` is for an operator running the built server directly, and an unset value reports `unknown` rather than guessing. Reported only with the anonymous statistics. See [`docs/anonymous-stats.md`](../docs/anonymous-stats.md). |
| `RUST_LOG`         | `info`      | Standard `tracing` filter, e.g. `kroma_server=debug`. Inherited by the module sidecars. |
| `KROMA_MODULE_LOG` | *(empty)*   | Overrides `RUST_LOG` for the module sidecars only, e.g. `kroma_indexer=debug`. Their output is drained into the core's log and Admin → Modules → *module* → Journaux. |
| `KROMA_HWACCEL`    | *(probed)*  | Pins the re-encode pipeline: `qsv`, `vaapi`, `nvenc`, `videotoolbox`, or `software` to rule hardware out of a problem. See [Hardware transcoding](#hardware-transcoding). |
| `KROMA_RENDER_NODE`| `/dev/dri/renderD128` | Which DRM render node VAAPI/QSV open, for a host with more than one. |
| `KROMA_ENCODE_EFFORT`| *(from the box)* | Pins the software encoder tier: `quality` or `realtime`. |
| `KROMA_FFMPEG_CONCURRENCY`| *(cores − 1)* | How many background media passes (storyboards, fingerprints, subtitle extraction) may run at once. |
| `KROMA_PROBE_WORKERS`| *(half the cores, 2..4)* | Concurrent `ffprobe` processes during a scan.        |
| `KROMA_WALK_THREADS`| *(cores × 4, 8..32)* | Threads walking the library roots. Raise it for remote mounts. |
| `KROMA_WATCH_INTERVAL`| `300`     | Seconds between periodic rescans, `0` for none (filesystem events still fire). The `watchIntervalSecs` admin setting wins over it. |
| `KROMA_MODULE_HOT_RELOAD`| *(empty)* | Set to `1` so a changed sidecar binary restarts its process. A dev loop only: it polls the filesystem. |

A fork shipping its own published app also reads `KROMA_APNS_KEY_P8`,
`KROMA_APNS_KEY_ID`, `KROMA_APNS_TEAM_ID`, `KROMA_APNS_TOPIC` and
`KROMA_FCM_SERVICE_ACCOUNT`, each falling back to the matching admin setting.
KROMA's own builds push through the relay instead, see
[`packages/push-relay`](../packages/push-relay/README.md).

## Hardware transcoding

Direct play never re-encodes anything, and most playback is direct play. The
exception is a source the client's decoder cannot take: HEVC on an H.264-only
TV, or a 4K frame on a decoder that stops at 1080p. That re-encode is the one
part of the delivery path that costs real CPU, and on a NAS a single 4K→1080p
stream will saturate the box on its own.

On an Intel iGPU (QuickSync), an AMD/Intel GPU (VAAPI), an NVIDIA card (NVENC)
or an Apple machine (VideoToolbox), the same job runs on fixed-function silicon
at a few percent CPU. KROMA probes for one at startup, and **makes each
candidate encode a test frame before believing it**. A device that is listed but
has no driver, or whose render node the service user cannot open, otherwise looks
exactly like no device at all.

The verdict is in the log on every boot:

```
INFO video re-encodes run on hardware accel=vaapi reason=h264_vaapi encoded a test frame
WARN video re-encodes run on the CPU reason=/dev/dri/renderD128 is not readable by this user …
```

Three things have to be true, and the log line names whichever one is not:

1. **ffmpeg has the encoder.** Many static builds do not. Check with
   `ffmpeg -hide_banner -encoders | grep -E 'h264_(vaapi|qsv|nvenc)'`.
2. **The render node is there.** `ls -l /dev/dri` should show a `renderD*` node.
   In Docker it has to be passed in: `--device /dev/dri:/dev/dri`.
3. **The service user can open it.** The node is usually `root:render` (or
   `root:videodriver` on DSM) with no access for anyone else, so the user KROMA
   runs as must be in that group: `--group-add` under Docker, and the Synology
   package joins `videodriver` at install.

## Behind a reverse proxy

The server reads `X-Forwarded-For` / `CF-Connecting-IP` only from a peer worth
believing, because both are set by whoever is calling. Loopback is always
believed, so **a proxy on the same host needs no configuration**.

A proxy anywhere else does. In another container, or on another machine, its
requests arrive from its own address, the headers are discarded, and the server
sees every client as that one address. Two things stop working: nearby TV
pairing treats the whole world as one network, and the login brute-force guard
counts everyone as one caller.

Name the proxy and it can be seen through. Bare addresses or IPv4 CIDRs, comma
or space separated:

```bash
KROMA_TRUSTED_PROXIES="172.18.0.0/16"     # a docker bridge
KROMA_TRUSTED_PROXIES="10.0.0.4, 10.0.0.5" # two named front-ends
```

Only ever name the proxy. Anything matching this list can claim to be any
client, so a range your clients live in gives that away to all of them.

The proxy must also set the header the standard way, appending the peer it saw
rather than replacing what the caller sent. nginx's
`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` does this, as do
Caddy and Traefik by default. The server reads the rightmost entry, the only one
the proxy itself vouched for.

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

## HTTPS on the LAN (optional)

By default the server speaks plain HTTP, which is usually fine on a LAN. But a
browser refuses the Web Crypto API (`crypto.subtle`, WebAuthn/passkeys) on a
non-`localhost` HTTP origin, so a phone hitting `http://192.168.x.y:4040` cannot
use those. A LAN box has no public DNS name for Let's Encrypt, so KROMA can serve
HTTPS with an auto-generated self-signed certificate instead:

- Enable it with `KROMA_HTTPS=1` (or the `httpsEnabled` admin setting, where the
  env wins). HTTPS is additive: the plain-HTTP listener keeps running.
- The server generates the cert once under `<data>/tls/` (`cert.pem` + `key.pem`,
  key `0600`) and reuses it on restart. Delete that folder to force a regen,
  e.g. after changing the SANs below.
- The listener binds `KROMA_HTTPS_PORT` (default 4443).
- Its SANs cover the box's local identities automatically: `localhost`,
  loopback, the hostname, `<hostname>.local`, and the primary LAN IP.
- Download the public cert from `/api/tls/cert.pem` to trust it once per device.

If the cert cannot be prepared, HTTPS is skipped and HTTP keeps serving, with the
reason logged. Preparing it never blocks startup.

**Redirect HTTP to HTTPS, optionally.** Set `KROMA_HTTPS_REDIRECT=1` (or the
`httpsRedirect` admin toggle) to make the HTTP listener 307-redirect everything
to HTTPS. It is off by default on purpose: a self-signed origin shows a trust
prompt until you import the cert, and some TV / native clients cannot follow the
redirect. The cert download (`/api/tls/cert.pem`) stays reachable over plain HTTP
either way, so a device can still bootstrap trust.

### Adding names/IPs to the cert (`KROMA_TLS_SANS`)

A browser only accepts the cert for an address listed in its SANs. When the
auto-detected identities do not match how clients reach the box, add the missing
ones. Each entry parses as an IP if it looks like one, else a DNS name. Separate
them with commas, spaces or `;`:

```bash
KROMA_TLS_SANS="192.168.1.50, nas.home, kroma.stmx.ch"
```

This matters most in Docker: on the default bridge network the container's
hostname is its random ID and its "primary LAN IP" is the Docker bridge address
(`172.x`), not your host's LAN IP, so the auto-detected SANs will not match the
address clients use. Pass the host's real IP / DNS name here, or run with
`--network host`, where auto-detection sees the host's identities. The
[Docker](#https-in-docker) section has a full example.

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
# {"status":"ok","name":"Salon","instanceId":"…","version":"0.1.39","ffprobe":true,"libraries":2,"items":10,"shows":2}

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

The published image is multi-arch (`linux/amd64` + `linux/arm64`): the same
`docker pull` works on an Intel/AMD NAS or server and on ARM64 boards such as a
Raspberry Pi 4/5 (64-bit OS required). It bundles the static `kroma-server`
binary, the web SPA (served on the same port) and static `ffmpeg`/`ffprobe`.

```bash
docker run -d --name kroma \
  -p 4040:4040 \
  -v kroma-data:/data \
  -v /path/on/host/media:/media \
  -e KROMA_MEDIA_DIRS=/media \
  ghcr.io/kromatv/kroma:latest
```

Or as compose. A ready-to-run [`docker-compose.yml`](../docker-compose.yml) sits
at the repo root, so `docker compose up -d` works from there:

```yaml
services:
  kroma:
    image: ghcr.io/kromatv/kroma:latest
    ports: ["4040:4040"]
    environment:
      KROMA_MEDIA_DIRS: /media
    volumes:
      - kroma-data:/data
      - /path/on/host/media:/media
volumes:
  kroma-data:
```

### HTTPS in Docker

To also serve the self-signed HTTPS listener (see
[HTTPS on the LAN](#https-on-the-lan-optional)), publish its port and turn it
on. The image `EXPOSE`s both ports, but you still publish `4443` yourself. And
because the bridge network hides your host's real identity, pass it via
`KROMA_TLS_SANS` so the cert is valid from other devices:

```bash
docker run -d --name kroma \
  -p 4040:4040 -p 4443:4443 \
  -e KROMA_HTTPS=1 \
  -e KROMA_TLS_SANS="192.168.1.50,nas.home" \
  -v kroma-data:/data \
  -v /path/on/host/media:/media \
  -e KROMA_MEDIA_DIRS=/media \
  ghcr.io/kromatv/kroma:latest
```

Or as compose:

```yaml
services:
  kroma:
    image: ghcr.io/kromatv/kroma:latest
    ports:
      - "4040:4040"
      - "4443:4443"
    environment:
      KROMA_MEDIA_DIRS: /media
      KROMA_HTTPS: "1"
      # Your host's real LAN IP / DNS name(s); the bridge cannot detect them.
      KROMA_TLS_SANS: "192.168.1.50,nas.home"
    volumes:
      - kroma-data:/data
      - /path/on/host/media:/media
volumes:
  kroma-data:
```

The cert lives in the `/data` volume (`/data/tls/`), so it survives restarts.
Delete it, or the volume, after changing `KROMA_TLS_SANS` to force a regen. Then
reach the box at `https://<host>:4443` and grab `/api/tls/cert.pem` to trust it
on each device. Running with `--network host` instead lets auto-detection see the
host's real hostname/IP, so `KROMA_TLS_SANS` is not needed.

### Volumes: what needs to be writable

- **`/data`** (named volume or bind mount): the SQLite database, caches,
  installed modules, Whisper models AND the torrent download staging area
  (`/data/torrents/downloads`). Give it enough space for in-flight downloads,
  or bind-mount a big disk.
- **Media mounts**: mount them read-write if you use the built-in
  requests/downloads stack, because the import step writes the finished files
  into the library (hardlink when possible, else reflink/copy, so separate mounts
  work, just slower to import). `:ro` is only safe for a pre-existing library you
  manage yourself.

Tags: `latest` (main), `X.Y.Z` / `X.Y` (releases). Then point every client at
`http://<host>:4040` (the web app is served there too).

### Building the image yourself

The from-source build needs the repo root as context (the server embeds the
shared locale catalogs from `packages/` and the web SPA from `clients/`):

```bash
docker build -f server/Dockerfile -t kroma .
```

It builds on either arch natively. Use `docker buildx build --platform
linux/arm64` to cross-build. CI assembles the published image from prebuilt
static payloads instead (see `server/Dockerfile.runtime`).
