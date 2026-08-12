// Whole-surface states: what a screen shows instead of content while it is
// loading, empty, or broken, plus the inline error banner forms use.

import { Box, Button, Icon, Spinner, styles, Text } from '@kroma/ui/kit';
import { type ReactNode, useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { radius, spacing, type } from '#mobile/lib/theme';

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
      <Icon name="alert-circle" size={17} thickness={2} color="danger" />
      <Text style={s.boxText}>{message}</Text>
    </Animated.View>
  );
}

export function Loading({ label }: Readonly<{ label?: string }>) {
  return (
    <Box style={s.center}>
      <Spinner size={36} color="textMuted" />
      {label ? <Text style={[s.centerText, s.loadingLabel]}>{label}</Text> : null}
    </Box>
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
    <Box style={s.center}>
      <Text style={s.centerText}>{message}</Text>
      {onRetry && retryLabel ? (
        <Box style={s.retry}>
          <Button variant="glass" label={retryLabel} onPress={onRetry} />
        </Box>
      ) : null}
    </Box>
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
    <Box style={s.emptyBox}>
      <Box style={s.emptyDisc}>{icon}</Box>
      <Text style={s.emptyTitle}>{title}</Text>
      {hint ? <Text style={s.emptyHint}>{hint}</Text> : null}
      {actionLabel && onAction ? (
        <Box style={s.emptyAction}>
          <Button variant="glass" label={actionLabel} onPress={onAction} />
        </Box>
      ) : null}
    </Box>
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
  boxText: { ...type.caption, flex: true, color: 'dangerHover', fontWeight: '600' },
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
