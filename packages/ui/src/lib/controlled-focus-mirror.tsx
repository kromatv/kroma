import { createContext, type ReactNode, useCallback, useContext } from 'react';
import type { View } from 'react-native';
import { useFocusMirror } from './use-focus-mirror';

const Mirrors = createContext(false);

/** Hands the document's focus to whichever controlled `<Focusable>` below it is
 *  `focused`, for a surface that runs a focus of its own (the player's chrome). */
export function ControlledFocusMirror({ children }: Readonly<{ children: ReactNode }>) {
  return <Mirrors.Provider value={true}>{children}</Mirrors.Provider>;
}

/** A controlled control's host ref: `setBox`, and the document's focus while
 *  `focused` inside a {@link ControlledFocusMirror}. */
export function useControlledMirror(
  focused: boolean,
  setBox: (view: View | null) => void,
): (view: View | null) => void {
  const mirror = useFocusMirror(useContext(Mirrors) && focused);
  return useCallback(
    (view: View | null) => {
      mirror(view);
      setBox(view);
    },
    [mirror, setBox],
  );
}
