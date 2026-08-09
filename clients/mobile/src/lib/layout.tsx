// Tablet-aware layout primitives. Multi-column layouts key off the LIVE
// window width (useIsWide), never the device class — iPadOS windows resize
// freely, so a narrow floating window must collapse back to single-column.

import { Box, styles } from '@kroma/ui/kit';
import * as Device from 'expo-device';
import { type ReactNode, useMemo } from 'react';
import { type StyleProp, useWindowDimensions, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from './theme';

// Device class, for capabilities that genuinely follow the hardware (e.g.
// player orientation locks) — resizable iPad windows make it wrong for any
// layout decision, which should use useIsWide instead.
export const isTablet = Device.deviceType === Device.DeviceType.TABLET;

// Full-screen iPads pass in both orientations; iPhones and narrow iPad
// windows never do.
export const WIDE_BREAKPOINT = 700;

/** True while the window is wide enough for multi-column layouts; re-renders
 * on window resize (iPad windowing, split view, rotation). */
export function useIsWide(min: number = WIDE_BREAKPOINT): boolean {
  const { width } = useWindowDimensions();
  return width >= min;
}

/** Standard page padding, grown to clear the notch / Dynamic Island when the
 * hardware inset sits at a side edge (landscape). */
export function useGutters(min: number = spacing.md): {
  left: number;
  right: number;
  style: { paddingLeft: number; paddingRight: number };
} {
  const insets = useSafeAreaInsets();
  const left = Math.max(insets.left, min);
  const right = Math.max(insets.right, min);
  return useMemo(
    () => ({ left, right, style: { paddingLeft: left, paddingRight: right } }),
    [left, right],
  );
}

export const contentWidth = {
  form: 480,
  reading: 720,
} as const;

/** Centered-column cap as a bare style, for style arrays on existing views. */
export function boxed(max: number = contentWidth.form): ViewStyle {
  return { width: '100%', maxWidth: max, alignSelf: 'center' };
}

/** Caps children to a centered column. Wrap any screen body in it; on phones
 * it is a no-op because the cap never engages. */
export function MaxWidth({
  max,
  style,
  children,
}: Readonly<{
  max?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}>) {
  return <Box style={[boxed(max), style]}>{children}</Box>;
}

/** Side-by-side columns in wide windows; below the breakpoint, left and right
 * render as plain stacked siblings inside `style`, so the narrow layout stays
 * byte-identical when a page adopts this. Collapses live on window resize. */
export function SplitColumns({
  left,
  right,
  leftFlex = 2,
  rightFlex = 3,
  style,
}: Readonly<{
  left: ReactNode;
  right: ReactNode;
  leftFlex?: number;
  rightFlex?: number;
  style?: StyleProp<ViewStyle>;
}>) {
  const wide = useIsWide();
  if (!wide) {
    return (
      <Box style={style}>
        {left}
        {right}
      </Box>
    );
  }
  return (
    <Box style={[style, s.splitRow]}>
      <Box style={[s.splitCol, { flex: leftFlex }]}>{left}</Box>
      <Box style={[s.splitCol, { flex: rightFlex }]}>{right}</Box>
    </Box>
  );
}

const s = styles({
  splitRow: { row: true, align: 'flex-start', gap: spacing.lg },
  splitCol: { gap: spacing.md },
});
