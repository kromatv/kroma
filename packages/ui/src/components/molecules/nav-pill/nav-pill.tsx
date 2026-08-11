// The floating section switcher: a capsule of icon + label items whose amber
// lens travels to the current section. Shared by the TV top nav and the phone
// tab bar; on glass it is also a slider that previews under the finger.

import {
  type ComponentRef,
  createContext,
  type ReactNode,
  type Ref,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  PanResponder,
  Platform,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';
import { Icon, type IconName, type IconProps } from '#ui/components/atoms/icon';
import { Txt } from '#ui/components/atoms/text';
import { RING_ROOM, type StyleDecl, styles, svFor } from '#ui/core';
import { ease } from '#ui/lib/ease';

const WEB = Platform.OS === 'web';

// The capsule's padding IS the room a focused item's ring needs, plus a hairline
// of capsule left showing outside it: an item sits this far in from the edge, so
// its ring lands INSIDE the capsule rather than being shaved off by the rounded
// clip the frost needs, or sitting exactly on the capsule's own edge, where two
// concentric lines a couple of pixels apart read as a drawing mistake.
const PAD = RING_ROOM;

const TRAVEL_MS = 260;
const CHASE_MS = 160;
// Inside the slop a touch is a tap and belongs to the item's own pressable.
const SLIDE_SLOP = 8;
const EASE_CSS = ease.spring.css;
const EASE_NATIVE = ease.spring.native;

type NavPillSize = 'sm' | 'tv';

/** `auto` is the size's own policy: every label at `tv`, the active item's at `sm`. */
type NavPillLabels = 'auto' | 'all' | 'active' | 'none';

// The item's WHOLE box, measured: `onLayout` reports the content box while an
// absolute child is placed against the padding box, so a derived height misses.
interface LensRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SlideTarget {
  label: string;
  rect: () => LensRect | null;
  select: () => void;
}

interface PillContext {
  size: NavPillSize;
  labels: Exclude<NavPillLabels, 'auto'>;
  claim: (id: string, rect: LensRect) => void;
  release: (id: string) => void;
  enrol: (id: string, target: SlideTarget) => void;
  withdraw: (id: string) => void;
  hover: string | null;
}

interface NavPillProps {
  size?: NavPillSize;
  labels?: NavPillLabels;
  slide?: boolean;
  /** Called with the label under the finger at each crossing, null when the slide ends. */
  onPreview?: (label: string | null) => void;
  backdrop?: ReactNode;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

const Context = createContext<PillContext>({
  size: 'tv',
  labels: 'all',
  claim: () => {},
  release: () => {},
  enrol: () => {},
  withdraw: () => {},
  hover: null,
});

function NavPill({
  size = 'tv',
  labels = 'auto',
  slide = true,
  onPreview,
  backdrop,
  style,
  children,
}: Readonly<NavPillProps>) {
  const auto = size === 'tv' ? 'all' : 'active';
  const labelPolicy = labels === 'auto' ? auto : labels;
  const [lens, setLens] = useState<{ id: string; rect: LensRect } | null>(null);
  const claim = useCallback((id: string, rect: LensRect) => {
    setLens((prev) =>
      prev?.id === id && prev.rect.x === rect.x && prev.rect.width === rect.width
        ? prev
        : { id, rect },
    );
  }, []);
  const release = useCallback((id: string) => {
    setLens((prev) => (prev?.id === id ? null : prev));
  }, []);

  const targets = useRef(new Map<string, SlideTarget>()).current;
  const enrol = useCallback(
    (id: string, target: SlideTarget) => {
      targets.set(id, target);
    },
    [targets],
  );
  const withdraw = useCallback(
    (id: string) => {
      targets.delete(id);
    },
    [targets],
  );
  const [hover, setHover] = useState<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;
  const preview = useCallback(
    (id: string | null, quiet = false) => {
      hoverRef.current = id;
      setHover(id);
      if (quiet) return;
      onPreviewRef.current?.(id === null ? null : (targets.get(id)?.label ?? null));
    },
    [targets],
  );
  const capsule = useRef<View>(null);
  const originX = useRef<number | null>(null);
  const lensId = useRef<string | null>(null);
  lensId.current = lens?.id ?? null;
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        Math.abs(gesture.dx) > SLIDE_SLOP && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderGrant: () => {
        if (settle.current) clearTimeout(settle.current);
        originX.current = null;
        preview(lensId.current, true);
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
      },
      onPanResponderMove: (_event, gesture) => {
        if (originX.current === null) return;
        const x = gesture.moveX - originX.current;
        let hit: string | null = null;
        let gap = Number.POSITIVE_INFINITY;
        for (const [id, target] of targets) {
          const rect = target.rect();
          if (!rect) continue;
          const away = Math.abs(x - (rect.x + rect.width / 2));
          if (away < gap) {
            gap = away;
            hit = id;
          }
        }
        if (hit && hit !== hoverRef.current) preview(hit);
      },
      // Once a slide owns the touch, no ancestor scroll view takes it back.
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: () => {
        const rested = hoverRef.current;
        if (rested === null || rested === lensId.current) {
          preview(null);
          return;
        }
        targets.get(rested)?.select();
        // The preview holds while the host navigates so the lens never dips back
        // toward the old owner; the timer is the safety net for a host that
        // declines the switch. Effects flush before timers, so a claim that was
        // coming has already landed by the time this fires.
        settle.current = setTimeout(() => preview(null), 64);
      },
      onPanResponderTerminate: () => preview(null),
    }),
  ).current;

  const previewRect = hover === null ? null : (targets.get(hover)?.rect() ?? null);

  // A fresh context object re-renders every item on every pointer move of a slide.
  const context = useMemo(
    () => ({ size, labels: labelPolicy, claim, release, enrol, withdraw, hover }),
    [size, labelPolicy, claim, release, enrol, withdraw, hover],
  );

  return (
    <Context.Provider value={context}>
      <Box
        ref={capsule}
        {...(slide && !Platform.isTV ? pan.panHandlers : null)}
        accessibilityRole="tablist"
        row
        align="center"
        gap={size === 'sm' ? 2 : 4}
        p={PAD}
        radius="pill"
        border="borderStrong"
        bg={backdrop ? BACKDROP_FILL : PILL_FILL}
        style={style}
      >
        {/* The clip belongs to the frost, which is the only thing that has to
            stop at the capsule's corner. On the capsule it also cropped the
            rings of the items inside it. */}
        {backdrop ? (
          <Box absolute top={0} right={0} bottom={0} left={0} radius="pill" overflow="hidden">
            {backdrop}
          </Box>
        ) : null}
        <Lens rect={previewRect ?? lens?.rect ?? null} chase={hover !== null} />
        {children}
      </Box>
    </Context.Provider>
  );
}

function Lens({ rect, chase }: Readonly<{ rect: LensRect | null; chase: boolean }>) {
  if (WEB) return <WebLens rect={rect} chase={chase} />;
  return <NativeLens rect={rect} chase={chase} />;
}

function WebLens({ rect, chase }: Readonly<{ rect: LensRect | null; chase: boolean }>) {
  // The first box is taken without a transition: a lens animating in from
  // nowhere on mount would be an entrance nobody staged.
  const placed = useRef(false);
  const had = placed.current;
  if (rect) placed.current = true;
  const last = useRef<LensRect | null>(null);
  if (rect) last.current = rect;
  const box = rect ?? last.current;
  if (!box) return null;
  return (
    <Box
      absolute
      radius="pill"
      bg="accentSoft"
      style={
        {
          // The travel rides a transform, not `left`. Both land the pill in the
          // same place, but `left` is laid out and painted on every frame of the
          // slide while a transform is handed to the compositor - and on a
          // television that is the difference between a slide and a jump.
          //
          // The WIDTH is still a width. `scaleX` would put it on the compositor
          // too, and would stretch the pill's corner radius into ellipses for
          // the length of every move; the box is absolutely positioned, so
          // laying it out disturbs nothing around it.
          left: 0,
          top: box.y,
          width: box.width,
          height: box.height,
          transform: `translateX(${box.x}px)`,
          opacity: rect ? 1 : 0,
          transitionProperty: had ? 'transform, width, opacity' : 'opacity',
          transitionDuration: `${chase ? CHASE_MS : TRAVEL_MS}ms`,
          transitionTimingFunction: EASE_CSS,
          // Asked for up front, so the first frame of a slide is not also the
          // frame that promotes the layer.
          willChange: 'transform',
        } as ViewStyle
      }
    />
  );
}

function NativeLens({ rect, chase }: Readonly<{ rect: LensRect | null; chase: boolean }>) {
  const left = useRef(new Animated.Value(0)).current;
  const width = useRef(new Animated.Value(0)).current;
  const shown = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  const last = useRef<LensRect | null>(null);
  if (rect) last.current = rect;

  useEffect(() => {
    if (rect && !placed.current) {
      placed.current = true;
      left.setValue(rect.x);
      width.setValue(rect.width);
      shown.setValue(1);
      return;
    }
    const eased = {
      duration: chase ? CHASE_MS : TRAVEL_MS,
      easing: EASE_NATIVE,
      useNativeDriver: false,
    } as const;
    if (rect) {
      Animated.parallel([
        Animated.timing(left, { toValue: rect.x, ...eased }),
        Animated.timing(width, { toValue: rect.width, ...eased }),
        Animated.timing(shown, { toValue: 1, ...eased }),
      ]).start();
      return;
    }
    Animated.timing(shown, { toValue: 0, ...eased }).start();
  }, [rect, chase, left, width, shown]);

  const box = rect ?? last.current;
  if (!box) return null;
  // Only x and width travel: every item shares the row's height and baseline.
  return (
    <Animated.View
      style={[s.lens, { left, width, opacity: shown, top: box.y, height: box.height }]}
    />
  );
}

/** A kit glyph by name, or a host's own component handed the item's current ink. */
type NavPillIcon = IconName | ((ink: string) => ReactNode);

// `color` is required rather than picked straight off IconProps: an item's ink
// is also handed to a host's own glyph component, which takes a string.
const navPillItemVariants = svFor<{
  root: StyleDecl;
  label: StyleDecl;
  icon: { color: string } & Pick<IconProps, 'size' | 'stroke'>;
}>()({
  slots: {
    root: { row: true, align: 'center', radius: 'pill' },
    label: { fontWeight: '700', letterSpacing: 0.2, color: 'textMuted' },
    icon: { color: 'glyph', stroke: 1.9 },
  },
  variants: {
    size: {
      tv: { root: { gap: 9, px: 18, py: 11 }, label: { fontSize: 18 }, icon: { size: 26 } },
      sm: {
        root: { gap: 6, px: 12, py: 10 },
        // Capped: a long locale label ("Rechercher") otherwise swallows the row.
        label: { fontSize: 12, maxW: 92, shrink: 1 },
        icon: { size: 22 },
      },
    },
    /** Under the lens: the current section, or the one a slide is previewing.
     *  It stays amber while focused, so only an unlit item brightens. */
    lit: {
      true: { label: { color: 'accentText' }, icon: { color: 'accentText' } },
      false: {
        label: { _focus: { color: 'text' } },
        icon: { _focus: { color: 'text' } },
      },
    },
    /** The active item already wears the lens, so it takes no focus wash on top. */
    active: { true: {}, false: { root: { _focus: { bg: 'tint/10' } } } },
  },
  defaults: { size: 'tv', lit: false, active: false },
});

interface NavPillItemProps
  extends Omit<FocusableProps, 'children' | 'onPress' | 'label' | 'style'> {
  icon: NavPillIcon;
  label: string;
  /** The current section. At most one item should say so. */
  active?: boolean;
  onPress: () => void;
  ref?: Ref<ComponentRef<typeof View>>;
}

function NavPillItem({
  icon,
  label,
  active = false,
  onPress,
  ref,
  ...focus
}: Readonly<NavPillItemProps>) {
  const { size, labels, claim, release, enrol, withdraw, hover } = useContext(Context);
  const id = useId();
  const rect = useRef<LensRect | null>(null);
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { x, y, width, height } = event.nativeEvent.layout;
      rect.current = { x, y, width, height };
      if (active) claim(id, rect.current);
    },
    [active, claim, id],
  );
  useEffect(() => {
    if (active && rect.current) claim(id, rect.current);
    if (!active) release(id);
  }, [active, claim, release, id]);

  // Never enrolled while disabled: an unenrolled item is invisible to the
  // hit-test, so a slide cannot select it. `select` reads onPress through a ref
  // so the slide never fires a stale closure.
  const select = useRef(onPress);
  select.current = onPress;
  useEffect(() => {
    if (focus.disabled) return;
    enrol(id, { label, rect: () => rect.current, select: () => select.current() });
    return () => withdraw(id);
  }, [enrol, withdraw, id, label, focus.disabled]);

  // Only the ink follows the finger; the label stays with `active`, so the
  // geometry under the finger is stable by construction.
  const lit = hover === null ? active : hover === id;

  return (
    <Box onLayout={onLayout}>
      <Focusable
        {...focus}
        ref={ref}
        onPress={onPress}
        label={label}
        role="tab"
        selected={active}
        focusScale={1.04}
        sv={navPillItemVariants}
        vars={{ size, lit, active }}
      >
        {(state) => (
          <>
            {typeof icon === 'string' ? (
              <Icon name={icon} {...state.slots.icon} />
            ) : (
              icon(state.slots.icon.color)
            )}
            {labels === 'all' || (labels === 'active' && active) ? (
              <Txt style={state.slots.label} lines={1}>
                {label}
              </Txt>
            ) : null}
          </>
        )}
      </Focusable>
    </Box>
  );
}

const PILL_FILL = 'surface1/78';
const BACKDROP_FILL = 'surface1/55';

const s = styles({
  lens: { absolute: true, radius: 'pill', bg: 'accentSoft' },
});

export type { NavPillIcon, NavPillItemProps, NavPillLabels, NavPillProps, NavPillSize };
export { NavPill, NavPillItem };
