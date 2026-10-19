import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { type StyleScope, sharedStyle } from '#ui/core';
import type { FrostBackdropProps } from '#ui/components/atoms/frost';
import { backdropBlur } from './css';
import type { FrostCoat } from './frost-coat-types';

const coats = new Map<number, FrostCoat>();

/** A CSS backdrop blur on the surface itself, one shared coat per strength. */
export function frostCoat(
  _surface: StyleProp<ViewStyle>,
  amount: number,
  _tint: string | undefined,
  _backdrop: ComponentType<FrostBackdropProps> | null,
  scope: StyleScope,
): FrostCoat {
  const cached = coats.get(amount);
  if (cached) return cached;
  const coat: FrostCoat = {
    style: sharedStyle(`frost:${amount}`, backdropBlur(amount) as never, scope) as ViewStyle,
    layer: null,
  };
  coats.set(amount, coat);
  return coat;
}
