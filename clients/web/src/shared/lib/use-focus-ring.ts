import { type RingToken, useFocusVisible, useTheme } from '@kroma/ui/kit';
import { type CSSProperties, useMemo, useState } from 'react';

/**
 * The kit's focus ring for an element that cannot be a `<Focusable>`. Spread
 * `bind` on the element and give it `style`, which is `rest` until the keyboard
 * puts focus on it.
 */
export function useFocusRing(rest: CSSProperties, token: RingToken = 'focus') {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  // Asked of the kit rather than of `focused`: a ring answers the keyboard, and
  // an anchored menu keeps DOM focus on the trigger it opened from, so raw focus
  // would leave a pointer-only interaction wearing one. Every direct consumer of
  // a ring token has to ask here (see @kroma/ui lib/focus-visible).
  const visible = useFocusVisible(focused);
  const lit = useMemo(() => ({ ...rest, ...theme.ring[token] }), [rest, theme, token]);
  return {
    style: visible ? lit : rest,
    bind: {
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
    },
  };
}
