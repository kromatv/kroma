import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { type StyleScope, sharedStyle } from '#ui/core';
import type { FrostBackdropProps } from '#ui/components/atoms/frost';
import { backdropBlur } from './css';
import { BARE, type FrostCoat, type FrostReach } from './frost-coat-types';
import { FrostMark } from './gl-frost/mark';

const coats = new Map<number, FrostCoat>();

/** The frost layer's mark where the surface sits on one; else nothing where the
 *  kit allows only a layer, else a CSS backdrop blur, one shared coat per strength. */
export function frostCoat(
  _surface: StyleProp<ViewStyle>,
  amount: number,
  _tint: string | undefined,
  _backdrop: ComponentType<FrostBackdropProps> | null,
  scope: StyleScope,
  reach: FrostReach,
): FrostCoat {
  if (reach.layer) return { style: null, layer: <FrostMark layer={reach.layer} /> };
  if (reach.layerOnly) return BARE;
  const cached = coats.get(amount);
  if (cached) return cached;
  const coat: FrostCoat = {
    style: sharedStyle(`frost:${amount}`, backdropBlur(amount) as never, scope) as ViewStyle,
    layer: null,
  };
  coats.set(amount, coat);
  return coat;
}
