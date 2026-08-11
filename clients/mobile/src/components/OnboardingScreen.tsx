// Shared scaffold for the onboarding/login surfaces. The lockup is the one
// anchor: same size and position on every phase, with content swapping beneath.

import {
  BackButton,
  Box,
  color,
  SplashBackdrop,
  type SplashCover,
  styles,
  Txt,
} from '@kroma/ui/kit';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, type KeyboardAvoidingViewProps, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '#mobile/lib/i18n';
import { boxed, contentWidth, useIsWide } from '#mobile/lib/layout';
import { groundShade, spacing, type } from '#mobile/lib/theme';
import { GateSettings } from './GateSettings';
import { KromaLockup } from './KromaLockup';

export function OnboardingScreen({
  keyboardBehavior,
  onBack,
  covers,
  settings = true,
  brand = true,
  children,
}: Readonly<{
  keyboardBehavior?: NonNullable<KeyboardAvoidingViewProps['behavior']>;
  onBack?: () => void;
  /** The language gear. On by default because this scaffold's usual job is a
   *  pre-sign-in gate, where picking a language is the one thing a reader may
   *  need before anything else. A screen reached from INSIDE the app is past
   *  that choice and turns it off. */
  settings?: boolean;
  /** The lockup over the content. On for the signed-out gates, where it is the
   *  one thing that says which app is asking. Off for a screen reached from
   *  inside the app, which has already answered that and needs the 84pt more
   *  than it needs the reminder. */
  brand?: boolean;
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
        colors={[color('accentSoft'), groundShade(0)]}
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
      {settings ? (
        <Box style={[s.gear, { top: insets.top + 8 }]}>
          <GateSettings />
        </Box>
      ) : null}
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
          {brand ? (
            <Box style={s.brand}>
              <KromaLockup height={36} />
            </Box>
          ) : null}
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
