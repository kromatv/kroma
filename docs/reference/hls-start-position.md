# Where an HLS player starts a remux

A remux the server is still writing is an EVENT playlist with no
`#EXT-X-ENDLIST`, and every player below treats that as live. Left alone, a
live playlist is joined near its end, not at its first segment. Since the remux
reads its first 60 seconds at full speed (`READRATE_BURST` in
`server/crates/kroma-media/src/hls/ffmpeg.rs`) and then runs at twice real time,
its end is already far past the anchor when the player first reads it.

So every media playlist the engine hands out carries
`#EXT-X-START:TIME-OFFSET=0` as its second line, on the first answer and on
every reload, whether the remux is running or finished, and on a playlist cut
out of a sibling session (`from_its_first_segment` in
`server/crates/kroma-media/src/hls/cut.rs`, called from `HlsEngine::master`).
This page records why the tag works, with sources. Read 2026-11-18.

## The specification

Sources: [RFC 8216](https://www.rfc-editor.org/rfc/rfc8216) and its successor,
[draft-pantos-hls-rfc8216bis-22](https://datatracker.ietf.org/doc/html/draft-pantos-hls-rfc8216bis-22)
(1 May 2026). Documented.

- EXT-X-START "indicates a preferred point at which to start playing a Playlist.
  By default, clients SHOULD start playback at this point when beginning a
  playback session." A positive TIME-OFFSET counts from the beginning of the
  playlist. RFC 8216 section 4.3.5.2, draft section 4.4.2.2, same text.
- PRECISE is optional and defaults to NO: start at the segment holding the
  offset and render every sample in it. At offset 0 that segment is the first
  one, so PRECISE changes nothing and is left out.
- Without the tag, a client "SHOULD NOT choose a segment that starts less than
  three target durations from the end" of a playlist with no EXT-X-ENDLIST (RFC
  section 6.3.3). The draft says the same through HOLD-BACK, whose absence
  "implies a value of three times the Target Duration" (section 4.4.3.8). With
  6-second segments that is 18 seconds before the end.
- An EVENT playlist "MUST NOT change or delete any part of the Playlist file; it
  MAY append lines to it" (RFC section 6.2.1). The tag therefore has to be in
  the very first answer, at a fixed place, never added later.
- The tag may sit in a multivariant playlist instead, and then "SHOULD NOT
  appear in any Media Playlist referenced by" it (RFC section 4.3.5). The
  subtitle wrapper in `server/src/api/stream/native_subtitles.rs` leaves it out,
  so the media playlist under it carries the only copy.
- One rule is knowingly bent: without EXT-X-ENDLIST, "the TIME-OFFSET SHOULD NOT
  be within three target durations of the end of the Playlist file". The first
  answer can hold a single segment. It holds because the remux outruns playback
  from the start: 2 seconds after the first request at an anchor of 79 s, the
  playlist already listed 10 segments (measured on this branch).

## What each player does with it

| Player | Where KROMA uses it | Without the tag | With `TIME-OFFSET=0` | How it is known |
| --- | --- | --- | --- | --- |
| Media3 1.9.1 | expo-video on Android TV and Android | 3 target durations before the end | first segment | source, and the emulator |
| AVFoundation | expo-video on Apple TV and iOS, Safari | 3 target durations before the end | first segment | iOS 27 simulator; tvOS not tested |
| hls.js 1.7.3 | web and TV web shells, `remux` engine | the caller's `startPosition` | unchanged | source |
| Shaka 5.3.1 | web and TV web shells, default engine | the caller's start time | unchanged | source |
| Samsung AVPlay | Tizen | not documented | tag not supported | documented |
| LG webOS player | webOS native HLS | not documented | not documented | nothing published |
| ffmpeg 8.1.1 demuxer | desktop shell's mpv | 3 segments before the end | ignored by default; the shell sets `live_start_index=0` | source, and mpv 0.41 |

### Media3

expo-video 58.0.12 depends on Media3 1.9.1 (`android/build.gradle`) and sets no
live configuration of its own. Read at the
[1.9.1 tag](https://github.com/androidx/media/tree/1.9.1/libraries/exoplayer_hls/src/main/java/androidx/media3/exoplayer/hls).

- `HlsPlaylistParser` reads `#EXT-X-START` in media playlists only; the
  multivariant parser ignores it.
- A playlist without an end tag is live (`DefaultHlsPlaylistTracker`:
  `isLive = !newSnapshot.hasEndTag`), and `HlsMediaSource.createTimelineForLive`
  sets the default start to `startOffsetUs` when the tag is there, otherwise to
  the duration minus the target offset, which falls back to
  `3 * playlist.targetDurationUs`.
- Without PRECISE, the start snaps to the segment holding the offset: segment 0.
- `suppressPositionProjection` is true for an EVENT playlist with a zero or
  positive offset, so the player never projects that default start forward in
  time (`SinglePeriodTimeline.getWindow`).
- Playback speed is left at 1.0: `updateLiveConfiguration` disables speed
  adjustment when the media item sets no speeds and the playlist has no
  `EXT-X-SERVER-CONTROL` hold-back, which ours never has.

Verified on the Chromecast_HD_GoogleTV emulator (Android 14), engine `auto`, a
`testsrc` film whose frame shows its own second:

| Case | Asked | Before: first frame | After: first frame |
| --- | --- | --- | --- |
| Resume from home | 600 | 640 | 598, the keyframe before the anchor |
| Far seek, answered out of the running session | 872 (before), 724 (after) | 1102 | 718, the segment holding 724 |

### AVFoundation

- Apple lists EXT-X-START from protocol version 6, iOS 7
  ([About the EXT-X-VERSION tag](https://developer.apple.com/documentation/http-live-streaming/about-the-ext-x-version-tag)).
  No Apple page says where AVPlayer starts an EVENT playlist.
- A December 2016 report says `#EXT-X-START:TIME-OFFSET=0.0` on a live stream
  worked on iOS "but not Quicktime 10.4 and tvOS". An Apple media engineer
  answered in January 2017: "As a workaround I would try a small positive offset
  instead. E.g. #EXT-X-START:TIME-OFFSET=0.01"
  ([forum thread 69442](https://developer.apple.com/forums/thread/69442)).
- Measured in Safari on the iOS 27 simulator, which plays the master natively
  with no start of its own (the web client's Safari path does the same).
  `currentTime` at the first `playing` event: no tag, 18.00 on a playlist first
  read at 6 segments and 42.00 on one read at 10, so 18 seconds before its end;
  `TIME-OFFSET=0`, 0.00 twice; `TIME-OFFSET=0.01`, 0.00. The 2016 report does
  not reproduce on iOS 27. tvOS 27 shares AVFoundation but was not tested: if an
  Apple TV is ever seen joining a remux late, `0.01` is the workaround Apple
  gave, and it starts every other player above on the same first segment.

### hls.js and Shaka

Both web clients and the TV web shells pass their own start: hls.js gets
`startPosition` (0 on the web, the stream's own clock on TV), Shaka gets
`load(url, startTime)`.

- hls.js uses the playlist's offset only when `startPosition` is -1
  (`setStartPosition` in
  [`base-stream-controller.ts`](https://github.com/video-dev/hls.js/blob/v1.7.3/src/controller/base-stream-controller.ts)).
- Shaka uses `manifest.startTime` only when the caller passed none, and tests it
  for truth, so an offset of 0 is never used at all
  (`if (startTime == null && this.manifest_.startTime)` in
  [`lib/player.js`](https://github.com/shaka-project/shaka-player/blob/v5.3.1/lib/player.js)).

Measured in Chrome against the same server, before and after: both engines
show their first frame within 0.03 s of `currentTime` 0 on a master anchored
at 600, whose `X-Hls-Start` is 598.041.

### Samsung and LG

- Samsung's [general specifications](https://developer.samsung.com/smarttv/develop/specifications/general-specifications.html)
  mark `#EXT-X-START` (and `#EXT-X-PLAYLIST-TYPE`) "Not supported". The same
  cell covers `#EXT-X-INDEPENDENT-SEGMENTS`, which ffmpeg already writes into
  every remux, so AVPlay skips such tags rather than failing on them. KROMA's
  AVPlay engine seeks to 0 itself after opening a master (`seekToAnchor` in
  `packages/tv/src/features/playback/player/avplay-master.ts`).
- LG's [streaming protocol page](https://webostv.developer.lge.com/develop/specifications/streaming-protocol-drm)
  lists the HLS tags its native player does not fully support; EXT-X-START is
  not among them, and nothing says it is honoured. The webOS shell plays a
  master through hls.js or Shaka; on the native path, `startStreamAt` in
  `packages/tv/src/features/playback/player/html-events.ts` moves the element
  back to the start once it has loaded.

### ffmpeg's demuxer (desktop shell)

The desktop shell plays a master through mpv, which reads HLS with ffmpeg's
demuxer. In [`libavformat/hls.c`](https://github.com/FFmpeg/FFmpeg/blob/n8.1.1/libavformat/hls.c)
a live playlist starts at `live_start_index`, default -3 (three segments before
the end), and `#EXT-X-START` is read only when `prefer_x_start` is set, default
0. The tag changes nothing there.

So the shell passes `live_start_index=0` to that demuxer itself
(`demuxer-lavf-o` in `apply_common_options` in
`clients/desktop/src-tauri/src/libmpv_shared.rs`, and in `BASE_ARGS` in
`clients/desktop/src-tauri/src/mpv/launch.rs` for the sidecar). It reaches
every server, whether its playlists carry the tag or not.

Measured with mpv 0.41 on 2026-11-19, a `testsrc` film whose frame shows its own
second, a master at 100 answered out of a session running from 0 and already
past 200: without the option the first frame read 198; with it, 2 seconds in,
98 against an `X-Hls-Start` of 96.043. The option leaves direct play alone: an
MKV, an MP4 and the server's byte-range stream open as before.
