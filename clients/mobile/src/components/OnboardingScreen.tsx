// Shared scaffold for the onboarding/login surfaces. The lockup is the one
// anchor: same size and position on every phase, with content swapping beneath.

import { BackButton, Box, SplashBackdrop, type SplashCover, styles, Txt } from '@kroma/ui/kit';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, type KeyboardAvoidingViewProps, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '#mobile/lib/i18n';
import { boxed, contentWidth, useIsWide } from '#mobile/lib/layout';
import { colors, SHADE, spacing, type } from '#mobile/lib/theme';
import { GateSettings } from './GateSettings';
import { KromaLockup } from './KromaLockup';

export function OnboardingScreen({
  keyboardBehavior,
  onBack,
  covers,
  children,
}: Readonly<{
  keyboardBehavior?: NonNullable<KeyboardAvoidingViewProps['behavior']>;
  onBack?: () => void;
  /** Splash artwork behind the phase (see the kit's SplashBackdrop); phases
   *  without a known server pass nothing and keep the plain wash. */
  covers?: readonly SplashCover[];
  children: ReactNode;
}>) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const wide = useIsWide();
  return (
    <Box style={s.screen}>
      {covers && covers.length > 0 ? <SplashBackdrop covers={covers} /> : null}
      <LinearGradient
        colors={[colors.accentSoft, SHADE.transparent]}
        style={s.wash}
        pointerEvents="none"
      />
      {onBack ? (
        <Box style={[s.back, { top: insets.top + 8 }]}>
          <BackButton label={t('common.back')} onPress={onBack} />
        </Box>
      ) : null}
      {/* The gear the TV and web gates both carry: language before sign-in.
          Opposite corner to Back, and outside the keyboard-avoiding column so
          it neither moves nor tints with the keyboard. */}
      <Box style={[s.gear, { top: insets.top + 8 }]}>
        <GateSettings />
      </Box>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : keyboardBehavior}
        style={s.body}
      >
        {/* KeyboardAvoidingView owns its own bottom padding, so the safe-area
            spacing lives on an inner view it never touches. */}
        <Box
          style={[
            s.inner,
            wide && s.innerCentered,
            {
              paddingTop: insets.top + (wide ? 16 : 56),
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <Box style={s.brand}>
            <KromaLockup height={36} />
          </Box>
          {children}
        </Box>
      </KeyboardAvoidingView>
    </Box>
  );
}

/** The content column under the anchor. Top-aligned when narrow, vertically
 * centred with a fixed minHeight when wide, so the headline lands at the same y
 * on every phase either way. */
export function OnboardingBox({ children }: Readonly<{ children: ReactNode }>) {
  const wide = useIsWide();
  return <Box style={wide ? s.boxWide : s.box}>{children}</Box>;
}

export function OnboardingTitle({
  title,
  subtitle,
}: Readonly<{ title: string; subtitle?: string | null }>) {
  return (
    <Box style={s.titleBlock}>
      <Txt style={s.headline}>{title}</Txt>
      {subtitle ? <Txt style={s.subtitle}>{subtitle}</Txt> : null}
    </Box>
  );
}

const s = styles({
  screen: { flex: true, bg: 'bg' },
  wash: { absolute: true, top: 0, right: 0, left: 0, h: '40%' },
  // Above the wash and outside the keyboard-avoiding column, so it neither
  // tints nor moves when the keyboard does.
  back: { absolute: true, left: spacing.md, z: 2 },
  gear: { absolute: true, right: spacing.md, z: 2 },
  body: { flex: true },
  inner: { flex: true, px: spacing.lg, ...boxed(contentWidth.form) },
  innerCentered: { justify: 'center' },
  brand: { align: 'center', mb: 48 },
  box: { flex: true, gap: spacing.md },
  boxWide: { gap: spacing.md, minH: 320 },
  titleBlock: { mb: spacing.sm },
  headline: { ...type.display, fontSize: 28, textAlign: 'center' },
  subtitle: { ...type.caption, mt: 6, textAlign: 'center' },
});
