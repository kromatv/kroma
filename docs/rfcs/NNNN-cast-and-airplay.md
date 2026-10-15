# RFC NNNN: playing on a Chromecast or an AirPlay TV that has no KROMA app

- Status: **DRAFT**
- PR: #NNNN
- Affects: `docs/spec/playback/README.md` (PLAY-48, and a new casting chapter from
  PLAY-54), the server's media ticket and CORS, `packages/ui` cast services,
  `clients/mobile`, `clients/web`, and a new shell, `clients/cast`

## Summary

Let a KROMA client send playback to a television that speaks Google Cast or AirPlay and
runs no KROMA app. AirPlay comes first and is mostly client work: the iPhone app plays
through AVPlayer and Safari through native HLS, both hand the URL to the TV, and the media
ticket already rides in that URL. Google Cast needs a receiver of our own: one Custom Web
Receiver hosted at `cast.kroma.tv` and registered once with Google. It takes an item id, a
list of server addresses and a ticket scoped to that item, picks a stream from the TV's own
decoders, and reports progress itself. The phone and Chrome drive it through Google's
sender SDKs. KROMA-to-KROMA casting stays as it is, and stays the path for TVs that run the
app.

## Motivation

Casting today reaches a television only when it runs the KROMA app and is signed into the
caller's account (`server/src/api/cast.rs`). Plenty of screens cannot run the app:

- a Chromecast without Google TV (3rd gen, Ultra) and a Nest Hub;
- an AirPlay 2 TV from Samsung, LG, Sony or Vizio, and any TV in a guest room or at a
  friend's;
- the Samsung and LG sets that gained Google Cast in 2024 to 2026 firmware, where the
  KROMA app is not installed.

The phone's only option there is screen mirroring: it re-encodes its own screen, drains its
battery and stops when it locks. People expect the Cast and AirPlay icons because every
other video app has them.

## What exists to build on

All on `origin/main`:

- **A credential that needs no header.** Every media byte route takes `?t=<ticket>`
  (`server/src/api/media_ticket.rs`). A playlist signs its segment and init URIs
  (`stream/hls_playlist.rs`), and the shaping redirect keeps the ticket.
- **The one format both protocols accept.** The remux is HLS with fMP4 segments, shaped per
  request by `?copy=`, `?video=` and `?maxw=&maxh=`.
- **Rules that take the device as an argument.** `canDirectPlay(item, caps)` and the
  engine selection in `@kromatv/core` decide from a `PlaybackCapabilities` value, so they
  can decide for a TV the sender is not.
- **A provider with a socket for platform bridges.** `CastProvider`
  (`packages/ui/src/services/cast.tsx`) already takes an optional `lan` bridge. The remote
  screen, the mini bar and the web cast bar read only `active.nowPlaying` and `positionMs`.
- **AirPlay, installed and unused.** expo-video 57 is AVPlayer on iOS and ships
  `VideoAirPlayButton` and `allowsExternalPlayback`. `PlayerBody.tsx` sets neither.
- **Safari plays the remux natively** (`video-engine.ts`: `v.src = url`), which is the path
  AirPlay can take.

## Proposal

### AirPlay

The sender stays the player. AVPlayer or Safari hands the URL to the TV, the TV fetches it,
and the phone keeps the clock, the heartbeat and the progress reports. The server does not
learn anything new.

1. **iOS app.** A `VideoAirPlayButton` in the player chrome beside the cast button, and
   `allowsExternalPlayback` set explicitly. When `isExternalPlaybackActive` turns on, the
   player shows an AirPlay state over the poster and keeps its transport controls.
2. **Safari.** An AirPlay control in the web player when
   `webkitplaybacktargetavailabilitychanged` reports a target. It calls
   `webkitShowPlaybackTargetPicker()`. It appears on the direct and native-HLS paths only,
   because AirPlay cannot carry an MSE stream. Shaka 4.12 and later add their own HLS
   alternative source.
3. **Subtitles.** The phone draws its subtitles itself, so an AirPlay TV would show none.
   The remux gains WebVTT renditions in a multivariant master (`EXT-X-MEDIA
   TYPE=SUBTITLES`, with `X-TIMESTAMP-MAP` aligned to the anchor). While AirPlay is active
   the app selects the rendition instead of drawing cues. Image subtitles (PGS, VobSub) stay
   unavailable, as they are on every client today.
4. **HEVC.** A copied HEVC stream in the remux is tagged `hvc1`, which Apple requires for
   HEVC in fMP4 HLS. The download path already does this.
5. **The unknown target.** Nothing in iOS lists AirPlay routes or says what the chosen one
   decodes. Spike 0 decides whether the phone's own plan is good enough or whether starting
   AirPlay re-plans against a conservative table (H.264 and HEVC Main/Main10; AAC, AC-3,
   E-AC-3; no DTS, TrueHD or Dolby Vision profile 7).

AirPlay does not reach the Android app, Chrome, Firefox or the desktop app, whose mpv cannot
hand a URL to AirPlay.

### Google Cast: the receiver

A new shell, `clients/cast`: a Cast Application Framework (CAF) Web Receiver deployed to
`https://cast.kroma.tv` from Cloudflare, the way `tv-web` deploys, and registered once in
the Google Cast console. One app id serves every install, because nothing install-specific
lives in the receiver: the sender hands over the address and the credential on each LOAD.
Jellyfin's receiver works the same way.

A LOAD carries `contentId` = the item id and a versioned `customData`, parsed with zod on
arrival:

- `bases`: the server addresses to try, in order;
- `ticket`: a cast ticket (see the server section);
- `startMs`, `audio`, `subtitle`;
- `sender`: the name to show and to log.

The receiver then:

1. probes each base's `/api/health` and keeps the first whose `instanceId` matches, so a
   phone on the tunnel URL and a TV on the LAN still find the same server;
2. fetches the item with the ticket;
3. builds a `PlaybackCapabilities` from `canDisplayType` and `getDeviceCapabilities`
   (frame size, HDR, Dolby Vision) and runs the rules every other client runs. The probe
   lives in the receiver; the rules stay in `@kromatv/core`;
4. plays `/stream` when the file is MP4, M4V, MOV or WebM with one audio track the TV
   decodes, and the fMP4 remux shaped by its declaration otherwise. Cast plays no MKV;
5. reloads at a new anchor for a seek outside the remuxed window, and for a change of audio
   track;
6. draws subtitles itself from the WebVTT route, as the other KROMA players do, so cues
   line up with an anchored stream;
7. reports progress, ping and stop every 10 seconds with the ticket, so the resume point
   survives a phone that leaves the house.

Audio falls back to the server's stereo AAC whenever the source is not AAC, MP3, Opus or
FLAC. AC-3 and E-AC-3 on Cast are passthrough only and depend on the HDMI sink, and
Jellyfin turned them off after trouble with HLS. They stay off until tested on real
hardware.

A custom namespace, `urn:x-cast:tv.kroma`, carries state shaped like `CastNowPlaying`
(item, position, duration, state, track lists) to every connected sender, and carries
`setAudio`, `setSubtitle` and `skipNext` back. Play, pause, seek and stop use the standard
media channel, so the TV remote, Google Home and the phone's system notification work as
well.

The receiver uses CAF's own player and styles it. It loads no React: it is a player, and a
Chromecast with Google TV HD is the floor it runs on.

### Google Cast: the server

1. **A cast ticket.** `POST /api/cast/tickets { itemId }` (bearer, `playback` capability,
   library grant checked) returns `{ ticket, expiresAt, bases }`. The ticket is today's
   media ticket with the item id inside its signed claim. It opens that one item: its byte
   routes, subtitles and storyboard, its metadata, and its progress, ping and stop. It dies
   with the sender device, as today's ticket does. Its lifetime covers the runtime plus a
   margin, capped at today's 12 hours. The phone's account-wide ticket never reaches a TV.
2. **Addresses.** `bases` lists every private IPv4 address the server listens on, with its
   port, then `remoteUrl` when set. The sender puts its own base first unless it is a
   loopback address. No loopback address ever reaches a TV.
3. **CORS.** `https://cast.kroma.tv` joins `OFFICIAL_CLIENTS` in `server/src/api/origin.rs`,
   beside `https://tv.kroma.tv`.
4. **Attribution.** Progress, ping and stop accept a cast ticket for their own item, and the
   playback session records the receiver's name, so the admin dashboard shows
   "Salon (Chromecast)" and not the phone.

### Google Cast: the senders

`CastProvider` gains a second optional bridge, `googleCast`, beside `lan`. It lists
devices, starts and ends a session, sends the LOAD and relays the namespace. `active`
becomes either a KROMA receiver or a Cast session, and `send` dispatches on which. The
remote screen, the mini bar, the track pickers and the web cast bar do not change.

- **Mobile, iOS and Android.** `react-native-google-cast` through its Expo config plugin,
  with KROMA's app id. `app.json` adds `_googlecast._tcp` and `_<APPID>._googlecast._tcp`
  to `NSBonjourServices`, and the local-network text, in both languages, names televisions.
  Cast devices become a third kind of row in `CastDeviceList`. Android already assumes Play
  services for push; a phone without them lists no Cast devices.
- **Web.** The same bridge over `cast_sender.js`, loaded on demand in Chromium. Google only
  offers it on a secure context, so it works on https (own domain, the tunnel) and on
  localhost, and not on `http://<LAN IP>:4040`, which is where most self-hosted web clients
  live. Firefox and Safari get no Cast.

A Google TV that runs the KROMA app appears twice, as a KROMA TV and as a Cast device. The
KROMA row sorts first, and the Cast row says it is Google Cast. Merging the two is Cast
Connect's job (later).

### Phases

Each phase ships on its own.

0. **Spikes on real hardware:** the Chromecast with Google TV HD, the Apple TV, the Samsung
   TV and an iPhone. Three answers can change the design, so they come first.
   - Does an https receiver on current Cast firmware fetch HLS segments, JSON and WebVTT
     over plain http from a LAN address? The evidence so far is a 2019 test of a progressive
     file and Jellyfin working in practice. Record the `Origin` header it sends and whether
     Chrome's Local Network Access interferes. An unpublished receiver on a registered
     device answers this in a day.
   - Does today's iOS build already AirPlay the anchored remux and a direct MP4 from Control
     Center (`allowsExternalPlayback` defaults to true)? Across a seek to a new anchor? With
     the phone locked? To the Samsung's AirPlay 2?
   - Does Safari on macOS AirPlay the native-HLS path?

   If plain http fails on Cast, the Cast phases ship for servers reached over https and
   wait on LAN HTTPS for the rest (see Unresolved).
1. **AirPlay:** the iOS button and state, the Safari control, `hvc1`. A subtitle notice
   while on AirPlay.
2. **AirPlay subtitles:** WebVTT renditions in the remux.
3. **Server for Cast:** the cast ticket, `bases`, CORS, ticket-accepting progress.
4. **The receiver**, its console registration and its deploy workflow, driven from the web
   client on localhost during development.
5. **The mobile Cast sender.**
6. **The web Cast sender**, on secure contexts only.

Later, each its own decision:

- **Cast Connect.** Register the Android TV app's package against the same app id, so
  casting to a Google TV that has KROMA opens the native app, with its full engine set and
  VLC for what Cast cannot play. Native Kotlin behind an Expo module in `tv-native`.
- **Server-side Cast control** (see Alternatives).
- **E-AC-3 5.1 as a transcode target,** so DTS and TrueHD keep surround on an Apple TV or a
  Cast device behind an AV receiver. Today every transcode is stereo AAC.
- **A full-length VOD playlist** whose segments are produced on request. Any receiver could
  then seek on its own, and the anchor reloads would go.

## What the TVs play

From Google's media page and the device spec sheets, September 2026. The receiver probes
at runtime rather than trusting this table; it is here to size the fallbacks.

| Receiver | Max | Video | HDR | Never |
|---|---|---|---|---|
| Chromecast 3rd gen | 1080p60 | H.264 | none | HEVC, DTS, MKV |
| Chromecast with Google TV HD | 1080p60 | H.264, HEVC, VP9, AV1 | HDR10, HDR10+, HLG | Dolby Vision, DTS, MKV |
| Chromecast with Google TV 4K | 2160p60 | H.264, HEVC, VP9 | HDR10, HDR10+, HLG, Dolby Vision | AV1, DTS, MKV |
| Google TV Streamer | 2160p60 | H.264, HEVC, VP9, AV1 | HDR10, HDR10+, HLG, Dolby Vision P5 and P8 | DTS, MKV |
| Apple TV 4K over AirPlay | 2160p60 | H.264, HEVC | HDR10, HDR10+, HLG, Dolby Vision P5 | DTS, AV1, MKV, DASH |
| AirPlay 2 TVs | undocumented | | | |

Every Cast device decodes AAC, MP3, Opus, Vorbis and FLAC, and passes AC-3 and E-AC-3
through to the HDMI sink without decoding them. The Apple TV decodes AAC, MP3, ALAC, FLAC,
AC-3 and E-AC-3. Text subtitles only, WebVTT preferred, on both.

## What this costs

- **A hosted receiver at `cast.kroma.tv`, forever.** Every install depends on it; when it
  is down, Cast is down for everyone. The app id is compiled into every shipped build and
  can never change.
- **A Google dependency.** A $5 developer account, the console, the SDKs, and Google's say
  over publishing.
- **A second player to maintain.** The receiver re-implements anchors, subtitles and
  progress on top of CAF, and has to follow CAF: 3.0 made Shaka its default HLS player in
  July 2026.
- **SDK churn on mobile.** The Google Cast iOS SDK leaves CocoaPods after 4.8.6 for Swift
  Package Manager, and `react-native-google-cast` 5 is a Nitro rewrite that drops the old
  architecture.
- **A wider local-network prompt** on iOS, and two more Bonjour types.
- **More credentials in URLs.** A cast ticket reaches a device KROMA does not control, and
  lands in the request log the way today's ticket does. Scoping it to one item is what
  makes that acceptable.
- **Web users on plain http get no Cast button,** and will ask why.

## Compatibility

Nothing breaks. The routes and the ticket kind are new, the extra origin only widens CORS,
and a client that ships none of this behaves as it does today. An older mobile build keeps
casting to KROMA TVs.

The spec moves. PLAY-48 says KROMA does not hand off an active session as a first-class
gesture, which the shipped KROMA-to-KROMA cast already contradicts. This RFC rewrites
PLAY-48 and adds a casting chapter to `docs/spec/playback/`, numbered from PLAY-54.

## Alternatives

- **The Default Media Receiver alone.** No registration and no hosting, but it cannot switch
  audio tracks, re-anchor a seek, report progress or pick a stream from the TV's decoders.
  Good enough for spike 0, not for users.
- **The Styled Media Receiver.** Our logo over the same limits.
- **Server-side Cast control.** A module finds Cast devices with mDNS from the server and
  drives them over the CASTV2 protocol, as Home Assistant does with pychromecast. Every
  client could then cast through the existing server-relayed roster with no SDK in any app,
  including the web on plain http, Firefox and the desktop app. It needs the server on the
  TV's network, so it fails for a server on a VPS or behind Docker bridge networking, and it
  speaks Google's protocol without Google's SDK. It would drive the same receiver, so it
  stays open as a later phase.
- **The Chromecast signs in as a temporary KROMA TV.** The receiver redeems a one-time code
  from the phone, joins the account's cast roster and takes commands through the server like
  any KROMA TV, so every client could control it. It needs a new transient session kind and a
  longer launch, and it duplicates what the Cast media channel already does.
- **Mirroring.** Works today with no work from us, at the cost described in Motivation.
- **DLNA and UPnP renderers.** Out of scope.
- **Do nothing.** A TV without the KROMA app gets mirroring, and a Chromecast without Google
  TV gets nothing.

## Unresolved

- **Plain http on Cast** (spike 0). If it fails, the fix is publicly trusted certificates
  for LAN addresses, the way plex.direct works. That would also let `tv.kroma.tv` and the
  web Cast sender reach a LAN server, and needs a KROMA-run DNS zone and ACME issuance: its
  own RFC.
- **What AirPlay 2 TVs accept.** No vendor documents it; the Samsung is the first data
  point.
- **AC-3 and E-AC-3 over Cast.**
- **The next episode with no sender connected.** The receiver would need the next-episode
  route, which an item-scoped ticket does not open.
- **Cast built-in on Samsung and LG.** Whether those receivers run a Custom Web Receiver the
  way a Chromecast does, and what they decode.
- **The desktop app** is receiver-only today. Giving it a sender role is a separate
  question.

## References

- Cast supported media: https://developers.google.com/cast/docs/media
- Cast registration and publishing: https://developers.google.com/cast/docs/registration
- Web sender requires a secure context: https://developers.google.com/cast/docs/web_sender/integrate
- Cast Connect: https://developers.google.com/cast/docs/android_tv_receiver/core_features
- An https receiver playing http media, 2019: https://github.com/googlecast/CastVideos-chrome/issues/24
- Jellyfin's receiver: https://github.com/jellyfin/jellyfin-chromecast
- AirPlay with MSE: https://webkit.org/blog/15036/how-to-use-media-source-extensions-with-airplay/
- AVPlayer headers are not supported (so none reach AirPlay): https://developer.apple.com/forums/thread/83560
- expo-video: https://docs.expo.dev/versions/latest/sdk/video/
