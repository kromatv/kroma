// The floating section switcher: a capsule of icon + label items whose amber
// lens travels to the current section. Shared by the TV top nav and the phone
// tab bar; on glass it is also a slider that previews under the finger.
//
// Yoga has no `order` and the capsule's fill depends on whether it is wearing a
// backdrop, so the Root sorts its direct children once and publishes the size
// and the label policy the items honour through context.

import {
  Children,
  isValidElement,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import { PanResponder, Platform, type StyleProp, type View, type ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Frost } from '#ui/components/atoms/frost';
import { RING_ROOM } from '#ui/core';
import { HAND } from '#ui/lib/cursor';
import {
  type LensRect,
  NavPillContext,
  type NavPillLabels,
  type NavPillSize,
  type SlideTarget,
  useNavPill,
} from './nav-pill-context';
import { Item } from './nav-pill-item';
import { Lens } from './nav-pill-lens';

// The capsule's padding IS the room a focused item's ring needs, plus a hairline
// of capsule left showing outside it: an item sits this far in from the edge, so
// its ring lands INSIDE the capsule rather than being shaved off by the rounded
// clip the frost needs, or sitting exactly on the capsule's own edge, where two
// concentric lines a couple of pixels apart read as a drawing mistake.
const PAD = RING_ROOM;

// Inside the slop a touch is a tap and belongs to the item's own pressable.
const SLIDE_SLOP = 8;

const PILL_FILL = 'surface1/78';
const BACKDROP_FILL = 'surface1/55';

/** The blur or wash the capsule floats on: whatever `registerFrost` gave this
 *  shell. Present, the capsule thins its own fill so the backdrop reads through
 *  it; absent, the capsule keeps its solid one. */
function Backdrop({ amount = 16 }: Readonly<{ amount?: number }>) {
  useNavPill('Backdrop');
  // The clip belongs to the backdrop, which is the only thing that has to stop
  // at the capsule's corner. On the capsule it also cropped the rings of the
  // items inside it.
  return (
    <Frost amount={amount}>
      <Box absolute top={0} right={0} bottom={0} left={0} radius="pill" />
    </Frost>
  );
}

interface NavPillRootProps {
  /** Names the tab strip: what the tabs are tabs OF. */
  label?: string;
  size?: NavPillSize;
  /** Which items show their label. Container policy, not an item's: it has to
   *  be the same answer for every item or the capsule's geometry jumps as the
   *  lens travels. Defaults to the size's own. */
  labels?: NavPillLabels;
  slide?: boolean;
  /** Called with the label under the finger at each crossing, null when the slide ends. */
  onPreview?: (label: string | null) => void;
  /** A `<NavPill.Backdrop>` must be a DIRECT child to sit behind the items;
   *  every other child is an item of the capsule. */
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

interface Sorted {
  backdrop: ReactNode[];
  items: ReactNode[];
}

function sort(children: ReactNode): Sorted {
  const at: Sorted = { backdrop: [], items: [] };
  for (const child of Children.toArray(children)) {
    if (isValidElement(child) && child.type === Backdrop) at.backdrop.push(child);
    else at.items.push(child);
  }
  return at;
}

function Root({
  label,
  size = 'tv',
  labels,
  slide = true,
  onPreview,
  children,
  style,
}: Readonly<NavPillRootProps>) {
  const labelPolicy = labels ?? (size === 'tv' ? 'all' : 'active');
  const at = sort(children);
  const [lens, setLens] = useState<{ id: string; rect: LensRect } | null>(null);
  const claim = (id: string, rect: LensRect) => {
    setLens((prev) =>
      prev?.id === id && prev.rect.x === rect.x && prev.rect.width === rect.width
        ? prev
        : { id, rect },
    );
  };
  const release = (id: string) => {
    setLens((prev) => (prev?.id === id ? null : prev));
  };

  const targets = useRef(new Map<string, SlideTarget>());
  // Plain arrows, not effect events: these go into the context, and
  // `useEffectEvent` returns a new closure per render, which re-enrolled every
  // item on every one.
  const enrol = (id: string, target: SlideTarget) => {
    targets.current.set(id, target);
  };
  const withdraw = (id: string) => {
    targets.current.delete(id);
  };
  // The rect is read once, as the preview lands: item geometry cannot move
  // under a finger mid-slide.
  const [hover, setHover] = useState<{ id: string; rect: LensRect | null } | null>(null);
  // The finger's own copy of the preview owner: a slide crosses items faster
  // than the state behind it commits.
  const hoverRef = useRef<string | null>(null);
  const preview = useEffectEvent((id: string | null, quiet = false) => {
    hoverRef.current = id;
    setHover(id === null ? null : { id, rect: targets.current.get(id)?.rect() ?? null });
    if (quiet) return;
    onPreview?.(id === null ? null : (targets.current.get(id)?.label ?? null));
  });
  const capsule = useRef<View>(null);
  const originX = useRef<number | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );

  const grab = useEffectEvent(() => {
    if (settle.current) clearTimeout(settle.current);
    originX.current = null;
    preview(lens?.id ?? null, true);
    const node = capsule.current as
      | (View & { getBoundingClientRect?: () => { left: number } })
      | null;
    if (node?.getBoundingClientRect) {
      const scrollX = (globalThis as { scrollX?: number }).scrollX ?? 0;
      originX.current = node.getBoundingClientRect().left + scrollX;
    } else {
      node?.measureInWindow((x) => {
        originX.current = x;
      });
    }
  });

  const drag = useEffectEvent((moveX: number) => {
    if (originX.current === null) return;
    const x = moveX - originX.current;
    let hit: string | null = null;
    let gap = Number.POSITIVE_INFINITY;
    for (const [id, target] of targets.current) {
      const rect = target.rect();
      if (!rect) continue;
      const away = Math.abs(x - (rect.x + rect.width / 2));
      if (away < gap) {
        gap = away;
        hit = id;
      }
    }
    if (hit && hit !== hoverRef.current) preview(hit);
  });

  const drop = useEffectEvent(() => {
    const rested = hoverRef.current;
    if (rested === null || rested === lens?.id) {
      preview(null);
      return;
    }
    targets.current.get(rested)?.select();
    // The preview holds while the host navigates so the lens never dips back
    // toward the old owner; the timer is the safety net for a host that
    // declines the switch. Effects flush before timers, so a claim that was
    // coming has already landed by the time this fires.
    settle.current = setTimeout(() => preview(null), 64);
  });

  // Built once: the handlers are effect events, so the one responder always
  // sees the current items without ever being recreated.
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        Math.abs(gesture.dx) > SLIDE_SLOP && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderGrant: () => grab(),
      onPanResponderMove: (_event, gesture) => drag(gesture.moveX),
      // Once a slide owns the touch, no ancestor scroll view takes it back.
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: () => drop(),
      onPanResponderTerminate: () => preview(null),
    }),
  );

  // Left to the React Compiler, which memoises this on the inputs it actually
  // reads.
  const context = {
    size,
    labels: labelPolicy,
    claim,
    release,
    enrol,
    withdraw,
    hover: hover?.id ?? null,
  };

  return (
    <NavPillContext.Provider value={context}>
      <Box
        ref={capsule}
        {...(slide && !Platform.isTV ? pan.panHandlers : null)}
        accessibilityRole="tablist"
        accessibilityLabel={label}
        row
        align="center"
        gap={size === 'sm' ? 2 : 4}
        p={PAD}
        radius="pill"
        border="borderStrong"
        bg={at.backdrop.length > 0 ? BACKDROP_FILL : PILL_FILL}
        style={[HAND, style]}
      >
        {at.backdrop}
        <Lens rect={hover?.rect ?? lens?.rect ?? null} chase={hover !== null} />
        {at.items}
      </Box>
    </NavPillContext.Provider>
  );
}

/**
 * The floating section switcher.
 *
 * ```tsx
 * <NavPill.Root size="tv">
 *   <NavPill.Item icon="home" label="Accueil" active onPress={goHome} />
 *   <NavPill.Item icon="search" label="Rechercher" onPress={goSearch} />
 * </NavPill.Root>
 *
 * <NavPill.Root size="sm" labels="none">
 *   <NavPill.Backdrop>
 *     <BlurView intensity={60} style={StyleSheet.absoluteFill} />
 *   </NavPill.Backdrop>
 *   <NavPill.Item icon="home" label="Accueil" active onPress={goHome} />
 * </NavPill.Root>
 * ```
 */
const NavPill = { Root, Item, Backdrop };

export type { NavPillIcon, NavPillItemProps } from './nav-pill-item';
export type { NavPillLabels, NavPillRootProps, NavPillSize };
export { NavPill };
