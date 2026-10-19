import { Children, cloneElement, type ReactElement, type ReactNode } from 'react';
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import {
  activeTheme,
  type CornerValue,
  radiusValue,
  type StyleScope,
  useStyleScope,
} from '#ui/core';
import { useKitSettings } from '#ui/lib/kit-settings';
import { frostCoat } from '#ui/lib/frost-coat';
import { BARE, type FrostCoat } from '#ui/lib/frost-coat-types';
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

const EMPTY: ViewStyle = {};

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
  const { on = true, amount = 12, tint } = options;
  return frostEnabled && on ? frostCoat(surface, amount, tint, frost, scope) : BARE;
}

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
