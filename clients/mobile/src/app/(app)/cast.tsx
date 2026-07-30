// The phone as the TV's control surface. It draws what the TV last reported
// (position interpolated between heartbeats), never what this phone just asked for.

import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { formatTimecode, type MediaItem, sizedImageUrl } from '@kroma/core';
import { useCast } from '@kroma/ui';
import { Icon, type IconName } from '@kroma/ui/kit';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CastSheet } from '#mobile/components/cast/CastSheet';
import { TrackPickerSheet } from '#mobile/components/cast/TrackPickerSheet';
import { EmptyState, Screen } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { goBack } from '#mobile/lib/nav';
import { useClient } from '#mobile/lib/session';
import { colors, radius, spacing, type } from '#mobile/lib/theme';
import { ScrubBar } from '#mobile/player/ScrubBar';

const SKIP_MS = 10_000;

type NowPlaying = NonNullable<NonNullable<ReturnType<typeof useCast>['active']>['nowPlaying']>;

function RemoteActions({
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
    <View style={styles.actions}>
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
    </View>
  );
}

function RemoteArtwork({ item }: Readonly<{ item?: MediaItem }>) {
  const client = useClient();
  const { width } = useWindowDimensions();
  const art = item
    ? sizedImageUrl(client.backdropFor(item) ?? client.posterFor(item), width)
    : null;
  return (
    <>
      {art ? (
        <Image source={{ uri: art }} style={styles.art} contentFit="cover" transition={200} />
      ) : (
        <View style={[styles.art, styles.artFallback]}>
          <Icon name="device-tv" size={40} stroke={1.4} color={colors.textFaint} />
        </View>
      )}
      <Text numberOfLines={2} style={styles.title}>
        {item?.metadata?.title ?? item?.title ?? ''}
      </Text>
      {item?.showTitle ? (
        <Text numberOfLines={1} style={styles.subtitle}>
          {item.showTitle}
        </Text>
      ) : null}
    </>
  );
}

export default function CastRemoteScreen() {
  const t = useT();
  const router = useRouter();
  const { active, positionMs, send, select } = useCast();
  const devices = useRef<BottomSheetModal>(null);
  const audio = useRef<BottomSheetModal>(null);
  const subtitles = useRef<BottomSheetModal>(null);

  if (!active) {
    return (
      <Screen>
        <Header title={t('cast.remote')} onBack={() => goBack(router)} />
        <EmptyState
          icon={<Icon name="cast" size={40} stroke={1.4} color={colors.textFaint} />}
          title={t('cast.noDevices')}
          hint={t('cast.noDevicesHint')}
        />
      </Screen>
    );
  }

  const playing = active.nowPlaying;
  const item = playing?.item;
  const durationMs = playing?.durationMs ?? 0;
  const isPlaying = playing?.state === 'playing';
  const buffering = playing?.state === 'buffering';

  return (
    <Screen>
      <Header title={active.name} onBack={() => goBack(router)} />
      <Pressable onPress={() => devices.current?.present()} style={styles.deviceRow}>
        <Icon name="cast" size={18} stroke={1.8} color={playing ? colors.accent : colors.textDim} />
        <Text style={[styles.deviceText, !playing && styles.deviceTextIdle]}>
          {t(playing ? 'cast.playingOn' : 'cast.connectedTo', {
            device: `${active.name} · ${active.username}`,
          })}
        </Text>
        <Icon name="chevron-right" size={16} stroke={2} color={colors.textDim} />
      </Pressable>

      {playing ? (
        <ScrollView contentContainerStyle={styles.body}>
          <RemoteArtwork item={item} />

          <View style={styles.scrub}>
            <ScrubBar
              cur={positionMs / 1000}
              dur={durationMs / 1000}
              buffered={0}
              onSeek={(abs) => void send({ type: 'seek', positionMs: Math.round(abs * 1000) })}
            />
            <View style={styles.times}>
              <Text style={styles.time}>{formatTimecode(positionMs / 1000)}</Text>
              <Text style={styles.time}>
                {durationMs
                  ? `-${formatTimecode(Math.max(0, (durationMs - positionMs) / 1000))}`
                  : ''}
              </Text>
            </View>
          </View>

          <View style={styles.transport}>
            <Round
              icon="rewind-backward-10"
              label={t('player.back10')}
              onPress={() => void send({ type: 'skip', deltaMs: -SKIP_MS })}
            />
            <Round
              big
              icon={isPlaying || buffering ? 'player-pause-filled' : 'player-play-filled'}
              label={t(isPlaying ? 'player.pause' : 'player.play')}
              onPress={() => void send({ type: 'togglePlay' })}
            />
            <Round
              icon="rewind-forward-10"
              label={t('player.fwd10')}
              onPress={() => void send({ type: 'skip', deltaMs: SKIP_MS })}
            />
          </View>

          <RemoteActions
            playing={playing}
            isEpisode={item?.kind === 'episode'}
            deviceName={active.name}
            onAudio={() => audio.current?.present()}
            onSubtitles={() => subtitles.current?.present()}
            onNext={() => void send({ type: 'skipNext' })}
            onContinueHere={() => {
              const at = Math.round(positionMs / 1000);
              void send({ type: 'stop' });
              select(null);
              if (item) router.replace(`/player/${item.id}?start=${at}` as never);
              else goBack(router);
            }}
            onStop={() => {
              void send({ type: 'stop' });
              select(null);
              goBack(router);
            }}
          />
        </ScrollView>
      ) : (
        <EmptyState
          icon={<Icon name="device-tv" size={40} stroke={1.4} color={colors.textFaint} />}
          title={t('cast.idleTitle')}
          hint={t('cast.idleHint', { device: active.name })}
          actionLabel={t('cast.disconnect')}
          onAction={() => {
            select(null);
            goBack(router);
          }}
        />
      )}

      <CastSheet
        ref={devices}
        onPick={(id) => {
          devices.current?.dismiss();
          select(id);
          if (!id) goBack(router);
        }}
      />
      <TrackPickerSheet
        ref={audio}
        title={t('player.audioTrack')}
        tracks={playing?.audioTracks ?? []}
        activeIndex={playing?.audioIndex ?? null}
        onPick={(index) => {
          audio.current?.dismiss();
          if (index != null) void send({ type: 'setAudio', index });
        }}
      />
      <TrackPickerSheet
        ref={subtitles}
        title={t('player.subtitles')}
        tracks={playing?.subtitles ?? []}
        activeIndex={playing?.subtitleIndex ?? null}
        offLabel={t('player.subtitlesOff')}
        onPick={(index) => {
          subtitles.current?.dismiss();
          void send({ type: 'setSubtitle', index });
        }}
      />
    </Screen>
  );
}

function labelOf(tracks: { index: number; label: string }[], index?: number | null) {
  return tracks.find((track) => track.index === index)?.label;
}

function Header({ title, onBack }: Readonly<{ title: string; onBack(): void }>) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button">
        <Icon name="chevron-down" size={26} stroke={2} />
      </Pressable>
      <Text numberOfLines={1} style={styles.headerTitle}>
        {title}
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function Round({
  icon,
  label,
  onPress,
  big,
}: Readonly<{ icon: IconName; label: string; onPress(): void; big?: boolean }>) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.round, big && styles.roundBig, pressed && { opacity: 0.7 }]}
    >
      <Icon name={icon} size={big ? 34 : 26} stroke={1.8} color={colors.text} />
    </Pressable>
  );
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
      style={({ pressed }) => [styles.wide, pressed && { opacity: 0.75 }]}
    >
      <Icon name={icon} size={20} stroke={1.8} color={colors.text} />
      <Text numberOfLines={1} style={styles.wideLabel}>
        {label}
      </Text>
      {value ? (
        <Text numberOfLines={1} style={styles.wideValue}>
          {value}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  headerTitle: { ...type.heading, color: colors.text, flex: 1 },
  headerSpacer: { width: 26 },
  body: { gap: spacing.md, paddingBottom: spacing.xl },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  deviceText: { ...type.caption, color: colors.accent, flex: 1 },
  deviceTextIdle: { color: colors.textDim },
  art: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  artFallback: { alignItems: 'center', justifyContent: 'center' },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.caption, color: colors.textDim, marginTop: -spacing.sm },
  scrub: { gap: 6 },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { ...type.small, color: colors.textDim, fontVariant: ['tabular-nums'] },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
  round: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  roundBig: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.surfaceHigh },
  actions: { gap: spacing.xs },
  wide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
  },
  wideLabel: { ...type.body, color: colors.text, flex: 1 },
  wideValue: { ...type.caption, color: colors.textDim, maxWidth: '45%' },
});
