// How a container learns WHICH of its items took the focus.
//
// A navigator node answers a coarser question - the focus is somewhere inside
// me - so a row that has to know which tile would need a node per tile. A
// virtualised row's tiles are already the nodes, and this saves it a second
// registration each.

import { createContext, type ReactNode, useContext, useMemo } from 'react';

type Report = () => void;

const FocusReportContext = createContext<Report | null>(null);

/** Called by `<Focusable>` when it takes the focus. */
function useFocusReport(): Report | null {
  return useContext(FocusReportContext);
}

type ReporterProps = Readonly<
  { children: ReactNode } & (
    | { onFocus: Report; index?: undefined }
    | { onFocus: (index: number) => void; index: number }
  )
>;

/** Wrap one row item so its focus is reported without passing an index down.
 *  With `index`, the handler is shared by every item and the reporter binds it,
 *  so the context value stays put across re-renders of the row. */
function FocusReporter(props: ReporterProps) {
  const { onFocus, index, children } = props;
  // Stable per item, or every focus change re-renders every tile in the window.
  const value = useMemo<Report>(
    () => (index === undefined ? (onFocus as Report) : () => onFocus(index)),
    [onFocus, index],
  );
  return <FocusReportContext.Provider value={value}>{children}</FocusReportContext.Provider>;
}

export { FocusReporter, useFocusReport };
