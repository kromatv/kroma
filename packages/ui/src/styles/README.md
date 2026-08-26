# Styles

The CSS half of the design system, for the targets that read CSS. The TV and native
apps never load any of it. They consume the TypeScript tokens directly.

**There are no `.css` files here, and no CSS text.** Every rule is data:
`reset.ts`, `page.ts`, `admin-table.ts` and `motion.ts` are lists of `rule()`,
`atMedia()` and `keyframes()` entries with colours read back through `cssRef`, and
`sheet.ts` is the only thing that knows what CSS syntax looks like. `kromaUI()`
(`@kroma/ui/vite`) compiles them, together with the tokens and the `@font-face`
rules it generates from `src/core/tokens/`, into the stylesheet a build emits. One
representation, so the two halves cannot drift.

## Using it

An app whose entry is TypeScript imports the sheet and Vite injects it:

```ts
import 'virtual:kroma.css';
```

A page that must be styled at first paint links it instead, which is a real
request for an emitted, content-hashed asset:

```tsx
import appCss from 'virtual:kroma.css?url';
```

An app that still has a stylesheet of its own (because Tailwind needs one) writes
the directive in it, and the plugin expands it in place:

```css
@import "@kroma/ui/css";
```

Where Tailwind runs, take the sheet in parts. Tailwind's own preflight is already
a reset, and a second unlayered one would outrank every utility it collides with
(`h1 { font-size: inherit }` beats `text-4xl`):

```css
@import "tailwindcss";
@import "@kroma/ui/css/fonts";
@import "@kroma/ui/css/tokens";
@import "@kroma/ui/css/motion";
@import "@kroma/ui/css/page";
@import "@kroma/ui/css/theme";
```

| Part | Emits |
| --- | --- |
| `kroma` | fonts + tokens + motion + base: what an app wants |
| `tv` | fonts + tokens + motion + reset: what a television wants |
| `tokens` | the custom properties, both palettes |
| `theme` | the Tailwind v4 bridge (`bg-accent`, `text-muted`, …) |
| `fonts` | the `@font-face` rules |
| `motion` | the component keyframes |
| `reset` | the UA stylesheet undone, and nothing else |
| `page` | body, focus ring, scrollbars, admin tables, with the reset left out |
| `base` | `reset` and `page` together |

Both doors name the same parts: `virtual:kroma-<part>.css`, or
`@kroma/ui/css/<part>` in a stylesheet (`virtual:kroma.css` and `@kroma/ui/css`
for the aggregate). `tv` is
there because a television wants the type, the tokens and the reset but none of the
page furniture on top of it: it hides overflow, grounds itself dark and owns its
focus visuals. The single parts are for `apps/www`, which wants the furniture
without the reset, and for anything else that needs one half only.

## The fonts come with a preload

The two self-hosted faces are declared `font-display: optional`, because swapping
them in after first paint moved the whole column (0.78 CLS). `optional` buys that
with a ~100ms block period and no swap period at all. A face that has not arrived
by then is dropped for the life of the page, and the reader stares at `system-ui`
until the next cold load.

So the preload is not a tuning knob. It is the condition the declaration is only
correct under. `kromaUI()` therefore ships a second plugin, `kroma-font-preload`,
which injects

```html
<link rel="preload" href="…/hanken-grotesk-latin-<hash>.woff2"
      as="font" type="font/woff2" crossorigin="anonymous">
```

at the top of every `index.html`, from the same `FIRST_PAINT_FONTS` the
`@font-face` rules are written from, so the two cannot name different files. Three
details are load-bearing:

- **`crossorigin`**, even same-origin. A font is always fetched in CORS mode; a
  preload without it does not match the fetch and the file is downloaded twice.
- **The latin subset only.** `latin-ext` covers nothing a first screen renders, and
  a preload the page never uses is a console warning and wasted bytes.
- **The href is written the way Vite reads one, not the way it ships.** That is a
  path relative to the html on a build, so Vite rewrites it to the same
  fingerprinted asset the stylesheet resolves to, and the dev server's `/@fs` URL
  otherwise.

A target that renders its own `<head>` instead of an `index.html` gets no such
help. The TanStack sites carry the same two links by hand, in `@kroma/site-kit`'s
`siteHead()` and in `apps/www`'s root route.

The dev server declares `swap` rather than `optional`. There the sheet arrives with
the module graph and a cold session has a hundred stories to transform first, so
the preload is often reported unused and dropped, the block period expires, and the
reader is left on `system-ui` until a reload warms the cache. Nobody measures CLS on
a dev server, and a typeface that only appears every other F5 is the worse bug.

## Two rules the builds enforce the hard way

**`kromaUI()` comes before `tailwindcss()`.** Tailwind resolves `@import` itself,
so if it reaches a stylesheet first it silently drops the specifier it does not
know and every custom property is missing from the bundle. The plugin fails the
build rather than let that ship.

**The directive belongs in the app's own entry stylesheet.** Vite inlines nested
CSS `@import`s inside its own CSS plugin, where the plugin container's `transform`
never sees them. `generateBundle` sweeps the emitted assets as a backstop, but
Tailwind can consume a nested file before that runs. The virtual specifier has no
such trap: it is a module, so it resolves wherever it is imported.
