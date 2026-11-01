import { type ReactNode, useEffect, useReducer } from 'react';
import { Animated, Modal } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { styles } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { webDocument } from '#ui/lib/dom';
import { ScopeCarrier } from '#ui/lib/scope-carrier';
import { useScrollLock } from '#ui/lib/scroll-lock';
import { useFadeRise } from '#ui/lib/use-fade-rise';

const SHEET = 640;
const MARGIN = 16;

interface CommandLayerProps {
  closeLabel: string;
  onClose: () => void;
  /** Fade the layer in and raise the sheet into place. */
  animated: boolean;
  children: ReactNode;
}

/** The scrim, what closes the palette when pressed, and the sheet over them. */
function CommandLayer({ closeLabel, onClose, animated, children }: Readonly<CommandLayerProps>) {
  const s = useStyles(sDefinition);
  const scrim = useFadeRise(true, 0);
  const sheet = useFadeRise(true);

  return (
    <Animated.View style={[s.layer, animated ? scrim.style : null]}>
      <Focusable
        label={closeLabel}
        ring={false}
        onPress={onClose}
        style={s.catcher}
        focusScale={1}
      />
      <Animated.View style={[s.sheet, animated ? sheet.style : null]}>
        <Box bg="surface2" radius="xl" border="borderStrong" borderWidth={1} overflow="hidden">
          {children}
        </Box>
      </Animated.View>
    </Animated.View>
  );
}

/** Puts `children` over the whole window, holding the focus and the page's scroll,
 *  and gives the focus back to what held it when it goes. */
function CommandModal({
  onClose,
  children,
}: Readonly<{ onClose: () => void; children: ReactNode }>) {
  const [shown, show] = useReducer(() => true, false);
  useEffect(() => {
    show();
    const opener = webDocument()?.activeElement as HTMLElement | null | undefined;
    return () => opener?.focus();
  }, []);
  useScrollLock(true);
  return (
    <Modal transparent visible={shown} animationType="none" onRequestClose={onClose}>
      <ScopeCarrier>{children}</ScopeCarrier>
    </Modal>
  );
}

const sDefinition = styles({
  layer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 40,
    alignItems: 'center',
    bg: 'bg/72',
  },
  catcher: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sheet: { zIndex: 1, width: SHEET + MARGIN * 2, maxWidth: '100%', px: MARGIN, mt: 96 },
});

export { CommandLayer, CommandModal };
