import type { ComponentType } from 'react';
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import {
  activeTheme,
  onPaper,
  resolveStyles,
  type StyleScope,
  sharedStyle,
  styles,
} from '#ui/core';
import type { FrostBackdropProps } from '#ui/components/atoms/frost';
import { BARE, type FrostCoat, type FrostReach } from './frost-coat-types';

const sDefinition = styles({
  fill: { fill: true, pointerEvents: 'none', z: -1 },
  clip: { overflow: 'hidden' },
});

/** A registered platform blur drawn as the surface's first layer, clipped to its corner. */
export function frostCoat(
  surface: StyleProp<ViewStyle>,
  amount: number,
  tint: string | undefined,
  Backdrop: ComponentType<FrostBackdropProps> | null,
  scope: StyleScope,
  reach: FrostReach,
): FrostCoat {
  if (!Backdrop || reach.layerOnly) return BARE;
  const corner = StyleSheet.flatten(surface)?.borderRadius;
  const s = resolveStyles(sDefinition, scope);
  return {
    style: null,
    layer: (
      <Backdrop
        intensity={Math.min(100, amount * 4)}
        tint={tint ?? (onPaper(activeTheme(scope.theme)) ? 'light' : 'dark')}
        style={[
          s.fill,
          s.clip,
          typeof corner === 'number'
            ? sharedStyle(`frost:corner:${corner}`, { radius: corner }, scope)
            : null,
        ]}
      />
    ),
  };
}
