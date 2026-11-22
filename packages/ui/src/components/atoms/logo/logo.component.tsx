// The KROMA lockup drawn from outlines, not a webfont, so it renders identically
// offline and on a TV that has never seen a Google Font.

import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { Wheel } from '#ui/components/atoms/wheel';
import { styles, useStyles, useTheme } from '#ui/core';
import { KROMA_KR_PATH, KROMA_LOCKUP, KROMA_MA_PATH } from '#ui/lib/lockup-paths';
import { Path, Svg } from '#ui/lib/svg.component';
import type { WheelSpin } from '#ui/lib/wheel-paths';

interface LogoProps {
  /** Lockup height, which is also the wheel-O diameter. */
  size?: number;
  markOnly?: boolean;
  /** Draws the KROMA Kids lockup: the word Kids on an accent tag after the
   *  wordmark. Ignored with `markOnly`. */
  kids?: boolean;
  spin?: WheelSpin;
  color?: string;
}

function Logo({ size = 24, markOnly = false, kids = false, spin, color }: Readonly<LogoProps>) {
  const theme = useTheme();
  if (markOnly) {
    return <Wheel size={size} spin={spin} />;
  }
  return (
    <Box
      row
      align="center"
      accessibilityRole="image"
      accessibilityLabel={kids ? 'KROMA Kids' : 'KROMA'}
    >
      <Wordmark size={size} spin={spin} fill={color ?? theme.colors.text} />
      {kids ? <KidsTag size={size} /> : null}
    </Box>
  );
}

function Wordmark({
  size,
  spin,
  fill,
}: Readonly<{ size: number; spin?: WheelSpin; fill: string }>) {
  const s = size / KROMA_LOCKUP.height;
  return (
    <>
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
    </>
  );
}

const sDefinition = styles({
  word: { font: 'display', fontWeight: '800', color: 'accentInk' },
});

function KidsTag({ size }: Readonly<{ size: number }>) {
  const s = useStyles(sDefinition);
  const scale = { fontSize: Math.round(size * 0.62), lineHeight: Math.round(size * 0.84) };
  return (
    <Box ml={Math.round(size * 0.34)} px={Math.round(size * 0.3)} radius="pill" bg="accent">
      <Text lines={1} style={[s.word, scale]}>
        Kids
      </Text>
    </Box>
  );
}

export type { LogoProps };
export { Logo };
