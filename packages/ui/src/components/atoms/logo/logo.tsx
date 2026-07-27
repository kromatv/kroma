// <Logo>: the KROMA brand lockup, on every target.
//
// Drawn entirely from the official export's outlines: "KR" + the chromatic wheel
// as the O + "MA". No webfont involved, so it renders identically offline and on
// a TV that has never seen a Google Font.

import { Box } from '#ui/components/atoms/box';
import { Wheel } from '#ui/components/atoms/wheel';
import { KROMA_KR_PATH, KROMA_LOCKUP, KROMA_MA_PATH } from '#ui/lib/lockup-paths';
import { Path, Svg } from '#ui/lib/svg';
import { colors } from '#ui/lib/tokens';
import type { WheelSpin } from '#ui/lib/wheel-paths';

interface LogoProps {
  /** Lockup height (= the wheel-O diameter); with `markOnly`, the wheel diameter. */
  size?: number;
  /** Show only the chromatic wheel, without the KR MA letters. */
  markOnly?: boolean;
  spin?: WheelSpin;
  /** Letter colour. Defaults to the body text token. */
  color?: string;
}

function Logo({ size = 24, markOnly = false, spin, color = colors.text }: Readonly<LogoProps>) {
  if (markOnly) return <Wheel size={size} spin={spin} />;
  const s = size / KROMA_LOCKUP.height;
  return (
    <Box row align="center" accessibilityLabel="KROMA">
      <Svg
        width={KROMA_LOCKUP.krWidth * s}
        height={size}
        viewBox={`0 0 ${KROMA_LOCKUP.krWidth} ${KROMA_LOCKUP.height}`}
      >
        <Path d={KROMA_KR_PATH} fill={color} />
      </Svg>
      <Box ml={KROMA_LOCKUP.gapLeft * s} mr={KROMA_LOCKUP.gapRight * s}>
        <Wheel size={size} spin={spin} />
      </Box>
      <Svg
        width={KROMA_LOCKUP.maWidth * s}
        height={size}
        viewBox={`${KROMA_LOCKUP.maX} 0 ${KROMA_LOCKUP.maWidth} ${KROMA_LOCKUP.height}`}
      >
        <Path d={KROMA_MA_PATH} fill={color} />
      </Svg>
    </Box>
  );
}

export type { LogoProps };
export { Logo };
