// <Resizable>: panels a reader can re-proportion, and the seams they meet at.
//
// shadcn's shape (`ResizablePanelGroup` / `ResizablePanel` / `ResizableHandle`)
// in this kit's vocabulary, over this kit's own machinery: react-resizable-panels
// is DOM-only, and a component here has to work on a television driven by a
// D-pad as well as under a pointer.
//
// The Root owns the layout, walks its DIRECT children once to learn where the
// panels and the seams are, and publishes what it learned through context - the
// same shape <ButtonGroup> and <Disclosure> take, and for the same reason:
// there is no `:first-child` here and Yoga has no `order`.

import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import type { GroupOrientation } from '#ui/lib/group-shape';
import { type ChangeDetails, defineControl, typed, useControl } from '#ui/lib/control';
import { useAutoSave } from './resizable-autosave.hook';
import {
  ResizableGroupContext,
  type ResizableGroupState,
  type ResizableLayoutDetails,
} from './resizable-context';
import { Handle } from './resizable-handle.component';
import { defaultLayout, limitsFor, sameLayout, solve } from './resizable-layout';
import { useMoves } from './resizable-moves.hook';
import { Panel } from './resizable-panel';
import { resizableParts } from './resizable-parts';
import { HANDLE_THICKNESS } from './resizable-seam.component';
import { browserStorage, type ResizableStorage, readLayout } from './resizable-store';

interface ResizableRootProps {
  /** Which way the panels run. `horizontal` puts them side by side with
   *  upright seams between them. */
  orientation?: GroupOrientation;
  /** Present: you own the layout (controlled). A list of shares, one per
   *  panel, summing to 100. */
  layout?: readonly number[];
  /** The layout to start from, overriding what the panels' own `defaultSize`s
   *  describe. */
  defaultLayout?: readonly number[];
  onLayoutChange?: (next: readonly number[], details: ResizableLayoutDetails) => void;
  /** Fixes every seam in the group. The seams stay drawn and stop being focus
   *  stops. */
  disabled?: boolean;
  /** Keeps the layout between visits under this key. Each arrangement of the
   *  group (orientation and panel count) is stored separately, so a window
   *  crossing a breakpoint cannot restore a layout written for other panels. */
  autoSaveId?: string;
  /** Where `autoSaveId` writes. Defaults to `localStorage`, which is null off
   *  the web; a native host passes its own device store. */
  storage?: ResizableStorage | null;
  style?: StyleProp<ViewStyle>;
  /** `<Resizable.Panel>`s with `<Resizable.Handle>`s between them. A part has
   *  to be a DIRECT child to take its place; anything else is laid out as
   *  written and takes no part in the group. */
  children?: ReactNode;
}

const NOTHING: readonly number[] = [];

const resizableControl = defineControl('resizable', {
  state: { layout: typed<readonly number[] | null>(null) },
  reasons: ['drag', 'commit', 'restore'],
});

/**
 * A group of resizable panels.
 *
 * ```tsx
 * <Resizable.Root orientation="horizontal" autoSaveId="inspector">
 *   <Resizable.Panel defaultSize={25} minSize="200px">…</Resizable.Panel>
 *   <Resizable.Handle label="Resize the list" />
 *   <Resizable.Panel minSize="480px">…</Resizable.Panel>
 * </Resizable.Root>
 * ```
 */
function Root({
  orientation = 'horizontal',
  layout: layoutProp,
  defaultLayout: openAt,
  onLayoutChange,
  disabled = false,
  autoSaveId,
  storage,
  style,
  children,
}: Readonly<ResizableRootProps>) {
  const parts = useMemo(() => resizableParts(children), [children]);
  const arrangement = `${orientation}:${parts.specs.length}`;

  const [length, setLength] = useState(0);
  const available = Math.max(0, length - parts.seams * HANDLE_THICKNESS);

  const limits = useMemo(() => limitsFor(parts.specs, available), [parts.specs, available]);
  const opened = useMemo(
    () => solve(openAt ?? defaultLayout(parts.specs, available), limits),
    [openAt, parts.specs, available, limits],
  );

  const store = useMemo(() => (storage === undefined ? browserStorage() : storage), [storage]);

  const [restored] = useState(() => readLayout(store, autoSaveId, arrangement) ?? openAt ?? null);

  const report = useRef(onLayoutChange);
  const told = useRef<readonly number[]>(NOTHING);
  const settled = useRef(true);
  const tell = (next: readonly number[] | null, { reason, source }: ChangeDetails) => {
    if (next === null || reason === 'restore') {
      return;
    }
    told.current = next;
    settled.current = reason !== 'drag';
    report.current?.(next, { committed: settled.current, user: source === 'user' });
  };
  // Null while nothing has been asked for: the panels' own defaults are then
  // re-derived on every window, which is what resolves a `'280px'` default the
  // first frame could not.
  const [{ layout: wish, setLayout }] = useControl(resizableControl, {
    layout: layoutProp,
    defaultLayout: restored,
    onLayoutChange: tell,
    disabled,
  });
  const mine = wish?.length === parts.specs.length ? wish : null;
  const layout = useMemo(() => (mine ? solve(mine, limits) : opened), [mine, limits, opened]);

  const commit = useCallback(
    (next: readonly number[], committed: boolean) => {
      if (!sameLayout(next, told.current)) {
        setLayout(next, committed ? 'commit' : 'drag');
      } else if (committed && !settled.current) {
        settled.current = true;
        report.current?.(next, { committed, user: true });
      }
    },
    [setLayout],
  );

  // A layout that changed without anyone touching a seam - a window narrowing
  // until a panel's own floor bit - is still a layout change to a caller
  // keeping one.
  useEffect(() => {
    if (told.current !== NOTHING && sameLayout(layout, told.current)) {
      return;
    }
    told.current = layout;
    settled.current = true;
    report.current?.(layout, { committed: true, user: false });
  }, [layout]);

  useAutoSave({ store, autoSaveId, arrangement, mine, restore: setLayout });

  // A layout effect rather than a render-phase write: as fresh (no drag or key
  // event can land between the commit and it), and a place the React Compiler
  // allows a ref, so the group stays memoisable.
  useLayoutEffect(() => {
    report.current = onLayoutChange;
  });

  const { begin, drag, reset, resize } = useMoves({ layout, limits, available, opened }, commit);

  const state = useMemo<ResizableGroupState>(
    () => ({
      orientation,
      disabled,
      available,
      layout,
      limits,
      specs: parts.specs,
      begin,
      drag,
      reset,
      resize,
    }),
    [orientation, disabled, available, layout, limits, parts.specs, begin, drag, reset, resize],
  );

  const measure = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLength(Math.round(orientation === 'horizontal' ? width : height));
  };

  return (
    <ResizableGroupContext value={state}>
      <Box
        flex
        row={orientation === 'horizontal'}
        minW={0}
        minH={0}
        onLayout={measure}
        style={style}
      >
        {parts.nodes}
      </Box>
    </ResizableGroupContext>
  );
}

/**
 * Panels a reader can re-proportion, and the seams they meet at.
 *
 * The seam is one D-pad stop as well as a pointer target: press it to take the
 * arrow keys, press it again (or hold it) to put its two panels back.
 */
const Resizable = { Root, Panel, Handle };

export type { ResizableRootProps };
export { Resizable };
