import { formatTimecode } from '@kromatv/ui/intl';
import { Box, styles, Text, fontSizes, useStyles } from '@kromatv/ui/kit';
import { useControlsHold } from './useControlsHold';
import type { Transport } from '#mobile/player/engine';
import { ScrubBar } from '#mobile/player/ScrubBar';
import type { StoryboardTile } from '#mobile/player/useStoryboard';

export function PlayerScrubRow({
  engine,
  onInteract,
  hold,
  tileFor,
  markers,
}: Readonly<{
  engine: Transport;
  onInteract(): void;
  hold?: () => () => void;
  tileFor?: (abs: number) => StoryboardTile | null;
  markers?: number[];
}>) {
  const s = useStyles(definition);

  const scrub = useControlsHold(hold);
  return (
    <Box>
      <ScrubBar
        cur={engine.cur}
        dur={engine.dur}
        buffered={engine.buffered}
        tileFor={tileFor}
        markers={markers}
        onScrubStart={scrub.take}
        onScrubEnd={scrub.give}
        onSeek={(abs) => {
          engine.seekTo(abs);
          onInteract();
        }}
      />
      <Box style={s.timeRow}>
        <Text style={s.time}>{formatTimecode(engine.cur)}</Text>
        <Text style={s.time}>{formatTimecode(engine.dur)}</Text>
      </Box>
    </Box>
  );
}

const definition = styles({
  timeRow: { row: true, between: true, align: 'center', mt: 2 },
  time: { color: 'text/50', fontSize: fontSizes.caption, fontVariant: ['tabular-nums'] },
});
