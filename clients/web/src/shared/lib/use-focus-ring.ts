import { classes, type RingToken, sharedStyle, useFocusVisible } from '@kroma/ui/kit';
import { useState } from 'react';

/**
 * The kit's focus ring for an element that cannot be a `<Focusable>`. Spread
 * `bind` on the element and give it `className`, which is `rest`'s classes
 * until the keyboard puts focus on it.
 */
export function useFocusRing(rest: object, token: RingToken = 'focus') {
  const [focused, setFocused] = useState(false);
  // Asked of the kit rather than of `focused`: a ring answers the keyboard, and
  // an anchored menu keeps DOM focus on the trigger it opened from, so raw focus
  // would leave a pointer-only interaction wearing one. Every direct consumer of
  // a ring token has to ask here (see @kroma/ui lib/focus-visible).
  const visible = useFocusVisible(focused);
  return {
    className: classes(rest, visible ? sharedStyle(`ring:${token}`, { ring: token }) : null),
    bind: {
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
    },
  };
}
