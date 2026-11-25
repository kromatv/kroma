import { useState } from 'react';

/** What {@link useFocusWithin} hands back: `focused` for the shell to paint,
 *  the two handlers for the control that takes the focus. */
export interface FocusWithin {
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
}

/** Whether a control holds the focus, for a shell that lights up around it:
 *  spread `onFocus` and `onBlur` on the control and read `focused` where the
 *  shell is drawn. Each handler flips the state, then calls the caller's own. */
export function useFocusWithin(onFocus?: () => void, onBlur?: () => void): FocusWithin {
  const [focused, setFocused] = useState(false);
  return {
    focused,
    onFocus: () => {
      setFocused(true);
      onFocus?.();
    },
    onBlur: () => {
      setFocused(false);
      onBlur?.();
    },
  };
}
