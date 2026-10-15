# Watching a film while it downloads

A torrent arrives out of order, so a player pointed at it stalls on whichever
piece it needs next. A player pointed at it through a reader that reorders the
swarm does not: the piece picker is told where the cursor is and fetches ahead
of it. That reader is what the embedded engine already ships, and this feature
is the steps between a title a member picked and a picture on their screen.

Every one of those steps belongs to `tv.kroma.torrents`. The core keeps one
generic route saying which mount answers the `watchable` capability, the reverse
proxy in front of that mount, and the TMDB routes a viewer finds a title with. It
has no route, no type and no setting for any of the rest. See
[`capability-surfaces.md`](capability-surfaces.md) for why the split falls there.

The shape, end to end:

| step | who answers | needs a session |
| --- | --- | --- |
| what this server can offer | core `GET /api/capabilities` | yes, and nothing else |
| find a title | core `GET /api/discover/search`, `/trending`, `/{movie,tv}/{tmdbId}` | yes, and nothing else |
| pick an episode | core `GET /api/discover/tv/{tmdbId}/season/{season}` | yes, and nothing else |
| everything after that | the module, under the mount | yes, except the two a `<video>` fetches |

## The capability, and how a client finds the mount

```
GET /api/capabilities
{"capabilities": {"watchable": {
  "mount": "/api/module/tv.kroma.torrents",
  "sources": [{
    "mount": "/api/module/tv.kroma.torrents",
    "label": "Torrents",
    "icon": "magnet",
    "figures": [
      {"key": "downloaded", "label": "Téléchargé", "kind": "percent"},
      {"key": "speed",      "label": "Vitesse",    "kind": "rate"},
      {"key": "sources",    "label": "Pairs",      "kind": "ratio"}
    ],
    "map": {"label": "Morceaux reçus"},
    "actions": [{"key": "cancel", "label": "Annuler"}]
  }]
}}}
```

The core asks the running registry which modules contribute `watchable`, lists
one source per answer that described itself, and keeps `mount` at the top level
naming the lowest-id module of them. It holds the NAME and never the module id:
an operator who installs a different module contributing the same point changes
the answer and nothing else. A capability nothing answers is absent from the map,
which is what a client reads as "do not offer it".

A capability the VIEWER may not use is absent the same way. `watchable` is
offered to an account holding `watchable.play`, the right an operator ticks
beside the others on the account page, so a member without it is answered a map
with no `watchable` in it and every shell draws nothing. Playing a film the
catalogue already holds is `playback` and is untouched: this right is about
playing one that has not finished arriving.

**An admin decides who gets it.** Direct play searches the indexers and starts a
download with nobody approving it, so the upgrade that introduced the right hands
it only to the accounts that could already do that: whoever holds `requests.auto`,
and whoever runs the server (`users.manage`, `library.manage`, `settings.manage`,
who can tick it for themselves in one request anyway). A member who could only
watch the catalogue does not get it, and is told nothing new is on offer by the
capability being absent. The carry runs once per right and the mark is written
when the grant lands, so an operator who then unticks it keeps it unticked, and a
grant the database refused is retried on the next start rather than marked done
(`kroma_engine::services::rights`).

Everything inside a source is the module's own, in the viewer's language: the
core calls `POST {mount}/_port/watchable/describe` with the locale and forwards
what comes back. Torrents answers the three figures above, a slice map it calls
Morceaux reçus, and the one action beyond playing, which is the
`DELETE {mount}/watch/{id}` below. A second module answering `watchable` for
Usenet or a debrid link declares its own words and its own figures, and the same
screen draws both. See
[`capability-surfaces.md`](capability-surfaces.md#a-module-brings-its-own-interface-as-data)
for the vocabulary and its limits.

That replaces what used to be a localized 404 on every core route. The refusals
a viewer now sees are the module's own words, in English, because a sidecar has
no core catalog to look a key up in.

## The routes, under the mount

`M` below is the mount the capability listing gave out. Every route takes a
session bearer, which the module resolves itself through the host: the core's
proxy has no session gate. It also takes `watchable.play`, checked by the module
against the `User` the host hands it, because the proxy in front of the mount
checks nothing of the kind: a viewer the listing did not offer the capability to
must be refused when they ask anyway, with the `403` every client already reads
as "you may not".

```
GET    M/watch                                        {"entries": [...]}
POST   M/watch/start                                  {"downloadId","release","reused"}
DELETE M/watch/{id}                                   {"removed": true}
GET    M/watch/{id}/files/{file}/probe                {"durationMs","video","audio"}
GET    M/watch/{id}/files/{file}/progress?buckets=N
GET    M/watch/{id}/files/{file}/storyboard           {"url","interval","cols",...}
POST   M/watch/{id}/files/{file}/ticket               {"url","token","expiresAt"}
```

And the four a media element fetches, which carry no bearer:

```
GET    M/watch/{id}/files/{file}/hls/{mode}/{anchor}/{audio}/index.m3u8?t=<token>
GET    M/watch/{id}/files/{file}/hls/{mode}/{anchor}/{audio}/{name}?t=<token>
GET    M/watch/{id}/files/{file}/subtitles/{index}.vtt?t=<token>
GET    M/watch/{id}/files/{file}/storyboard.img?t=<token>&v=<version>
```

**A member is answered about the watch downloads they started, and no others.**
Every route above that takes a bearer asks that first, and a download the viewer
did not start reads exactly like one that does not exist: `404`. Whoever drives
the download queue (`requests.manage` or `settings.manage`) is answered about all
of them, as they already are on the queue screen. A watch download is a temporary
cache of a film somebody asked for rather than a library, so it carries no
library scope of its own, and `POST M/watch/start` is what records the asking:
two members who both start the same title are both offered it, once it is
reused.

## Starting one

`POST M/watch/start` takes `{"tmdbId", "kind", "title", "year", "season",
"episode"}` (`kind` is `movie` or `show`, `year` may be null, and a show needs
both `season` and `episode`). The module asks the host which process answers the
`acquisition` point and calls it, method `watch`, as `{"tmdb_id", "kind",
"title", "year", "season", "episode"}`. That module searches the configured
indexers, picks a release and starts it, or hands back a download of that title
already running.

| status | means |
| --- | --- |
| 200 | a download to watch, new or `reused` |
| 400 | no title or no TMDB id, or a show without a season and an episode |
| 422 `{"error"}` | the point answered and found nothing to start; the message is its own |
| 422, no `error` key | a `kind` that is neither word, refused by the body parse before an indexer is swept |
| 502 | nothing answers `acquisition`, or it answered something unreadable |
| 504 | the point did not answer within the loopback's 30 seconds |

A 504 is not a refusal. An indexer sweep can outlast the loopback, and the
acquisition module keeps going after this one has stopped waiting, so the
download may still appear. A client that gets one looks at `GET M/watch` before
asking again.

The episode picker reads `GET /api/discover/tv/{tmdbId}/season/{season}`:
`{"episodes": [{"episode", "name", "overview", "stillUrl", "airDate",
"runtimeMin"}]}`, the last three nullable and `name` and `overview` empty when
TMDB has none. It is the TMDB season fetch the request ledger and a library
show's missing episodes already use, in the viewer's language, and a season TMDB
cannot answer is an empty list.

## Discover is readable by every member

Search, trending and the title detail need a session and nothing else, because a
member who may watch has to be able to find what to watch. Creating a request
still needs `requests.create`, and approving or managing one still needs
`requests.manage`.

What a response carries depends on who asks. Every viewer gets the catalogue
flags (`inLibrary`, `localId`, and per season `available` and
`episodesAvailable`), weighed against the libraries the viewer was granted the
way the library routes weigh them: a title held only in a library the viewer
cannot see reads as not in the library at all. The request overlay (`requestId`,
`requestStatus`, `requestProgress`, and per season `requested`) names someone's
request, so only a viewer holding `requests.create` sees it, the same viewer who
needs it to avoid asking twice. For anyone else those fields are null or false.

## One credential, for the bytes and for the playlist

`POST M/watch/{id}/files/{file}/ticket` mints a play token for one file of one
download and answers `{"url", "token", "expiresAt"}`. The token expires after
twelve hours, is handed out again until six hours are left of it, and is the
whole credential: a media element attaches no header of
its own, so it goes in `?t=` on every playlist and segment, and the module
rewrites every URI of a playlist to carry it. `url` is the same token already
spelled as that file's raw bytes, at `M/play/<token>`; `token` is handed over on
its own so no client has to take a mount apart to find it.

A token for another file of the same download is no credential for this one: a
playlist or segment presenting one answers `401`.

Minting is also what narrows the download, so asking for a ticket is not free of
side effects: see [only the file being watched](#only-the-file-being-watched).
The narrowing happens on every call, not only on the first, because a viewer who
moves to another episode of a pack has to move the piece picker with them
whatever token they already hold. A ticket is minted only for a video file the
listing offers, so the narrowing can never point the swarm at an `.nfo`.

The core's media ticket is core-only by written policy. The module never reaches
for it and never sees one.

## Who transcodes

The module does, with its own `HlsEngine` from `kroma_module_sdk::media` behind
the SDK's `transcode` feature: the same engine, modes and sessions as the
catalogue's, in its own process. Its sessions are written under
`<data>/modules/tv.kroma.torrents/hls`, beside its own `module.sqlite`, because
two engines over one directory would each wipe the other's live sessions. It
takes its live-session cap from `maxConcurrent`, the same knob the core sizes its
own HLS cache from (8 unless an operator says otherwise, NOT `mediaConcurrency`,
which is the background ffmpeg budget and is one on a two-core NAS), and its own
reaper takes an idle session away after three minutes rather than trimming to a
byte budget. **The cap never takes a session somebody is reading**: it reclaims
the ones that have gone quiet and otherwise lets the cache run over, because the
HLS routes are anonymous and a session it guessed wrong about is somebody's film.

What that cache keeps, and what it does not, is worth saying plainly. A session
is a running ffmpeg keyed on the file, the mode, the anchor and the audio track,
and it holds every segment it has written, minus a window of 45 segments behind
the slowest reader that the reaper sweeps. A re-anchor inside that window is
answered out of it (see [seeking](#seeking-and-why-it-still-moves-the-piece-picker)),
which is the only sharing there is. Nothing survives the sidecar restarting: the
engine empties its root on construction, because two engines over one directory
would each delete the other's live sessions. It empties a root it can tell is its
own, one carrying the `.kroma-hls` file it writes there or holding nothing at all,
and leaves anything else exactly as it found it: an SDK user who passed a data
directory gets a warning, not an erased server. And a viewer who leaves the page and
comes back after three minutes pays for the remux again.

The probe is the module's too. There is no grant and no loopback through the
core any more: ffmpeg is handed the module's own byte route on its own listener,
`http://127.0.0.1:<its port>/_read/<token>`, so a piece goes from the engine to
ffmpeg in one hop and never back out through the proxy. That path is the module's
own on purpose: a read through it holds the film in the watch cache, as any read
does, and it is not somebody watching. Otherwise the module probing its own file
would answer a viewer's Cancel, and an operator's delete, with "it is being
played". ffprobe runs over that
URL once per file and the answer is kept:

```json
{"durationMs": 888064,
 "video": {"codec": "h264", "width": 1024, "height": 436},
 "audio": [{"index": 0, "codec": "aac", "channels": 6, "language": "eng"}]}
```

Every figure in there is nullable, and a null is a real answer, not a placeholder:
`video` is null for a file with no picture, `durationMs` for a container whose
header says nothing, and `width` / `height` / `channels` for a stream ffprobe
opened and did not measure. A client reading this loosens its schema rather than
waiting for a number the file does not carry.

`404` means the module does not offer that download or that file, and never will:
no such row, a download on another engine, a film the catalogue has taken over,
or an index that is not one of the listed video files. `503` means it may still
come: a grab that has not reached the engine yet, a swarm that has not answered
with the file list, or no pieces within 20 seconds. Nothing is minted and nothing
is narrowed on either refusal.

That 503 does not kill the ffprobe. It is already waiting on the container's
index at the end of the file, and starting a second one would send the reader
back to the first byte and fetch the same walk again, so the next call joins the
one running instead. One ffprobe per file, however many times a client asks.

### The mode a client gets, and why it is not a redirect

The mode a client asks for is not always the mode that will play on it: a device
that cannot decode the picture or the soundtrack is given a transcode of it
instead. The catalogue's routes answer that with a `302` to the mode that will
really play. This pair cannot, because the core's reverse proxy follows a `3xx`
itself rather than handing it to the browser.

So the playlist answered IS the mode that will play, and the client learns which
one it got two ways:

- **`X-Hls-Mode`** on the playlist response names the mode token.
- **Every URI in the playlist body** is written out in full, as an absolute path
  under the mount naming that mode, rather than left relative to the URL the
  playlist was fetched from. So a segment is fetched from the session that
  really exists even if the client ignores the header.

Everything else is the catalogue's: the same mode tokens, the same
`?copy=&video=&maxw=&maxh=`, the same `X-Hls-Start` and `X-Media-Duration`. The
playlist answers `503` when ffmpeg has written none within the engine's 20 second
wait; the session keeps running, so asking again picks it up.

One thing is not the catalogue's. Nothing plays until the first segment is
written, and over an input ffmpeg reads by HTTP that is whole seconds of media
fetched from the swarm before the first frame. So a stream the engine opens over
HTTP is cut at two seconds rather than six. A stream copy still cuts on a source
keyframe, so the ask can only bring the first cut forward and never splits a GOP:
on Sintel the first segment falls from 13.5 s of media (1.4 MiB) to 3.1 s
(59 KiB), and every segment after it is the source's own 10.4 s either way.

## Progress, cancelling and the cache

`GET M/watch/{id}/files/{file}/progress?buckets=120` answers

```json
{"progress": 0.42,
 "figures": {"downloaded": 0.42, "speed": 318000, "sources": [31, 498]},
 "slices": [100, 98, 0],
 "arriving": [1, 2]}
```

`figures` is keyed by what the descriptor declared, so a client reads a number
it was told the label and the format of and never a word about a swarm.
`slices` is one percentage per slice of the file, and the count is held between
10 and 400.

### The arrival map, and what `arriving` means

`slices` is built from the bitfield of VERIFIED pieces, so a release cut into
8 MiB pieces over a slow line leaves the whole map at zero for minutes while
bytes are flowing: nothing has completed yet.

`arriving` is the 0-based indexes into `slices`, on the same bucketing, of the
slices the module is asking the swarm for and does not already hold whole. It is
a plain `number[]`, empty when nothing is being asked for, and a client that has
not been updated leaves it out and draws `slices` alone.

**It is what the module asked for, not what the peers are sending.** librqbit
9.0.0-rc.0 keeps that answer to itself: the chunk tracker's per-chunk status, its
queue of needed pieces and `PieceTracker::get_inflight` are all `pub(crate)`, and
the only piece state on the public `Api` is `api_dump_haves`, which is the
verified bitfield `slices` already reads. So the module reports its own two asks,
which between them are everything it ever asks for out of order:

- **the container index, while that read is in flight.** The last mebibyte of the
  file and its first 64 KiB, which is the whole of what the swarm is being asked
  for on the preparation screen, and the reason the map used to sit empty there.
- **the read-ahead window in front of an open reader.** librqbit queues the
  pieces of the 32 MiB after a stream's cursor (`PER_STREAM_BUF_DEFAULT`), so the
  window is `[cursor, cursor + 32 MiB)` clamped to the file. The module records
  where its own reader has reached, because `FileStream::position` is public but
  librqbit's registry of live streams is not.

Both are byte ranges into the file, folded onto the same buckets as `slices` and
filtered down to the slices that are not already whole. A slice can therefore be
in `arriving` for minutes: at 200 KB/s an 8 MiB piece takes forty seconds, which
is exactly the wait the field exists to explain.

The clients draw it on the kit's `ArrivalMap`, on the preparation screen of every
shell: a slice in `arriving` is a ringed accent cell that breathes, and holds
still for a viewer who asked for reduced motion. A slice that is whole is drawn
whole even while the list still names it, and an index past the last slice is
dropped. `WatchableProgress` defaults the field to `[]`, which is how a module
that predates it reads.

The call is 2.0 to 5.3 ms through the proxy and 1.1 KB on the wire, flat in the
bucket count, so **what makes a percentage jump is the sample interval and not
the endpoint.** Polling faster buys a smoother figure at the cost of a request
per viewer per interval on a television, and nothing the server could send would
be cheaper than what it already sends: `downloaded` is the value and `speed` is
its derivative, so a client holding both and the file's `sizeBytes` can advance
the figure between samples for no traffic at all. That is where the smoothing
belongs. Two bounds on it: never past the next real sample, and never while
`speed` is zero, because a stalled swarm must read as stalled.

**The old spelling is answered beside it for one version.** `downBps`, `upBps`,
`peers`, `peersSeen` and `pieces` are still on every response through
`tv.kroma.torrents` **0.13.x** and go away in **0.14.0**, so a client that has
not been updated keeps working across one module release. They carry the same
numbers as `figures` and `slices`, derived from them, so the two halves cannot
disagree while both are answered.

A film started to be watched is a temporary cache. It is never imported unless
the module's `watchKeepInLibrary` setting is on, and it is erased
`watchCacheMinutes` after its last reader closes. `DELETE M/watch/{id}` erases it
at once, and a client sends it only for the viewer's own Cancel on the waiting
screen (`cancelWatch` in `@kromatv/core`). Leaving the player or the waiting
screen sends nothing, so the film stays in that cache for a viewer who comes
back and for any other viewer still watching it.

| status | means |
| --- | --- |
| 200 `{"removed": true}` | stopped and erased |
| 404 | the module does not offer that download to this viewer |
| 409 `{"error"}` | somebody is reading it, or it was not started by a watch |

**A cancel never ends somebody else's film.** Two viewers can be on one
download, so while a reader is open it is refused with the `409` rather than
erased under them; a viewer who presses Cancel during the probe, which holds a
reader for its five seconds, is answered on the next press. Erasing one revokes
every play token minted for it, so a stale token cannot outlive its bytes.

Both settings live in the module's own `module.sqlite` and are written through
its own `PUT M/downloads/limits`, because the core no longer declares either
key and a module cannot read one the core has never heard of. An install that had
tuned them before the move reads the defaults again: 30 minutes, and off.

## Seeking, and why it still moves the piece picker

A seek the client cannot reach in the running session reloads the playlist at a
new anchor. Two things can answer it.

**The session already produced that second.** A viewer who seeks back, or ahead
of the picture but behind the remux, is answered out of the running session: the
engine hands back that playlist cut to start at the segment holding the second
asked for, with `X-Hls-Start` naming it and `#EXT-X-MEDIA-SEQUENCE` naming the
first segment kept. No second ffmpeg, no byte fetched twice, and the client
learns nothing: it asked at its own anchor and every URI it is given is under it.

Two rules keep that from serving the wrong bytes. An anchor that has a session of
its own is always answered out of THAT one, never out of a sibling, because its
segment requests are served from it. And once a sibling has answered an anchor it
keeps answering it, even after the reaper has swept the first segment of the cut:
starting a second ffmpeg at that anchor would write over the segment names the
viewer is already reading, under a cache header that says they never change.

**Nothing has produced it yet.** Then a new ffmpeg starts with `-ss` before
`-i`, which over HTTP is a range request at the new offset and a new reader
positioned there, which is what the piece picker follows. Two things make that
cheap:

- The keyframe the remux will really start on is found by asking the demuxer for
  one frame FROM the anchor, not by scanning the thirty seconds before it. The
  seek a demuxer makes lands on the keyframe at-or-before the second it is given,
  which is the same seek `-ss` makes, so the first frame handed back is the
  answer and nothing else is read.
- The session the seek supersedes is marked, and taken at the reaper's first pass
  45 seconds after its last read, instead of the three minutes an ordinary idle
  session gets. A superseded ffmpeg keeps pulling its input at up to twice
  realtime, so the viewer would be waiting on half a line. It is only marked and
  never killed on the spot, because the same sibling may be what a SECOND viewer
  further back in the film is reading, and their next request clears the mark.

Measured on Sintel (129 MB, 1.1 Mbit/s) served over one shared 80 KB/s line,
seeking from the start to 420 s, which is the swarm's shape without the swarm's
variance:

| | seconds to the keyframe |
| --- | --- |
| a thirty second scan, sharing the line with the superseded reader | 192.5 |
| a thirty second scan, line to itself | 96.3 |
| one frame, sharing the line | 16.5 |
| one frame, line to itself | 8.6 |

Both forms answered the same keyframe, 415.875. The first segment costs a
further 15 s on that line, so a far seek went from about 208 seconds to the
picture to about 24.

The row a viewer lands on now is the third: the superseded reader is left alone
until it falls quiet, so the line is shared for that grace rather than freed at
once. The two "line to itself" rows are what the same seek costs once nothing
else is reading, which is also the second viewer's case.

The remainder is the swarm's and no scheduling here touches it: ffmpeg must read
from the keyframe at-or-before the anchor, and on a release with a ten second GOP
that is ten seconds of media whatever else is true. **So a far seek still waits,
and the player has to say why.** hls.js 1.7 abandons a manifest load after 20
seconds and retries a timeout twice, so a client playing a download in flight
needs a longer manifest timeout and a retry on 503. A 503 costs one poll interval
and no more: it never kills the ffprobe behind it, and the next call joins the one
already running.

The phone's AVPlayer has neither, and a stall reaches its caller only as a
`loading` status, never as the error hls.js hands the web and the television
before they reanchor. So the phone does three things itself:

- It hands AVPlayer a master only once the master has answered, through
  `readyMasterStart`, which retries the 503 the way `resolveMasterStart` does but
  at every anchor, the start of the film included.
- It starts each stream at its own first second. The playlist is `EVENT` with no
  `EXT-X-START`, so AVPlayer, like hls.js without `startPosition: 0`, would
  otherwise open it near the end of what has been cut.
- It watches for a playhead that has stopped over film already on disk
  (`arrivalStallWatch` in core, `useArrivalStall` in `@kromatv/core/react`): eight
  seconds still with the fifteen seconds after it on disk and nothing more loaded
  meanwhile, and it reloads its own stream and lands on that second. A reanchor
  there follows only a reload that bought no progress and left nothing loaded under
  the playhead. The reload comes first because it never leaves the session the
  phone was reading, where a new anchor may be answered out of a sibling.

At the real edge AVPlayer waits and resumes by itself, a few seconds of film at a
time, as each segment is cut. The map cannot tell that edge apart: it places bytes
by the file's average rate, and on a film whose opening minutes run above that rate
it said 181 s had arrived where the bytes held 146 s of picture. So the watch also
asks AVPlayer how far it has loaded, and leaves alone a player whose buffer is
still growing. At a slow edge that buffer can sit still longer than the eight
seconds, and the watch then reloads a player that would have resumed anyway: the
reload lands on the same second and plays within half a second, and it happens at
most once every thirty seconds.

When nothing arrives at all, AVPlayer gives the stream up: an `EVENT` playlist
unchanged for about forty seconds ends the item with CoreMedia error -12888. hls.js
keeps polling instead. So while the download is still arriving the phone keeps its
player up with a spinner, and reloads at the stalled second once the map shows
more film arrived since the failure. It shows the failure only once the whole film
has arrived, or at the third failure in a row with no frame played between them.

The television does the last two of those. The stall watch is the hook the phone
reads, `useArrivalRecovery` in `@kromatv/core/react`; the landing on the stream's
first second is armed on every attach of the `<video>` engine's native branch, the
re-attach after an audio switch and a re-anchor included.

That landing does nothing on desktop Chrome. Chrome 154 plays HLS itself, so
`canPlayType('application/vnd.apple.mpegurl')` answers `maybe` and a television
shell running on it takes the native path. Over a playlist with no
`#EXT-X-ENDLIST` it opens three target durations back from the end, reports
`duration` as `Infinity`, counts `currentTime` from 0 at the segment it joined,
and exposes no `seekable` range at all, so the offset is invisible to the element
and no assignment to `currentTime` moves it. On a catalogue master whose session
had cut 105 s it fetched `seg_00009` first, about 94 s in, while the player's
clock read 0:10 and Shaka over the same session read 0:07 with the picture to
match. An `#EXT-X-START:TIME-OFFSET=0,PRECISE=YES` in front of the same bytes
changed nothing. AVPlayer does take the seek, which is what the two lines above
rest on; what Tizen, webOS and WKWebView do could not be measured here.

One thing a client must not reason about on this path: the `<video>` element's own
`duration` is only what ffmpeg has written so far, 21 s on a film whose runtime is
10:58. The title's length comes from `X-Media-Duration` and nowhere else.

## What the wait is made of

Same film, same cap, the whole way from the press to the first segment:

| part | seconds |
| --- | --- |
| the indexer sweep inside `acquisition/watch` | 0.8, the slowest of three indexers |
| torrent metadata and the file list | 0.3 |
| the probe | 5.5, over nine cold runs, 4.7 at best and 12.0 at worst |
| the playlist | 0.1 |
| the first segment | 0.0, its bytes came in with the probe's |

The probe was 18.5 s before the container's index was fetched first, with four
of eight runs answering 503 at the 20 second wait before a later call got an
answer. After, none of nine did.

Only one of those is worth attacking, and it is not ffmpeg. ffprobe describes
Sintel from 640 KB in three reads: the head, the moov at the end, then the head
again. What it waits for is the second one, and the cost is the swarm's, not the
reader's. Every open stream's window is served equally and the ordinary queue
walks the file in order, so an index at the end of the file gets a fraction of
the line while the head takes the rest. With nothing reading the head at all,
the last mebibyte still took 25 s at 250 KiB/s.

So nothing reads the head until the index is in. When a token is minted for a
file, the module asks for the last mebibyte, walks the mp4 box chain from 64 KiB
of head to learn where the index really starts, and fetches the gap when the
guess came up short: a fifteen minute film's moov is 586 KiB, a two hour film's
is several megabytes. For the length of that read the torrent's selection is
emptied, so a peer has nothing else to offer, and the file is put back however
the read ends, including on a timeout. The probe waits for it before it opens
ffprobe.

A container whose index sits at the front pays one wasted mebibyte, which is
4 s on a capped line and a fifth of a second on a real one. The box walk is what
tells the two apart, and what catches an index bigger than the guess.

The floor under all of it is the bytes: the index, plus the first piece of the
file. At 250 KiB/s on Sintel that is 1.125 MiB and 4.6 s, and the fastest run
measured 4.7. Two things raise it and no scheduling here touches either. A piece
is the smallest thing the swarm hands over, so a release cut into 8 MiB pieces
pays 16 MiB before anything plays. And librqbit wakes a peer that found no work
only when another dies or a hash fails, so the move from the index to the head
can sit through an idle sleep of up to five seconds.

## Only the file being watched

A pack grabbed to watch one episode would otherwise fetch all ten while the
viewer waits on the head of one: the grab cannot name a file, because at grab
time the torrent has no file list. So the module narrows the torrent to one file
at the moment a token is minted for it, which is the first time a file is named.
Pieces already on disk are kept, so a viewer who then plays a second episode
re-selects rather than restarts, and the first episode's bytes are still there if
they go back.

Two consequences. A watch download narrowed to one file reports itself finished
once that file is in, so with `watchKeepInLibrary` on the import takes the one
episode and not the pack. And a torrent whose small files share a piece with the
head or the tail of the watched file still fetches them, because a piece is the
smallest thing the swarm hands over.

## What is offered, and what is not

A download is offered while the catalogue has nothing to offer in its place:
`downloading`, `seeding`, `completed`, `paused`. Never `imported`, because by
then the film has a catalogue row and the ordinary player is better in every way
(a resume position every device shares, generated subtitles, intro and credits
markers).

Two more refusals, both about not showing a card that cannot play:

- only the embedded engine, because only it can read a file it is still
  fetching. A qBittorrent or Transmission daemon is somebody else's process.
- only a download whose metadata the swarm has answered with. Before that the
  file list is unknown, so the entry waits for the next call rather than
  appearing empty.

The listing carries the original torrent index of each video file, and a ticket,
a probe and a playlist all name that index. Renumbering it anywhere would play
the wrong file.

## What the clients show

| client | surface |
| --- | --- |
| web | Lire on a film's discover card and on its title page, and Regarder maintenant on each row of Mes demandes |
| television | a rail on the home, and the watch screen it opens |
| phone | a rail on the home, and the `/watch/<id>` route it opens |

Every surface draws nothing when the capability is absent from
`GET /api/capabilities`, which is what a server without the module answers.

Each shell plays it through its ordinary player: the same chrome, keys, scrub bar
and engine choice as a catalogue item. What changes is the source it is handed. A
file with no catalogue row cannot answer a server-side resume position, and a
fabricated item would make it lie, so the position is kept on the device. The
heartbeat, the next episode and a cast name the file itself instead (see
[below](#the-heartbeat-the-next-episode-and-a-cast)). What the file carries itself is: its audio tracks by title,
its text subtitles, its chapters on the scrub bar, a storyboard that fills in as
the film arrives, and its HDR system and bit depth in the quality line and the
stats. A picture subtitle track (PGS, VobSub) is left out, as the catalogue
leaves it out. The top bar says how much of the file has arrived, and the scrub
bar draws the spans already on disk.

**The subtitle files the release ships beside the video are offered too**, after
the file's own tracks, in the one list. Most releases carry their subtitles that
way rather than inside the container, and each one is a few kilobytes, so the
selection a watch narrows the torrent to holds them from the moment it starts.
Narrowing to the video alone would fetch the film and never the words over it.
A file is listed once every piece of it is on disk, and answered whole, because
an index is a position in that list and one that could not be answered yet would
move every later track. The match is the catalogue's own
(`kroma_media::external_subtitles`), so `Sintel.fr.srt` and `Subs/2_French.srt`
read the same here as they do after an import.

Subtitles and the storyboard both grow while the file arrives, so neither is read
once.

```
GET M/watch/{id}/files/{file}/subtitles/{index}.vtt?t=<token>
GET M/watch/{id}/files/{file}/storyboard                      (session + right)
GET M/watch/{id}/files/{file}/storyboard.img?t=<token>&v=<n>
```

Both are read out of the islands already on disk, and an island is pulled in at
each end by ten seconds or a third of itself, whichever is smaller: a keyframe
before the island is in the hole, and a twenty second island whose whole length
went to the margin used to answer nothing at all. A tile whose own second cannot
be read answers no tile rather than the frame the demuxer resyncs to, which over
a file still arriving is minutes later. And a pass that stopped where the bytes
really stop, rather than where the average-rate guess said they would, is run
again as soon as more has arrived: what it proved is the last cue it wrote, not
the span it was handed.

A text track answers the cues found so far as WebVTT with `X-Kroma-Partial: 1`
and `Cache-Control: no-store`; a complete one answers `0` and may be kept for a
day. A player asks for it again every twenty seconds and right after a seek
lands, keeping every cue it already drew, until the track answers complete. An
index that is not a text subtitle track of the file is a `404`, and a picture
track (PGS, VobSub) is not offered at all. A file beside the video is never
partial: it answers `0` from the first read.

The storyboard manifest answers `{"url", "interval", "tileW", "tileH", "cols",
"rows", "count", "duration", "complete", "ready"}`, where `ready` is one
character per tile, `1` where a picture is there. Before the first tile is drawn
it answers `202 {"status": "pending"}`, which is a poll-again and not a refusal.
`url` is the sheet with the play token and the version already in it: the sheet
is rewritten in place under one name as tiles land, so `v` is what tells two
versions apart and the bytes themselves are `no-store`. A player asks again every
ten seconds until `complete`, shows no thumbnail for a tile marked `0`, and moves
to a newer version only once its picture has loaded, so a thumbnail never blanks
on the way. The sheet route is a `404` until a tile has been drawn.

The rules are pure functions in `@kromatv/core` (`heldCues`, `seekLanded`,
`storyboardAsksAgain`, `drawnTileIndex`), and the shells share one hook per
concern in `@kromatv/core/react`: `useWatchSubtitles`, `useWatchStoryboard`, and
`useLoadedSheet` for the swap between two versions of a sheet.

The three shells reach one screen, so neither half of it is written three times.
The road from a file to a picture, probe then ticket then ready, is
`useWatchScreen` in `@kromatv/core/react`, which also owns the cadence the
arrival figures are polled on: every two seconds while a viewer waits, every
five once the picture is up. Which module answers the capability at all is
`useCapability` beside it, on one spelling for every capability: undefined until
the map has been read, null where nothing answers. The arrangement over the picture is `<ArrivalPlayer>` in `@kromatv/ui`: the
arrival line under the title, the spans already on disk along the scrub bar, and
the download block in the stats.

What stays in a shell is what only that shell has. The web's query cache holds
the search and the listing, each shell owns its route and its media surface, and
the phone draws its own chrome here because it draws its own chrome for the
catalogue too.

## The heartbeat, the next episode and a cast

All three name the file the way the capability does, as a watch item:

```json
{"mount": "/api/module/tv.kroma.torrents", "id": "f13348a88094f2e1", "file": 1,
 "title": "Kaamelott", "poster": null, "tmdbId": 11466, "season": 1, "episode": 2}
```

The core keeps it and hands it on without reading it, so it learns no module id.
It only bounds it: the mount is an absolute path of plain segments, the id is
one segment, the title is cut to 256 characters with control characters removed,
and the poster is an `http(s)` or `/` address.

**The heartbeat.** `POST /api/playback/ping` takes a `watch` in place of
`itemId`, exactly one of the two, else a `400`. It needs `watchable.play`, as a
catalogue item needs the library it sits in, and the body is capped at 16 KiB.
The admin's "now playing" draws the session from what the ping said, with an
"En téléchargement" chip, and stops it exactly as it stops any other: the next
ping answers `410`, the `playback.terminate` event reaches the player, and the
player shows the stop message. The play history records it without an item id,
under the show's title.

**The next episode.** The file's own season and episode, read off its name,
start the search. The episodes after it come from the TMDB season listing the
catalogue already reads, `GET /api/discover/tv/{tmdbId}/season/{season}`, which
gives their titles and stills, then from the next season once this one runs out.
An episode that has not aired is never offered. When the same download holds the
next episode, the player opens that file of it; otherwise it opens the watch
route for that episode, whose start is idempotent. The web and the television use
the kit player's countdown card and up-next sheet (`useWatchUpNext`), and the
phone shows its catalogue card in the last thirty seconds and moves on when the
picture ends.

**A pack answers only for the episodes it holds.** The ledger knows the season a
pack was grabbed for and nothing else, so the module matches the episode against
the pack's own files, by the same names it lists them under. A pack that lacks the
episode is not reused: the start goes on to rank and grab a release that has it,
through the same idempotent path. While the swarm has not answered with the file
list yet the start waits up to ten seconds for it rather than guessing, and a
magnet whose metadata never arrives claims nothing.

**A cast.** `POST /api/cast/receivers/{id}/command` takes
`{"type": "watch", "watch": {...}, "positionMs": 42000}`, checked for shape and
for `watchable.play` and relayed as it was named. The television picks that
mount, opens its watch screen on the file at the position, and reports the file
back in `cast.state` as `watch`. A roster row carries it as `nowWatching`,
beside `nowPlaying` rather than inside it, so a remote built before it reads the
set as idle instead of failing on a missing `item`. A remote's next-episode key
moves the television on to the episode its own player offers.

## Two things to know before touching it

The module reverse proxy treats `content-length` as hop by hop and strips it, so
a `206` reaches the player chunked, carrying `Content-Range` and no length.
Chrome and the phone cope. Television browsers reading the raw bytes are
unverified. The same proxy follows a `3xx` itself, which is why the playlist pair
negotiates its mode in a header and not in a redirect.

A seek far ahead of the download blocks until those pieces arrive: measured at
nine seconds for the tail of the raw bytes when Sintel was 33 per cent complete,
and at the figures above through HLS. That is the reader working, not a stall,
and it is why the hint exists.

And the part no tunnel changes: while a viewer watches, their client is also a
peer, uploading what it has to the swarm. A VPN hides the address. It does not
change what the machine is doing.
