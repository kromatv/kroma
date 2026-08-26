import {
  Children,
  type ComponentType,
  cloneElement,
  type ReactElement,
  type ReactNode,
  useSyncExternalStore,
} from 'react';
import { Platform, type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import { type CornerValue, onPaper, radiusValue, styles } from '#ui/core';
import { backdropBlur } from '#ui/lib/css';
import { WEB } from '#ui/lib/platform';
import { mergeSlotProps } from '#ui/lib/slot';

/** What a registered platform blur must accept - expo-blur's <BlurView> as it
 * stands, so a shell registers the component itself, unconfigured. */
interface FrostBackdropProps {
  /** Platform blur strength, 0-100 (expo-blur's scale). */
  intensity?: number;
  /** Open string union: expo-blur's tint set is wider than the three the kit
   *  asks for, and the registered component must remain assignable. */
  tint?: 'light' | 'dark' | 'default' | (string & {});
  /** Android only. expo-blur draws NOTHING there unless it is told how: its
   *  `blurMethod` defaults to `'none'`, so a frost that works on Apple TV is
   *  invisible on Android until this is passed. Open union for the same reason
   *  as `tint`. */
  blurMethod?: 'none' | 'dimezisBlurView' | 'dimezisBlurViewSdk31Plus' | (string & {});
  style?: StyleProp<ViewStyle>;
}

// `dimezisBlurView` rather than the Sdk31Plus variant: that one needs API 31 and
// the oldest sets this ships to are Android 9. Undefined off Android, where the
// platform blurs on the GPU and the prop means nothing.
const ANDROID_BLUR = Platform.OS === 'android' ? 'dimezisBlurView' : undefined;

let PlatformFrost: ComponentType<FrostBackdropProps> | null = null;

/** Hand the kit the platform's blur view (the TV shell's expo-blur), once, at
 * module scope, before the first render. Generic over the component's own
 * props, since `ComponentType` is invariant in `P` and naming the props
 * directly would reject <BlurView> over tints the kit never passes. */
function registerFrost<P extends FrostBackdropProps>(component: ComponentType<P>): void {
  PlatformFrost = component as ComponentType<FrostBackdropProps>;
}

interface FrostOptions {
  /** False renders the surface untouched, so a caller that is only sometimes
   *  glass states the condition rather than branching around the coat.
   *  Defaults to true. */
  on?: boolean;
  /** Blur strength in CSS px; the platform intensity is derived from it. */
  amount?: number;
  /** Defaults to the ground the app is on. Pass it only for a surface that holds
   *  one ground whatever the app chose, the way the player's chrome stays dark.
   *  Native only: a browser coat has no tint of its own. */
  tint?: 'light' | 'dark' | 'default';
}

/** The two halves of a frost. Spread `style` onto the surface's own style list
 *  and render `layer` as its first child; exactly one of them is ever set. */
interface FrostCoat {
  style: ViewStyle | null;
  layer: ReactNode;
}

const BARE: FrostCoat = { style: null, layer: null };

// A rendering mode rather than a per-surface prop, and one every mounted
// surface has to hear: the coat is computed during render, so a bare module flag
// would only take effect on whatever happened to render next. The listener set
// is what makes it a switch instead of a startup constant.
let frostOn = true;
const listeners = new Set<() => void>();
const frostEnabled = (): boolean => frostOn;
const onFrostChange = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Turn every frost in the app off, or back on, wherever it is already on
 * screen: a television whose GPU composites the blur on the CPU pays for every
 * frosted control at once, and the plain fill underneath is what the design
 * falls back to anyway.
 */
function setFrostEnabled(on: boolean): void {
  if (on === frostOn) return;
  frostOn = on;
  for (const listener of listeners) listener();
}
const EMPTY: ViewStyle = {};

// One coat per strength, shared by identity: <Focusable> keys its style memo on
// the values it is handed, and a fresh object per render would re-run the
// box/face split on every frame of every frosted control on screen.
const webCoats = new Map<number, FrostCoat>();

/**
 * The frost a glass surface wears, for a control that places the layer itself.
 * `surface` is the surface's own resolved style: the native layer takes its
 * corner from that rather than being told one twice.
 *
 * A hook, because {@link setFrostEnabled} has to reach a surface that is already
 * drawn: call it at the top of the control, like any other.
 */
function useFrostCoat(surface: StyleProp<ViewStyle>, options: FrostOptions = {}): FrostCoat {
  useSyncExternalStore(onFrostChange, frostEnabled, frostEnabled);
  return coatOf(surface, options);
}

function coatOf(surface: StyleProp<ViewStyle>, options: FrostOptions): FrostCoat {
  const { on = true, amount = 12, tint } = options;
  if (!on || !frostOn) return BARE;
  if (WEB) {
    const cached = webCoats.get(amount);
    if (cached) return cached;
    const coat: FrostCoat = { style: backdropBlur(amount) as ViewStyle, layer: null };
    webCoats.set(amount, coat);
    return coat;
  }
  if (!PlatformFrost) return BARE;
  const corner = StyleSheet.flatten(surface)?.borderRadius;
  return {
    style: null,
    layer: (
      <PlatformFrost
        // expo-blur's 0-100 scale: about four steps to the CSS pixel.
        intensity={Math.min(100, amount * 4)}
        blurMethod={ANDROID_BLUR}
        tint={tint ?? (onPaper() ? 'light' : 'dark')}
        style={[s.fill, s.clip, typeof corner === 'number' ? { borderRadius: corner } : null]}
      />
    ),
  };
}

const s = styles({
  fill: {
    fill: true,
    // Never a touch target: the surface underneath owns the press.
    pointerEvents: 'none',
    // Below the surface's content: a positioned element on the web paints over
    // its static siblings regardless of document order.
    z: -1,
  },
  clip: { overflow: 'hidden' },
});

// The child declares its corner as a style or as <Box>'s `radius` shorthand,
// and the native layer clips itself to whichever it used.
function cornerOf(props: Record<string, unknown>): ViewStyle {
  const flat = StyleSheet.flatten(props.style as StyleProp<ViewStyle>);
  if (typeof flat?.borderRadius === 'number') return flat;
  if (props.radius == null) return EMPTY;
  return { borderRadius: radiusValue(props.radius as CornerValue) };
}

interface FrostProps extends FrostOptions {
  /** Exactly one element: the surface that wears the frost. */
  children: ReactElement;
}

/**
 * The frost a glass surface wears, as a wrapper that renders NO element of its
 * own: it puts the coat on its one child, the way `<Slot>` does (see
 * lib/slot.tsx).
 *
 * A control whose child is a render function cannot take a layer this way:
 * those call `useFrostCoat` and place `layer` themselves.
 */
function Frost({ children, ...options }: Readonly<FrostProps>) {
  const el = Children.only(children) as ReactElement<Record<string, unknown>>;
  const coat = useFrostCoat(cornerOf(el.props), options);
  if (!coat.style && !coat.layer) return el;
  const merged = mergeSlotProps(coat.style ? { style: coat.style } : {}, el.props);
  if (coat.layer) {
    const inner = el.props.children;
    if (typeof inner === 'function') {
      throw new TypeError(
        '<Frost> cannot layer a render-function child; call useFrostCoat() instead',
      );
    }
    merged.children = [
      cloneElement(coat.layer as ReactElement, { key: 'frost' }),
      ...Children.toArray(inner as ReactNode),
    ];
  }
  return cloneElement(el, merged);
}

export type { FrostBackdropProps, FrostCoat, FrostOptions, FrostProps };
export { Frost, registerFrost, setFrostEnabled, useFrostCoat };
