import { Children, cloneElement, type ReactElement, type ReactNode } from 'react';
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import {
  activeTheme,
  type CornerValue,
  onPaper,
  radiusValue,
  resolveStyles,
  type StyleScope,
  sharedStyle,
  styles,
  useStyleScope,
} from '#ui/core';
import { backdropBlur } from '#ui/lib/css';
import { useKitSettings } from '#ui/lib/kit-settings';
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
  style?: StyleProp<ViewStyle>;
}

const cornerStyle = (corner: number, scope: StyleScope) =>
  sharedStyle(`frost:corner:${corner}`, { radius: corner }, scope);

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
 * A hook, so root configuration reaches a surface that is already
 * drawn: call it at the top of the control, like any other.
 */
function useFrostCoat(surface: StyleProp<ViewStyle>, options: FrostOptions = {}): FrostCoat {
  const scope = useStyleScope();

  const { frost, frostEnabled } = useKitSettings();
  return frostEnabled ? coatOf(surface, options, frost, scope) : BARE;
}

function coatOf(
  surface: StyleProp<ViewStyle>,
  options: FrostOptions,
  PlatformFrost: ReturnType<typeof useKitSettings>['frost'],
  scope: StyleScope,
): FrostCoat {
  const { on = true, amount = 12, tint } = options;
  if (!on) return BARE;
  if (WEB) {
    const cached = webCoats.get(amount);
    if (cached) return cached;
    const coat: FrostCoat = {
      style: sharedStyle(`frost:${amount}`, backdropBlur(amount) as never, scope) as ViewStyle,
      layer: null,
    };
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
        tint={tint ?? (onPaper(activeTheme(scope.theme)) ? 'light' : 'dark')}
        style={[
          resolveStyles(sDefinition, scope).fill,
          resolveStyles(sDefinition, scope).clip,
          typeof corner === 'number' ? cornerStyle(corner, scope) : null,
        ]}
      />
    ),
  };
}

const sDefinition = styles({
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
function cornerOf(props: Record<string, unknown>, scope: StyleScope): ViewStyle {
  const flat = StyleSheet.flatten(props.style as StyleProp<ViewStyle>);
  if (typeof flat?.borderRadius === 'number') return flat;
  if (props.radius == null) return EMPTY;
  return {
    borderRadius: radiusValue(props.radius as CornerValue, undefined, activeTheme(scope.theme)),
  };
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
  const scope = useStyleScope();

  const el = Children.only(children) as ReactElement<Record<string, unknown>>;
  const coat = useFrostCoat(cornerOf(el.props, scope), options);
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
export { Frost, useFrostCoat };
