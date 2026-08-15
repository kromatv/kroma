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
  Children,
  isValidElement,
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
import { useControllable } from '#ui/lib/use-controllable';
import {
  PanelIndexContext,
  ResizableGroupContext,
  type ResizableGroupState,
  type ResizableLayoutDetails,
  SeamIndexContext,
} from './resizable-context';
import { HANDLE_THICKNESS, Handle } from './resizable-handle';
import {
  adjust,
  defaultLayout,
  FULL,
  limitsFor,
  type PanelSpec,
  resetSeam,
  resizePanel,
  sameLayout,
  solve,
} from './resizable-layout';
import { Panel } from './resizable-panel';
import { browserStorage, type ResizableStorage, readLayout, writeLayout } from './resizable-store';

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

interface Parts {
  specs: PanelSpec[];
  seams: number;
  nodes: ReactNode[];
}

function walk(children: ReactNode): Parts {
  const specs: PanelSpec[] = [];
  let seams = 0;
  // `Children.toArray` has already given every child a stable key of its own,
  // which is what the providers wrap themselves in: an index would renumber the
  // panels the moment a window crossing a breakpoint drops one.
  const nodes = Children.toArray(children).map((child) => {
    if (!isValidElement(child)) return child;
    if (child.type === Panel) {
      const at = specs.length;
      specs.push(child.props as PanelSpec);
      return (
        <PanelIndexContext.Provider key={child.key} value={at}>
          {child}
        </PanelIndexContext.Provider>
      );
    }
    if (child.type === Handle) {
      seams += 1;
      return (
        <SeamIndexContext.Provider key={child.key} value={specs.length - 1}>
          {child}
        </SeamIndexContext.Provider>
      );
    }
    return child;
  });
  return { specs, seams, nodes };
}

const NOTHING: readonly number[] = [];

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
  const parts = useMemo(() => walk(children), [children]);
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

  // Null while nothing has been asked for: the panels' own defaults are then
  // re-derived on every window, which is what resolves a `'280px'` default the
  // first frame could not.
  const [wish, setWish] = useControllable<readonly number[] | null>(layoutProp, restored);
  const mine = wish?.length === parts.specs.length ? wish : null;
  const layout = useMemo(() => (mine ? solve(mine, limits) : opened), [mine, limits, opened]);

  const report = useRef(onLayoutChange);
  const told = useRef<readonly number[]>(NOTHING);
  const settled = useRef(true);

  const commit = useCallback(
    (next: readonly number[], committed: boolean) => {
      const moved = !sameLayout(next, told.current);
      if (!moved && (!committed || settled.current)) return;
      told.current = next;
      settled.current = committed;
      if (moved) setWish(next);
      report.current?.(next, { committed, user: true });
    },
    [setWish],
  );

  // A layout that changed without anyone touching a seam - a window narrowing
  // until a panel's own floor bit - is still a layout change to a caller
  // keeping one.
  useEffect(() => {
    if (told.current !== NOTHING && sameLayout(layout, told.current)) return;
    told.current = layout;
    settled.current = true;
    report.current?.(layout, { committed: true, user: false });
  }, [layout]);

  // A window crossing a breakpoint hands the group a different set of panels,
  // and the layout written for the old set says nothing about the new one.
  const arranged = useRef(arrangement);
  useEffect(() => {
    if (arranged.current === arrangement) return;
    arranged.current = arrangement;
    setWish(readLayout(store, autoSaveId, arrangement));
  }, [arrangement, store, autoSaveId, setWish]);

  useEffect(() => {
    if (mine) writeLayout(store, autoSaveId, arrangement, mine);
  }, [store, autoSaveId, arrangement, mine]);

  const from = useRef<readonly number[]>(NOTHING);
  const at = useRef({ layout, limits, available, opened });
  // A layout effect rather than render-phase writes: as fresh (no drag or key
  // event can land between the commit and it), and a place the React Compiler
  // allows a ref, so the group stays memoisable.
  useLayoutEffect(() => {
    report.current = onLayoutChange;
    at.current = { layout, limits, available, opened };
  });

  const begin = useCallback(() => {
    from.current = at.current.layout;
  }, []);

  const drag = useCallback(
    (seam: number, delta: number, committed: boolean) => {
      const room = at.current.available;
      if (room <= 0) return;
      const base =
        from.current.length === at.current.layout.length ? from.current : at.current.layout;
      commit(adjust(base, seam, (delta / room) * FULL, at.current.limits), committed);
    },
    [commit],
  );

  const reset = useCallback(
    (seam: number) => {
      commit(resetSeam(at.current.layout, seam, at.current.opened, at.current.limits), true);
    },
    [commit],
  );

  const resize = useCallback(
    (panel: number, size: number) => {
      commit(resizePanel(at.current.layout, panel, size, at.current.limits), true);
    },
    [commit],
  );

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

  const measure = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      setLength(Math.round(orientation === 'horizontal' ? width : height));
    },
    [orientation],
  );

  return (
    <ResizableGroupContext.Provider value={state}>
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
    </ResizableGroupContext.Provider>
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
