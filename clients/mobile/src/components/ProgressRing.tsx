import {
  activeTheme,
  color,
  ProgressRing as Ring,
  Spinner,
  useStyleScope,
  useThemeVersion,
} from '@kromatv/ui/kit';
// Circular progress ring (downloads), from the design system. Wraps
// @kromatv/ui's <ProgressRing> with this app's own contract: a negative value
// means "indeterminate", shown as the platform spinner instead of a ring
// stuck at zero.

export function ProgressRing({
  progress,
  size = 34,
  thickness = 2.5,
}: Readonly<{
  progress: number;
  size?: number;
  thickness?: number;
}>) {
  const scope = useStyleScope();
  useThemeVersion();

  if (progress < 0) return <Spinner size={20} color="accent" />;
  return (
    <Ring
      // A ring at exactly 0 reads as broken rather than as "just started", so
      // the first sliver is always drawn.
      value={Math.max(0.02, progress)}
      size={size}
      thickness={thickness}
      track={color('borderStrong', activeTheme(scope.theme))}
      fill={color('accent', activeTheme(scope.theme))}
    />
  );
}
