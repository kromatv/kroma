// How a container learns that something inside it took the focus.
//
// Not `SpatialNavigationNode`'s `onActive`: "active" in LRUD means "on the path to
// the focused node" and is monotone - walking right fires per tile, walking back
// left fires nothing - so a row wired to it scrolls one way and freezes the other.

import { createContext, type ReactNode, useContext, useMemo } from 'react';

type Report = () => void;

const FocusReportContext = createContext<Report | null>(null);

/** Called by `<Focusable>` when it takes the focus. */
function useFocusReport(): Report | null {
  return useContext(FocusReportContext);
}

/** Wrap one row item so its focus is reported without passing an index down. */
function FocusReporter({ onFocus, children }: Readonly<{ onFocus: Report; children: ReactNode }>) {
  // Stable per item, or every focus change re-renders every tile in the window.
  const value = useMemo(() => onFocus, [onFocus]);
  return <FocusReportContext.Provider value={value}>{children}</FocusReportContext.Provider>;
}

export { FocusReporter, useFocusReport };
