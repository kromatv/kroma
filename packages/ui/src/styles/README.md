# Styles

The CSS half of the design system, for the targets that read CSS. The TV and
native apps never load any of it — they consume the TypeScript tokens directly.

**There is no CSS to maintain here.** `kroma.css` is a placeholder; everything
real is emitted by `kromaUI()` (`@kroma/ui/vite`) from the TypeScript tokens, so
the design system has one representation and the two halves cannot drift.

## Using it

An app's entry stylesheet writes one line:

```css
@import "@kroma/ui/css";
```

and where Tailwind runs, the same stylesheet in parts, because Tailwind's own
preflight is already a reset and a second unlayered one would outrank every
utility it collides with (`h1 { font-size: inherit }` beats `text-4xl`):

```css
@import "tailwindcss";
@import "@kroma/ui/css/fonts";
@import "@kroma/ui/css/tokens";
@import "@kroma/ui/css/motion";
@import "@kroma/ui/css/page";
@import "@kroma/ui/css/theme";
```

| Specifier | Emits |
| --- | --- |
| `@kroma/ui/css` | fonts + tokens + motion + base |
| `@kroma/ui/css/tokens` | the custom properties, both palettes |
| `@kroma/ui/css/theme` | the Tailwind v4 bridge (`bg-accent`, `text-muted`, …) |
| `@kroma/ui/css/fonts` | the `@font-face` rules |
| `@kroma/ui/css/motion` | the component keyframes |
| `@kroma/ui/css/reset` | the UA stylesheet undone, and nothing else |
| `@kroma/ui/css/page` | body, focus ring, scrollbars, with the reset left out |
| `@kroma/ui/css/base` | reset, body, focus ring, scrollbars |

The parts exist for `@kroma/tv`, which wants the type, the tokens and the reset
but none of the page furniture on top of it (it hides overflow, grounds itself
dark and owns its focus visuals), and for `apps/www`, which wants the furniture
without the reset.

## The fonts come with a preload, not just a `@font-face`

The two self-hosted faces are declared `font-display: optional`, because
swapping them in after first paint moved the whole column (0.78 CLS). `optional`
buys that with a ~100ms block period and **no swap period at all**: a face that
has not arrived by then is dropped for the life of the page, and the reader
stares at `system-ui` until the next cold load.

So the preload is not a tuning knob, it is the condition the declaration is only
correct under. `kromaUI()` therefore ships a second plugin, `kroma-font-preload`,
which injects

```html
<link rel="preload" href="…/hanken-grotesk-latin-<hash>.woff2"
      as="font" type="font/woff2" crossorigin="anonymous">
```

at the top of every `index.html`, from the same `FIRST_PAINT_FONTS` the
`@font-face` rules are written from, so the two cannot name different files.
Three details are load-bearing:

- **`crossorigin`**, even same-origin. A font is always fetched in CORS mode; a
  preload without it does not match the fetch and the file is downloaded twice.
- **The latin subset only.** `latin-ext` covers nothing a first screen renders,
  and a preload the page never uses is a console warning and wasted bytes.
- **The href is written the way Vite reads one, not the way it ships** - a path
  relative to the html on a build, so Vite rewrites it to the same fingerprinted
  asset the stylesheet resolves to, and the dev server's `/@fs` URL otherwise.

A target that renders its own `<head>` instead of an `index.html` gets no such
help: the TanStack sites carry the same two links by hand, in
`@kroma/site-kit`'s `siteHead()` and in `apps/www`'s root route.

## Two rules the builds enforce the hard way

**`kromaUI()` comes before `tailwindcss()`.** Tailwind resolves `@import`
itself, so if it reaches the stylesheet first it silently drops the specifier it
does not know and every custom property is missing from the bundle.

**The directive belongs in the app's own entry stylesheet.** Vite inlines nested
CSS `@import`s inside its own CSS plugin, where the plugin container's
`transform` never sees them. `generateBundle` sweeps the emitted assets as a
backstop, but Tailwind can consume a nested file before that runs.

Both failures are silent: the build succeeds and ships
`body { background: var(--kroma-bg) }` pointing at nothing.
