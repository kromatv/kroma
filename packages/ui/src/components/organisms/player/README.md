# The player chrome

A family of organisms: everything drawn over a playing film. It is the largest
component in the kit, and the one that shows what a component folder looks like
once it outgrows a handful of files.

## The normalized inner structure

A small component is four files (`button.tsx`, its story, its demos, `index.ts`).
When one needs more than that, it splits the SAME way every time, so you can guess
where something is in a folder you have never opened:

```
player/
  index.ts              the public door: what the rest of the app may import
  player.tsx            Player.Root: assembles the parts, owns nothing else
  player-parts.tsx      the slots a host fills: Media, Actions, Panel
  types.ts              the contract shared across the folder (PlayerController)
  player.fixture.ts     a standing-still controller, so the parts have stories
  parts/                sub-components ONLY this component renders
    top-bar/            one part, one folder: its code, its story, its tests
      top-bar.tsx  top-bar.stories.tsx  index.ts
    control-cluster/  seek-bar/  stats-panel/  …
    settings-panel/
      settings-panel.tsx  settings-panel.stories.tsx  …
      settings/                            a cohesive group of sub-panels
    icons.tsx                              what several parts share, beside them
  hooks/                stateful behaviour, one concern per file
    use-player-nav.ts  use-player-keys.ts  use-seek-nudge.ts  …
  lib/                  pure functions and their tests
    chapters.ts  fmt.ts  nav.ts  subtitle-appearance.ts  …
```

The rule behind it: `parts` render, `hooks` remember, `lib` calculates. If a file
does none of those it does not belong in the folder. `lib` is where the unit tests
are, because pure functions are the part worth testing directly. `nav.ts` decides
which control the D-pad reaches next, and that is checked as arithmetic rather than
by clicking a television.

Anything outside `index.ts` is private to the folder. The app imports `Player`; it
does not reach for `parts/top-bar`.

## The two meanings of "part"

`player-parts.tsx` holds the compound's public parts, the three slots a host fills,
in `DESIGN.md`'s vocabulary. `parts/` holds the private sub-components the chrome
draws for itself. Only the first ever appears in a call site:

```tsx
<Player.Root controller={controller} flags={WEB_FLAGS} … onClose={leave}>
  <Player.Media><video ref={videoRef} /></Player.Media>
  {stopped ? <Player.Panel>…</Player.Panel> : null}
</Player.Root>
```

Each slot renders its children and NOTHING else. `Media` in particular must add no
element: the injected stylesheet sizes a browser surface through
`#kroma-player-stage > video`, a direct-child rule a wrapper would break. Only a
DIRECT child takes its slot; any other child is drawn over the chrome as it stands,
which is what the web's resume toast does. A `<Player.Panel>` also LOCKS the
chrome: the picture stops taking presses and only Back / OK get through.

Everything else the chrome needs is data rather than children: one
`PlayerController`, the platform `flags`, and the collections that come off the
wire (`chapters`, `markers`, `upNext`). Those are `DESIGN.md` §3 T2/T3. The up-next
sheet is a virtualiser and a chapter list is a parsed payload, so neither can be
written as JSX by a caller.

## Why the controller shape

The chrome is driven by ONE object, a `PlayerController` (see `types.ts`), which the
surface implements: an in-page `<video>` on the web, and AVPlay / mpv / ExoPlayer
rendering to a native plane *behind* a transparent page on the TVs. So the chrome
knows nothing about how playback works, and the same components draw over four
different decoders.

That is also why `player.fixture.ts` exists. A workbench has no film to play, and
`<StatsPanel>` cannot render without a controller, so the fixture is one that
reports a plausible 4K direct-play session and ignores every command. Pressing Play
in a story shows the pressed state rather than starting a film that is not there.

## One chrome, two very different stages

The design is drawn for a 1920 television. A browser window is whatever the user
made it, and at 1280 the right-hand cluster used to reach back into the centred
transport and draw straight through it. The circles do not shrink, so nothing gave
way.

`lib/metrics.ts` is what decides instead. It weighs the controls that are actually
present (a film with no next episode and no live receiver is two circles narrower)
against the width there is, and returns one `scale` the whole chrome is drawn at,
in three stages:

1. **it fits**: the design, transport dead centre;
2. **tight**: everything shrinks together, and the cluster claims its width from the
   centring spacer, so the transport drifts left rather than being overdrawn;
3. **compact**: below the point where a circle would stop being tappable
   (56 × 0.78 ≈ 44px), the cluster moves under the transport and wraps.

Nothing is ever dropped to make room. A control removed from the row keeps its
D-pad stop (see `lib/nav.ts`), so a hidden one would be a trap rather than a
tidy-up. The same file places the settings panel: its 44% share, a floor below
which its rows stop being readable, and the point where it covers the stage instead
of shrinking the picture into a card beside it.

`Player` measures its own root rather than the window, so a story frame, a split
view and a browser window all get the layout they deserve.

## Platform splits

`use-player-keys`, `subtitle-edge` and `virtual-focus` each have a `.web` sibling.
Remote handling, subtitle outline rendering and focus-without-focus differ between
a browser and a TV runtime. Everything else is shared.
