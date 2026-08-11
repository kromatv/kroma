// The phone as the TV's control surface. It draws what the TV last reported
// (position interpolated between heartbeats), never what this phone just asked for.

import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { formatTimecode, type MediaItem, sizedImageUrl } from '@kroma/core';
import { useCast } from '@kroma/ui';
import { Box, Icon, type IconName, styles, Text } from '@kroma/ui/kit';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { CastSheet } from '#mobile/components/cast/CastSheet';
import { TrackPickerSheet } from '#mobile/components/cast/TrackPickerSheet';
import { EmptyState, Screen } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { goBack } from '#mobile/lib/nav';
import { useClient } from '#mobile/lib/session';
import { radius, spacing, type } from '#mobile/lib/theme';
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

function RemoteArtwork({ item }: Readonly<{ item?: MediaItem }>) {
  const client = useClient();
  const { width } = useWindowDimensions();
  const art = item
    ? sizedImageUrl(client.backdropFor(item) ?? client.posterFor(item), width)
    : null;
  return (
    <>
      {art ? (
        <Image source={{ uri: art }} style={s.art} contentFit="cover" transition={200} />
      ) : (
        <Box style={[s.art, s.artFallback]}>
          <Icon name="device-tv" size={40} stroke={1.4} color="textDim" />
        </Box>
      )}
      <Text lines={2} style={s.title}>
        {item?.metadata?.title ?? item?.title ?? ''}
      </Text>
      {item?.showTitle ? (
        <Text lines={1} style={s.subtitle}>
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
          icon={<Icon name="cast" size={40} stroke={1.4} color="textDim" />}
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
      <Pressable onPress={() => devices.current?.present()} style={s.deviceRow}>
        <Icon name="cast" size={18} stroke={1.8} color={playing ? 'accent' : 'textMuted'} />
        <Text style={[s.deviceText, !playing && s.deviceTextIdle]}>
          {t(playing ? 'cast.playingOn' : 'cast.connectedTo', {
            device: `${active.name} · ${active.username}`,
          })}
        </Text>
        <Icon name="chevron-right" size={16} stroke={2} color="textMuted" />
      </Pressable>

      {playing ? (
        <ScrollView contentContainerStyle={s.body}>
          <RemoteArtwork item={item} />

          <Box style={s.scrub}>
            <ScrubBar
              cur={positionMs / 1000}
              dur={durationMs / 1000}
              buffered={0}
              onSeek={(abs) => void send({ type: 'seek', positionMs: Math.round(abs * 1000) })}
            />
            <Box style={s.times}>
              <Text style={s.time}>{formatTimecode(positionMs / 1000)}</Text>
              <Text style={s.time}>
                {durationMs
                  ? `-${formatTimecode(Math.max(0, (durationMs - positionMs) / 1000))}`
                  : ''}
              </Text>
            </Box>
          </Box>

          <Box style={s.transport}>
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
          </Box>

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
          icon={<Icon name="device-tv" size={40} stroke={1.4} color="textDim" />}
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
    <Box style={s.header}>
      <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button">
        <Icon name="chevron-down" size={26} stroke={2} />
      </Pressable>
      <Text lines={1} style={s.headerTitle}>
        {title}
      </Text>
      <Box style={s.headerSpacer} />
    </Box>
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
      style={({ pressed }) => [s.round, big && s.roundBig, pressed && { opacity: 0.7 }]}
    >
      <Icon name={icon} size={big ? 34 : 26} stroke={1.8} color="text" />
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
      style={({ pressed }) => [s.wide, pressed && { opacity: 0.75 }]}
    >
      <Icon name={icon} size={20} stroke={1.8} color="text" />
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
  header: { row: true, align: 'center', gap: spacing.sm, py: spacing.sm },
  headerTitle: { ...type.heading, flex: true, color: 'text' },
  headerSpacer: { w: 26 },
  body: { gap: spacing.md, pb: spacing.xl },
  deviceRow: { row: true, align: 'center', gap: spacing.xs, py: spacing.xs, mb: spacing.sm },
  deviceText: { ...type.caption, flex: true, color: 'accentText' },
  deviceTextIdle: { color: 'textMuted' },
  art: { w: '100%', aspect: 16 / 9, bg: 'surface1', radius: radius.md },
  artFallback: { center: true },
  title: { ...type.title, color: 'text' },
  subtitle: { ...type.caption, mt: -spacing.sm, color: 'textMuted' },
  scrub: { gap: 6 },
  times: { row: true, between: true },
  time: { ...type.small, color: 'textMuted', fontVariant: ['tabular-nums'] },
  transport: { row: true, center: true, gap: spacing.lg, py: spacing.sm },
  round: { center: true, w: 56, h: 56, bg: 'surface2', radius: 28 },
  roundBig: { w: 76, h: 76, bg: 'surface3', radius: 38 },
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
