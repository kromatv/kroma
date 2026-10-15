import { useMemo } from 'react';
import { Animated } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { motion } from '#ui/core/tokens';
import { useLoop } from '#ui/lib/loop';
import { useReducedMotion } from '#ui/lib/reduced-motion';

const CELL = 9;
const BREATH_MS = motion.duration.slow * 3;
const NOTHING_ASKED: readonly number[] = [];

interface ArrivalMapProps {
  /** One percent per slice of the file, in file order; an empty list draws
   *  nothing rather than an empty row. */
  slices: readonly number[];
  /** Indexes into `slices` being fetched right now, drawn live until each is whole. */
  arriving?: readonly number[];
  label?: string;
}

type Tone = 'accent' | 'accent/40' | 'white/10' | 'live';

const toneOf = (percent: number, asked: boolean): Tone => {
  if (percent >= 100) return 'accent';
  if (asked) return 'live';
  return percent > 0 ? 'accent/40' : 'white/10';
};

const cellsOf = (slices: readonly number[], arriving: readonly number[]) => {
  const asked = new Set(arriving);
  return slices.map((percent, at) => ({ slice: at + 1, tone: toneOf(percent, asked.has(at)) }));
};

const s = styles({
  live: { w: CELL, h: CELL, radius: 2, bg: 'accent/50', border: 'accent', borderWidth: 2 },
});

/** Drawn over film, so its ink is white rather than the theme's. */
function ArrivalMap({ slices, arriving = NOTHING_ASKED, label }: Readonly<ArrivalMapProps>) {
  const cells = useMemo(() => cellsOf(slices, arriving), [slices, arriving]);
  const still = useReducedMotion();
  const live = cells.some((cell) => cell.tone === 'live');
  const breath = useLoop('pulse', BREATH_MS, live && !still);
  if (cells.length === 0) return null;
  return (
    <Box gap={8} w="100%">
      {label ? (
        <Text variant="meta" color="white/45">
          {label}
        </Text>
      ) : null}
      <Box row wrap gap={3} justify="center">
        {cells.map((cell) =>
          cell.tone === 'live' ? (
            <Animated.View key={cell.slice} style={[s.live, breath]} />
          ) : (
            <Box key={cell.slice} w={CELL} h={CELL} radius={2} bg={cell.tone} />
          ),
        )}
      </Box>
    </Box>
  );
}

export type { ArrivalMapProps };
export { ArrivalMap };
