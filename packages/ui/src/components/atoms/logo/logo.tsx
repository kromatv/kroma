// The KROMA lockup drawn from outlines, not a webfont, so it renders identically
// offline and on a TV that has never seen a Google Font.

import { Box } from '#ui/components/atoms/box';
import { Wheel } from '#ui/components/atoms/wheel';
import { useTheme } from '#ui/core';
import { KROMA_KR_PATH, KROMA_LOCKUP, KROMA_MA_PATH } from '#ui/lib/lockup-paths';
import { Path, Svg } from '#ui/lib/svg';
import type { WheelSpin } from '#ui/lib/wheel-paths';

interface LogoProps {
  /** Lockup height, which is also the wheel-O diameter. */
  size?: number;
  markOnly?: boolean;
  spin?: WheelSpin;
  color?: string;
}

function Logo({ size = 24, markOnly = false, spin, color }: Readonly<LogoProps>) {
  const theme = useTheme();
  const fill = color ?? theme.colors.text;
  if (markOnly) return <Wheel size={size} spin={spin} />;
  const s = size / KROMA_LOCKUP.height;
  return (
    <Box row align="center" accessibilityRole="image" accessibilityLabel="KROMA">
      <Svg
        width={KROMA_LOCKUP.krWidth * s}
        height={size}
        viewBox={`0 0 ${KROMA_LOCKUP.krWidth} ${KROMA_LOCKUP.height}`}
      >
        <Path d={KROMA_KR_PATH} fill={fill} />
      </Svg>
      <Box ml={KROMA_LOCKUP.gapLeft * s} mr={KROMA_LOCKUP.gapRight * s}>
        <Wheel size={size} spin={spin} />
      </Box>
      <Svg
        width={KROMA_LOCKUP.maWidth * s}
        height={size}
        viewBox={`${KROMA_LOCKUP.maX} 0 ${KROMA_LOCKUP.maWidth} ${KROMA_LOCKUP.height}`}
      >
        <Path d={KROMA_MA_PATH} fill={fill} />
      </Svg>
    </Box>
  );
}

export type { LogoProps };
export { Logo };
