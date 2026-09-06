import type { PlaybackSession } from '@kroma/client/admin';
import { resolveImageUrl } from '@kroma/core';
import type { Translate } from '@kroma/i18n';
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
import { posterScrim } from '#web/shared/lib/art-styles';
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
  const poster = kromaClient().media.artwork.posterUrl(s.itemId);

  return (
    <Box w={THUMB_W} aspect={16 / 9} shrink={0} self="flex-start" radius="xs" overflow="hidden">
      <Box fill style={posterScrim(s.title)} />
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

function transportTone(state: string, t: Translate): { color: ColorValue; label: string } {
  if (state === 'buffering') return { color: 'accent', label: t('admin.buffering') };
  if (state === 'playing') return { color: 'success', label: t('admin.playing') };
  return { color: 'text/50', label: t('admin.paused') };
}

function pipeTone(mode: string, t: Translate): { ink: ColorValue; bg: ColorValue; label: string } {
  if (mode === 'transcode') {
    return { ink: 'accent', bg: 'accentWash/14', label: t('admin.audioTranscode') };
  }
  if (mode === 'remux') return { ink: 'info', bg: 'info/14', label: t('admin.remux') };
  return { ink: 'success', bg: 'success/14', label: t('admin.directPlay') };
}

function subtitleOf(s: PlaybackSession, t: Translate): string {
  if (s.kind === 'episode' && s.season != null) {
    return t('admin.episodeShort', { season: s.season, episode: s.episode ?? '' });
  }
  return s.year == null ? '' : String(s.year);
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
  const loaded = s.durationMs && s.bufferedMs != null ? s.bufferedMs / s.durationMs : undefined;
  const buffering = s.state === 'buffering';
  // What the CLIENT reported it is doing. The server's own account of a session,
  // including a picture it had to re-encode, is the Transcodage section.
  const transcode = s.mode === 'transcode';
  const lan = s.network === 'LAN';

  const { color: stateColor, label: stateLabel } = transportTone(s.state, t);
  const pipe = pipeTone(s.mode, t);
  const sub = subtitleOf(s, t);

  return (
    <Surface elevated pad="none" border="border" row gap={18} px={20} py={18}>
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
            <Progress value={pct / 100} buffered={loaded} waiting={buffering} rounded />
          </Box>
          <Text variant="meta" color="textDim" style={TABULAR}>
            {s.durationMs ? fmt.timecode(s.durationMs) : '-'}
          </Text>
        </Row>

        <Divider />
        <Row wrap gapX={26} gapY={10}>
          <DataField.Root size="sm">
            <DataField.Label>{t('admin.statPlayback')}</DataField.Label>
            <Row self="flex-start" radius="xs" px={9} py={3} bg={pipe.bg}>
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
            <Row self="flex-start" radius="xs" px={9} py={3} bg={lan ? 'success/12' : 'info/12'}>
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
        await client.admin.terminateSession(session.id, message);
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
