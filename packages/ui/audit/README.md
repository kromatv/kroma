# The kit audit

Every story view in the kit, rendered through react-native-web in jsdom, measured
three ways. **Nothing measured is committed.** There are no baseline files: each
check is either a rule that is simply never allowed, or a worklist you read.

| What | Where | Catches |
| --- | --- | --- |
| Broken views | `audit.test.tsx` | A story that stopped rendering |
| Accessible tree (`a11y.ts`) | `audit.test.tsx` | Nameless controls, roles claiming a state they never report, aria references pointing at nothing |
| List-render allocations (`fanout-scan.ts`) | `audit.test.tsx` | A prop the React Compiler cannot cache, so a whole list re-renders when one item changed |
| `asChild` fan-out | `delegation.test.tsx` | A delegated row reaching the rows beside it when it takes the focus |
| Rail interaction cost | `rail-cost.test.tsx` | What one press of Right costs the row the home screen is built from |
| Native driver left off (`perf-scan.ts`) | `audit.test.tsx` | An animation running through JS that the native driver would have taken |
| Source perf worklist (`perf-scan.ts`) | `bun run perf:scan` | Faults a rendered tree cannot show: a layout animation, a memo that memoises nothing, a context value rebuilt per render |
| DOM structure (`cost.ts`) | `bun run kit:dom` | Elements that paint nothing, carry no semantics and hold no text |
| Interaction cost (`sweep.ts`, `perf.ts`) | `bun run kit:perf` | Components destroyed and rebuilt by a single press |

The first six are gates because they pass today, so a failure means something
broke rather than something was already broken. The last three are worklists: the
kit still carries real faults in them, and a gate born red is not a gate.

## Why it runs the React Compiler

The audit is its own vitest project (`--project audit`) and it is the only one
that runs `babel-plugin-react-compiler`. Without it every interaction would look
catastrophic and the numbers would blame the code for work the shells already
remove. Measuring uncompiled React tells you nothing about what ships.

## Interaction cost, and why mount cost was not enough

Mount cost is the easy half: it is the same for everyone and no memoisation
changes it. What breaks a television is the SECOND render, the one a keypress
causes.

`kit:perf` presses one control in every story view and reports two numbers.
**Churn** is the one that matters: components React destroyed and built again
even though nothing new appeared on screen. A press that opens a menu mounts a
menu, and that is the button working; a press that rebuilds forty keys that were
already there is a bug no memoisation can soften, because a remount throws away
native views, animated values and focus.

```bash
bun run kit:perf                  # the worklist, worst first
KROMA_PERF_ONLY=keyboard bun run kit:perf
```

It presses ONE control per story view, which is its blind spot: nothing in it
walks a row. `rail-cost.test.tsx` covers the case the sweep cannot reach, with
`@kroma/react-audit` driving a real `<Rail.List>` under the D-pad. It is a gate:
a press must leave the mounted window alone whether or not it translates the row,
and the press that reaches the end of the window must add one tile rather than
rebuild the tiles already there.

**Measure the row, or half the gate is vacuous.** `edgeScrollOffset` returns 0
for a zero viewport, and jsdom has no ResizeObserver, so a rail that was never
measured can never translate: every press reads as the still case. The test fires
the rail's own `onLayout` through `layout()` (`#ui/testing`) at 1920px. That is
what separates the first four presses, where only the highlight moves, from the
ones past the edge margin, where the row moves under it.

What the gate does NOT hold the rail to: the press that GROWS the window
re-renders every tile already in it, nine updates for one mount at that viewport.
The row rebuilds its whole `tiles` array whenever `mounted` changes, so every
cell gets a new element even though only the last one is new. Nothing is
destroyed and no focus or animated value is lost, which is why it is an accepted
cost rather than a second gate.

**Record from before the mount.** `record()`'s docs say so and this is why: React
leaves the `PerformedWork` flag on a fiber that bailed out, so a recording opened
mid-interaction reads every fiber an EARLIER press touched as touched by this
one. `churn` needs it for a second reason: it reads the first commit as the mount.

It reads React's own fiber tree through `__REACT_DEVTOOLS_GLOBAL_HOOK__`
(`hook.ts`), installed as a setup file because the renderer reads that hook once,
when it initialises. A `<Profiler>` can say a commit took 3 ms; only the fiber
tree can say which forty components did the work, and whether they re-rendered or
were thrown away.

## The DOM worklist

```bash
bun run kit:dom                 # worst structural overhead first
bun run kit:dom --help          # every flag
bun run kit:dom --smells        # only the components carrying removable structure
bun run kit:dom --quiet         # the summary lines, for a script
bun run kit:dom ListRow         # one component: annotated tree + scoped digest
```

An element earns its place by doing at least one of: painting, animating,
carrying semantics, holding text, or distributing two or more children with flex.
Everything else is structure, and structure can move. In a tree dump, `[paints]`
means the element draws or clips something, a layout list is what it contributes,
and an empty `[]` is a candidate.

## What a rendered tree cannot show

`bun run perf:scan` reads the source of every workspace that ships one - the
shells and `packages/tv` included, not just the kit - for three faults the jsdom
audit is structurally blind to, because react-native-web in a browser has no
native driver and no `Platform.isTV` branch.

```bash
bun run perf:scan                     # every workspace
bun run perf:scan virtual-rail        # one path
bun run perf:scan --rule identity-memo
```

- `js-driven-animation` - `useNativeDriver: false` where nothing layout-bound is
  animated, so the driver would have taken it as the code stands. Always a plain
  mistake, so it is a **gate** (`audit.test.tsx`), across every workspace.
- `layout-animation` - the same flag, but the file binds a layout property
  (`left`/`top`/`width`/`height`/`strokeDashoffset`) to a value. The native
  driver has no node for those, so there is nothing to switch on: the fix is to
  animate `transform` instead, or to accept the cost. A **worklist**, because
  sometimes the honest answer is to accept it: `scaleX` on a pill turns its
  semicircular caps into ellipses, and RN has no per-corner x/y radii to correct
  them with. The finding names the properties that make the call, so it does not
  have to be re-derived each time it is read.
- `identity-memo` - `useMemo(() => x, [x])`, which memoises nothing. Whoever
  reads it as stable is not getting what they asked for.
- `unstable-provider` - a context value built during render. Context is read
  PAST an unchanged element, so this re-renders every consumer in the subtree
  even where React would otherwise have bailed out.

## The scanners know nothing about KROMA

`source-scan.ts` is the substrate both source scanners stand on, and no file in
this directory names a workspace, a directory or a product. A scanner is handed
the trees to read and told where the React Compiler lives:

```ts
const at = babelAt([join(root, 'package.json'), join(root, 'packages/bundler/package.json')]);
await scanTrees(at, root, ['packages/ui/src'], { ext: ['.tsx'] });
```

`babelAt` walks its candidates in order and takes the first that resolves, so a
repo that hoists its dependencies passes only its root; this one has to name
`@kroma/bundler`, because that workspace alone declares the plugin. Reaching
`@babel/core` through the compiler's own tree is what stops the two disagreeing
on a version. When none of the candidates resolves it throws `NoCompiler`,
naming every path it tried, rather than dying inside babel.

Everything that knows this repo lives in one file, `scripts/audit-target.ts`:
the compiler's location, and `shippedTrees()`, which works the trees out from the
same `workspaces` globs the package manager reads, so a new client is covered
the day it is added, and porting the audit to another repo is that file.

## What the compiler skipped, and what it could not cache

Two different failures, two different tools.

`bun run kit:compiler [needle]` reports components the React Compiler SKIPS,
silently, with its reason. A skip means the component re-renders unmemoised in
every shell. The dominant cause is a ref written or read during render.

`bun run kit:fanout [needle]` reports what the compiler compiled but could not
cache: a function or object literal written into a JSX prop inside a `.map()`.
There is no cache slot per iteration, so the value is new every render and the
whole list re-renders. The scan reads the compiler's OUTPUT, not the source,
because the compiler hoists most of these on its own and a source-level reading
cries wolf on more than half.

## Two traps worth writing down

**`useEffectEvent` is not referentially stable.** React returns a new closure
from it on every render (`updateEvent` in react-dom). It is for reading fresh
values inside an effect. Handing one to a memoised child re-renders that child
every time, which is why React's own docs say not to pass an effect event to
another component. When the FUNCTION ITSELF is a prop, use
`#ui/lib/stable-callback`.

**The kit is clean because the kit is gated.** `--all` widens the same scan to
every workspace that ships source, and the number there is not zero: the shells
and `packages/tv`, the whole 10-foot experience, were never scanned by
anything. That is a worklist to work down, not a gate: the gate covers the kit,
where it passes.

**A list is not always a `.map()`.** The scan looked only inside `map` and
`flatMap` callbacks, so a `for` loop pushing JSX into an array - which is how
`<VirtualRail>`, the longest list in the app, builds its row - read as clean.
Loop bodies count too, and `fanout-scan.test.ts` now pins both forms.

**The compiler cannot memoise a call to an imported function.** `urlRows(letters)`
was recomputed on every render and the compiler did not even guard the grid that
read it. A member read off a module constant (`URL_ROWS[letters]`) it can hold
still. If a helper returns a fresh array or object, make it a table.

## Trust the guard, not the eye

jsdom quirks the analyzers absorb: shorthand properties are not expanded into
longhands (`gap`, `border-radius`, `transition` are read through fallbacks),
clock-derived text is redacted, `TZ` is pinned. A quirk absorbed in `dom.ts` is
absorbed once.
