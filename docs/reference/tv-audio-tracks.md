# Audio tracks in a TV's own player

What the TV engines rely on when a television's player opens the original
file and KROMA has to ask it for the soundtrack the viewer chose
(`nativeAudioPosition` in `packages/core/src/hevc/native-audio-position.ts`,
used by `expo-direct-audio.ts` and `avplay-direct.ts` in
`packages/tv/src/features/playback/player/`). Each fact names its source.
Read 2026-11-18.

## Sources

- **A**: Samsung's [AVPlay API reference](https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/avplay-api.html),
  sections `1.12 AVPlayStreamInfo`, `getTotalTrackInfo`, `setSelectTrack` and
  `getCurrentStreamInfo`.
- **W**: react-native-tv's `packages/react-native-webos/docs/reference/webos-media-playback.md`
  and `runtime/host/expo/modules/video/` at `faecb75`.
- **P**: [GLinnik21/plx-native](https://github.com/GLinnik21/plx-native/tree/f8f6dbb75c783de7c790608653e212a14c2ec66c)
  at `f8f6dbb`, `docs/uri-mode.md`. Its author's set is on webOS 4.5.
- **N**: [iqui27/nuvio-native-legacy](https://github.com/iqui27/nuvio-native-legacy/tree/7cac4f25d11931b56c41cfefb952e4e183c45c1a)
  at `7cac4f2`, `src/video.c`. Its author's set is a C9 on webOS 4.10.
- **S**: [stremio-origin/webos](https://github.com/stremio-origin/webos/tree/051818e)
  at `051818e`, `src/platform/webos/video_webos.c`, tested on a 4.4 set.
- **K**: KROMA's own server, 2026-11-18: an LG OLED65B8 on webOS 4.4 played a
  Matroska file with English as track 0 and Français as track 1, flagged
  default, in French when English was chosen.

## Samsung AVPlay

- `getTotalTrackInfo()` returns every track as `{ index, type, extra_info }`.
  An audio track's `extra_info` is a JSON string shaped
  `{"language":"%s","channels":"%d","sample_rate":"%d","bit_rate":"%d","fourCC":"%s"}`,
  and the page's one example has `"language":"en"`. (A)
- The order of that list, and whether `index` is the track's place in the
  container, are not stated. (A)
- `setSelectTrack('AUDIO', trackIndex)` takes the `index` field of that list. It
  is documented for the PLAYING state, and for READY only on Smooth
  Streaming. (A)

## LG webOS

- `sourceInfo` lists `audioTrackInfo[]` with `language`, `codec`, `channels`,
  `sampleRate` and `bitRate`. `selectTrack` takes
  `{"mediaId":M,"type":"audio","index":n}`, confirmed by `trackSelected` or by
  an `audioInfo` naming the track. (W)
- On a C9 the pipeline gives two-letter codes in `audioTrackInfo`
  (`"en"`, `"es"`, `"fr"`, `"it"`). (N, the comment above the subtitle probe)
- The pipeline picks its own tracks at load. Players that ship on it start
  without selecting and send the position in `audioTrackInfo` as the `index`.
  (S: `play` without a select, `video_select_audio`; N: `video_escolher_audio`)
- On 4.5 the track chosen at load is named by an `audioInfo` event before
  `loadCompleted`. That was measured with a one-track file only. (P)
- react-native-webos reports the first track as playing once `sourceInfo`
  arrives and does not read `audioInfo`, so its `audioTrack` can name a track
  the pipeline is not playing. (W: `readSourceInfo`)
- Not known: whether `audioTrackInfo` follows the file's order, and whether the
  pipeline starts on the track the file flags as default. Either one explains
  K. Choosing by language avoids both.

## What KROMA does with this

- A track is found in the player's list by language first (`eng`, `en` and
  `fre`, `fr` compare equal), then by its rank among tracks of that language,
  and by position only when the language cannot decide. A position whose own
  language says it is another track is never taken.
- The expo-video engine asks for the track at every open and on every pick,
  the one already playing included, because the player's own report of what
  plays cannot be trusted on webOS. A track the player does not list plays
  through the server's remux instead.
