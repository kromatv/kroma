import type { useCast } from '@kroma/ui';
import { Box, Icon, type IconName, styles, Text } from '@kroma/ui/kit';
import { Pressable } from 'react-native';
import { useT } from '#mobile/lib/i18n';
import { radius, spacing, type } from '#mobile/lib/theme';

type NowPlaying = NonNullable<NonNullable<ReturnType<typeof useCast>['active']>['nowPlaying']>;

export function RemoteActions({
  playing,
  isEpisode,
  deviceName,
  onAudio,
  onSubtitles,
  onNext,
  onContinueHere,
  onStop,
}: Readonly<{
  playing: NowPlaying;
  isEpisode: boolean;
  deviceName: string;
  onAudio: () => void;
  onSubtitles: () => void;
  onNext: () => void;
  onContinueHere: () => void;
  onStop: () => void;
}>) {
  const t = useT();
  return (
    <Box style={s.actions}>
      {playing.audioTracks.length > 1 ? (
        <Wide
          icon="wave-sine"
          label={t('player.audioTrack')}
          value={labelOf(playing.audioTracks, playing.audioIndex)}
          onPress={onAudio}
        />
      ) : null}
      {playing.subtitles.length > 0 ? (
        <Wide
          icon="badge-cc"
          label={t('player.subtitles')}
          value={labelOf(playing.subtitles, playing.subtitleIndex) ?? t('player.subtitlesOff')}
          onPress={onSubtitles}
        />
      ) : null}
      {isEpisode ? (
        <Wide icon="player-track-next" label={t('player.nextEpisode')} onPress={onNext} />
      ) : null}
      <Wide icon="device-mobile" label={t('cast.continueHere')} onPress={onContinueHere} />
      <Wide
        icon="player-stop-filled"
        label={t('cast.stop')}
        value={t('cast.stopHint', { device: deviceName })}
        onPress={onStop}
      />
    </Box>
  );
}

function labelOf(tracks: { index: number; label: string }[], index?: number | null) {
  return tracks.find((track) => track.index === index)?.label;
}

function Wide({
  icon,
  label,
  value,
  onPress,
}: Readonly<{ icon: IconName; label: string; value?: string; onPress(): void }>) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [s.wide, pressed && { opacity: 0.75 }]}
    >
      <Icon name={icon} size={20} thickness={1.8} color="text" />
      <Text lines={1} style={s.wideLabel}>
        {label}
      </Text>
      {value ? (
        <Text lines={1} style={s.wideValue}>
          {value}
        </Text>
      ) : null}
    </Pressable>
  );
}

const s = styles({
  actions: { gap: spacing.xs },
  wide: {
    row: true,
    align: 'center',
    gap: spacing.sm,
    minH: 52,
    px: spacing.md,
    bg: 'surface2',
    radius: radius.md,
  },
  wideLabel: { ...type.body, flex: true, color: 'text' },
  wideValue: { ...type.caption, maxW: '45%', color: 'textMuted' },
});
