// Shared scaffold for the onboarding/login surfaces. The lockup is the one
// anchor: same size and position on every phase, with content swapping beneath.

import { BackButton, styles } from '@kroma/ui/kit';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  type KeyboardAvoidingViewProps,
  Platform,
  Pressable,
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
    <View style={s.screen}>
      <LinearGradient
        colors={[colors.accentSoft, SHADE.transparent]}
        style={s.wash}
        pointerEvents="none"
      />
      {onBack ? (
        <View style={[s.back, { top: insets.top + 8 }]}>
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
        style={s.body}
      >
        {/* KeyboardAvoidingView owns its own bottom padding, so the safe-area
            spacing lives on an inner view it never touches. */}
        <View
          style={[
            s.inner,
            wide && s.innerCentered,
            {
              paddingTop: insets.top + (wide ? 16 : 56),
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View style={s.brand}>
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
  return <View style={wide ? s.boxWide : s.box}>{children}</View>;
}

export function OnboardingTitle({
  title,
  subtitle,
}: Readonly<{ title: string; subtitle?: string | null }>) {
  return (
    <View style={s.titleBlock}>
      <Text style={s.headline}>{title}</Text>
      {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function BackLink({ onPress }: Readonly<{ onPress(): void }>) {
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [s.backLink, pressed && { opacity: 0.6 }]}
    >
      <Text style={s.backLinkText}>{t('common.back')}</Text>
    </Pressable>
  );
}

const s = styles({
  screen: { flex: true, bg: 'bg' },
  wash: { absolute: true, top: 0, right: 0, left: 0, h: '40%' },
  // Above the wash and outside the keyboard-avoiding column, so it neither
  // tints nor moves when the keyboard does.
  back: { absolute: true, left: spacing.md, z: 2 },
  body: { flex: true },
  inner: { flex: true, px: spacing.lg, ...boxed(contentWidth.form) },
  innerCentered: { justify: 'center' },
  brand: { align: 'center', mb: 48 },
  box: { flex: true, gap: spacing.md },
  boxWide: { gap: spacing.md, minH: 320 },
  titleBlock: { mb: spacing.sm },
  headline: { ...type.display, fontSize: 28, textAlign: 'center' },
  subtitle: { ...type.caption, mt: 6, textAlign: 'center' },
  backLink: { self: 'center', p: spacing.sm, mt: 'auto' },
  backLinkText: { ...type.caption, color: 'textMuted', fontWeight: '600' },
});
