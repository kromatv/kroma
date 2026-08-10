// The control ABOVE a settings sub-panel's list: its Back button.
//
// A sub-panel does not render that button - the panel around it does - so
// without this the two of them each kept a notion of where the focus was, and a
// remote could light both at once (the list's first row AND the button). One
// owner instead: the list's index, where -1 means the header, and the panel
// merely paints what the list reports.
//
// Provided by <SettingsPanel> around whichever sub-view is open; `useListFocus`
// picks it up on its own, so a panel gets the behaviour by being inside one
// rather than by wiring anything.

import { createContext, type ReactNode, useContext } from 'react';

export interface PanelHeader {
  /** OK on the header: what the Back button does. */
  activate: () => void;
  /** Whether the header currently holds the focus. */
  report: (focused: boolean) => void;
}

const HeaderContext = createContext<PanelHeader | null>(null);

export function usePanelHeader(): PanelHeader | null {
  return useContext(HeaderContext);
}

export function PanelHeaderProvider({
  value,
  children,
}: Readonly<{ value: PanelHeader; children: ReactNode }>) {
  return <HeaderContext.Provider value={value}>{children}</HeaderContext.Provider>;
}
