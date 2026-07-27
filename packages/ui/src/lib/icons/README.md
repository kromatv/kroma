# Icons

There is nothing to register. `<Icon name="wave-sine" />` works because
[Tabler](https://tabler.io/icons) exports `IconWaveSine`, and `glyphs.ts`
translates one spelling into the other. No slug list, no generator, no generated
file — all three used to exist here and all three are gone.

A name the package does not have draws the fallback (`help-circle`) rather than
crashing, which is what makes it safe to take an icon name from **data**: a
server-installed module names its glyph in its manifest, and no list could ever be
complete.

## One namespace, two renderers

Tabler ships the same icons twice with the same export names:
`@tabler/icons-react` draws DOM `<svg>`, `@tabler/icons-react-native` draws through
react-native-svg. This folder imports the React Native one, and every web bundler
aliases that specifier to the DOM one — the same trick as
`react-native` → `react-native-web`, wired in `clients/tv-build/rnw.ts` and
`vitest.config.ts`.

So a browser gets native SVG and never loads react-native-svg's runtime (bytes a
TV cannot spare, the argument `lib/svg.web.tsx` makes at length), and native gets
react-native-svg, where it is the only way to draw at all.

The one prop the two packages disagree on is the outline WEIGHT — `stroke` on the
web, `strokeWidth` on native — so that name is split into `stroke-prop.ts` and
`stroke-prop.web.ts`. Passing the wrong one is quietly wrong (the icon still draws,
at the default weight), which is exactly why it is named rather than guessed.

## The type

`IconName` is **derived, not declared**: a tail-recursive template-literal type
applies the same transform as the runtime `slugOf` over `keyof typeof Tabler`,
giving a strict union of every Tabler slug. Autocomplete for thousands of glyphs,
and `<Icon name="chevron-rihgt" />` fails to compile. `hasGlyph` is the type guard
that turns a runtime string into an `IconName`.

`glyphs.test.tsx` carries compile-time assertions on that derivation — they caught
a missing prefix strip that would have produced `icon-wave-sine` and broken every
icon at runtime while compiling cleanly.

## The cost, measured

A namespace import cannot be tree-shaken, so the whole set ships: the kit site
went from 258 KB to 741 KB gzipped. Lazy loading does not recover it — Metro has no
dynamic import with a computed specifier, and the webOS legacy tier inlines every
chunk back into one IIFE — so it would only help the modern web tier, at the price
of thousands of chunks and glyphs arriving over the network mid-render. Reverting
to a hand-written map is a small change, local to `glyphs.ts`.
