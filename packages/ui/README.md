<div align="center">
  <img src="../../.github/assets/logo.svg" alt="KROMA" height="56">
  <h1>@kroma/ui</h1>
  <p><i>The KROMA design system. One component library, every platform.</i></p>
</div>

> Part of the [KROMA](../../README.md) monorepo. Deep charcoal and amber,
> Bricolage Grotesque / Hanken Grotesk, no emoji. The design language is not
> written down anywhere else: `src/core/tokens/*.ts` is the source, and this
> file is the prose around it.

The kit is authored against **React Native** and renders natively on Apple TV,
Android TV, iPhone and Android, and through **react-native-web** on Tizen, webOS,
the Tauri desktop shell and the web client.

That is the whole point: the components and the tokens exist once. A rail tile
looks the same on a Samsung panel and on an Apple TV because it *is* the same
tile.

```
src/
  core/                     the styling engine: the vocabulary, `sv`, themes (see "Styling")
  core/tokens/              LEVEL 1  the raw values every other level is made of
  components/atoms/         LEVEL 2  indivisible controls: Button, Text, Icon, Switch...
  components/molecules/     LEVEL 3  named arrangements: PosterCard, Field, ListRow...
  components/organisms/     LEVEL 4  whole regions that behave: Rail, Dialog, Player...
  components/templates/     LEVEL 5  page skeletons with no data: TvStage
                            LEVEL 6  pages are NOT here - they live in the app packages
  lib/                      the focus engine, pure maths, the form runtime
  lib/icons/                the icon set, resolved from Tabler by name (see "Icons")
  foundations/              stories for what has no component: the palette, the type ramp
  guides/                   the six `.page.mdx` articles the workbench serves as its docs
  services/                 React contexts the shells share (auth, cast, i18n, playback)
  styles/                   the CSS the web targets import, expanded by `kromaUI()`
  assets/                   the fonts and the intro sting

Every component is a FOLDER holding its code, its story, its demos and its tests.
See src/components/README.md for the hierarchy and the three ways to import from it.
```

```tsx
import { Box, Button, MediaCard, PosterCard, Text } from '@kroma/ui/kit';

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

**Four levels under `components/`**: atoms, molecules, organisms, templates, each
knowing only the ones below it.
[`src/components/README.md`](src/components/README.md) owns that hierarchy: what
earns a place at each level, and how a component is shaped once it has one. It is
the document to read before adding anything.

The test for moving up a level is simply: *has this arrangement now been written
twice?* `ListRow` earned its place after the third copy.

Every level is re-exported flat, so a consumer writes
`import { Button, ListRow } from '@kroma/ui/kit'` and never has to care which
level something is at. The split is for the people editing the kit, not for the
people using it.

**The design is declared once, at the top of the file, with `sv`.** The whole
styling engine (the vocabulary, recipes, interaction states, themes) has its
own section below ("Styling").

**Props carry their documentation**, the kit's one exception to the repo's
no-comment default, because a component's props are the whole of its public API.
A prop takes ONE line when its contract is not visible from its name and its
type: a default, a unit, a fallback chain, how it interacts with another prop.
`focusScale` does not say "the focus scale"; it says which controls the design
scales, and by how much. A prop whose name already says it takes nothing. The
rule and its limits live in [`CODE_STYLE.md`](../../CODE_STYLE.md).

**`ref` is a plain prop.** React 19 forwards it without `forwardRef`, so
components take it directly where a host node is useful.

---

## Styling

React Native has no `className`, so the kit has its own engine (`src/core`),
built the way Tailwind 4 builds utilities: **one vocabulary, defined as data,
resolved against a theme**. Everything below speaks it: `<Box>` props, recipe
layers, `styles()` declarations.

### The vocabulary

```tsx
<Box row center gap={12} px={64} py={24} bg="surface1" radius="lg" flex>
```

Layout shorthands (`row`, `center`, `gap`, `p/px/pt…`, `w/h`, `absolute`,
`fill`, `z`…) expand to React Native longhands. Colour takes a token name, a
`/NN` alpha suffix (`'accent/45'`, `'white/12'`), or any raw CSS colour;
`radius` and `shadow` take token names; `ring: 'focusLift'` is the focus
treatment, derived from the theme's accent; declarations (not `<Box>`, which is
a View) additionally take `text: 'label'` (a whole type role, spread under the
layer so longhands beside it win) and `font: 'ui' | 'display'`.

`<Text>` speaks the half of that vocabulary a React Native `Text` honours (the
spacing, sizing and position rows, plus `textAlign`), so a string is laid out
without a style object either:

```tsx
<Text variant="leadTv" textAlign="center" maxW={640} mt={24} color="textDim">
```

It does NOT take the container rows (`row`, `gap`, `align`) or the surface
paints (`bg`, `radius`, `border`): a Text lays itself out, a Box lays out
children. `textAlign` is spelled in full because `align` already means
`alignItems` on `<Box>`, and one name means one role across the kit.

**Type is set by a role, never at a call site.** There is no `size`/`weight`
prop and `style={{ fontSize }}` is drift: if no role fits, the ramp is missing
one. The ramp has a base tier and a 10-foot tier authored for three metres
rather than scaled up from the phone's. Each is a named ladder in order:
`BASE_RAMP` runs 66 down to 11, `TV_RAMP` 96 down to 13.

| Tier | Face | Roles, largest first |
| --- | --- | --- |
| base | `display` | `hero` 66 · `h1` 38 · `heading` 30 · `subheading` 26 · `h2` 22 · `title` 20 |
| base | `ui` | `body` 16 · `label` 15 · `meta` 13 · `overline` 11 |
| 10-foot | `display` | `codeTv` 96 · `heroTv` 82 · `bannerTv` 59 · `titleTv` 44 · `headingTv` 32 · `subheadingTv` 28 |
| 10-foot | `ui` | `bodyTv` 20 · `leadTv`/`labelTv`/`strongTv` 17 · `captionTv`/`metaTv`/`sectionTv` 15 · `footnoteTv`/`overlineTv` 13 |

A step is a size AND its leading (and its tracking where the design has one),
which is why a role carries a `ratio` rather than a second number to keep in
step. Where one size holds several roles, they differ in weight and leading:
`labelTv` is the 600 at 17, `strongTv` the 700. A one-off weight bump at a call
site is legal; a one-off `fontSize` is not.

Sizes are plain numbers, deliberately. Every TV screen is authored against the
fixed 1920x1080 canvas (see below), so a number IS the design's px value: there
is no scale to memorise. Only what genuinely IS a token (colour, radius,
elevation, type) takes a name.

The whole vocabulary is one rule table in `core/shorthands.ts`; **adding a
shorthand is adding a row**, and the `satisfies` link to `BoxStyleProps` makes
forgetting one a compile error.

### Responsive values

Every value in the vocabulary can be stated per breakpoint instead of flat, so a
screen that changes shape needs neither a raw `style` object nor a
`useWindowDimensions()` branch at the call site:

```tsx
<Box px={{ base: 16, md: 40, lg: 64 }} row={{ base: false, md: true }} gap={{ base: 12, md: 24 }} />

sv({ base: { p: { base: 12, lg: 24 } } })
```

| Step | From | What it is for |
| --- | --- | --- |
| `base` | 0 | a phone, and anything narrower than the next step |
| `md` | 600 | a tablet in portrait, or a half-screen split view on one |
| `lg` | 1024 | a desktop window, or a tablet in landscape |
| `tv` | 1920 | the 10-foot stage, which IS `CANVAS.width`, and the widest desktop |

Four steps, named once in `core/tokens/layout.ts` and closed on purpose: an
augmentable set would make `{ base: 16, xl: 40 }` legal instead of a compile
error.

**Mobile-first.** `base` is mandatory and means "no minimum". A step holds until
the next one the value itself names, and a missing middle step inherits from
below, never from above: `{ base: 12, tv: 48 }` is still 12 at `md` and at `lg`.

**The values are still values.** `bg={{ base: 'surface1', lg: 'surface2' }}`
resolves tokens exactly as the flat form does, through the same rule table, so
nothing is written raw to get it responsive.

**Where the width comes from.** React Native has no media query, so the active
breakpoint is a store fed by `Dimensions` at the app level, and it is NOT always
the window's: `<TvStage>` scales a fixed 1920x1080 canvas to fit the panel, so on
a television the design's width is the canvas (Android TV reports 960x540 dp for
the same screen Tizen reports as 1920x1080). `Platform.isTV` pins that for the
native TV shells; any other surface painting on a fixed stage states it once with
`pinDesignWidth(CANVAS.width)`.

**Who re-renders.** `<Box>` and `<Text>` follow a crossing by themselves, and
only when they hold a breakpoint object. Anywhere else, `useBreakpoint()` is the
subscription: it is what a recipe read by a component of your own needs, and what
a decision no style can carry uses (a different tree, one rail fewer).

**A declaration naming no breakpoint pays nothing.** No subscription, no rebuild,
and the same single cache entry it minted before there was an axis at all, the
way a recipe declaring no interaction states pays nothing for the state axis.

### Recipes: `sv`

`sv` is to React Native styles what `cva` is to Tailwind class strings: the
component's design as a declarative map, compiled once, resolved to frozen,
cached style objects.

```tsx
const chipVariants = sv({
  base: { row: true, center: true, radius: 'pill', _hover: { bg: 'white/16' } },
  variants: {
    tone: { neutral: { bg: 'white/10' }, accent: { bg: 'accentSoft' } },
    size: { sm: { py: 6, px: 12 }, tv: { py: 9, px: 18 } },
    active: { true: { bg: 'accent' } },      // boolean: `false` is the base look
  },
  compound: [{ when: { tone: 'accent', active: true }, style: { border: 'accentWash/45' } }],
  defaults: { tone: 'neutral', size: 'sm', active: false },
});
```

- **Interaction states live inside the layer they change**, under a `_` prefix:
  `_hover`, `_focus`, `_press`, `_disabled`. A variant's `_hover` beats the
  base's, so a variant cannot be given a rest fill and forgotten in the state
  tables. `<Focusable sv={...} vars={...}>` owns the live state and resolves
  the recipe against it.
- **Slots** name the parts of a multi-part component. `slots: { root, label,
  icon }` paints them all per variant; `svFor<{ root: StyleDecl; icon:
  Pick<IconProps, 'color'> }>()` types a slot that feeds a component's PROPS,
  so a typo in a glyph colour is a compile error.
- **Types derive from the recipe.** `VariantProps<typeof chipVariants>` is the
  props slice (cva-style); `Variant<typeof chipVariants, 'size'>` is one
  group's union. Add an option and every consumer's type follows: there is no
  second list.
- **The workbench reads the recipe.** Controls and the variant matrix derive
  from `options`/`defaults`; add a variant and it appears with no story edit.

**The caller's `style` always wins.** Components place it after the resolved
`root`, so a one-off tweak at a call site never has to fight the component.

### `styles()`: the rest

For shapes that are not a variant of anything, `styles()` is `StyleSheet.create`
in the kit's vocabulary: named, registered, theme-aware, one lowercase binding.

```tsx
const s = styles({
  row: { row: true, align: 'center', gap: 6, px: 8, radius: 'sm' },
  label: { text: 'meta', color: 'textMuted' },
});
```

### Themes

Every token group (colours, radius, shadows, fonts, type roles, motion) lives
in one live store. `KROMA` is the default; a theme is created by restating any
slice of it, and everything derived (type roles from specs + families, the
focus ring from the accent) re-derives:

```tsx
import { createTheme, setTheme, ThemeProvider, useTheme } from '@kroma/ui/kit';

const ocean = createTheme({
  colors: { accent: '#3FB6F2', accentHover: '#66C6F5' },
  fonts: { display: 'Clash Display' },
  radius: { lg: 18 },
});

setTheme(ocean);                      // boot-time, before mount
<ThemeProvider theme={ocean}>…        // or runtime: remounts the subtree
```

Nothing re-resolves eagerly: recipes, `styles()` and `<Box>` all key their
caches on the theme version and rebuild lazily on next use, so a swap costs one
rebuild per recipe actually rendered.

**New token names stay typed everywhere.** Token unions are `keyof` the base
table plus an augmentable registry, so a name added once is immediately legal
(and autocompleted) in `bg`, `border`, `color`, `/NN` alpha, `radius`, `font`:

```ts
declare module '@kroma/ui/tokens/colors' {
  interface ColorRegistry { brand: string }
}
createTheme({ colors: { brand: '#6C5CE7' } });   // → bg="brand", 'brand/40', …
```

(`RadiusRegistry`, `ShadowRegistry`, `FontRegistry`, `TypeRoleRegistry` do the
same for their groups.) Inside the kit no augmentation is needed: add the value
to `core/tokens/*` and the union already includes it.

For a token a style cannot carry (an `ActivityIndicator` colour, a chart
paint), read `useTheme()` in components (it subscribes) or `activeTheme()`
at call time elsewhere. Never capture either into a module constant.

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

The spatial navigator (`react-tv-space-navigation`) owns directional movement on
every target, so a browser TV and an Apple TV move focus by the same rules
rather than by two engines that drift apart. What is platform-split is only how
the remote reaches it, which is what `useFocusNav()` wires, plus the keys the
navigator has no opinion about:

- **Native**: the remote arrives through `useTVEventHandler` and is posted to
  the navigator as directions (`lib/focus-remote.ts`). A full-screen
  transparent Pressable holds the platform's focus so the app hears the keys at
  all. Back and PlayPause are bridged separately, since the OS does not route
  them to a focusable.
- **Web**: the remote arrives as ordinary `keydown` events on the document and
  feeds the same navigator (`lib/focus-remote.web.ts`), which is why the
  library is in the browser bundles too. Back, the transport keys and a held
  OK's auto-repeats are handled beside it.
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
(`resolve.extensions`); Metro never sees them. `find src -name '*.web.ts*'` is
the live list; they fall into five reasons, and a new one needs to name its
reason too:

| Reason | Where | Why the two platforms cannot share the file |
| --- | --- | --- |
| Focus and the remote | `lib/focus-{nav,here,remote,root,transition}`, `player/lib/virtual-focus`, `player/hooks/use-player-keys` | one shared navigator owns movement, but the remote reaches it as TV events natively and as document keydowns on the web |
| Browser APIs with no RN equivalent | `lib/{portal,modal-portal,landmark,scroll-lock,drag-select,loop,wheel-pan,perf-memory}` | a DOM portal, a landmark role, pointer capture and `performance.memory` have no React Native spelling |
| Drawing primitives | `lib/{css,svg}`, `lib/icons/stroke-prop` | React Native prefixes gradients `experimental_`; react-native-svg vs the browser's own SVG parser |
| Motion | `lib/{progress-motion,splash-motion}`, `organisms/kroma-intro` | a CSS transition vs an `Animated` value |
| Layered surfaces | `molecules/{select,tooltip}`, `organisms/menu` | the web stacks them in a portal above the document; native stacks them in a modal host |

Each split is a whole-module swap, so the two halves must export the same
names. A split that exists only to change a few lines belongs in
`Platform.OS` instead.

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
[Tabler](https://tabler.io/icons) has `IconWaveSine`, and `src/lib/icons/glyphs.ts`
translates one spelling into the other. No slug list, no generator, no generated
file. A name the package does not have draws the fallback (`help-circle`)
instead of crashing, which is what makes it safe to take an icon name from
**data**: a server-installed module names its glyph in a manifest, and no list
could ever be complete.

Tabler ships the same icons twice, with the same export names:
`@tabler/icons-react` draws DOM `<svg>`, `@tabler/icons-react-native` draws
through react-native-svg. `glyphs.ts` imports the React Native one, and every
web bundler aliases that specifier to the DOM one (`packages/bundler/src/rnw.ts`,
the same trick as `react-native` → `react-native-web`). So a browser gets native
SVG and never loads react-native-svg's runtime; native gets react-native-svg,
where it is the only way to draw at all. The one prop the two disagree on is the
outline weight, which is why `src/lib/icons/stroke-prop.ts` is itself a `.web`
split.

The cost, measured: a namespace import cannot be tree-shaken, so left alone the
whole set ships, and the kit site went from 258 KB to 741 KB gzipped. A build-time
subset in `@kroma/ui/bundler` buys it back on every target: 299 of 6,250 glyphs
kept, and `<Icon>` costs 49 KB gzipped instead of 573 KB. `vite dev` is not
subset (`apply: 'build'`); Metro is, in both `start` and `export`.

The one app that needs the whole set is the gallery itself, and it fetches it:
`src/lib/icons/library.ts` merges all of Tabler and Tabler's own catalogue into
the drawable set when the icons page mounts, which took 2,529 KB of glyphs and
373 KB of metadata out of the chunk the kit starts from. That door is web-only
by nature (Metro has no dynamic
import with a computed specifier, and the webOS legacy tier inlines every chunk
back into one IIFE), so a Metro workbench still opts into `icons: 'full'`.

---

## Tokens

`src/core/tokens/*.ts` is the **single source of truth** for the design; it is
also what builds the default theme (see "Styling: Themes"). `kromaUI()`
(`@kroma/ui/vite`) emits the CSS custom properties the web and desktop clients
consume from it at build time, so there is no stylesheet copy that can drift.

Components never import token VALUES for styling: the vocabulary carries them
by name (`bg="accent"`, `radius="lg"`, `text: 'hero'`), which is what lets a
theme reach every declaration. What legitimately imports from
`#ui/core/tokens` is the non-style residue: `motion` timings, the `CANVAS`
geometry, `gutter`, the chart palettes.

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
bun run dev:kit        # http://localhost:5180
bun run kit:ios        # the same stories, on a phone
bun run kit:tv         # and on an Apple TV
```

Every component, its live controls, and its variant matrix. This is the kit's
Storybook, and it is **not a separate application**: it is a normal screen built
from the kit, so it runs in a browser, on an Apple TV and on a phone, with no
manager iframe, no builder abstraction and no addon protocol to keep alive. It is
the only component explorer in the project that can show you the design on the
device that actually has to render it. It also rides along on the TV shells,
behind `?workbench` (`bun run dev:tizen`, then
`http://localhost:5174/?workbench`).

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
// components/atoms/button/button.detail-actions.demo.tsx
import { Box } from '#ui/components/atoms/box';
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
`packages/workbench/src/demos.ts`.

**Writing the prose.** `docs:` above is a markdown string, which is right for a
sentence and wrong for a page. A component with more to say puts it in a
`<story-id>.docs.mdx` beside the story, where it is a real document rather than
an escaped template literal - and where it can render the component in the middle
of it:

```mdx
// components/molecules/list-row/list-row.docs.mdx  (the shipped ones are
// button-group, otp-field, dialog and drawer)
import { ListRow } from './list-row'

One **D-pad stop** per row, and a pointer-sized hit area.

<ListRow.Root>
  <ListRow.Label>Qualité</ListRow.Label>
  <ListRow.Hint>1080p</ListRow.Hint>
</ListRow.Root>
```

The file replaces the story's `docs:` string. Unlike a demo's code panel this
does NOT thin out on a television: MDX is a plain compiler, so Vite runs it as a
plugin and Metro runs it as a transformer, and `@kroma/workbench`'s `mdx.tsx`
maps every HTML element MDX emits to a kit component - a mapping its own test
holds to a real compile, because a missing element is a crash on the one platform
that cannot render it.

**Stories, demos and docs are discovered, never listed.** Drop a `*.stories.tsx`,
a `*.demo.tsx` or a `*.docs.mdx` anywhere under `src/` and it is in the
workbench: there is no registry to regenerate and no generated file to fall
behind. Discovery needs a bundler primitive, and both bundlers resolve theirs
relative to the file that writes it, so the glob lives in the HOST, not in the
kit: `apps/kit/src/stories.web.ts` writes `import.meta.glob`, `stories.ts` beside
it writes `require.context`, and both hand the result to `@kroma/workbench`.
Every state is a real path (`/story/button/matrix`).

**The toolbar switches themes.** KROMA plus three restatements (Ocean, Ember,
Terminal). A control that stays amber under Ocean is bypassing the vocabulary.

**One screen, three widths.** The workbench is also the kit's own responsive
test: `packages/workbench/src/layout.ts` is a pure function of the window, and
the regions *move* rather than shrink. Past 1240pt the list, the canvas and the inspector are
three columns; below that the inspector docks under the canvas as a wrapping row;
below 880pt the list becomes a drawer over the canvas and the dock collapses to
its titlebar, so the component keeps the room on a phone.

The workbench is `@kroma/workbench`, a package of its own, and it knows no design
system: a host hands it the stories, the wordmark and the app context. This
package supplies KROMA's half of that in `src/workbench-config.tsx`, which is a
plain object rather than a call, because calling `defineWorkbench()` here would
make `@kroma/ui` import `@kroma/workbench`, which imports `@kroma/ui`. Each host
spreads it and adds its own discovery and router: `apps/kit/src/config{,.web}.tsx`,
`packages/tv/src/workbench{,.web}.tsx`, `clients/mobile/src/app/workbench.tsx`.

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
- [`src/components/DESIGN.md`](src/components/DESIGN.md) how a component's API is shaped
