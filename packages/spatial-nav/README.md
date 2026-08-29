# @kroma/spatial-nav

The focus tree a D-pad walks. A dependency-free engine that owns registration,
sibling order, directional resolution and single-owner focus, plus the React
binding `@kroma/ui`'s `<Focusable>`, rails and grid are built on.

This replaces `react-tv-space-navigation@6.0.0-beta1` and the `@bam.tech/lrud`
tree underneath it.

> The conformance suite in `src/*.test.ts` is written; the engine it describes is
> not. Every test in this package fails until `src/index.ts` and
> `src/react.tsx` land. That is the point: the suite is the specification.

## Why replace it

The old package is a dormant beta. `latest` points at a beta, nothing has shipped
in over a year, and the three defects that bite here all sit in the layer this
repo leans on hardest:

- **`registerNode` throws on a duplicate id.** LRUD raises
  `Node with an ID of <id> has already been registered`, and the virtualized
  list registers its nodes from two effects that cannot see each other. When both
  run in one commit the second re-registers the tail, the throw aborts the
  `forEach` that was registering the rest, and the remaining nodes never exist.
  Focus then lands on nodes that are not there and blurs never fire. That is the
  many-tiles-lit bug, and it is why `patches/` exists.
- **A recycled React key collides.** `getRange` can return more items than the
  modulus the key is taken against, so two indices share a key, React refuses to
  reconcile them, and the mounted tile count climbs without bound as the row is
  walked.
- **A node cannot declare its index.** LRUD's `registerNode` takes one;
  `SpatialNavigationNode` does not pass it. Siblings are therefore ordered by
  registration alone, so a tile that unmounts and remounts at the head of a
  sliding window registers last, and walking left dies at the window's edge. The
  rails work around it by growing and never shrinking, which is the mounting cost
  virtualisation was supposed to remove.

Owning the engine also ends the patch file, which currently carries the
idempotence fix, the key fix, and the `freeScrollFraction` prop the grid's wheel
scrolling needs.

## The two entry points

```ts
import { SpatialNavigator, Directions } from '@kroma/spatial-nav';        // the engine
import { NavigatorRoot, NavigatorItem } from '@kroma/spatial-nav/react';  // the binding
```

The engine imports nothing. It is a plain class over a tree of ids, so the whole
of the behaviour below is testable in the `node` vitest project with no DOM, no
React and no React Native. `./react` is the only half that renders anything.

## The API map

| `react-tv-space-navigation` | `@kroma/spatial-nav` |
| --- | --- |
| `SpatialNavigation.configureRemoteControl({ remoteControlSubscriber, remoteControlUnsubscriber })` | `configureRemote({ subscribe })` |
| `Directions` (a TS enum, used as a type) | `Directions` (a const object) + `type Direction` |
| `SpatialNavigationRoot isActive onDirectionHandledWithoutMovement` | `<NavigatorRoot active onEdge>` |
| `SpatialNavigationNode orientation alignInGrid onActive onInactive` | `<NavigatorNode orientation alignInGrid index onActive onInactive>` |
| `SpatialNavigationView direction alignInGrid style` | `<NavigatorView direction alignInGrid style>` |
| `SpatialNavigationFocusableView onSelect onFocus onBlur style viewProps` | `<NavigatorItem onSelect onFocus onBlur index style viewProps>` |
| `SpatialNavigationNodeRef` | `NodeHandle` |
| `DefaultFocus enable` | `<DefaultFocus enable>` |
| `useLockSpatialNavigation()` | `useLockNavigator()` |
| `SpatialNavigationDeviceTypeProvider` | `<PointerDeviceProvider>` |
| `SpatialNavigationVirtualizedGrid` | not provided, see below |
| `SpatialNavigationVirtualizedListRef` | not provided, see below |
| `SpatialNavigationScrollView` | not provided, never used here |
| `SpatialNavigationVirtualizedList` | not provided, never used here |
| `useSpatialNavigatorFocusableAccessibilityProps` | folded into `<NavigatorItem>` |

The engine underneath, which the old package never exposed:

```ts
const nav = new SpatialNavigator();

nav.registerNode('tile', { parent: 'row', index: 0, focusable: true, onFocus, onBlur });
nav.unregisterNode('tile');

nav.focus('tile');        // true when the focus landed
nav.handle('right');      // true when the focus moved
nav.focusedId;            // the one id holding it, or null
nav.lock(); nav.unlock(); // counted
nav.onEdge = (direction) => {};
```

## What deliberately differs

**Registration is idempotent.** Registering a held id again is a no-op and never
a throw; the first registration stands, whatever the second one declares.
Unregistering an id the navigator does not hold is a no-op too. No call site
should have to track what it already registered, which is exactly what the patch
had to add.

**A node can declare its index.** `index` is its slot among its siblings;
omitted, the node is appended after the highest index declared so far, and a tie
is broken by registration order. A rail can then unmount its head tile and mount
it again later without losing leftward navigation, so a rail can shrink as well
as grow.

**`onActive` and `onInactive` are symmetric.** A node is active while it lies on
the path from the root to the focused node, and the callbacks fire on every
transition in both directions. The old package's `onActive` was monotone
(walking right fired per tile, walking back left fired nothing), which is why the
rails carry a `<FocusReporter>` context instead of using it. They no longer have
to.

**A lock gates the engine, not a subscription.** `lock()` counts, and while the
count is above zero `handle()` refuses every direction and `onEdge` stays quiet.
Imperative `focus()` is unaffected: a lock stops the remote, not the app.
`<NavigatorRoot active={false}>` is one more lock, so `active` and
`useLockNavigator` compose instead of being two half-overlapping mechanisms.
Unlocking a navigator that is not locked clamps at zero rather than going
negative.

**`Directions` is a const object, not a TS enum.** `Directions.LEFT` still reads
the same, but the type is now `Direction`. Three call sites use the old name in
type position (`focus-tab.ts`, `focus-tab.test.ts`, `focus-remote.web.ts`) and
become `Direction` there.

**One flag turns a container into a grid.** `alignInGrid` on the vertical
container is enough; the rows do not also need LRUD's `useMeForIndexAlign`. When
the aligned index has no node in the row being entered, the nearest lower index
takes the focus.

**Registration order does not have to match the tree.** A node registered under a
parent that does not exist yet is held and attached when the parent arrives,
because React runs a child's mount effect before its parent's. A held node that
is unregistered before its parent arrives is dropped.

**The focus never vanishes.** Unregistering the focused node blurs it and hands
the focus to the sibling before it, else the one after it, else up the tree.
`focusedId` is null only when nothing focusable is left.

**Nothing is virtualised here.** `SpatialNavigationVirtualizedGrid` and its list
were the old package's own windowing, translation and scroll animation, and the
grid in `@kroma/ui` already wraps them in a clip, a column calculation and a
wheel gesture. That belongs in the kit's `<VirtualGrid>`, against this engine's
`index`, rather than in the navigator. The `freeScrollFraction` prop the patch
adds goes with it.

## The conformance suite

| File | What it pins |
| --- | --- |
| `navigator.registration.test.ts` | idempotent register and unregister, deferred parents |
| `navigator.order.test.ts` | sibling order, declared index, a remounted head tile |
| `navigator.direction.test.ts` | left/right/up/down, rows, grids, edges, the edge listener |
| `navigator.focus.test.ts` | one owner, blur before focus, select, the active path |
| `navigator.lifecycle.test.ts` | where the focus goes when its node is unregistered |
| `navigator.lock.test.ts` | the counted lock |
| `react.test.tsx` | the binding: tree order, one lit tile, a growing row, the lock hook |

Count, not identity, is the assertion that matters in the focus tests. The bug
that made this package necessary painted a ring on many tiles at once, and every
one of those tiles individually believed it was right.
