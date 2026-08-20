import { Box, styles } from '@kroma/ui/kit';
import type { useT } from '#mobile/lib/i18n';
import { MenuRow } from '#mobile/player/TrackSheetRows';

export type SheetView =
  | 'menu'
  | 'quality'
  | 'audio'
  | 'audioFilter'
  | 'subtitles'
  | 'appearance'
  | 'speed';

export function SheetMenu(
  at: Readonly<{
    t: ReturnType<typeof useT>;
    quality: string;
    audioCount: number;
    audio: string | undefined;
    filter: string | null;
    subtitles: string;
    appearance: string;
    speed: string;
    statsOn: boolean;
    onToggleStats(): void;
    go(view: SheetView): void;
    onReport(): void;
  }>,
) {
  return (
    <Box style={s.menuList}>
      <MenuRow
        icon="badge-4k"
        label={at.t('player.quality')}
        value={at.quality}
        onPress={() => at.go('quality')}
      />
      {at.audioCount > 1 ? (
        <MenuRow
          icon="wave-sine"
          label={at.t('player.audioTracks')}
          value={at.audio}
          onPress={() => at.go('audio')}
        />
      ) : null}
      {at.filter === null ? null : (
        <MenuRow
          icon="adjustments-horizontal"
          label={at.t('player.audioFilters')}
          value={at.filter}
          onPress={() => at.go('audioFilter')}
        />
      )}
      <MenuRow
        icon="badge-cc"
        label={at.t('player.subtitles')}
        value={at.subtitles}
        onPress={() => at.go('subtitles')}
      />
      <MenuRow
        icon="typography"
        label={at.t('player.subAppearance')}
        value={at.appearance}
        onPress={() => at.go('appearance')}
      />
      <MenuRow
        icon="gauge"
        label={at.t('player.speed')}
        value={at.speed}
        onPress={() => at.go('speed')}
      />
      <MenuRow
        icon="chart-bar"
        label={at.t('player.stats')}
        toggle
        on={at.statsOn}
        onPress={at.onToggleStats}
      />
      <MenuRow icon="flag" label={at.t('reports.sheet')} onPress={at.onReport} />
    </Box>
  );
}

const s = styles({
  menuList: { gap: 2 },
});
