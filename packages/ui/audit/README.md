# The kit audit

Every story view in the kit, rendered through react-native-web in jsdom, measured
three ways. **Nothing measured is committed.** There are no baseline files: each
check is either a rule that is simply never allowed, or a worklist you read.

| What | Where | Catches |
| --- | --- | --- |
| Broken views | `audit.test.tsx` | A story that stopped rendering |
| Accessible tree (`a11y.ts`) | `audit.test.tsx` | Nameless controls, roles claiming a state they never report, aria references pointing at nothing |
| List-render allocations (`fanout-scan.ts`) | `audit.test.tsx` | A prop the React Compiler cannot cache, so a whole list re-renders when one item changed |
| DOM structure (`cost.ts`) | `bun run kit:dom` | Elements that paint nothing, carry no semantics and hold no text |
| Interaction cost (`sweep.ts`, `perf.ts`) | `bun run kit:perf` | Components destroyed and rebuilt by a single press |

The first three are gates because they pass today, so a failure means something
broke rather than something was already broken. The last two are worklists: the
kit still carries real faults in both, and a gate born red is not a gate.

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

**The compiler cannot memoise a call to an imported function.** `urlRows(letters)`
was recomputed on every render and the compiler did not even guard the grid that
read it. A member read off a module constant (`URL_ROWS[letters]`) it can hold
still. If a helper returns a fresh array or object, make it a table.

## Trust the guard, not the eye

jsdom quirks the analyzers absorb: shorthand properties are not expanded into
longhands (`gap`, `border-radius`, `transition` are read through fallbacks),
clock-derived text is redacted, `TZ` is pinned. A quirk absorbed in `dom.ts` is
absorbed once.
