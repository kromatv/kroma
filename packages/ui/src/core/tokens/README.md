# Tokens

Level 1 of the hierarchy: the raw values, the ones that cannot be broken down
into anything smaller. `#F4B642`. `16`. `Hanken Grotesk`. Everything else in the
design system is made of these.

`colors.ts` says it in its own header and it is worth repeating: **this is the
single source of truth.** The CSS custom properties are emitted from these files
by `kromaUI()` (see [`../../styles/`](../../styles)) at build time, so there is
no stylesheet copy that can drift.

**Why the values are plain strings.** No `oklch()`, no `color-mix()`, no
viewport units. A token has to drop unchanged into a React Native `StyleSheet`,
into a CSS variable, and into a Chromium 53 webOS bundle. The moment a token
needs computing, one of those three cannot read it.

**Who consumes what**

- The universal kit and the native apps import the TypeScript directly:
  `import { colors, radius } from '#ui/core/tokens'`.
- The web and desktop shells consume the generated CSS variables.
- Outside the package, `@kroma/ui/tokens` is the public door.

**The stage.** `layout.ts` carries `CANVAS`, the fixed 1920x1080 canvas every
10-foot screen is authored against. That is why sizes in this kit are plain
numbers: on a fixed stage a number IS the design's px value, so there is no scale
to memorise and nothing to re-tune per platform. See
[`../../components/templates/`](../../components/templates).
