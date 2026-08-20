// The phone as the TV's control surface. It draws what the TV last reported
// (position interpolated between heartbeats), never what this phone just asked for.

import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { formatTimecode } from '@kroma/core';
import { useCast } from '@kroma/ui';
import { Box, Icon, styles, Text } from '@kroma/ui/kit';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { CastSheet } from '#mobile/components/cast/CastSheet';
import { RemoteActions } from '#mobile/components/cast/RemoteActions';
import { RemoteArtwork } from '#mobile/components/cast/RemoteArtwork';
import { RemoteHeader } from '#mobile/components/cast/RemoteHeader';
import { RemoteTransport } from '#mobile/components/cast/RemoteTransport';
import { TrackPickerSheet } from '#mobile/components/cast/TrackPickerSheet';
import { EmptyState, Screen } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { goBack } from '#mobile/lib/nav';
import { spacing, type } from '#mobile/lib/theme';
import { ScrubBar } from '#mobile/player/ScrubBar';

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
        <RemoteHeader title={t('cast.remote')} onBack={() => goBack(router)} />
        <EmptyState
          icon={<Icon name="cast" size={40} thickness={1.4} color="textDim" />}
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
      <RemoteHeader title={active.name} onBack={() => goBack(router)} />
      <Pressable onPress={() => devices.current?.present()} style={s.deviceRow}>
        <Icon name="cast" size={18} thickness={1.8} color={playing ? 'accent' : 'textMuted'} />
        <Text style={[s.deviceText, !playing && s.deviceTextIdle]}>
          {t(playing ? 'cast.playingOn' : 'cast.connectedTo', {
            device: `${active.name} · ${active.username}`,
          })}
        </Text>
        <Icon name="chevron-right" size={16} thickness={2} color="textMuted" />
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

          <RemoteTransport
            isPlaying={isPlaying}
            buffering={buffering}
            onSkip={(deltaMs) => void send({ type: 'skip', deltaMs })}
            onTogglePlay={() => void send({ type: 'togglePlay' })}
          />

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
          icon={<Icon name="device-tv" size={40} thickness={1.4} color="textDim" />}
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

const s = styles({
  body: { gap: spacing.md, pb: spacing.xl },
  deviceRow: { row: true, align: 'center', gap: spacing.xs, py: spacing.xs, mb: spacing.sm },
  deviceText: { ...type.caption, flex: true, color: 'accentText' },
  deviceTextIdle: { color: 'textMuted' },
  scrub: { gap: 6 },
  times: { row: true, between: true },
  time: { ...type.small, color: 'textMuted', fontVariant: ['tabular-nums'] },
});
