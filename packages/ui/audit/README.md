# The DOM audit

Every story view in the kit, rendered through react-native-web in jsdom, is
measured three ways and each measurement has a committed baseline in this
directory:

| What | Baseline | Catches |
| --- | --- | --- |
| Node count + depth (`cost.ts`) | `budget.json` | DOM growing back - or shrinking without the win being committed |
| Paint signature (`paint.ts`) | `paint/<story>.txt` | The design moving: one line per content leaf, carrying its typography plus the visual context its ancestors accumulate (padding sums, colours, radii, opacity products, transforms, animations, distributing flex containers) |
| Accessible tree (`a11y.ts`) | `a11y/<story>.txt` | Semantics lost with a wrapper: roles, names, states, tab stops - plus rule findings (nameless controls, stateless roles, dangling references) |
| Mount commits (`work.ts`) | third number in `budget.json` | CPU cost the compiler cannot remove: a view whose mount takes N commits repeats N-1 re-renders on every screen that shows it. Counted with the React Profiler; deterministic in jsdom |

All three read the DOM through `dom.ts`: what a style value means, what counts as
a child (an `<svg>` is one opaque leaf), and the walk that names where a finding
is. A quirk absorbed there is absorbed once.

The a11y rules only assert what the DOM proves, which is why two of them are
narrower than they look: a **range** (`role="slider"`, react-native-web's
spelling of `adjustable`) is never reported for taking no tab stop, because it is
dragged and nudged by the key map of the surface that owns it, and neither is in
the tree - what it is held to is a name and an `aria-valuenow`. A **text entry**
is named by its placeholder when nothing else names it (HTML-AAM), never by the
value it happens to hold. `a11y.test.ts` pins every rule.

The gate is `dom-budget.test.tsx`, which runs inside `bun run test`, so CI holds
all three. The point of the trio: **a reduction is only a reduction when the
node count goes down while the other two files do not change at all.**

## The loop

```bash
bun run kit:dom                 # worklist, worst structural overhead first
bun run kit:dom --help          # every flag, and what a tree's annotations mean
bun run kit:dom --smells        # only the components carrying removable structure
bun run kit:dom --quiet         # the three summary lines, for a script
bun run kit:dom ListRow         # one component: annotated tree + scoped digest
# edit the component
KROMA_DOM_ONLY=ListRow bun x vitest run --project web packages/ui/audit/dom-budget.test.tsx
#   "down to N nodes ... tighten it"  -> the reduction is real, paint unmoved
#   "<id> line N / was / now"         -> the design moved: fix or revert
bun run kit:dom --write         # move all three baselines; commit them with the change
```

In the tree dump, `[paints]` means the element draws or clips something,
`[padding-… width …]` is the layout it contributes, and an empty `[]` is a
candidate. The smells (`passthrough`, `wrapper`, `glyph-wrapper`, `void`,
`hidden-subtree`) in the report name the candidates outright.

## What is allowed to go

An element earns its place by doing at least one of: painting (background,
border, shadow, transform, translucency, clipping, positioning), animating,
carrying semantics (role, aria, tab stop, live region), holding text, or
distributing two or more children with flex. Everything else is structure, and
structure can move:

- a wrapper that only shapes its one child hands that style to the child
  (`<Box asChild>` / `lib/slot.tsx` is the tool);
- a box that repeats what its parent declares merges upward;
- a part that renders `<Box>{children}</Box>` with nothing of its own returns
  `children`;
- a ScrollView's `contentContainerStyle` is already an element - style it
  instead of nesting a box (a horizontal one lays content out as a row: name
  `flexDirection` when the content is a column);
- an element only one state needs renders only in that state.

## The runtime side

`bun run kit:compiler [needle]` reports which components the React Compiler
SKIPS - silently, per file, with its reason. Every shell runs the compiler
(web, the TV browsers, tv-native and mobile through Expo), so a skip means the
component re-renders unmemoised everywhere. The dominant cause is a ref written
or read during render; the sanctioned replacements are worked into
`focusable.tsx` and `alphabet-rail/` as reference implementations:
`useLayoutEffect` for latest-handler refs, `useEffectEvent` for gesture and key
layers, `useState(() => ...)` lazy init for Animated values and PanResponders,
render-phase setState for previous-value tracking, module-level functions for
ref-callback writes and try/catch bodies, and hoisting a RefObject OUT of any
props bag (an aggregate holding a ref taints every member access). When the
compiler says "existing memoization could not be preserved", the manual
`useMemo` usually never hit at all - delete it and let the compiler own it.

## Trust the guard, not the eye

jsdom quirks the analyzers already absorb: shorthand properties are not
expanded into longhands (`gap`, `border-radius`, `transition` are read through
fallbacks), clock-derived text is redacted, `TZ` is pinned. If a new signature
line churns between two identical runs, the fix belongs in `paint.ts`, not in a
looser assertion.
