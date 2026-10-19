import type { ViewStyle } from 'react-native';
import { sharedStyle } from '#ui/core';
import { backdropBlur } from './css';
import { FrostSample } from './frost-sample';
import { BARE, type FrostCoat, type FrostInput } from './frost-types';

const cssCoats = new Map<number, FrostCoat>();

/** The coat a glass surface wears in a browser: the source artwork sampled
 *  into the surface where the kit samples, else a CSS backdrop blur. */
export function frostCoat({ options, sampled, source, scope }: FrostInput): FrostCoat {
  const { on = true, amount = 12 } = options;
  if (!on) return BARE;
  if (sampled) {
    if (!source) return BARE;
    return { style: null, layer: <FrostSample source={source} amount={amount} /> };
  }
  const cached = cssCoats.get(amount);
  if (cached) return cached;
  const coat: FrostCoat = {
    style: sharedStyle(`frost:${amount}`, backdropBlur(amount) as never, scope) as ViewStyle,
    layer: null,
  };
  cssCoats.set(amount, coat);
  return coat;
}
