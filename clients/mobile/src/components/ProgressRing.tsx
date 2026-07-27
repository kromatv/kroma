// Circular progress ring (downloads), from the design system.
//
// The ring itself is @kroma/ui's <ProgressRing>; what stays here is this app's
// own contract, which the shared component deliberately does not have: a
// negative value means "indeterminate", and a queued download shows the
// platform spinner rather than a ring stuck at zero.

import { colors, ProgressRing as Ring, Spinner } from '@kroma/ui/kit';

export function ProgressRing({
  progress,
  size = 34,
  stroke = 2.5,
}: Readonly<{
  /** 0..1, or -1 for indeterminate. */
  progress: number;
  size?: number;
  stroke?: number;
}>) {
  if (progress < 0) return <Spinner size={20} color={colors.accent} />;
  return (
    <Ring
      // A ring at exactly 0 reads as broken rather than as "just started", so
      // the first sliver is always drawn.
      value={Math.max(0.02, progress)}
      size={size}
      stroke={stroke}
      track={colors.borderStrong}
      fill={colors.accent}
    />
  );
}
