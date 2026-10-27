// The player's panel: the shell every sheet inside the player is drawn in.
//
// Not the app's bottom sheet: the player is a native fullScreenModal, and
// @gorhom's sheet renders into a host mounted at the app root (behind that),
// so it would be invisible. A plain <Modal> gets its own window instead, and
// in landscape (where the film is) slides in from the side rather than
// letterboxing as a bottom sheet.
//
// iOS blur needs a uniform native corner mask. Extending the docked edges
// beyond a rectangular clip leaves only the exposed corners rounded.

import { Box, styles, useStyles } from '@kromatv/ui/kit';
import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSheetMinHeight } from '#mobile/components/ui';
import { radius, spacing } from '#mobile/lib/theme';

export function PlayerPanel({
  visible,
  onClose,
  onRequestClose,
  children,
}: Readonly<{
  visible: boolean;
  onClose(): void;
  // Where Android's Back goes when the panel has its own idea (a sub-view
  // walking back to its menu); defaults to `onClose`.
  onRequestClose?(): void;
  children: ReactNode;
}>) {
  const s = useStyles(sDefinition);

  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  // Lying down the panel is already full height; standing up it is a drawer,
  // and takes the same floor the app's sheets do - the device picker with one
  // TV on the network is two rows, and two rows is not a panel.
  const minHeight = useSheetMinHeight();

  if (!visible) return null;

  const corners = landscape ? s.leftCorners : s.topCorners;
  return (
    <Modal
      visible
      transparent
      animationType={landscape ? 'fade' : 'slide'}
      onRequestClose={onRequestClose ?? onClose}
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
    >
      {/* A panel can hold a field (the code a television the server could not
          place is printing), and this window is the player's own: nothing
          outside it moves for the keyboard. iOS is padded here; Android resizes
          the window itself (`adjustResize` in the manifest). */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={landscape ? s.overlayRow : s.overlayColumn}
      >
        <Pressable style={s.backdrop} onPress={onClose} />
        <Box
          style={[
            corners,
            landscape
              ? [
                  s.sidePanel,
                  {
                    width: Math.min(400, width * 0.46),
                    paddingTop: insets.top + spacing.sm,
                    paddingBottom: Math.max(insets.bottom, spacing.md),
                    paddingRight: Math.max(insets.right, spacing.md),
                  },
                ]
              : [s.bottomPanel, { minHeight, paddingBottom: Math.max(insets.bottom, spacing.md) }],
          ]}
        >
          <Box pointerEvents="none" style={[StyleSheet.absoluteFill, s.blurBounds]}>
            <Box
              collapsable={false}
              style={[s.blurClip, landscape ? s.extendRight : s.extendBottom]}
            >
              <BlurView
                tint="dark"
                intensity={Platform.OS === 'ios' ? 60 : 0}
                style={[
                  StyleSheet.absoluteFill,
                  s.roundedBlur,
                  Platform.OS !== 'ios' && s.androidPanelBg,
                ]}
              />
            </Box>
          </Box>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
            {children}
          </ScrollView>
        </Box>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const sDefinition = styles({
  overlayRow: { flex: true, row: true, justify: 'flex-end' },
  overlayColumn: { flex: true, justify: 'flex-end', flexDirection: 'column' },
  backdrop: { fill: true, bg: 'black/45' },
  leftCorners: {
    overflow: 'hidden',
    borderTopLeftRadius: radius.xl,
    borderBottomLeftRadius: radius.xl,
  },
  topCorners: {
    overflow: 'hidden',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  blurBounds: { overflow: 'hidden' },
  blurClip: { fill: true, radius: radius.xl, overflow: 'hidden' },
  roundedBlur: { radius: radius.xl, overflow: 'hidden' },
  extendRight: { right: -radius.xl },
  extendBottom: { bottom: -radius.xl },
  sidePanel: { h: '100%', pl: spacing.md },
  bottomPanel: { maxH: '70%', px: spacing.md, pt: spacing.sm },
  androidPanelBg: { bg: 'surface1/97' },
  scroll: { pt: spacing.xs, pb: spacing.md },
});
