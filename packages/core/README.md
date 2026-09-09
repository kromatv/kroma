<div align="center">
  <img src="../../.github/assets/logo.svg" alt="KROMA" height="56">
  <h1>@kromatv/core</h1>
  <p><i>Shared, framework-agnostic core for every KROMA client.</i></p>
</div>

> Part of the [KROMA](../../README.md) monorepo. Zero UI, zero framework: the
> playback and runtime rules every shell (web, TV, mobile, desktop) depends on.
> Write it once, run it everywhere.

## Install

```ts
// workspace dependency already wired in clients
import { canDirectPlay, detectCapabilities } from '@kromatv/core';
```

Pure TypeScript, no build step: the workspace consumes it as source. The root
entry pulls in no framework. The `./react` subpath does, and holds the hooks
built on these rules.

## What this package is not

`@kromatv/core` re-exports nothing. Three doors, and each thing is behind exactly
one, so an import path says where a symbol came from:

- `@kromatv/client/<domain>` is what one domain owns: its zod schemas, its ids, its
  response types. `MediaItem`, `Show`, `ShowDetail`, `Season`, `Library`,
  `VideoTrack`, `AudioTrack`, `SubtitleTrack`, `Metadata`, `CastMember`, `User`,
  `Permission` and `hasPermission` all live there.
- `@kromatv/client` is what no single domain owns: `createKromaClient`,
  `KromaClient`, `KromaApiError`, `KromaClientOptions`, the transport, the
  WebSocket events and the remembered-session store.
- `@kromatv/core` is what is not a wire type at all: the rules built on top.

Adding or changing a payload means editing the zod schema in
`packages/client/src/api/<domain>/`, never redefining a wire type here.

## What's inside

| Module | Exports | Purpose |
| ------ | ------- | ------- |
| `hevc` | `detectCapabilities`, `capabilities`, `canDirectPlay`, `audioSupport` | Capability detection: what this device can decode (HEVC 10-bit/HDR, AV1, AC3/EAC3/DTS) and whether a given item direct-plays. |
| `player` | `attachDirectPlay`, `formatRuntime` | Wire a `MediaItem` to a `<video>` element for direct-play streaming. |
| `remote` | `resolveRemoteKey`, `registerTvMediaKeys`, `RemoteKey` | Normalize TV remote / keyboard input into semantic keys (`back`, `play`, colour buttons, D-pad). |
| `discover` | `discoverServer`, `discoverServers`, `subnetCandidates`, `getLocalIPv4` | Zero-config LAN discovery (mDNS candidates + `/24` subnet scan, because TVs can't resolve `.local`). |
| `handoff` | the beacon a television raises and the phone answers | The road a TV takes to an account, on top of the handoff domain's wire types. |
| `format` | `metaLine`, `qualityBadge`, `codecLabel`, `channelLabel`, `posterColors` | Brand-consistent text formatting (e.g. `2024 · 2h08 · Thriller`, `4K HDR`, `H.265`). |
| `intl` | `formatTimecode`, `formatBytes`, `formatDuration`, `formatUptime` | Locale-aware number, size and duration formatting. |
| `lang` | `langCode`, the language table | Track languages, named the way the product names them. |
| `subtitles` | `parseVtt`, `activeCueText`, `isTextSubtitle`, `Cue` | Minimal WebVTT parsing + cue lookup for the custom subtitle layer. |
| `permissions` | `PERMISSIONS`, `PermissionMeta` | What each permission means, for the admin screens that render them. |
| `i18n` | the core catalogs, one folder per language and one file per namespace | `src/locales/{en,fr}/<namespace>.json`, found and typed by the Vite plugin. |

## Direct-play, in one decision

Direct play is the default, so the client decides up front whether a title will
play on its own decoder. What it cannot decode goes through the server's HLS
path instead.

```ts
import { capabilities, canDirectPlay, audioSupport } from '@kromatv/core';

const caps = capabilities();              // cached device probe
const verdict = canDirectPlay(item, caps);

if (verdict.canDirectPlay) {
  // stream client.media.streamUrl(item.id) straight into <video>
} else if (audioSupport(item, caps).canPlay === false) {
  // video decodes but audio (AC3/EAC3/DTS) doesn't → use the audio-only HLS path
  // client.media.hlsMasterUrl(item.id, true); the server copies video, re-encodes audio to AAC
}
```

`detectCapabilities()` probes HEVC (incl. Main 10 / HDR), AV1, VP9 and the audio
codecs the platform can decode, so TVs (hardware HEVC + AC3) and browsers (HEVC on
Safari / HW-Chromium, no AC3) each get the right path.

## Talking to the server

The client is `@kromatv/client`, and it is a factory rather than a class:

```ts
import { createKromaClient } from '@kromatv/client';

const client = createKromaClient({ baseUrl: 'http://nas.local:4040' });

const movies  = await client.media.movies();
const show    = await client.media.show(id);           // seasons + episodes
const url     = client.media.streamUrl(item.id);       // range-streamed original
const poster  = client.media.artwork.posterFor(item);  // resolved TMDB/cached art
```

## See also

- `@kromatv/client` (`../client/src/api/`): the transport and every wire type
- [`@kromatv/ui`](../ui/README.md): design-system components built on these types
- [`@kromatv/tv`](../tv/README.md): the 10-foot experience that ties it together
- [server/README.md](../../server/README.md): the API this client speaks to
