# Compiled styles

A browser build compiles the kit's static style declarations ahead of time,
the way StyleX does: every property of a declaration becomes one atomic class
in a static stylesheet, and the renderer merges classes per property at render.
What runs in the browser is a lookup and a string join, never a resolver.
React Native is not touched: Metro never runs the plugin, and the same source
resolves at runtime there exactly as it did.

Three halves:

| Half | Where | Job |
| --- | --- | --- |
| build | `packages/ui/vite/atomic/` | evaluates a declaration statically, resolves it through the engine, compiles it, rewrites the call, collects the rules |
| runtime | `src/core/atomic/` | what a compiled module imports: the leaf the build writes, the merge a recipe runs, the dev server's injector |
| renderer | `patches/react-native-web@0.21.2.patch` | react-native-web compiles a static style to its classes and inserts nothing |

## What a build does

`kromaUI()` carries the `kroma-atomic` plugin. For every workspace source
module it sees, the plugin looks for the kit's `styles`, `style`, `sv` and
`svFor` bindings and reads each declaration they are handed without running
the module: literals, the module's own constants, arithmetic on them, spreads,
`as const`, and a constant imported from another workspace file through
`#ui/`, `#tv/`, `#web/`, a relative path, `@kroma/ui/tokens` or
`@kroma/ui/kit`, re-exports followed. A value it reads goes through the same
`split()` and `normalize()` the runtime uses, under a theme whose colours and
shadows are the custom properties the browser reads, then through
react-native-web's own atomic compiler for its rules. The classes a build
emits are therefore the classes the runtime mints for the same value, and the
two never disagree about a rule.

The declaration is then rewritten in place as the longhands it resolved to:

```ts
const s = styles({ row: { row: true, gap: 6 } });
// becomes
const s = styles({ row: __kromaStatic({ flexDirection: 'row', gap: 6 }) });
// and the sheet gains
.a1B2c3{flex-direction:row;}
.dD4e5F{gap:6px;}
```

A value stated per state compiles to the same layers a `_hover` layer does:
`bg: { base: 'accent', hover: 'accentHover' }` is `bg: 'accent', _hover: { bg:
'accentHover' }` to the engine, on the build and at runtime alike.

A class is six characters, the same on a dev server and in a build: a 32-bit
murmurhash of the property and value written in a 64-symbol alphabet, whose
first symbol the two bits left over pick from `a` to `d`, so the name is
legal without a prefix. StyleX names its classes the same way behind an `x`,
and react-native-web upstream spells the property into the name on a dev
server; the patch takes both out, since the rule a build wrote is the rule a
dev server has to read.

and the rules land in the token stylesheet the shell already loads
(`virtual:kroma*.css` or `@import "@kroma/ui/css"`), after everything
react-native-web injects at runtime, so a compiled class outranks the reset the
renderer gives every view. A build that loads no token sheet is warned and
paints its compiled styles with nothing.

A `styles()` set compiles per entry: the entries the reader cannot see stay as
written and resolve at runtime beside the compiled ones. A recipe compiles per
slot, whole or not at all, because a slot's layers are then merged without
resolving them again; a slot `svFor` types as anything but `StyleDecl` feeds a
component's props and stays as written. What stays on the runtime today: a call
(`keyRowWidth(...)`, `color(...)` inside a declaration), anything bound at
render time. `KROMA_ATOMIC_REPORT=1` prints
every declaration left behind and why; a build's summary counts them.
`KROMA_ATOMIC=0` turns the compiler off for one build or dev server, which is
how to tell a compiler fault from a runtime one.

## What a compiled leaf is

`staticStyle(longhands, states?)` is the resolved declaration itself, frozen,
carrying a non-enumerable `$$static` mark and, for a recipe layer, its
`_hover` / `_focus` / `_press` / `_disabled` coats under `$$states`, each a
static leaf of its own. The renderer registers it exactly as it registers a
style compiled at runtime: the same hashing, the same classes, the same cache
hit on every render. Only the rule insertion is skipped, because the sheet
already holds them.

The patch on react-native-web carries seven hunks, each a few lines:

- `StyleSheet.create` compiles a `$$static` style and inserts nothing.
- The class name is the hash alone, six characters, on a dev server as in a
  build.
- The ordered sheet, when it is created, reads every atomic-shaped selector
  already in the document's stylesheets, so a style registered at runtime
  that compiles to a rule the build wrote inserts nothing: one rule per class
  in the page, never a compiled copy and a runtime copy.
- `StyleSheet.insertStatic(css, group)` is the dev server's door into that
  ordered sheet.
- `<Text numberOfLines>` clamps with a registered style per line count rather
  than an inline declaration.
- `ModalPortal` puts its container back into the document when React
  reconnects its effect. React disconnects the effects of a tree it hides
  behind a Suspense fallback, and upstream's cleanup removed the container for
  good, which left every `<Drawer>` and `<Dialog>` on the browser rendering
  into a detached node once anything around them suspended after they opened.
  `useModalPortalRepair` is redundant with this and stays as a no-op.
- The resolver warns, on a dev server only and once per shape, when a style
  reaches an element unregistered: `[kroma] a style painted inline instead of
  as classes: {paddingVertical}`. Properties a render legitimately computes
  (sizes, offsets, transforms, opacity, an image, a colour) pass; the rest is
  a declaration that belongs in `styles()`. That warning is the ban on inline
  styling: open the console on a screen and it names what is left.

Because the leaf is the longhands, nothing downstream changes: a spread, a key
walk, `StyleSheet.flatten`, `<Text>`'s line-height fix, `<Frost>`'s corner and
the renderer's own `<Image>` reading `resizeMode` all see what they always saw.
A recipe whose slot is static merges its cascade with `mergeStatic`, last wins
per property, into a leaf registered the same way, cached per variant
combination as before.

## Per breakpoint

The build resolves a layer at every step of the scale and diffs the longhands.
One whose value never moves is written as it is; one that moves reads a custom
property whose fallback is its base value, and each further step restates that
property:

```ts
const s = styles({ page: { px: { base: 8, md: 12 } } });
// the sheet gains
.dtf4ZV{padding-left:var(--kc3zcbh,8px);}
:root[data-kroma-bp~="md"] .dtf4ZV{--kc3zcbh:12px;}
```

The variable's name hashes the property and the whole cascade, so the class that
reads it belongs to that cascade alone: one property, one class, however many
steps. That is what keeps the merge right, because `styleq` and `mergeStatic`
both decide per property and the last layer wins. A later `px` therefore
replaces every step of an earlier one, and none of the loser's rules can reach
the element: they name a class it no longer wears.

A step rule only ever sets the variable, so it never argues with a property
rule. The four step selectors weigh the same as each other, and a group per step
puts `md` in the sheet before `lg` before `tv`.

The step reaches the browser as `data-kroma-bp` on the document root, written by
the breakpoint store, carrying every step reached (`base md lg` at `lg`) so `~=`
matches from a step upwards as the cascade does. Not media queries, because the
store's width is not always the window's: `<TvStage>` paints a fixed 1920 canvas
at whatever scale it is given, `Platform.isTV` answers for a television, and
`pinDesignWidth` states it for anything else. A media query would put the
compiled classes on one step while `<Box>`, `sharedStyle` and every declaration
left on the runtime resolved at another. One store decides the step and the
browser reads what it decided.

A server has no width to measure, so the HTML it sends carries no attribute and
a prerendered page paints the base step until the client reads the store, which
is the first `styles()` or `<Box>` on it. One attribute write settles it, where
the runtime needed a re-render for the same crossing, and a shell that ships as
an SPA paints nothing before it.

A longhand the compiler does not write as one plain declaration stays on the
runtime: a value it expands into vendor prefixes (`display: flex`) reads
differently through a `var()`, so the build checks that the variable stands in
for the value exactly, at every step, and refuses the declaration when it does
not. So does a longhand one step states and another does not, which is what
`row: { base: false, md: true }` is: no `flexDirection` at all below `md`.

## Themes

Colour and elevation go through the cascade, as they already did on a browser:
a compiled rule says `var(--kroma-accent)`, and `applyTheme` or a
`[data-theme]` swap repaints it for free. Radius, families and type roles are
literals at build time, as they are literals at runtime today. The difference
is what happens to a theme that restates one of those: a runtime-resolved
declaration rebuilds on `setTheme`, a compiled one keeps the built-in value.
No shell of ours ships such a theme; a kit consumer that does can turn the
compiler off with `kromaUI({ atomic: false })`.

## The dev server

A dev server writes no sheet, so each compiled module inserts its own rules as
it loads, into react-native-web's ordered sheet through `insertStatic`, where
a rule holds the place its priority group gives it and a class the renderer
registers later inserts nothing twice. The shipped build and the dev page
therefore paint the same classes from different places. After the renderer patch first lands, a dev server with
a warm optimizer cache still serves the unpatched copy: start it once with
`--force`.

## What the engine owes the plugin

The plugin runs in the build process, loaded by Node itself, so the engine's
pure core has to load there too. That is why `breakpoint-cascade.ts`,
`normalize.ts` and `shorthand-resolve.ts` read no store and import no
React Native, why every import on that path is spelled `#ui/...` rather than
`./...` (Node cannot resolve an extensionless relative import, and the
package's `imports` map carries a `node` condition that appends the extension
for `#ui/*` while the browser targets keep resolving a `.web` twin), and why a
class there has no parameter properties: Node strips types, it does not
compile them.

## Inline styles

A class is a class only for a style the renderer registered. Two habits put a
style on the element inline instead, and both are gone from the kit:

- a style written as a plain object (`const HAND = { cursor: 'pointer' }`)
  rather than declared with `styles()`. Declared, it is registered, compiled
  ahead of time like any declaration, and shared by every control wearing it.
- a style array flattened with `StyleSheet.flatten` before it reaches the
  element. The result is a fresh object nothing registered. `<Focusable>` did
  this on the browser to satisfy the navigator's type, and painted every
  control inline; it keeps the array now.

Two more habits paint inline, and both are handled:

- an animated component. `Animated.createAnimatedComponent` flattens its style
  array into one object per render, which is right where the value animates
  (native's press dip is an `Animated.Value`) and wrong on the browser, whose
  dip is a CSS transition. `<Focusable>`'s pressable is a plain `Pressable`
  there, and the press and focus scales are registered per scale value.
- a router. TanStack's `createLink` spreads the style it is handed into its
  own active-state style, so the object that reaches the anchor is registered
  by nothing. `registered(style)` from `@kroma/ui/kit` registers it again by
  its content, and the web client's `RouteLink` anchor wears the result.

An element react-native-web never renders (a glyph's `<svg>`, an `<img>`, a
client's own `<div>` or `<a>`) takes `classes(...styles)` from `@kroma/ui/kit`:
the resolver hands back the classes the registered styles compile to and the
element wears those. A value a render computes but that takes few distinct
values (a control's size, a title's key-art wash, a scale) goes through
`sharedStyle(key, decl)`, one class per value; `<Slot>` registers the style it
merges onto its host the same way, so every `asChild` host paints as classes.

What stays inline is what changes continuously: a progress bar's fill, a
virtual list's row offsets and height, an anchored popup's measured box, a
storyboard frame's sheet offset, and the values an `Animated` node drives.
That set is the guard's whole allow-list (`width`, `height`, the four edges,
`maxHeight`, `minWidth`, `paddingTop`, `transform`, `opacity`, `borderRadius`
and the background image, position and size), and on a dev server it names,
with its values, any other property that reaches an element inline. Every
route of the web client audits clean under it; the boot intro is the one
deliberate exception, a framework-free scene that renders before the kit's
sheet exists.

A test reads a control's paint with `declared(el, property)` from
`@kroma/ui/testing`, which follows the classes into the stylesheets, and asks
for the ring with `wearsRing(el)`; `el.style` reads nothing of a class, and
jsdom's computed style drops `z-index` and every `var()`.

## Not compiled yet

`<Box>` props resolve at render as before, breakpoints and all: only a
declaration a reader can see becomes classes, and a prop is written per call
site. Interaction states are still resolved by the recipe from the state
`<Focusable>` passes it, merging static coats; attribute selectors would let the
browser do that.
