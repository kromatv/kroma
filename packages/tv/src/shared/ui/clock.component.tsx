import { Box, styles, Text, useStyles } from '@kromatv/ui/kit';
import { useClock } from '#tv/shared/ui/brand';

const HEADER_CENTRE = 70;

const sDefinition = styles({
  clock: {
    fontVariant: ['tabular-nums'],
    textShadow: '0 1px 4px rgba(0, 0, 0, 0.6)',
  },
});

/** The live wall clock, as every screen header draws it. */
export function WallClock() {
  const s = useStyles(sDefinition);
  return (
    <Text variant="labelTv" style={s.clock}>
      {useClock()}
    </Text>
  );
}

/** The wall clock pinned top-right, on the browse bar's centre line, for a screen without that bar. */
export function ScreenClock() {
  return (
    <Box
      absolute
      top={0}
      right={64}
      h={HEADER_CENTRE * 2}
      justify="center"
      z={20}
      pointerEvents="none"
    >
      <WallClock />
    </Box>
  );
}
