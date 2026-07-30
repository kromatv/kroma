// The chrome every drawer in the app is drawn in.

import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { type ReactNode, useMemo } from 'react';
import {
  type StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, type } from '#mobile/lib/theme';

const MIN_HEIGHT = 320;

const MIN_SHARE = 0.42;

export function useSheetMinHeight(): number {
  const { height } = useWindowDimensions();
  return Math.min(MIN_HEIGHT, Math.round(height * MIN_SHARE));
}

export function SheetBackdrop(props: Readonly<BottomSheetBackdropProps>) {
  return <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />;
}

/**
 * The style must stay flattened: `<BottomSheetView>` passes an array to
 * `StyleSheet.compose`, which takes two arguments and silently drops a third —
 * the caller's `style` override.
 */
export function SheetBody({
  children,
  style,
}: Readonly<{ children: ReactNode; style?: StyleProp<ViewStyle> }>) {
  const insets = useSafeAreaInsets();
  const minHeight = useSheetMinHeight();
  const body = useMemo(
    () =>
      StyleSheet.flatten([
        styles.body,
        { minHeight, paddingBottom: insets.bottom + spacing.md },
        style,
      ]),
    [minHeight, insets.bottom, style],
  );
  return <BottomSheetView style={body}>{children}</BottomSheetView>;
}

export function SheetTitle({ children }: Readonly<{ children: ReactNode }>) {
  return <Text style={styles.title}>{children}</Text>;
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  grabber: { backgroundColor: colors.textFaint, width: 40 },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  title: { ...type.title, color: colors.text, marginBottom: spacing.md },
});

export const sheetChrome = {
  backdropComponent: SheetBackdrop,
  backgroundStyle: styles.surface,
  handleIndicatorStyle: styles.grabber,
};
