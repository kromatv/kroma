// The amber lens covering the stretch of letters on screen, and the bubble a
// scrubbing finger drags with it. Both belong to the Root: the lens is one box
// crossing several rows, so no row can draw it.

import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { styles, useStyles } from '#ui/core';
import { GlideBox } from '#ui/lib/glide-box';
import type { GlideRect } from '#ui/lib/glide-box-types';
import { PAD, ROW_W } from './alphabet-rail-context';

const TRAVEL_MS = 260;
const CHASE_MS = 160;
const BUBBLE = 64;

type LensBox = GlideRect;

function lensFor(lit: [number, number], rowH: number): LensBox {
  const height = (lit[1] - lit[0] + 1) * rowH;
  const width = Math.min(ROW_W, height);
  return {
    x: PAD + (ROW_W - width) / 2,
    y: PAD + lit[0] * rowH,
    width,
    height,
  };
}

function Lens({ box, chase }: Readonly<{ box: LensBox | null; chase: boolean }>) {
  const s = useStyles(sDefinition);
  return <GlideBox rect={box} durationMs={chase ? CHASE_MS : TRAVEL_MS} style={s.lens} />;
}

/** The letter under a scrubbing finger, held clear of it. */
function Bubble({ letter, y }: Readonly<{ letter: string; y: number }>) {
  const s = useStyles(sDefinition);

  return (
    <Box
      absolute
      align="center"
      justify="center"
      bg="accent"
      radius="xl"
      style={[s.bubble, { top: y - BUBBLE / 2 }]}
    >
      <Text selectable={false} variant="subheadingTv" color="accentInk">
        {letter}
      </Text>
    </Box>
  );
}

const sDefinition = styles({
  bubble: { right: ROW_W + PAD * 2 + 18, w: BUBBLE, h: BUBBLE },
  lens: { absolute: true, radius: 'pill', bg: 'accent' },
});

export { Bubble, Lens, lensFor };
