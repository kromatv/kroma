// Mouse-wheel handling over a virtualised list. Native no-op: a television has
// no pointer, and the phone builds scroll with a finger. See `wheel-pan.web.ts`.

import type { RefObject } from 'react';
import type { ScrollView, View } from 'react-native';

type WheelHost = RefObject<View | ScrollView | null>;

/** No-op off the web. */
function useWheelTravel(
  _ref: WheelHost,
  _onTravel: (delta: number) => void,
  _enabled = true,
): void {
  // No pointer to listen to.
}

export type { WheelHost };
export { useWheelTravel };
