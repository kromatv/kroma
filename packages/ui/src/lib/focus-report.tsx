// How a container learns that something inside it took the focus.
//
// A virtualised row has to know which item is selected - that is what decides
// where the row sits - and the navigator does not offer a usable signal for it.
// `SpatialNavigationNode`'s `onActive` looks like the one, but "active" in LRUD
// means "on the path to the focused node" and it is MONOTONE here: walking right
// fires it for each tile in turn, walking back left fires nothing at all,
// because those nodes never went inactive. A row wired to it scrolls one way and
// freezes the other, which is exactly the bug this exists to kill.
//
// So the signal comes from the control that actually took the focus. Every
// focusable in the kit is a `<Focusable>`, and it reports through this context -
// one read per focusable, and nothing at all for the trees that provide no
// reporter.

import { createContext, type ReactNode, useContext, useMemo } from 'react';

type Report = () => void;

const FocusReportContext = createContext<Report | null>(null);

/** Called by `<Focusable>` when it takes the focus. */
function useFocusReport(): Report | null {
  return useContext(FocusReportContext);
}

/**
 * Wrap the part of the tree whose focus you want reported - one per row item, so
 * the report says WHICH item without anything having to pass an index down.
 */
function FocusReporter({ onFocus, children }: Readonly<{ onFocus: Report; children: ReactNode }>) {
  // The provider's value must be stable per item, or every focus change would
  // re-render every tile in the window.
  const value = useMemo(() => onFocus, [onFocus]);
  return <FocusReportContext.Provider value={value}>{children}</FocusReportContext.Provider>;
}

export { FocusReporter, useFocusReport };
