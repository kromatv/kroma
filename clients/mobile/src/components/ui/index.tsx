// Small shared primitives for the mobile screens: the dark screen scaffold and
// text surfaces, re-exporting the controls and state views so every screen keeps
// importing them from one place.

import { ExpandableText as KitExpandableText } from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '#mobile/lib/i18n';
import { useGutters } from '#mobile/lib/layout';
import { colors, spacing, type } from '#mobile/lib/theme';

export { TextField } from './controls';
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
  // Horizontal insets matter too: in landscape the notch / Dynamic Island sits
  // at the LEFT edge and content slid straight under it. The screen's own
  // padding absorbs the inset rather than stacking on top of it.
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

/** Netflix-style collapsed paragraph, from the design system. What stays here
 * is this app's call shape: the "more" label bound to its i18n, and the phone's
 * own reading style for a synopsis. */
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
  // Gutter-aware: section titles sit on full-bleed pages (home, detail), so
  // they clear the landscape notch themselves.
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
