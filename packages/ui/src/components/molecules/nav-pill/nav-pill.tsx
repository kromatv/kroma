// <NavPill>: the floating section switcher, as ONE component.
//
// A capsule of icon + label items where the current section sits in its own
// amber lens. The Apple TV's top nav and the iPhone's bottom tab bar are this
// same design at two distances - and until this file they were two
// implementations (packages/tv NavPill, clients/mobile PillTabBar) drifting a
// padding at a time. The kit owns the capsule; the apps own what pressing an
// item MEANS.
//
// The API is compound, shadcn-fashion: the root carries the shared decisions
// (metrics, label policy, the fill) down by context, and each item is its own
// child rather than a row in a config array - so a host can wrap one item in a
// badge, ref the last one for focus wiring, or put something that is not an
// item in the row, none of which an `items` prop can say.
//
//   <NavPill size="tv">
//     <NavPillItem icon="home" label="Home" active onPress={goHome} />
//     <NavPillItem icon="search" label="Search" onPress={goSearch} />
//   </NavPill>
//
// The two sizes are the two distances. `tv` keeps every label - a viewer three
// metres away is reading, not tapping, and constant labels mean the capsule
// never changes width under the travelling ring. `sm` (a thumb on glass) shows
// the label only on the active item, which is how the bar fits a phone.
//
// The LENS TRAVELS. The amber is one view owned by the root, not a background
// each item paints: items report where they sit, and when the section changes
// the lens springs from the old item's box to the new one's - the morph a
// segmented control taught everyone to expect, and the reason the root has to
// know the geometry at all. On the kit's usual split: a CSS transition where
// react-native-web would otherwise run a rAF loop, `Animated` elsewhere (the
// JS driver, deliberately - left and width are layout properties the native
// driver cannot carry, and a 260ms one-shot is what the JS driver is for).
//
// The fill is a solid translucency, not a blur: the kit stays free of platform
// blur dependencies. A platform that composites blur on the GPU fills the
// `backdrop` slot - the iPhone with its own <BlurView>, the TV chrome with the
// kit's <Frost> (which is CSS backdrop-filter on the browsers, ignored for
// free by the legacy panels, and the shell's registered blur view on native) -
// and the fill thins to let it read.
//
// On glass the capsule is also a SLIDER. A tap switches sections as it always
// has, but a finger that lands and then travels is captured by the capsule
// itself: the lens - and the amber ink with it - chases the finger from item to
// item as a PREVIEW, and lifting commits whatever it rests on, the drag the
// native tab bar taught thumbs to expect. Committing on the RELEASE rather than
// on every crossing is what keeps the gesture calm: `active` never flips while
// the finger is down, so no label swaps and no rect reflows happen under a
// thumb that is still moving - the host navigates once, when it lets go. A
// television never sees any of this: the remote has no finger.
//
// The root's options bend these defaults without forking the design: `labels`
// overrides the size's label policy (`none` is the icon-only bar), `slide`
// turns the gesture off for a tap-only host, and `onPreview` reports each
// crossing as it happens - the hook a host hangs its selection haptics on,
// since the kit itself stays free of platform haptics dependencies.

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
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Txt } from '#ui/components/atoms/text';
import { ease } from '#ui/lib/ease';
import { colors } from '#ui/lib/tokens';

const WEB = Platform.OS === 'web';

/** How the lens travels: the kit's spring curve, at a pace that reads as the
 * lens ARRIVING somewhere rather than teleporting or wallowing. */
const TRAVEL_MS = 260;
/** How the lens travels UNDER A FINGER: tighter, so it reads as chasing the
 * finger magnetically rather than commuting behind it. */
const CHASE_MS = 160;
/** Horizontal travel before the capsule takes the touch from the item under it.
 * Inside the slop a touch is a tap and belongs to the item's own pressable. */
const SLIDE_SLOP = 8;
const EASE_CSS = ease.spring.css;
const EASE_NATIVE = ease.spring.native;

type NavPillSize = 'sm' | 'tv';

/** Which items carry their label. `auto` is the size's own policy: every label
 * at `tv`, the active item's at `sm`. */
type NavPillLabels = 'auto' | 'all' | 'active' | 'none';

/** Where an item sits inside the capsule, in the capsule's own coordinates. */
interface LensRect {
  x: number;
  width: number;
}

/** What the root can do with an item during a slide: read where it sits (live,
 * through a getter, so a re-layout never goes stale), select it, and tell the
 * host's `onPreview` what the finger is over. */
interface SlideTarget {
  label: string;
  rect: () => LensRect | null;
  select: () => void;
}

interface PillContext {
  size: NavPillSize;
  /** The RESOLVED label policy: the root has already spent `auto`. */
  labels: Exclude<NavPillLabels, 'auto'>;
  /** The active item saying where it is. `id` is the caller's own, so a report
   *  from an item that has since gone inactive cannot clobber the owner's. */
  claim: (id: string, rect: LensRect) => void;
  /** An item that WAS the lens's owner saying it no longer is. */
  release: (id: string) => void;
  /** Every item enrols as a slide target, active or not: a finger can land
   *  anywhere and travel everywhere. */
  enrol: (id: string, target: SlideTarget) => void;
  withdraw: (id: string) => void;
  /** The item a slide is previewing. While a finger is down the amber ink
   *  follows this instead of `active`; null means no slide is in flight. */
  hover: string | null;
}

interface NavPillProps {
  /** `tv`: 10-foot metrics, every label. `sm`: thumb metrics, active label only. */
  size?: NavPillSize;
  /** Overrides the size's label policy: `none` is the icon-only bar
   *  (Instagram's), `all` labels everything, `active` labels the current
   *  section. `auto` (the default) lets the size decide. */
  labels?: NavPillLabels;
  /** The touch slide: press, travel, and the lens previews under the finger,
   *  committing the item it rests on at the release. On by default everywhere
   *  a finger exists; `false` keeps the capsule tap-only. */
  slide?: boolean;
  /** The slide's crossings as they happen: called with the label under the
   *  finger each time the preview moves to a new item, and with null when the
   *  slide ends. The hook a host hangs its selection haptics on. */
  onPreview?: (label: string | null) => void;
  /** A platform's own backdrop (the iPhone's BlurView), filled behind the
   *  items. Given one, the capsule's own fill thins so it can read. */
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

  // The slide. The capsule watches every touch and takes over only when one
  // TRAVELS - a tap never crosses the slop and lands on the item's own
  // pressable, exactly as before. Once captured, each move is hit-tested
  // against the enrolled items by nearest centre (so the 2-4px gaps have no
  // dead zones and a finger past either end clamps to the end item), and the
  // nearest item becomes the PREVIEW: the lens and the ink chase it, but the
  // host hears nothing until the finger lifts on it.
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
  /** The previewed item: state, because the items re-ink from it; mirrored in
   * a ref because the responder's callbacks are minted once. `quiet` keeps the
   * grant's seed - the section the finger started on - out of `onPreview`,
   * which reports crossings, not the landing. */
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
  /** The capsule's window x, so a move's pageX can be read in lens space.
   * Measured at grant; moves before the measure lands are simply skipped. */
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
        // In a browser the ref is a DOM node and the rect is synchronous;
        // everywhere else, measureInWindow answers within the frame.
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
      // The bar is the destination, not a passenger: once a slide owns the
      // touch, no ancestor scroll view takes it back.
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: () => {
        const rested = hoverRef.current;
        if (rested === null || rested === lensId.current) {
          preview(null);
          return;
        }
        targets.get(rested)?.select();
        // The preview HOLDS while the host navigates, so the lens never dips
        // back toward the old owner between this release and the new item's
        // claim. The timer is the safety net for a host that declines the
        // switch: effects flush before timers on the same thread, so by the
        // time it fires, a claim that was coming has landed and clearing the
        // preview changes nothing visible - and if no claim ever comes, the
        // lens springs home instead of squatting on an item that is not
        // active.
        settle.current = setTimeout(() => preview(null), 64);
      },
      // Terminated means the system took the touch; nothing was chosen.
      onPanResponderTerminate: () => preview(null),
    }),
  ).current;

  /** While a slide is in flight (or settling), the lens sits on the preview's
   * box rather than the owner's, read live so a re-layout mid-flight lands. */
  const previewRect = hover === null ? null : (targets.get(hover)?.rect() ?? null);

  // Memoised: a fresh object here re-renders every item in the pill on every
  // render of the pill, which during a slide is every pointer move.
  const context = useMemo(
    () => ({ size, labels: labelPolicy, claim, release, enrol, withdraw, hover }),
    [size, labelPolicy, claim, release, enrol, withdraw, hover],
  );

  return (
    <Context.Provider value={context}>
      <Box
        ref={capsule}
        // A television has no finger; leaving the responder off keeps the
        // remote's path exactly as it was. `slide={false}` is a host saying
        // the same about its own capsule.
        {...(slide && !Platform.isTV ? pan.panHandlers : null)}
        row
        align="center"
        // Tighter on a phone: six items and one open label have to share a
        // screen the capsule must never outgrow.
        gap={size === 'sm' ? 2 : 4}
        p={6}
        radius="pill"
        border="borderStrong"
        bg={backdrop ? BACKDROP_FILL : PILL_FILL}
        overflow="hidden"
        style={style}
      >
        {backdrop ? (
          <Box absolute top={0} right={0} bottom={0} left={0}>
            {backdrop}
          </Box>
        ) : null}
        <Lens rect={previewRect ?? lens?.rect ?? null} chase={hover !== null} />
        {children}
      </Box>
    </Context.Provider>
  );
}

/**
 * The travelling amber. One view for the whole capsule, sprung between the
 * boxes the items report. It SNAPS into its first place - a lens animating in
 * from nowhere on mount would be an entrance nobody staged - and fades away
 * when no item is active (a deep screen), keeping its last box so it can fade
 * back in place if the same section returns.
 */
function Lens({ rect, chase }: Readonly<{ rect: LensRect | null; chase: boolean }>) {
  // Vertical inset matches the capsule's own padding, so the lens is exactly
  // the box the item used to paint for itself.
  if (WEB) return <WebLens rect={rect} chase={chase} />;
  return <NativeLens rect={rect} chase={chase} />;
}

function WebLens({ rect, chase }: Readonly<{ rect: LensRect | null; chase: boolean }>) {
  // The first box is taken without a transition: the style below only carries
  // `transitionProperty` once a box has already been committed.
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
      top={6}
      bottom={6}
      radius="pill"
      bg={colors.accentSoft}
      style={
        {
          left: box.x,
          width: box.width,
          opacity: rect ? 1 : 0,
          transitionProperty: had ? 'left, width, opacity' : 'opacity',
          transitionDuration: `${chase ? CHASE_MS : TRAVEL_MS}ms`,
          transitionTimingFunction: EASE_CSS,
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
      // First placement: arrive, do not travel.
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

  if (!last.current && !rect) return null;
  return <Animated.View style={[styles.lens, { left, width, opacity: shown }]} />;
}

/** An item's picture: a kit glyph by name, or - for a host whose icons are its
 * own components (the iPhone's tab icons) - a function handed the item's
 * current ink, so its colour still travels with focus. */
type NavPillIcon = IconName | ((ink: string) => ReactNode);

interface NavPillItemProps
  extends Omit<FocusableProps, 'children' | 'onPress' | 'label' | 'style'> {
  icon: NavPillIcon;
  label: string;
  /** The current section. At most one item should say so. */
  active?: boolean;
  onPress: () => void;
  /** For a host's focus wiring: the TV names the last item as the avatar's
   *  left-hand neighbour. */
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
  const metrics = METRICS[size];
  const id = useId();
  /** Where this item sits, kept current by layout; CLAIMED only while active. */
  const rect = useRef<LensRect | null>(null);
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { x, width } = event.nativeEvent.layout;
      rect.current = { x, width };
      if (active) claim(id, rect.current);
    },
    [active, claim, id],
  );
  useEffect(() => {
    if (active && rect.current) claim(id, rect.current);
    if (!active) release(id);
  }, [active, claim, release, id]);

  // A slide target for the root's finger, active or not - though never while
  // disabled: an unenrolled item is invisible to the hit-test, so the lens
  // skips over it to a neighbour and a slide cannot select it. `select` reads
  // the live onPress through a ref so a host handing down a fresh closure each
  // render never leaves the slide firing a stale one.
  const select = useRef(onPress);
  select.current = onPress;
  useEffect(() => {
    if (focus.disabled) return;
    enrol(id, { label, rect: () => rect.current, select: () => select.current() });
    return () => withdraw(id);
  }, [enrol, withdraw, id, label, focus.disabled]);

  // While a slide previews, the amber follows the finger instead of `active`:
  // exactly one item reads as current at any moment, and because the preview
  // held on release IS the item about to become active, the handoff never
  // flickers. Only the ink moves - the label stays with `active`, so the
  // geometry under the finger is stable by construction.
  const lit = hover === null ? active : hover === id;

  return (
    <Box onLayout={onLayout}>
      <Focusable
        {...focus}
        ref={ref}
        onPress={onPress}
        label={label}
        focusScale={1.04}
        style={metrics.item}
        focusedStyle={active ? null : FOCUSED}
      >
        {({ focused }) => {
          const ink = inkOf(lit, focused);
          return (
            <>
              {typeof icon === 'string' ? (
                <Icon name={icon} size={metrics.icon} stroke={1.9} color={ink} />
              ) : (
                icon(ink)
              )}
              {/* The resolved policy: `all` holds the capsule's width under the
                  travelling lens (the tv default); `active` gives the row to
                  the icons and spends the width on the one label that orients
                  (the sm default); `none` is all icon. */}
              {labels === 'all' || (labels === 'active' && active) ? (
                <Txt style={metrics.label} color={ink} lines={1}>
                  {label}
                </Txt>
              ) : null}
            </>
          );
        }}
      </Focusable>
    </Box>
  );
}

/** The lit item - the current section, or the slide's preview while a finger
 * is down - is amber; an idle one recedes, and comes up to full ink under the
 * ring. Icon and label always take the same ink, so an item reads as one
 * object rather than a glyph next to a word. */
function inkOf(lit: boolean, focused: boolean): string {
  if (lit) return colors.accentBright;
  return focused ? colors.text : colors.textMuted;
}

const PILL_FILL = 'rgba(18, 18, 22, 0.78)';
/** Over a host backdrop the fill only has to tint, not to be the surface. */
const BACKDROP_FILL = 'rgba(18, 18, 22, 0.55)';

/** One geometry per size for every state: the box is the same whether the item
 * is idle, focused or current, so only colour and the lens move. */
const METRICS = {
  tv: {
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingHorizontal: 18,
      paddingVertical: 11,
      borderRadius: 999,
    },
    icon: 26,
    label: { fontSize: 18, fontWeight: '700', letterSpacing: 0.2 },
  },
  sm: {
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 999,
    },
    icon: 22,
    // CAPPED, because the label is whatever the locale makes it: five icon-only
    // items plus one open lens have to fit a phone, and "Rechercher" was the
    // lens swallowing the row. The cap truncates the rare too-long word; the
    // common ones fit whole.
    label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2, maxWidth: 92, flexShrink: 1 },
  },
} as const;

const FOCUSED = { backgroundColor: 'rgba(255, 255, 255, 0.10)' };

const styles = {
  lens: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
  },
} as const;

export type { NavPillIcon, NavPillItemProps, NavPillLabels, NavPillProps, NavPillSize };
export { NavPill, NavPillItem };
