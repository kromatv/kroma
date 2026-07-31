# Styles

The CSS half of the design system, for the targets that read CSS. The TV and
native apps never load any of it — they consume the TypeScript tokens directly.

```
styles.css        the global stylesheet: `import '@kroma/ui/styles.css'`, once
tailwind.css      the Tailwind v4 entry: tokens mapped onto utilities
fonts.css         the two families
tokens/*.css      GENERATED from src/core/tokens — never edit
```

## tokens/ is generated

`bun run tokens:gen` reads the TypeScript tokens and writes
`tokens/{colors,spacing,effects,typography}.css` as `:root` custom properties.
**The TS is the source; these files are downstream.** `bun run tokens:check`
regenerates and fails on any diff, so a hand edit here cannot survive.

Why generate at all: nothing can import a `.ts` from a stylesheet, and a token has
to exist in both languages — React Native needs the object, Tailwind's `@theme`
and old-Chromium CSS need the custom property. It is a format translation, not a
redundant copy, and there is no list to maintain because the generator walks the
token objects.

The generator also refuses to lose one: a colour declared in `colors.ts` but never
emitted fails the run, with the name in the message. That guard exists because it
happened — `wash` was added and silently never reached CSS, so the web side
resolved `var(--kroma-wash)` to nothing.

## tailwind.css

Maps the KROMA tokens onto Tailwind utilities (`bg-accent`, `rounded-lg`,
`shadow-card`) by referencing the custom properties rather than copying values, so
a token change moves the utilities with it.

It is imported by the web app **and by every module's own stylesheet**, which is
what lets a runtime-installed module ship self-contained CSS carrying the full
design instead of depending on whichever utility classes the host happened to
generate. Each build's Tailwind scans its own source.

## Values are plain strings, deliberately

No `oklch()`, no `color-mix()`, no viewport units anywhere in the tokens. A value
has to drop unchanged into a React Native `StyleSheet`, into a CSS variable, and
into a Chromium 53 webOS bundle. The moment a token needs computing, one of those
three cannot read it.
