# @kroma/kit

The design system's workbench, as a website and as an app.

Same stories, same config, same components: two bundlers and three shapes pointed
at one source tree. It is a showcase you can deploy and a tool you can launch at a
simulator, and the second half is the point. A 10-foot component is judged on a
television, and a 44pt hit target is judged on a phone. Neither is something a
browser at 1280x800 can tell you.

## Running it

```sh
bun run dev          # the site, on Vite            → localhost:5180
bun run ios          # iPhone simulator
bun run android      # Android emulator
bun run ios:tv       # Apple TV simulator
bun run android:tv   # Android TV emulator
```

From the repo root the same five are `bun run dev:kit`, `kit:ios`, `kit:android`,
`kit:tv`, `kit:androidtv`.

The first native run does an `expo prebuild`, which writes `ios/` and `android/`
from `app.json`; both are generated and both are gitignored. The phone and TV
variants write the SAME directories, so switching between them re-prebuilds. That
is why `expo:prebuild` and `expo:prebuild:tv` are separate scripts. They are
spelled `expo:` rather than `prebuild` on purpose: `prebuild` is npm's lifecycle
hook for `build`, so under that name every web build of the workbench wiped and
regenerated both native projects first.

## The one app, two shapes

`EXPO_TV=1` is what makes it a television build. `@react-native-tvos/config-tv`
reads it (the plugin is configured without `isTV`, so the env var decides), and
`Platform.isTV` then tells `src/App.tsx` whether to put the workbench on
`<TvStage>`, the fixed 1920x1080 canvas every 10-foot screen is authored against.

## What differs per bundler

Discovery and routing are the only things that differ, and they differ because the
*bundlers* do:

| | web | native |
|---|---|---|
| entry | `index.html` → `src/main.tsx` | `index.ts` → `src/App.tsx` |
| stories | `src/stories.web.ts` (`import.meta.glob`) | `src/stories.ts` (`require.context`) |
| config | `src/config.web.tsx` (path routing) | `src/config.tsx` (`memoryRouter`) |

Vite prefers `.web.*`, Metro never sees it: the kit's usual platform split.
Everything KROMA-shaped, the title, the mark and the locale lens, is
`KROMA_WORKBENCH`, spread into `defineWorkbench` and shared with the app shells
that mount a workbench of their own.

Native discovery has one honest limitation. Metro cannot hand a module its own
text, so there is no `?raw` half. A demo renders without its code panel and the
Props tab is empty, rather than either carrying a hand-written copy that has
drifted from the file it claims to be.

## Deploying the site

`bun run deploy` builds and pushes to Cloudflare (`wrangler.jsonc`). CI does the
same on push; see `.github/workflows/kit.yml`.
