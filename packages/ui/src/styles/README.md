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

and three where Tailwind runs:

```css
@import "tailwindcss";
@import "@kroma/ui/css";
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
| `@kroma/ui/css/base` | reset, body, focus ring, scrollbars |

The parts exist for `@kroma/tv`, which wants the type, the tokens and the reset
but none of the page furniture on top of it (it hides overflow, grounds itself
dark and owns its focus visuals).

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
