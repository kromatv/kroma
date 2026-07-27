# The player chrome

A family of organisms: everything drawn over a playing film. It is the largest
component in the kit, and the one that shows what a component folder looks like
once it outgrows a handful of files.

## The normalized inner structure

A small component is four files (`button.tsx`, its story, its demos, `index.ts`).
When one needs more than that, it splits the SAME way every time, so you can
guess where something is in a folder you have never opened:

```
player/
  index.ts              the public door: what the rest of the app may import
  Player.tsx            the component itself — assembles the parts, owns nothing else
  types.ts              the contract shared across the folder (PlayerController)
  player.fixture.ts     a standing-still controller, so the parts have stories
  parts/                sub-components ONLY this component renders
    TopBar.tsx  ControlCluster.tsx  SettingsPanel.tsx  …
    TopBar.stories.tsx                     a part's story lives beside the part
    settings/                              a cohesive group of sub-panels
  hooks/                stateful behaviour, one concern per file
    usePlayerNav.ts  usePlayerKeys.ts  useSeekNudge.ts  …
  lib/                  pure functions and their tests
    chapters.ts  fmt.ts  nav.ts  subtitle-appearance.ts  …
```

The rule behind it: **`parts` render, `hooks` remember, `lib` calculates.** If a
file does none of those it does not belong in the folder. `lib` is where the unit
tests are, because pure functions are the part worth testing directly — `nav.ts`
decides which control the D-pad reaches next, and that is checked as arithmetic
rather than by clicking a television.

Anything outside `index.ts` is private to the folder. The app imports `Player`;
it does not reach for `parts/TopBar`.

## Why the controller shape

The chrome is driven by ONE object, a `PlayerController` (see `types.ts`), which
the surface implements: an in-page `<video>` on the web, and AVPlay / mpv /
ExoPlayer rendering to a native plane *behind* a transparent page on the TVs. So
the chrome knows nothing about how playback works, and the same components draw
over four different decoders.

That is also why `player.fixture.ts` exists. A workbench has no film to play, and
`<StatsPanel>` cannot render without a controller, so the fixture is one that
reports a plausible 4K direct-play session and ignores every command. Pressing
Play in a story shows the pressed state rather than starting a film that is not
there.

## Platform splits

`usePlayerKeys`, `subtitle-edge` and `virtual-focus` each have a `.web` sibling:
remote handling, subtitle outline rendering and focus-without-focus differ between
a browser and a TV runtime. Everything else is shared.
