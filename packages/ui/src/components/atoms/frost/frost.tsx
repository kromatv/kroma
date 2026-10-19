import { Children, cloneElement, type ReactElement, type ReactNode } from 'react';
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import {
  activeTheme,
  type CornerValue,
  radiusValue,
  type StyleScope,
  useStyleScope,
} from '#ui/core';
import { frostCoat } from '#ui/lib/frost-coat';
import { useFrostSource } from '#ui/lib/frost-source';
import { BARE, type FrostCoat, type FrostOptions } from '#ui/lib/frost-types';
import { useKitSettings } from '#ui/lib/kit-settings';
import { mergeSlotProps } from '#ui/lib/slot';

const EMPTY: ViewStyle = {};

/**
 * The frost a glass surface wears, for a control that places the layer itself.
 * `surface` is the surface's own resolved style: the layer takes its corner
 * from that rather than being told one twice.
 *
 * A hook, so root configuration reaches a surface that is already
 * drawn: call it at the top of the control, like any other.
 */
function useFrostCoat(surface: StyleProp<ViewStyle>, options: FrostOptions = {}): FrostCoat {
  const scope = useStyleScope();
  const source = useFrostSource();
  const { frost, frostEnabled, frostSampled } = useKitSettings();
  if (!frostEnabled) return BARE;
  return frostCoat({ surface, options, platform: frost, sampled: frostSampled, source, scope });
}

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

export type { FrostBackdropProps } from '#ui/lib/frost-types';
export type { FrostCoat, FrostOptions, FrostProps };
export { Frost, useFrostCoat };
