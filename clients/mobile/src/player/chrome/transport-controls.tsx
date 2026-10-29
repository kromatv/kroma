import { SKIP_BACK_ICON, SKIP_FORWARD_ICON } from '@kromatv/ui';
import { Box, Icon, IconButton, Spinner, styles, useStyles } from '@kromatv/ui/kit';
import { useT } from '#mobile/lib/i18n';
import { colors } from '#mobile/lib/theme';
import type { Engine } from '#mobile/player/engine';

export function TransportControls({
  engine,
  poke,
  compact,
}: Readonly<{ engine: Engine; poke(): void; compact: boolean }>) {
  const s = useStyles(definition);
  const t = useT();
  return (
    <Box style={[s.centerRow, compact && s.compactRow]} pointerEvents="box-none">
      <IconButton
        diameter={compact ? 40 : 56}
        icon={SKIP_BACK_ICON}
        glyph={compact ? 22 : 28}
        onPress={() => {
          engine.skip(-10);
          poke();
        }}
        label={t('player.back10')}
      />
      {/* Buffering lives IN the play button while controls are up: a second
            spinner floating behind the cluster read as two half-drawn
            controls fighting over the same centre. */}
      <IconButton
        diameter={compact ? 56 : 72}
        variant={compact ? 'scrim' : 'primary'}
        onPress={() => {
          engine.togglePlay();
          poke();
        }}
        label={engine.playing ? t('player.pause') : t('player.play')}
      >
        {(() => {
          const ink = compact ? colors.text : colors.accentInk;
          if (engine.waiting) return <Spinner size={compact ? 24 : 30} color={ink} />;
          const glyph = engine.playing ? 'player-pause-filled' : 'player-play-filled';
          return <Icon name={glyph} size={engine.playing ? 30 : 32} color={ink} />;
        })()}
      </IconButton>
      <IconButton
        diameter={compact ? 40 : 56}
        icon={SKIP_FORWARD_ICON}
        glyph={compact ? 22 : 28}
        onPress={() => {
          engine.skip(10);
          poke();
        }}
        label={t('player.fwd10')}
      />
    </Box>
  );
}
const definition = styles({
  centerRow: { flex: true, row: true, center: true, gap: 40 },
  compactRow: { gap: 24 },
});
