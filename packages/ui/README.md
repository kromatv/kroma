<div align="center">
  <img src="../../.github/assets/logo.svg" alt="KROMA" height="56">
  <h1>@kroma/ui</h1>
  <p><i>The KROMA design system. One component library, every platform.</i></p>
</div>

> Part of the [KROMA](../../README.md) monorepo. Components and design tokens
> ported from the [design source](../../design/readme.md): deep charcoal and
> amber, Bricolage Grotesque / Hanken Grotesk, no emoji.

The kit is authored against **React Native** and renders natively on Apple TV,
Android TV, iPhone and Android, and through **react-native-web** on Tizen, webOS,
the Tauri desktop shell and the web client.

That is the whole point: the components and the tokens exist once. A rail tile
looks the same on a Samsung panel and on an Apple TV because it *is* the same
tile.

```
src/
  lib/tokens/       LEVEL 1  the raw values every other level is made of
  components/atoms/         LEVEL 2  indivisible controls: Button, Txt, Icon, Switch...
  ui/molecules/     LEVEL 3  named arrangements: PosterCard, Field, ListRow...
  ui/organisms/     LEVEL 4  whole regions that behave: Rail, Dialog, Virtual...
  ui/templates/     LEVEL 5  page skeletons with no data: TvStage
                    LEVEL 6  pages are NOT here - they live in the app packages
  lib/              the variant helper, the focus engine, pure maths
  icons/            the icon set, resolved from Tabler by name (see "Icons")
  workbench/        the component atelier: stories, demos, controls, matrix
  player/           the unified player chrome (a family of organisms)
  components/       the older DOM-only components the browser admin app still uses

Every component is a FOLDER holding its code, its story, its demos and its tests.
See src/components/README.md for the hierarchy and the three ways to import from it.
```

```tsx
import { Box, Button, MediaCard, PosterCard, Txt } from '@kroma/ui/kit';

<Box row center gap={16} px={64}>
  <Button variant="primary" size="tv" icon="player-play-filled" label="Lecture" />
  <MediaCard title="Blade Runner 2049" overline="Science-fiction" art={url} tint={tint} />
</Box>
```

`react` and `react-native` are **peer dependencies**. Components are consumed as
source through the workspace: no build step.

---

## Conventions

The component conventions follow [shadcn/ui](https://ui.shadcn.com).

**One component per file, named after it in kebab-case.** `button.tsx` exports
`Button`; `media-card.tsx` exports `MediaCard`. If you are looking for a
component, its filename is its name. Helpers only one component uses live in that
file; helpers that are genuinely shared (pure maths, tokens, the focus engine)
live in `lib/`.

**Two tiers: primitives and molecules.** A **primitive** owns one visual idea and
composes nothing but React Native hosts. It knows about tokens and about focus;
it knows nothing about the app. A **molecule** composes primitives into an
arrangement the design names: the scrim over a poster, the glyph well on a
settings row, the rule that a field's error replaces its hint. It may know the
shape of the data it lays out (a title, a progress fraction) but never where that
data came from.

The test for adding a molecule is simply: *has this arrangement now been written
twice?* `ListRow` earned its place after the third copy.

Both tiers are re-exported flat, so a consumer writes
`import { Button, ListRow } from '@kroma/ui/kit'` and never has to care which
tier something is in. The split is for the people editing the kit, not for the
people using it.

**Variants are declared once, at the top of the file, with `sv`.** `sv` is to
React Native styles what `cva` is to Tailwind class strings: a declarative map
from props to styles, with compound variants and defaults.

```tsx
const button = sv({
  base: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md },
  variants: {
    variant: { primary: { backgroundColor: colors.accent }, ghost: {} },
    size: { md: { paddingHorizontal: 28 }, lg: { paddingHorizontal: 38 } },
  },
  compound: [{ when: { variant: 'ghost', size: 'lg' }, style: { borderWidth: 1 } }],
  defaults: { variant: 'primary', size: 'md' },
});
```

**The caller's `style` always wins.** `sv(props, ...overrides)` appends the
overrides last, which is what `cn()` does for class names: a one-off tweak at a
call site never has to fight the component.

**Props carry their documentation.** Every non-obvious prop has a JSDoc line
saying what it is FOR, not what it is. `focusScale` does not say "the focus
scale"; it says which controls the design scales, and by how much.

**`ref` is a plain prop.** React 19 forwards it without `forwardRef`, so
components take it directly where a host node is useful.

---

## Layout: `<Box>`

React Native has no `className`, and a screen written as a `StyleSheet` lookup
table reads terribly. `<Box>` takes the design's vocabulary directly:

```tsx
<Box row center gap={12} px={64} py={24} bg="surface1" radius="lg" flex>
```

Sizes are plain numbers, deliberately. Every TV screen is authored against the
fixed 1920x1080 canvas (see below), so a number IS the design's px value: there
is no scale to memorise, and it matches how the design specifies values. Only
what genuinely IS a token (colour, radius, elevation) takes a token name.

---

## The 1920x1080 stage

`<TvStage>` is a fixed 1920x1080 canvas scaled to fit whatever the platform
gives. It is what makes the layout pixel-identical across targets whose native
units disagree:

| Target | What the platform reports |
| --- | --- |
| Tizen / webOS | 1920x1080 CSS px on a real panel |
| Apple TV | 1920x1080 points (the same on a 4K set: tvOS renders @2x) |
| Android TV | **960x540 dp** at density 2.0 on a 1080p panel |

Without the stage, an Android TV renders the whole design at double size. With
it, one set of numbers is correct everywhere and the design is never re-tuned
per platform.

This is also why the kit contains no viewport units. Where the design says
`clamp(42px, 7.6vh, 82px)`, the code says `82`, with a comment: on a fixed
1080-tall stage that is what it resolves to, and a `vh` would mean something
different on each target.

---

## Focus

`<Focusable>` is the one focusable primitive. Every remote-reachable control is
one, and it carries the signature 10-foot affordance: a solid amber ring plus a
dark lift, with an optional scale (1.06 for rail tiles, 1.05 for posters, 1.04
for the primary action).

`useFocusNav()` wires a screen's remote. What it does underneath differs, and
that difference is the only reason the focus engine is platform-split:

- **Native**: the OS focus engine owns directional movement (UIFocusEngine on
  tvOS, `nextFocus` resolution on Android TV). The kit only bridges Back and
  PlayPause, which the OS does not route to a focusable.
- **Web**: there is no OS focus engine, so movement is geometric: the nearest
  focusable in the pressed direction, with cross-axis drift weighted x2 so
  straight-line neighbours win.
- **Phones**: the TV remote APIs only exist in the react-native-tvos fork, so
  everything remote-shaped degrades to a no-op and a `<Focusable>` is simply a
  touch target. Android's hardware back button still routes through `onBack`.

A modal declares a focus SCOPE (`<Dialog>` does this for you) so the D-pad cannot
wander back into the page behind it.

The **press guard** is shared: a press that navigates somewhere must not also
fire the control the new screen auto-focuses, so presses are ignored for 300 ms
after every screen mounts.

---

## Platform splits

Three mechanisms carry the entire cross-platform story.

**`.web.ts` / `.web.tsx` siblings.** Vite resolves them first
(`resolve.extensions`); Metro never sees them. There are only six, and each
exists for a real reason:

| Split | Why |
| --- | --- |
| `lib/focus-nav` | the OS focus engine vs geometric spatial navigation |
| `lib/focus-transition` | a CSS transition vs an Animated value |
| `lib/css` | React Native prefixes gradients `experimental_` |
| `lib/svg` | react-native-svg vs the browser's own SVG parser |
| `lib/spatial-nav.web` | web-only: a TV has nothing to navigate geometrically |
| `workbench/registry` | Metro's `require.context` vs Vite's `import.meta.glob` |

**`Platform.OS`, inside one file**, where the split is a single element rather
than a whole module. `<Img>` uses this: its leaf is a real `<img>` on the web
(keeping `loading="lazy"`, `fetchpriority` and `object-position`, which a
1000-poster grid on a TV needs) and React Native's `<Image>` natively, while the
container, the cross-fade timing and the cover maths are shared.

**Injection**, for the one case where the split is not the kit's to make.
`<Img>` owns everything that is DESIGN: the container, the instant gradient
placeholder, the cross-fade timing, the cover maths. What it does not own is
which decoder loads the bytes. A TV wants React Native's `<Image>`; the mobile
app wants `expo-image`, for its memory+disk cache and view recycling on a long
scrolling list. So the leaf is swappable, once, at app start:

```tsx
// clients/mobile/src/app/_layout.tsx
setImageBackend(expoImageBackend);
```

A backend declares `fades` so `<Img>` knows whether to run its own cross-fade or
stay out of the way of one the decoder already does. Nothing else in the kit or
in any screen changes.

---

## Icons

There is nothing to register. `<Icon name="wave-sine" />` works because
[Tabler](https://tabler.io/icons) has `IconWaveSine`, and `src/icons/glyphs.ts`
translates one spelling into the other. No slug list, no generator, no generated
file. A name the package does not have draws the fallback (`help-circle`)
instead of crashing, which is what makes it safe to take an icon name from
**data** — a server-installed module names its glyph in a manifest, and no list
could ever be complete.

Tabler ships the same icons twice, with the same export names:
`@tabler/icons-react` draws DOM `<svg>`, `@tabler/icons-react-native` draws
through react-native-svg. `glyphs.ts` imports the React Native one, and every
web bundler aliases that specifier to the DOM one (`clients/tv-build/rnw.ts`,
the same trick as `react-native` → `react-native-web`). So a browser gets native
SVG and never loads react-native-svg's runtime; native gets react-native-svg,
where it is the only way to draw at all. The one prop the two disagree on is the
outline weight — see `src/icons/stroke-prop.ts`.

The cost, measured: a namespace import cannot be tree-shaken, so the whole set
ships. The kit site went from 258 KB to 741 KB gzipped. Lazy loading does not
recover it on the targets that care — Metro has no dynamic import with a
computed specifier, and the webOS legacy tier inlines every chunk back into one
IIFE — so it would only help the modern web tier, at the price of thousands of
chunks and glyphs arriving over the network mid-render. Reverting to a
hand-written map is a small change, local to `glyphs.ts`.

---

## Tokens

`src/lib/tokens/*.ts` is the **single source of truth** for the design.
`bun run tokens:gen` generates the CSS custom properties the web and desktop
clients consume (`src/styles/tokens/*.css`) from it. CI runs `bun run
tokens:check`, which regenerates and fails on any diff, so the two cannot drift.

Never edit the generated CSS.

```ts
colors.accent      // #F4B642, the single warm amber
colors.bg          // #0A0A0C, the deep charcoal page
type.hero          // 66px / 700, Bricolage Grotesque
radius.lg          // 13, posters and cards
```

### Two form factors

The palette, the brand and the motion are shared by everything. What genuinely
differs between a phone and a television is **scale**: a phone is held at arm's
length, a TV is watched from three metres. So there is a second ramp, and it
lives here rather than in the mobile app, because it is a design decision and not
drift:

```ts
import { mobileType, mobileSpace, mobileRadius } from '@kroma/ui/kit';

mobileType.title   // 28px / 800, where the 10-foot ramp says 44
mobileRadius.lg    // 18, rounder: close-up chrome reads sharp, not crisp
```

The 10-foot ramp is authored against the fixed 1920x1080 stage, so its numbers
are canvas px. The mobile ramp is authored against real device points and is read
as-is, with no stage in between.

---

## The workbench

```bash
bun run dev:tizen      # then open http://localhost:5174/?workbench
```

Every component, its live controls, and its variant matrix. This is the kit's
Storybook, and it is about 700 lines because it is **not a separate
application**: it is a normal screen built from the kit, so it runs in a browser,
on an Apple TV and on a phone, with no manager iframe, no builder abstraction and
no addon protocol to keep alive. It is the only component explorer in the project
that can show you the design on the device that actually has to render it.

**Writing a story.** One default export, in a `*.stories.tsx` next to the
component:

```tsx
export default story({
  name: 'Button',
  group: 'Actions',
  docs: "What it is FOR, in a sentence.",
  variants: buttonVariants,          // the component's own sv
  args: { label: 'Lecture', icon: 'player-play-filled' as IconName | '' },
  render: (props) => <Button {...props} />,
});
```

Passing `variants` is the whole trick. A compiled `sv` carries its declaration,
so the workbench reads the axes straight off the component: **every control and
every matrix row above is derived, not written**. Storybook needs `argTypes` or a
docgen pass to get there, and both can drift from the component; this cannot,
because it *is* the component. Add a variant, and it appears in the panel and in
the matrix with no story edit at all.

Anything that is not a variant goes in `args`, where the control is inferred from
the value's type (string, boolean, number). `controls` only exists for the cases
a type cannot express: a range with real bounds, an enum that is not a variant,
an icon picker. Compositions a grid cannot express (an open dialog, a stateful
toggle) go in `scenes`.

**Writing a demo.** A demo is the other half of the job: not the same component
under other args, but a worked example with its own state and several components
in it - a form that validates, a code screen that rejects a code. It is **one
file, and it declares nothing**:

```tsx
// components/atoms/button.detail-actions.demo.tsx
import { Box } from './box';
import { Button } from './button';

/**
 * The row from a title screen: the primary action, two stateful toggles and a
 * demoted extra. Press the `outline` buttons to see the amber `active` fill.
 *
 * @name Detail actions
 */
export default function DetailActions() {
  return <Box row gap={12}>{/* ... */}</Box>;
}
```

The file name says which story it belongs to (`<story-id>.<demo>.demo.tsx`) and
what the tab is called; the doc comment above the export is the prose (`@name`
renames the tab, any other tag is ignored); and **the file itself is the code
sample** - read as text by the bundler, so the sample cannot drift from the
example the way a hand-copied template literal did. Reading a file as text is a
Vite primitive (`?raw`) that Metro has no answer for, so on Apple TV and Android
TV a demo renders with no code panel rather than a stale one. See
`workbench/demos.ts`.

**Stories and demos are discovered, never listed.** Drop a `*.stories.tsx` or a
`*.demo.tsx` anywhere under `src/` and it is in the workbench: there is no
registry to regenerate and no generated file to fall behind. That needs a bundler
primitive, and the two bundlers spell it differently, so this is one of the kit's
`.web` splits: `registry.ts` uses Metro's `require.context`, `registry.web.ts`
uses Vite's `import.meta.glob`. Every state is a deep link
(`?workbench&story=button&view=matrix`).

**One screen, three widths.** The workbench is also the kit's own responsive
test: `workbench/layout.ts` is a pure function of the window, and the regions
*move* rather than shrink. Past 1240pt the list, the canvas and the inspector are
three columns; below that the inspector docks under the canvas as a wrapping row;
below 880pt the list becomes a drawer over the canvas and the dock collapses to
its titlebar, so the component keeps the room on a phone.

The workbench is `@kroma/workbench`, a package of its own. This one provides the
stories and the demos and nothing else: no registry, no config, no mark. Each
shell configures its own — see `clients/kit/src/config.tsx`.
It is a tool, not part of the library, and it drags in every story: an app that
is not being inspected should not pay for it. The TV entry loads it lazily,
behind the `?workbench` flag.

**Screenshots.**

```bash
bun run build:tizen && bun run shots     # -> packages/ui/.shots/
```

One PNG per story, captured from the real build by the Chrome already on the
machine: no Playwright, no test runner, no new dependency. The workbench's
`?shot` mode renders the story alone, with no sidebar, header or panel, so what
lands in the file is the component.

It captures; it does not compare. A pixel diff across Chrome versions is mostly
noise, so these are made to be *looked at* and dropped into a review, not gated
on. Behaviour is what the unit tests are for.

---

## Testing

```bash
bunx vitest run packages/ui
```

Component tests render through react-native-web in jsdom, which is exactly what
the browser targets ship, and assert the DOM that comes out. Pure logic (the
variant helper, the layout resolver, the cover-rect maths, the focus geometry) is
tested directly.

Two things worth knowing when writing them:

- react-native-web compiles most styles into atomic CSS classes and keeps inline
  styles only where a value is dynamic, so assert through `getComputedStyle`, not
  the `style` attribute.
- A `<Focusable>` renders a real `<button>`, so the browser's own activation
  behaviour turns Enter into a click. jsdom implements neither, so a test stands
  in for the browser with an explicit `fireEvent.click`.

---

## See also

- [`@kroma/core`](../core/README.md) the types and logic these components render
- [`@kroma/tv`](../tv/README.md) the 10-foot experience composed from these
- [design/readme.md](../../design/readme.md) the full design language
