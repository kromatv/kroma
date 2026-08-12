// The sheet's three bands, and what the surface tells them: only the middle one
// scrolls, the other two stay put behind a hairline.

import { createContext, type ReactNode, useContext } from 'react';
import { ScrollView, type StyleProp, type ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Divider } from '#ui/components/atoms/divider';
import { IconButton, type IconButtonProps } from '#ui/components/atoms/icon-button';
import { styles } from '#ui/core';
import { useTDefault } from '#ui/services/i18n';

interface Shell {
  pad: number;
  onClose?: () => void;
}

const PAD = 24;
const BAND_Y = 20;

const ShellContext = createContext<Shell>({ pad: PAD });

const useShell = () => useContext(ShellContext);

interface DrawerBandProps {
  children?: ReactNode;
  /** Merged over the band's own padding, for the browser-only insets the kit's
   *  vocabulary has no spelling for (`env(safe-area-inset-top)`). */
  style?: StyleProp<ViewStyle>;
}

/** The pinned top of the sheet: it stays put while the panel scrolls under it. */
function Header({ children, style }: Readonly<DrawerBandProps>) {
  const { pad } = useShell();
  return (
    <>
      <Box shrink={0} px={pad} py={BAND_Y} style={style}>
        {children}
      </Box>
      <Divider />
    </>
  );
}

/** The scrolling middle, and the only part of the sheet that scrolls. */
function Panel({ children, style }: Readonly<DrawerBandProps>) {
  const { pad } = useShell();
  return (
    <ScrollView
      style={[s.panel, style]}
      // Grows to the sheet's height so a short body can still pin something to
      // its bottom edge with `mt="auto"`, as the navigation sheets do.
      contentContainerStyle={{ paddingHorizontal: pad, paddingVertical: BAND_Y, flexGrow: 1 }}
    >
      {children}
    </ScrollView>
  );
}

/** The pinned bottom: a shelf for the sheet's actions. */
function Footer({ children, style }: Readonly<DrawerBandProps>) {
  const { pad } = useShell();
  return (
    <>
      <Divider />
      <Box shrink={0} px={pad} py={BAND_Y} style={style}>
        {children}
      </Box>
    </>
  );
}

/** Everything an icon button takes except what dismissing the sheet decides:
 *  the glyph, the accessible name and what pressing it does. */
type DrawerCloseProps = Omit<IconButtonProps, 'icon' | 'label' | 'onPress' | 'children'>;

/** The way out, wired to the Root's `onClose`. Renders nothing when the sheet
 *  cannot be dismissed, so a header composed by a caller needs no condition of
 *  its own. */
function Close({ variant = 'ghost', ...button }: Readonly<DrawerCloseProps>) {
  const { onClose } = useShell();
  const t = useTDefault();
  if (!onClose) return null;
  return (
    <IconButton
      {...button}
      variant={variant}
      icon="x"
      label={t('common.close')}
      onPress={onClose}
    />
  );
}

const s = styles({
  panel: { shrink: 1 },
});

export type { DrawerBandProps, DrawerCloseProps, Shell };
export { Close, Footer, Header, PAD, Panel, ShellContext };
