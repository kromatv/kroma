// "Playing on Salon": the strip above the tab bar while this phone is driving a
// TV. Tapping it opens the full remote; the play/pause is right there because
// that is the one control worth reaching for without opening anything.
//
// Rendered inside the floating tab dock, so it travels with the tab bar instead
// of being pinned to a screen - the cast session outlives whichever tab you are
// on.

import { useCast } from '@kroma/ui';
import { Icon } from '@kroma/ui/kit';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
      style={({ pressed }) => [styles.bar, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={t('cast.playingOn', { device: active.name })}
    >
      {poster ? (
        <Image source={{ uri: poster }} style={styles.poster} contentFit="cover" />
      ) : (
        <View style={[styles.poster, styles.posterFallback]}>
          <Icon name="device-tv" size={18} stroke={1.8} color={colors.textDim} />
        </View>
      )}
      <View style={styles.text}>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        <Text numberOfLines={1} style={styles.device}>
          {t('cast.playingOn', { device: active.name })}
        </Text>
      </View>
      {playing ? (
        <Pressable
          onPress={() => void send({ type: isPlaying ? 'pause' : 'resume' })}
          hitSlop={10}
          style={({ pressed }) => [styles.transport, pressed && { opacity: 0.7 }]}
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
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    paddingRight: spacing.sm,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  poster: { width: 40, height: 56 },
  posterFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  text: { flex: 1, gap: 1 },
  title: { ...type.body, color: colors.text, fontWeight: '600' },
  device: { ...type.small, color: colors.accent },
  transport: { padding: 4 },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: colors.border,
  },
  fill: { height: 2, backgroundColor: colors.accent },
});
