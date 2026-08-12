// The panel's three bands, and what the surface tells them: only the middle one
// scrolls, the other two stay put.

import { createContext, type ReactNode, useContext } from 'react';
import { ScrollView } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { styles } from '#ui/core';
import { DIALOG_PAD } from '#ui/lib/surface-shell';

interface Shell {
  pad: number;
  hasHeader: boolean;
  hasFooter: boolean;
}

const ShellContext = createContext<Shell>({
  pad: DIALOG_PAD,
  hasHeader: false,
  hasFooter: false,
});

const useShell = () => useContext(ShellContext);

const GAP = 24;

/** The pinned top of the panel: it stays put while the content scrolls under it. */
function Header({ children }: Readonly<{ children: ReactNode }>) {
  const { pad } = useShell();
  return (
    <Box shrink={0} gap={8} px={pad} pt={pad} pb={pad > 0 ? GAP : 0}>
      {children}
    </Box>
  );
}

/** The scrolling middle, and the only part of the panel that scrolls. */
function Panel({ children }: Readonly<{ children: ReactNode }>) {
  const { pad, hasHeader, hasFooter } = useShell();
  const gap = pad > 0 ? GAP : 0;
  return (
    <ScrollView
      style={s.panel}
      // No vertical padding against a pinned neighbour: it would scroll away.
      contentContainerStyle={{
        paddingHorizontal: pad,
        paddingTop: hasHeader ? 0 : pad,
        paddingBottom: hasFooter ? 0 : pad,
        gap,
      }}
    >
      {children}
    </ScrollView>
  );
}

/** The pinned bottom: a shelf, not a row. Put a <Dialog.Actions> in it. */
function Footer({ children }: Readonly<{ children: ReactNode }>) {
  const { pad } = useShell();
  return (
    <Box shrink={0} px={pad} pt={pad > 0 ? GAP : 0} pb={pad}>
      {children}
    </Box>
  );
}

const s = styles({
  panel: { shrink: 1 },
});

export type { Shell };
export { Footer, Header, Panel, ShellContext };
