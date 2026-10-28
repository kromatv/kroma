import { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';

/** Whether tvOS's own focus follows the app's here: the control the app focuses is the view tvOS focuses. */
export const NATIVE_FOCUS = Platform.isTV === true && Platform.OS === 'ios';

interface NativeFocusHost {
  hold: () => () => void;
}

const NativeFocusContext = createContext<NativeFocusHost | null>(null);

/** Provided by <FocusRoot> to the controls under it. */
export const NativeFocusProvider = NativeFocusContext.Provider;

/** For <FocusRoot>: whether one of its controls holds tvOS's focus, which is when its key host must stop being a place tvOS could move to. */
export function useNativeFocusHost(): { held: boolean; host: NativeFocusHost } {
  const [holders, setHolders] = useState(0);
  const [host] = useState<NativeFocusHost>(() => ({
    hold: () => {
      setHolders((n) => n + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        setHolders((n) => n - 1);
      };
    },
  }));
  return { held: holders > 0, host };
}

/** Whether tvOS should focus this control now, held against the focus root's key host while it does. */
export function useNativeFocus(focused: boolean): boolean {
  const host = useContext(NativeFocusContext);
  const on = NATIVE_FOCUS && focused && host !== null;
  useEffect(() => (on && host ? host.hold() : undefined), [on, host]);
  return on;
}
