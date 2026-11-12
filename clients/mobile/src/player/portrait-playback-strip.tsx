import { formatTimecode } from '@kromatv/ui/intl';
import { Box, IconButton, styles, Text, useStyles } from '@kromatv/ui/kit';
import { useT } from '#mobile/lib/i18n';
import { spacing, type } from '#mobile/lib/theme';
import type { Transport } from './engine';
import { ScrubBar } from './ScrubBar';
import type { StoryboardTile } from './useStoryboard';

export function PortraitPlaybackStrip({
  engine,
  markers,
  tileFor,
  onFullscreen,
}: Readonly<{
  engine: Transport;
  markers?: number[];
  tileFor?: (abs: number) => StoryboardTile | null;
  onFullscreen(): void;
}>) {
  const s = useStyles(definition);
  const t = useT();
  return (
    <Box style={s.strip}>
      <ScrubBar
        compact
        cur={engine.cur}
        dur={engine.dur}
        buffered={engine.buffered}
        onSeek={engine.seekTo}
        tileFor={tileFor}
        markers={markers}
      />
      <Box style={s.row}>
        <Text style={s.time}>
          {formatTimecode(engine.cur)}
          <Text style={s.duration}>{` / ${formatTimecode(engine.dur)}`}</Text>
        </Text>
        <IconButton
          variant="ghost"
          diameter={44}
          icon="maximize"
          glyph={22}
          label={t('player.fullscreen')}
          onPress={onFullscreen}
        />
      </Box>
    </Box>
  );
}

const definition = styles({
  strip: { px: spacing.md },
  row: { row: true, between: true, align: 'center', mt: -spacing.sm },
  time: { ...type.caption, color: 'text', fontVariant: ['tabular-nums'] },
  duration: { color: 'textDim' },
});
