// Whole-surface states: what a screen shows instead of content while it is
// loading, empty, or broken, plus the inline error banner forms use.

import { Button, Icon, Spinner, styles } from '@kroma/ui/kit';
import { type ReactNode, useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '#mobile/lib/theme';

/** Tinted banner with a shake on message change; renders nothing while
 * `message` is null. */
export function ErrorBanner({ message }: Readonly<{ message: string | null }>) {
  const shake = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!message) return;
    fade.setValue(0);
    shake.setValue(0);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 140, useNativeDriver: true }),
      Animated.sequence(
        [8, -7, 5, -3, 0].map((toValue) =>
          Animated.timing(shake, { toValue, duration: 55, useNativeDriver: true }),
        ),
      ),
    ]).start();
  }, [message, fade, shake]);
  if (!message) return null;
  return (
    <Animated.View style={[s.box, { opacity: fade, transform: [{ translateX: shake }] }]}>
      <Icon name="alert-circle" size={17} stroke={2} color={colors.danger} />
      <Text style={s.boxText}>{message}</Text>
    </Animated.View>
  );
}

export function Loading({ label }: Readonly<{ label?: string }>) {
  return (
    <View style={s.center}>
      <Spinner size={36} color={colors.textDim} />
      {label ? <Text style={[s.centerText, s.loadingLabel]}>{label}</Text> : null}
    </View>
  );
}

export function ErrorView({
  message,
  retryLabel,
  onRetry,
}: Readonly<{
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
}>) {
  return (
    <View style={s.center}>
      <Text style={s.centerText}>{message}</Text>
      {onRetry && retryLabel ? (
        <View style={s.retry}>
          <Button variant="glass" label={retryLabel} onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  actionLabel,
  onAction,
}: Readonly<{
  icon: ReactNode;
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}>) {
  return (
    <View style={s.emptyBox}>
      <View style={s.emptyDisc}>{icon}</View>
      <Text style={s.emptyTitle}>{title}</Text>
      {hint ? <Text style={s.emptyHint}>{hint}</Text> : null}
      {actionLabel && onAction ? (
        <View style={s.emptyAction}>
          <Button variant="glass" label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

const s = styles({
  box: {
    row: true,
    align: 'center',
    gap: 10,
    px: spacing.sm,
    py: 10,
    bg: 'danger/12',
    radius: radius.md,
    border: 'danger/35',
  },
  boxText: { ...type.caption, flex: true, color: '#FF8A80', fontWeight: '600' },
  center: { flex: true, center: true, p: spacing.lg },
  centerText: { ...type.caption, textAlign: 'center' },
  loadingLabel: { mt: spacing.md },
  retry: { minW: 160, mt: spacing.md },
  emptyBox: {
    flex: true,
    center: true,
    gap: 6,
    p: spacing.xl,
    // Optical centering: a mathematically centered block reads too low, so
    // bias it upward toward the ~45% line.
    pb: 150,
  },
  emptyDisc: { center: true, w: 84, h: 84, mb: spacing.sm, bg: 'surface2', radius: 42 },
  emptyTitle: { ...type.section, textAlign: 'center' },
  emptyHint: { ...type.caption, maxW: 300, textAlign: 'center', lineHeight: 20 },
  emptyAction: { minW: 180, mt: spacing.md },
});
