<div align="center">
  <img src="../../.github/assets/logo.svg" alt="KROMA" height="56">
  <h1>@kromatv/tv</h1>
  <p><i>The shared 10-foot TV experience mounted by the Samsung & LG shells.</i></p>
</div>

> Part of the [KROMA](../../README.md) monorepo. The entire living-room app,
> meaning connect, profiles, home, detail, player and subtitles, lives here once. The
> [`@kromatv/tizen`](../../clients/tizen/README.md) and
> [`@kromatv/webos`](../../clients/webos/README.md) clients are thin shells that just
> mount it; nothing TV-specific is duplicated per platform.

## Mount it

```ts
import { mountTv } from '@kromatv/tv/mount';
import '@kromatv/ui/css/tv';   // the kit's stylesheet, served by kromaUI()

mountTv();          // renders the whole TV app into #root
```

Or embed the component directly:

```tsx
import { TvApp } from '@kromatv/tv';

<TvApp />
```

Native shells pass search capabilities directly as
`<TvApp voiceSearch={nativeVoiceSearch} searchShell={nativeSearchShell} />`.
Both props are optional; missing or unavailable backends retain the on-screen
keyboard and hide the microphone. Each mounted app owns these providers; the
former `setVoiceSearchBackend` and `setSearchShell` registrations are removed.
Native launcher publishing and discovery follow the same ownership model:
pass `launcher={nativeLauncher}` and `serverBrowse={browseForServers}` to `TvApp`
instead of calling their former registration setters.

Native shells create `createSearchRequests()` and `createDeepLinks()` with
`useState`, pass the instances through `searchRequests` / `deepLinks`, and give
their request callbacks to native listeners. Requests queued during font or
session loading remain available when the TV mounts; separate roots never share
them. The former global request functions are removed.

Cast rosters, socket controls, playback reports and pending cast seeks belong to
the mounted receiver provider. Preview refresh throttling belongs to the mounted
catalogue. Build metadata and hardware adapters are selected at build time:
Metro maps the TV adapters to the native shell, while browser builds use Vite's
stamp and Web APIs. The former `setBuildInfo` and `setHardwareSource` startup
registrations are removed. Shared immutable helpers are available from
`@kromatv/tv/build-info` and `@kromatv/tv/hardware`.

`react` / `react-dom` are peer dependencies (≥ 19.2). Built on
[`@kromatv/core`](../core/README.md) (API, capabilities, remote map) and
[`@kromatv/ui`](../ui/README.md) (components, tokens).

## What it provides

- **Spatial focus navigation**, on `@kromatv/ui`'s `useFocusNav`. D-pad and
  arrow-key driven focus with auto-scroll-into-view and an always-visible amber
  focus ring, the way a remote expects.
- **Full screen flow.** Connection / auto-discovery, profiles & Quick Connect
  (QR pairing), home (hero + rails), movie & show detail (cast, seasons), player
  with audio/subtitle selection and resume.
- **Direct-play player.** Streams the original file and decodes HEVC/HDR in TV
  hardware; falls back to the audio-only HLS path when needed (all via `@kromatv/core`).
- **Smart Hub preview** (`shared/preview/`) builds the "new movies" carousel data
  Samsung shows on the home screen even while the app is closed (see the
  [Tizen README](../../clients/tizen/README.md#smart-hub-preview-new-movies-carousel)).
- **Tuned for TV hardware:** lazy poster decode, `content-visibility`, memoized
  tiles, GPU-only focus animation, single-chunk build (~52 kB gzip).

## Exports

| Export | What |
| ------ | ---- |
| `mountTv(props?)` | Render the TV app into `#root`. From `@kromatv/tv/mount`. |
| `TvApp` / `TvAppProps` | The root React component, from the package root. |

## Develop

Run any TV shell in a desktop browser, where arrow keys and Enter act as the remote:

```bash
bun run dev:tizen     # :5174   Samsung
bun run dev:webos     # :5175   LG
```

## See also

- [`@kromatv/core`](../core/README.md) · [`@kromatv/ui`](../ui/README.md)
- [Samsung Tizen client](../../clients/tizen/README.md) · [LG webOS client](../../clients/webos/README.md)
