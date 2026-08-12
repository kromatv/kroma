# @kroma/tizen Samsung TV (Tizen)

> Part of the [KROMA](../../README.md) monorepo the Samsung TV shell.

Thin shell over **`@kroma/tv`** (the shared 10-foot experience). Tizen TVs decode
HEVC/H.265 (incl. 10-bit / HDR) in hardware, so playback is direct-play.

## Two bundles, one package (2021-2023 sets)

Samsung freezes Chromium per Tizen major (4.0 = 56, 5.0 = 63, 5.5 = 69, 6.0 = 76,
6.5 = 85, 7.0 = 94, 8.0 = 108, 9.0 = 120), and Tailwind v4's cascade layers need
Chrome 99 - so only 2024 models can run the modern bundle. `config.xml` offers
the app from **Tizen 6.0 (2021)**, so the build emits **two bundles** and
`dist/index.html` picks one at runtime (an ES5 loader gated on
`CSSLayerBlockRule`):

- **modern** (`dist/assets/`): ESM, ES2020, Lightning CSS @ Chrome 99 - untouched.
- **legacy** (`dist/legacy/`): one ES2015 IIFE + a flattened stylesheet, verified
  down to Chromium 53. `../tv-build/check-legacy.ts` fails the build if anything
  unparseable for that engine sneaks back.

Without it a 2021 set cannot even *parse* the bundle (`?.` and `??` are Chrome
80) and 2022-2023 sets drop every `@layer` block, so the app installs and shows
a black or unstyled screen. This is the same machinery webOS uses; it is driven
by `tv.target.ts` through the shared factory in `packages/bundler/src/shell.ts`.

Authoring rules that keep the legacy tier working: flex only (no CSS grid), no
`/opacity` colour modifiers, spacing via `gap-*` (shimmed) or margins.

## Develop (in a desktop browser)

```bash
bun install
bun run server          # Rust media server :4040
bun run dev:tizen       # Vite dev server :5174 use arrow keys + Enter as a remote
```

## Build / prepare the app

```bash
bun run build:tizen     # builds → clients/tizen/dist (config.xml + icon.png come from public/)
# package it:  cd clients/tizen && tizen build-web && tizen package -t wgt -s <cert-profile> -- dist
```

## Smart Hub preview (new-movies carousel)

When the KROMA tile is focused on the TV home screen **even while the app isn't
running** Samsung expands it into a carousel of the newest movies. Selecting a
tile opens that movie's detail page in KROMA.

How it works:

- A **background service** ([`src/preview-service.cts`](./src/preview-service.cts),
  built to `dist/service/preview-service.js`) is declared in `config.xml`
  (`use.preview = bg_service`). The TV runs it on its
  own schedule to fetch the carousel data.
- The foreground app ([`@kroma/tv` `shared/preview/`](../../packages/tv/src/shared/preview))
  builds the tile JSON from the live catalog and writes it to the package-private
  `wgt-private/preview.json`; the service reads that file and calls
  `webapis.preview.setPreviewData()`.
- Each tile carries a `PAYLOAD` (`{type:'movie', id}`); on launch the app reads it
  via `getRequestedAppControl()` / the `appcontrol` event and opens the page. The
  platform may deliver the payload verbatim or wrapped as
  `{"values": encodeURIComponent(...)}` `parsePayload` handles both.

**Where to see it:** the carousel only shows on the Smart Hub home, when the KROMA
tile is **added to the launcher and highlighted** never from inside the app.
After a fresh install, open KROMA once (so it writes the data), return Home, and
focus the tile. A full power-off/on forces a refresh.

Notes / caveats:

- **Images must be PNG/JPG, not WebP** (Samsung carousel limit; also ≤360 KB,
  height ≤360 px). KROMA caches posters as WebP, so tiles request the server's
  on-the-fly JPEG rendition (`/api/images/<hash>.webp.jpg`, see
  [`kroma-engine/src/infra/image.rs`](../../server/crates/kroma-engine/src/infra/image.rs)
  `jpeg_rendition`). The
  server must be running a build with that endpoint.
- Only movies with resolved TMDB art are included (un-enriched titles, which
  would fall back to a non-raster SVG poster, are skipped until enrichment).
- Data refreshes whenever the app is opened (it rewrites the file); the service
  re-asserts it to the home screen on the TV's schedule while KROMA is closed.
- Image URLs point at the LAN server, so the TV must be able to reach it.
- Debugging on a **retail TV**: `sdb dlog`/`sdb shell` are disabled
  (`intershell_support:disabled`), so the service/app can't log to the device.
  Mirror logs to a LAN HTTP collector (Samsung's own sample does this) the
  service can POST via `require('http')`, the app via `fetch` (its `console.*` is
  stripped from the production build).
- `devel.api.version` in `config.xml` targets the Samsung Product API level; bump
  it toward the device's version if a newer `webapis` is ever needed.

## Performance built to feel like Netflix / Disney+

TVs have weak CPUs/GPUs and slow storage, so the shell is tuned for that:

- **Lazy, async poster decoding** every tile is a real `<img loading="lazy"
  decoding="async">`; off-screen artwork in long rails is never fetched or
  decoded until it nears the viewport.
- **Off-screen tiles cost ~nothing** `content-visibility: auto` lets the
  browser skip layout + paint for poster tiles that aren't on screen, while they
  stay in the DOM so the remote can still focus and scroll to them.
- **Memoised tiles** `PosterCard` is `React.memo`'d, so scrolling a rail doesn't
  re-render unaffected tiles.
- **GPU-only focus animation** focus uses `transform`/`box-shadow` (composited),
  never layout-triggering properties, for a smooth 60 fps highlight.
- **Lean bundle** production build is a single JS + single CSS file (fewer TV
  round-trips), `console`/`debugger` stripped, ES2018 target for the Tizen webview.
  Ships ~**52 kB gzip** JS.
- **Early connection warm-up** a `<link rel="preconnect">` to the media server
  is injected as soon as the client is created.

These improvements live in `@kroma/ui` + `@kroma/tv`, so the LG/webOS app gets them too.

## Package + deploy to a real TV

A [`Makefile`](./Makefile) automates the whole pipeline. One-time setup (Tizen
CLI, Samsung certificate, TV Developer Mode) is documented in
**[SETUP.md](./SETUP.md)** it can't be scripted because it needs your Samsung
account and your TV.

```bash
make doctor                       # check tools + config
make deploy TV_IP=192.168.1.50    # build → sign → install → launch on the TV
make logs                         # watch the app's console output
make redeploy                     # fast iteration after a code change
```

Or via bun from the repo root: `bun run --filter @kroma/tizen deploy` (after a
`.tizen.env` is configured).

## Publishing to Samsung Apps TV

See [STORE.md](./STORE.md) for TV Seller Office membership (a new seller can launch
in the **US only**), assets, listing fields, the FCC caption/TTS requirement, and
what Samsung's testers need in order to be able to test a client for a server
they cannot reach.

Notes:
- `config.xml` targets Tizen 6.0+ (2021+ TVs), package id `KromaTV001`.
- The package version is stamped from the product version at build time
  ([`stamp-version.ts`](../tv-build/stamp-version.ts)); bump `server/Cargo.toml`,
  not `config.xml`.
- Retail Samsung TVs require a **Samsung** signing certificate tied to the TV's
  DUID see [SETUP.md](./SETUP.md) step 3. A self-signed cert only works on the
  emulator.
- Media/colour remote keys are registered at runtime via `@kroma/core`'s
  `registerTvMediaKeys()`; arrow keys + OK drive spatial focus navigation.
- Set the server address on first launch (connection screen); it persists in
  `localStorage`.
