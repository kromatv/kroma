import { createContext, useContext, useEffect } from 'react';

/** Counts the popups open on the settings screen, whose Back leaves them to close themselves. */
export const SettingsPopups = createContext<((delta: 1 | -1) => void) | null>(null);

/** Counts a popup as open on the settings screen while `open` holds. */
export function useSettingsPopup(open: boolean): void {
  const count = useContext(SettingsPopups);
  useEffect(() => {
    if (!open || !count) return;
    count(1);
    return () => count(-1);
  }, [open, count]);
}
