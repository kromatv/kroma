// Shared scaffold for the onboarding/login surfaces. The lockup is the one
// anchor: same size and position on every phase, with content swapping beneath.

import { BackButton } from '@kroma/ui/kit';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  type KeyboardAvoidingViewProps,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '#mobile/lib/i18n';
import { boxed, contentWidth, useIsWide } from '#mobile/lib/layout';
import { colors, SHADE, spacing, type } from '#mobile/lib/theme';
import { KromaLockup } from './KromaLockup';

export function OnboardingScreen({
  keyboardBehavior,
  onBack,
  children,
}: Readonly<{
  keyboardBehavior?: NonNullable<KeyboardAvoidingViewProps['behavior']>;
  onBack?: () => void;
  children: ReactNode;
}>) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const wide = useIsWide();
  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={[colors.accentSoft, SHADE.transparent]}
        style={styles.wash}
        pointerEvents="none"
      />
      {onBack ? (
        <View style={[styles.back, { top: insets.top + 8 }]}>
          <BackButton
            variant="ghost"
            size={40}
            hitSlop={12}
            label={t('common.back')}
            onPress={onBack}
          />
        </View>
      ) : null}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : keyboardBehavior}
        style={styles.body}
      >
        {/* KeyboardAvoidingView owns its own bottom padding, so the safe-area
            spacing lives on an inner view it never touches. */}
        <View
          style={[
            styles.inner,
            wide && styles.innerCentered,
            {
              paddingTop: insets.top + (wide ? 16 : 56),
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View style={styles.brand}>
            <KromaLockup height={36} />
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/** The content column under the anchor. Top-aligned when narrow, vertically
 * centred with a fixed minHeight when wide, so the headline lands at the same y
 * on every phase either way. */
export function OnboardingBox({ children }: Readonly<{ children: ReactNode }>) {
  const wide = useIsWide();
  return <View style={wide ? styles.boxWide : styles.box}>{children}</View>;
}

export function OnboardingTitle({
  title,
  subtitle,
}: Readonly<{ title: string; subtitle?: string | null }>) {
  return (
    <View style={styles.titleBlock}>
      <Text style={styles.headline}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function BackLink({ onPress }: Readonly<{ onPress(): void }>) {
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.backLink, pressed && { opacity: 0.6 }]}
    >
      <Text style={styles.backLinkText}>{t('common.back')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  wash: { position: 'absolute', top: 0, left: 0, right: 0, height: '40%' },
  // Above the wash and outside the keyboard-avoiding column, so it neither
  // tints nor moves when the keyboard does.
  back: { position: 'absolute', left: spacing.md, zIndex: 2 },
  body: { flex: 1 },
  inner: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    ...boxed(contentWidth.form),
  },
  innerCentered: { justifyContent: 'center' },
  brand: { alignItems: 'center', marginBottom: 48 },
  box: { flex: 1, gap: spacing.md },
  boxWide: { minHeight: 320, gap: spacing.md },
  titleBlock: { marginBottom: spacing.sm },
  headline: { ...type.display, fontSize: 28, textAlign: 'center' },
  subtitle: { ...type.caption, textAlign: 'center', marginTop: 6 },
  backLink: { alignSelf: 'center', padding: spacing.sm, marginTop: 'auto' },
  backLinkText: { ...type.caption, color: colors.textDim, fontWeight: '600' },
});
