# @kroma/react-audit

What a React interaction actually costs: **which** components re-rendered, and
which were destroyed and rebuilt.

A `<Profiler>` can tell you a commit took 3 ms and touched a lot of the tree. It
cannot tell you which forty components did the work, and that is the only form of
the answer anyone can act on. This reads React's own fiber tree, through the same
hook React DevTools uses, so it names them.

## Install

```ts
// vitest.config.ts
setupFiles: ['@kroma/react-audit']
```

That has to happen before `react-dom` is imported by anything: the renderer reads
the devtools hook **once**, when it initialises. Importing this package installs
it. Naming it as a setup file is the only way to be sure of the order.

## Measure one interaction

```tsx
import { measure } from '@kroma/react-audit/react';

const result = measure(<Keyboard />);

result.churn       // [['Key', 42]]  destroyed and rebuilt by that one press
result.rerenders   // 128
result.components  // every component that did work, worst first
result.drove       // what it pressed, or null if the view had no control
```

`measure` renders, presses the first control the view offers, and reads the
commits. Drive something else with `{ press: '[role="slider"]' }`,
`{ type: 'abc' }`, or `{ act: (roots) => … }`. It does not unmount: that is
`afterEach(cleanup)`'s job, and it leaves the DOM there to inspect.

## Measure anything else

The core knows nothing about any renderer or test library. Start it, do whatever
you like, stop it.

```tsx
import { record } from '@kroma/react-audit';

const run = record();       // BEFORE rendering: the first commit is the mount
render(<Typing />);
fireEvent.click(screen.getByLabelText('a'));
const result = run.stop();
```

## Churn is the number that matters

Pressing a button that opens a menu mounts a menu. That is the button working,
and `churn` stays empty.

What is never right is a component that was **already on screen** being destroyed
and built again: nothing appeared, the count did not grow, and yet React paid to
create it twice. A remount throws away the host node, its state, its animated
values and the focus position, and no amount of memoisation softens it. That is
what `churn` reports, and empty is the only good answer.

```tsx
expect(measure(<Keyboard />).churn).toEqual([]);
```

## Reading it

```ts
import { formatResult } from '@kroma/react-audit';

console.log(formatResult(result));
// 2 commits  42 churned  0 re-rendered
//
// destroyed and rebuilt:
//     42  Key
```

## A caveat worth stating

Measure under the same compiler your app ships with. If your build runs the React
Compiler and your tests do not, every interaction will look catastrophic and the
numbers will blame your code for work the compiler already removes. In this repo
the audit is its own vitest project for exactly that reason.

## How it decides

- **Mounted**: the fiber has no alternate. That is unambiguous.
- **Re-rendered**: `actualDuration > 0` **and** the memoized props or state
  changed identity. Either signal alone lies. `actualDuration` sums a subtree's
  time into every ancestor, so it counts parents that only sat there. A props
  check alone counts subtrees React never cloned, whose alternate is stale from
  an earlier commit.
- **Churn**: mounted after the interaction, and no more of them on screen than
  before it.
