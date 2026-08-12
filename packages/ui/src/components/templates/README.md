# Templates

Level 5. Page skeletons: they decide where things GO and carry no content of
their own. A template would look identical whichever screen used it, which is
exactly what separates it from an [organism](../organisms).

There is one today, and it is the most load-bearing layout in the codebase.

**`TvStage`** is the fixed 1920x1080 canvas every 10-foot screen is authored
against, scaled to whatever the platform actually hands over:

| Target | What the platform reports |
| --- | --- |
| Tizen / webOS | 1920x1080 CSS px on a real panel |
| Apple TV | 1920x1080 points (the same on a 4K set: tvOS renders @2x) |
| Android TV | **960x540 dp** at density 2.0 on a 1080p panel |

Without it an Android TV renders the entire design at double size. With it, one
set of numbers is correct everywhere, which is also why this kit contains no
viewport units: where the design says `clamp(42px, 7.6vh, 82px)`, the code says
`82`, because on a fixed 1080-tall stage that is what it resolves to.

**Level 6, pages, is deliberately absent.** A page is a template filled with real
data, so it knows the server, the router and the session. Those live in the app
packages (`packages/tv/src/features/*`, `clients/*/src`). See
[`../README.md`](../README.md).
