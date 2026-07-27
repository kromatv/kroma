// Mouse-wheel / trackpad panning over a row. Native no-op.
//
// A television has no pointer, and the phone builds pan a real ScrollView with a
// finger, so there is nothing to wire here. See `wheel-pan.web.ts`.

import type { RefObject } from 'react';
import type { View } from 'react-native';

/** No-op off the web. */
function useWheelPan(
  _ref: RefObject<View | null>,
  _onPan: (delta: number) => void,
  _enabled = true,
): void {
  // No pointer to listen to.
}

export { useWheelPan };
