# Icons

There is nothing to register. `<Icon name="wave-sine" />` works because
[Tabler](https://tabler.io/icons) exports `IconWaveSine`, and `glyphs.ts`
translates one spelling into the other. No slug list, no generator, no generated
file: all three used to exist here and all three are gone.

A name the package does not have draws the fallback (`help-circle`) rather than
crashing, which is what makes it safe to take an icon name from data. A
server-installed module names its glyph in its manifest, and no list could ever be
complete.

## One namespace, two renderers

Tabler ships the same icons twice with the same export names.
`@tabler/icons-react` draws DOM `<svg>`, `@tabler/icons-react-native` draws through
react-native-svg. This folder imports the React Native one, and every web bundler
aliases that specifier to the DOM one, the same trick as
`react-native` → `react-native-web`, wired in `packages/bundler/src/rnw.ts` and
`vitest.config.ts`.

So a browser gets native SVG and never loads react-native-svg's runtime, bytes a TV
cannot spare, which is the argument `lib/svg.web.tsx` makes at length. Native gets
react-native-svg, where it is the only way to draw at all.

The one prop the two packages disagree on is the outline WEIGHT (`stroke` on the
web, `strokeWidth` on native), so that name is split into `stroke-prop.ts` and
`stroke-prop.web.ts`. Passing the wrong one is quietly wrong, since the icon still
draws at the default weight, which is exactly why it is named rather than guessed.

## The type

`IconName` is derived rather than declared. A tail-recursive template-literal type
applies the same transform as the runtime `slugOf` over `keyof typeof Tabler`,
giving a strict union of every Tabler slug. Autocomplete for thousands of glyphs,
and `<Icon name="chevron-rihgt" />` fails to compile. `hasGlyph` is the type guard
that turns a runtime string into an `IconName`.

`glyphs.test.tsx` carries compile-time assertions on that derivation, and they
caught a missing prefix strip that would have produced `icon-wave-sine` and broken
every icon at runtime while compiling cleanly.

## The cost, measured

A namespace import cannot be tree-shaken, so left alone the whole set ships: the
kit site went from 258 KB to 741 KB gzipped. Every target gets the scanned subset
from [`@kroma/ui/bundler`](../../../bundler), which walks the workspace for slug
literals and rewrites this folder's `glyph-source.ts` down to the names it found,
299 of 6,250 today. Measured on the repo's own Vite, `<Icon>` costs 49 KB gzipped
with the subset against 573 KB with the full set.

The walk reads `.ts`, `.tsx` and `.mdx`. A guide page draws icons like any other
source and is not typechecked, so a name only its prose spells would otherwise be
missing from the subset and draw the fallback in the built site alone.

Which paths get it: the Vite half is `apply: 'build'`, so `vite dev` still serves
all 6,250 and only the built bundle is subset. The Metro half runs at config-eval
time, so `expo start` and `expo export` both get it.

## The gallery, which needs the rest

A workbench browsing the icons is the one app that must answer from the whole set,
and `every-glyph.web.ts` fetches it as its own chunk. `library.ts` merges what
arrives into the drawable set through `addGlyphs`, alongside the catalogue the
workbench registered, and `useIconLibrary()` is what the icon browser waits on.
That keeps 2,529 KB of glyphs and 373 KB of metadata (490 KB and 119 KB gzipped)
out of the chunk `apps/kit` starts from, where they were 60% of it.

The widening reaches the NEXT render. `addGlyphs` drops the memoised resolutions,
but nothing already on screen re-renders, so a component that drew the fallback
keeps it until something else moves it. That is why the scan reads `.mdx`, so no
page draws a fallback for a name it spells, and why the widening stays a workbench
affair.

Native has no such door. Metro cannot split a chunk off, so `every-glyph.ts` is
`null`, the browser waits for nothing, and a Metro workbench that wants the gallery
asks for `icons: 'full'` in its config (`apps/kit/metro.config.cjs` does). The
webOS legacy tier is the other place a chunk buys nothing, since it inlines every
one of them back into a single IIFE.
