// The strip above the tab bar while this phone is driving a TV.

import { useCast } from '@kroma/ui';
import { Box, Icon, styles, Txt } from '@kroma/ui/kit';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { useT } from '#mobile/lib/i18n';
import { useClient } from '#mobile/lib/session';
import { colors, radius, spacing, type } from '#mobile/lib/theme';

export function CastMiniBar() {
  const t = useT();
  const router = useRouter();
  const client = useClient();
  const { active, send, positionMs } = useCast();

  if (!active) return null;

  const playing = active.nowPlaying;
  const title = playing ? (playing.item.metadata?.title ?? playing.item.title) : t('cast.idle');
  const poster = playing ? client.posterFor(playing.item) : null;
  const duration = playing?.durationMs ?? 0;
  const progress = duration > 0 ? Math.min(1, positionMs / duration) : 0;
  const isPlaying = playing?.state === 'playing';

  return (
    <Pressable
      onPress={() => router.push('/cast' as never)}
      style={({ pressed }) => [s.bar, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={t('cast.playingOn', { device: active.name })}
    >
      {poster ? (
        <Image source={{ uri: poster }} style={s.poster} contentFit="cover" />
      ) : (
        <Box style={[s.poster, s.posterFallback]}>
          <Icon name="device-tv" size={18} stroke={1.8} color={colors.textDim} />
        </Box>
      )}
      <Box style={s.text}>
        <Txt lines={1} style={s.title}>
          {title}
        </Txt>
        <Txt lines={1} style={s.device}>
          {t('cast.playingOn', { device: active.name })}
        </Txt>
      </Box>
      {playing ? (
        <Pressable
          onPress={() => void send({ type: isPlaying ? 'pause' : 'resume' })}
          hitSlop={10}
          style={({ pressed }) => [s.transport, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={t(isPlaying ? 'player.pause' : 'player.play')}
        >
          <Icon
            name={isPlaying ? 'player-pause-filled' : 'player-play-filled'}
            size={22}
            color={colors.text}
          />
        </Pressable>
      ) : null}
      {/* A hairline of progress along the bottom edge: enough to say how far in
          the TV is without spending a row on it. */}
      <Box style={s.track} pointerEvents="none">
        <Box style={[s.fill, { width: `${progress * 100}%` }]} />
      </Box>
    </Pressable>
  );
}

const s = styles({
  bar: {
    row: true,
    align: 'center',
    gap: spacing.sm,
    h: 56,
    pr: spacing.sm,
    mx: spacing.md,
    mb: spacing.xs,
    bg: 'surface3',
    radius: radius.md,
    border: 'border',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  poster: { w: 40, h: 56 },
  posterFallback: { center: true, bg: 'surface1' },
  text: { flex: true, gap: 1 },
  title: { ...type.body, color: 'text', fontWeight: '600' },
  device: { ...type.small, color: 'accent' },
  transport: { p: 4 },
  track: { absolute: true, right: 0, bottom: 0, left: 0, h: 2, bg: 'border' },
  fill: { h: 2, bg: 'accent' },
});
