// Shared primitives for the mobile screens, re-exporting the controls and state
// views so every screen imports them from one place.

import { ExpandableText as KitExpandableText } from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '#mobile/lib/i18n';
import { useGutters } from '#mobile/lib/layout';
import { colors, spacing, type } from '#mobile/lib/theme';

export { TextField } from './controls';
export {
  SheetBackdrop,
  SheetBody,
  SheetTitle,
  sheetChrome,
  useSheetMinHeight,
} from './sheet';
export { EmptyState, ErrorBanner, ErrorView, Loading } from './states';

export function Screen({
  children,
  padded = true,
  style,
}: Readonly<{
  children: ReactNode;
  padded?: boolean;
  style?: ViewStyle;
}>) {
  const insets = useSafeAreaInsets();
  // In landscape the notch sits at the left edge, so the padding absorbs the
  // horizontal inset rather than stacking on top of it.
  const pad = padded ? spacing.md : 0;
  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: insets.top,
          paddingLeft: Math.max(insets.left, pad),
          paddingRight: Math.max(insets.right, pad),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** The kit's collapsed paragraph, bound to this app's i18n and reading style. */
export function ExpandableText({
  children,
  lines = 3,
}: Readonly<{ children: string; lines?: number }>) {
  const t = useT();
  return (
    <KitExpandableText lines={lines} moreLabel={t('content.moreInfo')} style={styles.expandable}>
      {children}
    </KitExpandableText>
  );
}

export function SectionTitle({ children }: Readonly<{ children: ReactNode }>) {
  // Section titles sit on full-bleed pages, so they clear the notch themselves.
  const gutters = useGutters();
  return <Text style={[styles.sectionTitle, gutters.style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  expandable: { ...type.body, color: colors.textDim, lineHeight: 22 },
  sectionTitle: {
    ...type.section,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
});
