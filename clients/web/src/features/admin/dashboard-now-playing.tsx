import { type PlaybackSession, posterGradient, resolveImageUrl } from '@kroma/core';
import { TABULAR } from '@kroma/module-sdk';
import { useFormat, useT } from '@kroma/ui';
import {
  Avatar,
  Box,
  type ColorValue,
  DataField,
  Dialog,
  Divider,
  Field,
  Icon,
  IconButton,
  Progress,
  Row,
  Surface,
  Text,
} from '@kroma/ui/kit';
import { useState } from 'react';
import { createCallable } from 'react-call';
import { PillDot } from '#web/features/admin/pill';
import { apiBase, kromaClient } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';
import { useStoryboard } from '#web/shared/lib/use-storyboard';
import { Image } from '#web/shared/ui';

const THUMB_W = 132;

// The current storyboard frame when the sheet is ready, else the item poster,
// else a title-seeded gradient.
function NowPlayingThumb({ s }: Readonly<{ s: PlaybackSession }>) {
  // Never kick/await lazy ffmpeg generation just to paint a 132px thumb: fetch
  // once and only use the sheet if it already exists (else poster / gradient).
  const story = useStoryboard(s.itemId, { generate: false });
  const [posterFailed, setPosterFailed] = useState(false);
  const frame = story.tile(s.positionMs / 1000, THUMB_W);
  const poster = kromaClient().posterUrl(s.itemId);

  return (
    <Box
      w={THUMB_W}
      aspect={16 / 9}
      shrink={0}
      self="flex-start"
      radius="xs"
      overflow="hidden"
      shadow="card"
    >
      <div style={{ position: 'absolute', inset: 0, background: posterGradient(s.title) }} />
      {posterFailed ? null : (
        <Image src={poster} fit="cover" fill onError={() => setPosterFailed(true)} />
      )}
      {/* A storyboard tile is a window onto the sprite sheet: the sheet is drawn
          at its scaled size and slid into place (see StoryboardThumb). */}
      {frame ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url("${frame.sheet}")`,
            backgroundPosition: `${frame.offsetX}px ${frame.offsetY}px`,
            backgroundSize: `${frame.sheetWidth * frame.scale}px ${frame.sheetHeight * frame.scale}px`,
            backgroundRepeat: 'no-repeat',
          }}
        />
      ) : null}
    </Box>
  );
}

export function NowPlayingCard({
  s,
  avatarUrl,
  onStop,
}: Readonly<{ s: PlaybackSession; avatarUrl?: string | null; onStop: () => void }>) {
  const t = useT();
  const fmt = useFormat();
  const playing = s.state === 'playing';
  const pct = s.durationMs ? (s.positionMs / s.durationMs) * 100 : 0;
  const buffering = s.state === 'buffering';
  // `transcode` = the audio was re-encoded to AAC; `remux` = HLS repackage with
  // both streams copied. Video is NEVER transcoded, so it always reads as direct.
  const transcode = s.mode === 'transcode';
  const remux = s.mode === 'remux';
  const lan = s.network === 'LAN';

  let stateColor: ColorValue = 'text/50';
  let stateLabel = t('admin.paused');
  if (buffering) {
    stateColor = 'accent';
    stateLabel = t('admin.buffering');
  } else if (playing) {
    stateColor = 'success';
    stateLabel = t('admin.playing');
  }

  let pipe: { ink: ColorValue; bg: ColorValue; label: string } = {
    ink: 'success',
    bg: 'success/14',
    label: t('admin.directPlay'),
  };
  if (transcode) pipe = { ink: 'accent', bg: 'accentWash/14', label: t('admin.audioTranscode') };
  else if (remux) pipe = { ink: 'info', bg: 'info/14', label: t('admin.remux') };
  let sub = '';
  if (s.kind === 'episode' && s.season != null)
    sub = t('admin.episodeShort', { season: s.season, episode: s.episode ?? '' });
  else if (s.year != null) sub = String(s.year);

  return (
    <Surface elevated pad="none" radius={16} border="border" row gap={18} px={20} py={18}>
      <NowPlayingThumb s={s} />

      <Box flex minW={0} gap={12}>
        <Box row between align="flex-start" gap={18}>
          <Box minW={0}>
            <Row gap={10}>
              <Text variant="title" accessibilityRole="header" lines={1}>
                {s.showTitle ? `${s.showTitle}` : s.title}
              </Text>
              <Row gap={6} shrink={0}>
                <PillDot tone={stateColor} pulse={playing || buffering} />
                <Text variant="meta" color={stateColor}>
                  {stateLabel}
                </Text>
              </Row>
            </Row>
            <Text variant="meta" color="textDim" mt={4}>
              {[sub, s.videoLabel].filter(Boolean).join(' · ')}
            </Text>
          </Box>
          <Row shrink={0} gap={11}>
            <Box align="flex-end">
              <Text variant="label">{s.username}</Text>
              <Text variant="meta" color="textDim">
                {s.player} · {s.device}
              </Text>
            </Box>
            <Avatar
              name={s.username}
              src={resolveImageUrl(apiBase(), avatarUrl)}
              size={38}
              roundness={10 / 38}
            />
            <IconButton control="sm" label={t('admin.stopStream')} onPress={onStop}>
              <Icon name="player-stop-filled" size={15} color="danger" />
            </IconButton>
          </Row>
        </Box>

        <Row gap={12}>
          <Text variant="meta" color="textMuted" style={TABULAR}>
            {fmt.timecode(s.positionMs)}
          </Text>
          <Box flex>
            <Progress value={pct / 100} rounded />
          </Box>
          <Text variant="meta" color="textDim" style={TABULAR}>
            {s.durationMs ? fmt.timecode(s.durationMs) : '-'}
          </Text>
        </Row>

        <Divider />
        <Row wrap gapX={26} gapY={10}>
          <DataField.Root size="sm">
            <DataField.Label>{t('admin.statPlayback')}</DataField.Label>
            <Row self="flex-start" radius={4} px={9} py={3} bg={pipe.bg}>
              <Text variant="meta" color={pipe.ink}>
                {pipe.label}
              </Text>
            </Row>
          </DataField.Root>
          <DataField.Root size="sm">
            <DataField.Label>{t('admin.statVideo')}</DataField.Label>
            <Text variant="meta" color="success">
              {s.videoLabel}
            </Text>
          </DataField.Root>
          <DataField.Root size="sm">
            <DataField.Label>{t('admin.statAudioTrack')}</DataField.Label>
            <Text variant="meta" color={transcode ? 'accent' : 'success'}>
              {transcode ? `${s.audioLabel} → AAC` : s.audioLabel}
            </Text>
          </DataField.Root>
          <DataField.Root size="sm">
            <DataField.Label>{t('admin.statSubtitles')}</DataField.Label>
            <Text variant="meta" color="textMuted">
              {s.subtitle}
            </Text>
          </DataField.Root>
          <DataField.Root size="sm">
            <DataField.Label>{t('admin.statBitrate')}</DataField.Label>
            <Text variant="meta" color="textMuted" style={TABULAR}>
              {fmt.mbps(s.bitrate)} Mb/s
            </Text>
          </DataField.Root>
          <DataField.Root size="sm">
            <DataField.Label>{t('admin.statNetwork')}</DataField.Label>
            <Row self="flex-start" radius={4} px={9} py={3} bg={lan ? 'success/12' : 'info/12'}>
              <Text variant="meta" color={lan ? 'success' : 'info'}>
                {s.network} · {s.ip}
              </Text>
            </Row>
          </DataField.Root>
        </Row>
      </Box>
    </Surface>
  );
}

// Open with `await StopStreamModal.call({ session })`; resolves `true` once the
// session was terminated, `false` if dismissed. Mounted once by `AdminModalHosts`.
export const StopStreamModal = createCallable<{ session: PlaybackSession }, boolean>(
  ({ call, session }) => {
    const t = useT();
    const { client } = useAuth();
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);

    async function stop() {
      setBusy(true);
      try {
        await client.terminateSession(session.id, message);
        call.end(true);
      } finally {
        setBusy(false);
      }
    }

    return (
      <Dialog.Root
        open
        title={t('admin.stopStreamTitle')}
        width="md"
        onClose={() => call.end(false)}
      >
        <Text variant="meta" color="textDim">
          {t('admin.stopStreamDesc', { user: session.username })}
        </Text>
        <Field.Root label={t('admin.stopMessageLabel')}>
          <Field.Textarea
            rows={2}
            value={message}
            onValueChange={setMessage}
            placeholder={t('admin.stopMessagePlaceholder')}
          />
        </Field.Root>
        <Dialog.Actions
          onCancel={() => call.end(false)}
          cancelLabel={t('common.cancel')}
          onConfirm={() => void stop()}
          confirmLabel={t('admin.stopStream')}
          destructive
          busy={busy}
        />
      </Dialog.Root>
    );
  },
);
