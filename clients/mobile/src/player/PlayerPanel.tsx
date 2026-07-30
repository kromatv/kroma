// The player's panel: the shell every sheet inside the player is drawn in.
//
// Not the app's bottom sheet: the player is a native fullScreenModal, and
// @gorhom's sheet renders into a host mounted at the app root — behind that,
// so it would be invisible. A plain <Modal> gets its own window instead, and
// in landscape (where the film is) slides in from the side rather than
// letterboxing as a bottom sheet.
//
// The corner radius is set on the blur too: iOS's UIVisualEffectView ignores
// the rounded clip of the view it sits in, so an unrounded blur pane would
// poke out of the panel's rounded corners.

import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
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
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  // Lying down the panel is already full height; standing up it is a drawer,
  // and takes the same floor the app's sheets do - the device picker with one
  // TV on the network is two rows, and two rows is not a panel.
  const minHeight = useSheetMinHeight();

  if (!visible) return null;

  const corners = landscape ? styles.leftCorners : styles.topCorners;
  return (
    <Modal
      visible
      transparent
      animationType={landscape ? 'fade' : 'slide'}
      onRequestClose={onRequestClose ?? onClose}
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
    >
      <View style={landscape ? styles.overlayRow : styles.overlayColumn}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            corners,
            landscape
              ? [
                  styles.sidePanel,
                  {
                    width: Math.min(400, width * 0.46),
                    paddingTop: insets.top + spacing.sm,
                    paddingBottom: Math.max(insets.bottom, spacing.md),
                    paddingRight: Math.max(insets.right, spacing.md),
                  },
                ]
              : [
                  styles.bottomPanel,
                  { minHeight, paddingBottom: Math.max(insets.bottom, spacing.md) },
                ],
          ]}
        >
          <BlurView
            tint="dark"
            intensity={Platform.OS === 'ios' ? 60 : 0}
            style={[
              StyleSheet.absoluteFill,
              corners,
              Platform.OS !== 'ios' && styles.androidPanelBg,
            ]}
          />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayRow: { flex: 1, flexDirection: 'row' },
  overlayColumn: { flex: 1, flexDirection: 'column', justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  // Applied to the panel and to the blur inside it — see the file note above.
  leftCorners: {
    borderTopLeftRadius: radius.xl,
    borderBottomLeftRadius: radius.xl,
    overflow: 'hidden',
  },
  topCorners: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  sidePanel: { height: '100%', paddingLeft: spacing.md },
  bottomPanel: { maxHeight: '70%', paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  androidPanelBg: { backgroundColor: 'rgba(18, 18, 22, 0.97)' },
  scroll: { paddingBottom: spacing.md, paddingTop: spacing.xs },
});
