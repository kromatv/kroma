# What the brand film's encodes rely on

The boot film ships as two files in `packages/ui/src/assets/`, and every client
plays the first one its decoder takes:

| File | Codec | Picture | Size | Played by |
| --- | --- | --- | --- | --- |
| `kroma-intro-hevc.mp4` | HEVC Main, level 5.1 | 3840x2160, 60 fps | 8.2 MB | `<KromaIntro>`, first source |
| `kroma-intro-hevc-1080.mp4` | HEVC Main, level 4.1 | 1920x1080, 60 fps | 3.7 MB | `<NativeFilm>`, first source |
| `kroma-intro-h264.mp4` | H.264 High, level 3.2 | 1280x720, 60 fps | 3.4 MB | both, second source |

All three carry the same AAC-LC stereo track at 48 kHz. This page records the
platform facts the H.264 encode is cut to, with their sources. Read 2026-11-17.

## Samsung, 2017 sets (Tizen 3.0)

Source: [2017 TV Video Specifications](https://developer.samsung.com/smarttv/develop/specifications/media-specifications/2017-tv-video-specifications.html),
with the [2016 page](https://developer.samsung.com/smarttv/develop/specifications/media-specifications/2016-tv-video-specifications.html)
for comparison. Documented.

- Every 2017 class lists MP4 and "H.264 BP/MP/HP".
- The FHD class (17TV_STANDARD, the M series and HD sets) plays H.264 at
  1920x1080, 60 fps, 20 Mbps, with the note "H.264 FHD: Level 4.1 supported".
  Level 4.1 holds 1080p at 30 fps only: 1080p60 needs level 4.2, so the table
  and the note disagree. The UHD classes add "H.264 UHD: Level 5.1 supported".
- The 2016 page goes further: "Above 1280x720: Maximum 30 fps". 1280x720 at
  60 fps is inside both years' limits.
- "Media with higher bit or frame rate than specifications can cause video or
  audio playback to stall."
- Audio: "AAC / HE-AAC", 48 kHz among the listed sample rates. No channel count.
- Every 2017 class lists HEVC, but the FHD class only to "HEVC FHD: Level 4.1",
  below the 4K master's 5.1.
- No page separates what the HTML5 `<video>` element plays from what AVPlay
  plays. The [video element guide](https://developer.samsung.com/smarttv/develop/guides/multimedia/media-playback/using-video-elements.html)
  points back to the media specifications.

## LG, webOS 4.0 (2018 sets)

Source: [webOS TV 4.0 video and audio formats](https://webostv.developer.lge.com/develop/specifications/video-audio-40),
same numbers in the [2019 archived copy](http://web.archive.org/web/20190307062734/http://webostv.developer.lge.com/discover/specifications/supported-media-formats/webos-40/).
Web engine from [Web API and web engine](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine).
Documented.

- MP4 with H.264 and AAC.
- All models: "H.264 1920x1080@60P BP/MP/HP@L4.2 Maximum 40Mbps". UHD models add
  3840x2160 at 60 fps, level 5.1.
- All models: "HEVC 1920x1080@60P Main/Main10@L4.1". The 4K master needs a UHD
  model.
- "AAC Main profile is not supported." AAC-LC is not named; nothing lists sample
  rates or channels for AAC.
- webOS 4.x runs Chromium 53. As with Samsung, nothing says whether the limits
  differ for a web app's `<video>`.

## The H.264 encode

1280x720 at 60 fps, H.264 High at level 3.2, sits inside every limit above:
Samsung's level 4.1 note, its 2016 frame-rate note and LG's level 4.2, at
2.6 Mbit/s against 20 and 40. Level 3.2 holds 720p60 exactly, and x264 caps the
reference frames to what the level allows (5). It is also the cheapest of the
encodes that keep 60 fps: 1080p30 cost as many bytes and judders on the tunnel.

From the 4K master, with ffmpeg 8.1.1 and x264:

```bash
ffmpeg -i kroma-intro-hevc.mp4 -map 0:v:0 -map 0:a:0 \
  -vf "scale=1280:720:flags=lanczos" -c:v libx264 -preset veryslow -tune animation \
  -profile:v high -level:v 3.2 -bf 3 -pix_fmt yuv420p -crf 22 \
  -maxrate 8M -bufsize 16M -c:a copy -movflags +faststart kroma-intro-h264.mp4
```

`<source type>` carries each file's codecs string as read from its sample
description: `avc1.640020` from the avcC box (High, no constraint flags, level
32) and `hvc1.1.6.L153.90` from the hvcC box (Main, compatibility flags 6,
level 153, constraint byte 0x90). A new encode means reading them again.

## Native players

Sources: the [Android 17 CDD](https://source.android.com/docs/compatibility/17/android-17-cdd),
the [Android 7.0 CDD](https://source.android.com/docs/compatibility/7.0/android-7.0-cdd),
[Android supported media formats](https://developer.android.com/media/platform/supported-formats),
AndroidX Media3 1.9.1 (`DefaultTrackSelector`, `MediaCodecVideoRenderer`), the
[Apple TV HD technical specifications](https://support.apple.com/en-us/111928),
the [Expo SDK version table](https://docs.expo.dev/versions/latest/) and the
expo-video 58.0.12 sources. Documented, except where marked.

- Android requires an HEVC decoder on handhelds and televisions ("[5.3/H-0-2]",
  "[5.3.5/T-0-3]") but guarantees only Main Profile Level 3 (SD). 1080p60 HEVC
  is a must only on a television with a hardware HEVC decoder (since Android 9).
  H.264 1080p60 High 4.2 is a must on every television ("[5.3.4/T-1-3]").
- AOSP ships a software HEVC decoder since Android 5.0 (`OMX.google.hevc.decoder`,
  later `c2.android.hevc.decoder`).
- Media3, which expo-video plays through on Android: a video track with no
  decoder is left unselected and the sound plays alone, with no player error.
  A track beyond the decoder's reported limits is still selected
  (`exceedRendererCapabilitiesIfNecessary` defaults to true) and may fail.
- expo-video reports each video track's `isSupported` with `sourceLoad`
  (`Tracks.Group.isTrackSupported` on Android, `AVAssetTrack.isPlayable` on iOS),
  and `statusChange` reports `error` for a player error. `<NativeFilm>` moves to
  the next film on either.
- Expo SDK 58 runs on iOS 16.4 and later, whose oldest devices (iPhone 8, iPad
  5th generation) decode HEVC in hardware.
- Apple TV HD, still on tvOS 26: "HEVC SDR up to 1080p, 30 fps" and "H.264
  video up to 1080p, 60 fps, High or Main Profile level 4.2 or lower".

## Open questions

- What AVPlayer does with the 1080p60 HEVC film on an Apple TV HD, rated for
  30 fps: whether the track still reports playable (so the H.264 film is never
  tried) and drops frames, or fails.
- Whether `c2.android.hevc.decoder`, which declares enough blocks per second for
  1080p60, keeps up on a television without a hardware HEVC decoder. It reports
  the track supported, so `<NativeFilm>` stays on HEVC there.
- Whether a 2017 Samsung FHD set's web engine answers `canPlayType` for the
  level 5.1 HEVC master. If it says yes and the decoder refuses the file before
  its metadata, the element moves on to H.264; if the refusal comes as a decode
  error after it, the intro hands off without the film.

## Verified

On 2026-11-17, against `bun run build:tizen` and `bun run build:webos` served
locally:

- Chrome 157 on macOS: `canPlayType` answers `probably` for both strings and
  the 4K HEVC film plays, then the app opens.
- The same Chrome with `--disable-features=PlatformHEVCDecoderSupport`: HEVC
  answers `""`, the 720p H.264 film plays, then the app opens.
- Chromium 47.0.2526.0 (snapshot r352221) with the Tizen 3.0 user agent loads
  the deep tier, and Chromium 53.0.2785.0 (r403389) with the webOS 4 user agent
  the legacy tier. Both are open-source builds without H.264 or AAC, so they
  answer `""` for both strings: each `<source>` fires `error` and the intro
  hands off to the app as soon as the last one does.

Not run: H.264 on a real 2017 Samsung or 2018 LG set, or on any Chromium 47 or
53 build that carries the proprietary codecs.
