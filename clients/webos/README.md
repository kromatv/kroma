# @kroma/webos LG TV (webOS)

> Part of the [KROMA](../../README.md) monorepo the LG TV shell.

Thin shell over **`@kroma/tv`** (the shared 10-foot experience). webOS TVs decode
HEVC/H.265 (incl. HDR) in hardware, so playback is direct-play.

## Two bundles, one package (old-TV support)

LG freezes Chromium per webOS major (webOS 4.x = 53, 5.0 = 68, 6 = 79, 22 = 87,
23 = 94, 24 = 108), and Tailwind v4's cascade layers need Chrome 99. The build
therefore emits **two bundles** and `dist/index.html` picks one at runtime (an
ES5 loader gated on `CSSLayerBlockRule`):

- **modern** (`dist/assets/`): ESM, ES2020, Lightning CSS @ Chrome 99 - untouched.
- **legacy** (`dist/legacy/`): one ES2015 IIFE + a flattened stylesheet for
  Chromium 53-94 (webOS 4.x-23, 2018-2023 models). `vite.config.legacy.ts`
  lowers the JS (core-js + AbortController + IntersectionObserver polyfills);
  `../tv-build/legacy-css.ts` shims flex `gap` (negative-margin technique),
  `aspect-ratio` (`::before` strut) and `scale`/`translate` (composed
  transform), then `@csstools/postcss-cascade-layers` compiles `@layer` away
  and Lightning CSS down-levels to Chrome 53. `../tv-build/check-legacy.ts`
  fails the build if anything unparseable for Chromium 53 sneaks back.

The whole thing is driven by `tv.target.ts` (platform, dev port, engine
floors) through the shared factory in `packages/bundler/src/shell.ts` - see that
file for how to give any shell a legacy tier.

Playback on those engines: MSE cannot decode HEVC there, so `useDirectPlayback`
flags `nativeHls` (UA Chrome < 99) and the player hands the stream-copied HLS
master straight to the TV's media pipeline (`<video src>`, surround preserved),
the same shape as Safari's native-HLS path. webOS 3.x (Chromium 38, 2016-17)
has no CSS custom properties at all and is NOT supported.

Authoring rules that keep the legacy tier working: flex only (no CSS grid), no
`/opacity` colour modifiers, spacing via `gap-*` (shimmed) or margins.

## Develop (in a desktop browser)

```bash
bun install
bun run server          # Rust media server :4040
bun run dev:webos       # Vite dev server :5175 use arrow keys + Enter as a remote
```

## Build the web bundle

```bash
bun run build:webos     # → clients/webos/dist (appinfo.json + icons copied from public/)
```

## Run it in the webOS TV Simulator (no TV needed)

LG's simulator is a separate download from the CLI: grab it from [Simulator
Installation](https://webostv.developer.lge.com/develop/tools/simulator-installation)
(from webOS 25 the macOS build is ARM64-only; 24 and older also list a
`mac-arm64` zip) and unzip it anywhere, e.g. `~/Applications/webOS_TV_Simulator/`.
Then, after `build:webos`:

```bash
ares-launch -s 26 clients/webos/dist -sp ~/Applications/webOS_TV_Simulator
ares-launch -s 26 clients/webos/dist        # -sp is remembered after the first run
```

This is worth doing before touching a TV for one reason the dev server cannot
reproduce: the simulator loads `dist/` over `file://`, which is the origin shape
a packaged app gets on the set - **no server configured, empty localStorage**,
i.e. genuine first-launch state.

To drive it from a terminal (screenshots, console, remote keys), run the binary
yourself and put Chromium's debugging switch **after** the app directory - the
simulator takes its first argument as the app dir, so a leading flag makes it
look for `appinfo.json` inside the flag:

```bash
~/Applications/webOS_TV_Simulator/webOS_TV_26_Simulator_1.5.0.app/Contents/MacOS/webOS_TV_26_Simulator_1.5.0 \
  clients/webos/dist "{}" --remote-debugging-port=9222
```

The app is then an ordinary CDP target on `:9222`: `Page.captureScreenshot`,
`Runtime.evaluate`, `Log.entryAdded` / `Runtime.exceptionThrown` for the console,
and `Input.dispatchKeyEvent` for the remote (arrows, Enter, Back = keyCode 461).

What it does NOT give you: the engine is the simulator's own Chromium (120 /
Electron 28 for the webOS 26 build), not the frozen Chromium of the webOS major
it is named after. It exercises the **modern** tier only - the legacy tier is
covered by `check:legacy` and, in the end, by a real 2018-2023 set.

## Package an .ipk and install on a TV

Requires the **webOS TV CLI** (`@webos-tools/cli`, provides `ares-*`), not bundled
here. After `build:webos`:

```bash
ares-package clients/webos/dist --no-minify           # → tv.kroma.webos_<version>_all.ipk
ares-setup-device                                     # register your TV (Developer Mode app)
ares-install tv.kroma.webos_<version>_all.ipk -d <tv>
ares-launch tv.kroma.webos -d <tv>
```

`--no-minify` is not optional: `ares-package` otherwise re-minifies the bundle
with a terser from 2020 that cannot parse `?.` or `??`, and fails with "Failed to
minify code". The flag is missing from `--help` but it is real (and CI has been
passing it since `_release-tv.yml`). Vite has already minified the output.

## Publishing to the LG Content Store

See [STORE.md](./STORE.md) for the Seller Lounge account, assets, listing fields, the
self-checklist items that need real attention, and what LG's QA needs in order to
be able to test a client for a server it cannot reach.

Notes:
- The package version is stamped from the product version at build time
  ([`stamp-version.ts`](../tv-build/stamp-version.ts)); bump `server/Cargo.toml`,
  not `appinfo.json`.
- `disableBackHistoryAPI: true` routes the remote Back button to the app, where
  `@kroma/core`'s remote mapping (`keyCode 461`) handles it.
- Arrow keys + OK drive spatial focus navigation; media keys control the player.
- Set the server address on first launch (connection screen); it persists in
  `localStorage`.
