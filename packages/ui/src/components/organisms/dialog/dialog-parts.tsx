// The panel's three bands, and what the surface tells them: only the middle one
// scrolls, the other two stay put.

import { createContext, type ReactNode, useContext } from 'react';
import { ScrollView } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { RING_ROOM, styles } from '#ui/core';
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

// What a pinned band spends towards the gap to the panel: the rest of it is the
// panel's, as room for a focus ring, and the two always sum to GAP.
const band = (pad: number) => (pad > 0 ? GAP - RING_ROOM : 0);

/** The pinned top of the panel: it stays put while the content scrolls under it. */
function Header({ children }: Readonly<{ children: ReactNode }>) {
  const { pad } = useShell();
  return (
    <Box shrink={0} gap={8} px={pad} pt={pad} pb={band(pad)}>
      {children}
    </Box>
  );
}

/** The scrolling middle, and the only part of the panel that scrolls. */
function Panel({ children }: Readonly<{ children: ReactNode }>) {
  const { pad, hasHeader, hasFooter } = useShell();
  const gap = pad > 0 ? GAP : 0;
  // Against a pinned neighbour the panel spends only the room a focus ring
  // needs, and the band gives back exactly that much: the panel CLIPS, so a
  // control flush with its edge loses the side of its ring that stands outside.
  const room = pad > 0 ? RING_ROOM : 0;
  return (
    <ScrollView
      style={s.panel}
      contentContainerStyle={{
        paddingHorizontal: pad,
        paddingTop: hasHeader ? room : pad,
        paddingBottom: hasFooter ? room : pad,
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
    <Box shrink={0} px={pad} pt={band(pad)} pb={pad}>
      {children}
    </Box>
  );
}

const s = styles({
  panel: { shrink: 1 },
});

export type { Shell };
export { Footer, Header, Panel, ShellContext };
