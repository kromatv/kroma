// The seek bar and the two times of the remote, drawn from the television's
// own playhead.

import { useCastPosition } from '@kromatv/ui';
import { formatTimecode } from '@kromatv/ui/intl';
import { Box, styles, Text, useStyles } from '@kromatv/ui/kit';
import { type } from '#mobile/lib/theme';
import { ScrubBar } from '#mobile/player/scrub-bar.component';

interface RemoteScrubProps {
  durationMs: number;
  onSeek: (positionMs: number) => void;
}

export function RemoteScrub({ durationMs, onSeek }: Readonly<RemoteScrubProps>) {
  const s = useStyles(sDefinition);
  const positionMs = useCastPosition();
  const left = Math.max(0, (durationMs - positionMs) / 1000);
  return (
    <Box style={s.scrub}>
      <ScrubBar
        cur={positionMs / 1000}
        dur={durationMs / 1000}
        buffered={0}
        onSeek={(abs) => onSeek(Math.round(abs * 1000))}
      />
      <Box style={s.times}>
        <Text style={s.time}>{formatTimecode(positionMs / 1000)}</Text>
        <Text style={s.time}>{durationMs ? `-${formatTimecode(left)}` : ''}</Text>
      </Box>
    </Box>
  );
}

const sDefinition = styles({
  scrub: { gap: 6 },
  times: { row: true, between: true },
  time: { ...type.small, color: 'textMuted', fontVariant: ['tabular-nums'] },
});
