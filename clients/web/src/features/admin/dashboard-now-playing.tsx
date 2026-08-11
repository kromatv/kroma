import { type PlaybackSession, resolveImageUrl } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Avatar,
  color,
  DataField,
  Dialog,
  Field,
  Icon,
  IconButton,
  Progress,
  Surface,
} from '@kroma/ui/kit';
import { useState } from 'react';
import { createCallable } from 'react-call';
import { formatMbps, posterGradient, timecode } from '#web/shared/lib/adminFormat';
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
    <div
      className="relative aspect-video shrink-0 self-start overflow-hidden rounded-md shadow-[0_8px_20px_rgba(0,0,0,.45)]"
      style={{ width: THUMB_W, background: posterGradient(s.title) }}
    >
      {posterFailed ? null : (
        <Image src={poster} fit="cover" fill onError={() => setPosterFailed(true)} />
      )}
      {/* A storyboard tile is a window onto the sprite sheet: the sheet is drawn
          at its scaled size and slid into place (see StoryboardThumb). */}
      {frame ? (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("${frame.sheet}")`,
            backgroundPosition: `${frame.offsetX}px ${frame.offsetY}px`,
            backgroundSize: `${frame.sheetWidth * frame.scale}px ${frame.sheetHeight * frame.scale}px`,
            backgroundRepeat: 'no-repeat',
          }}
        />
      ) : null}
    </div>
  );
}

export function NowPlayingCard({
  s,
  avatarUrl,
  onStop,
}: Readonly<{ s: PlaybackSession; avatarUrl?: string | null; onStop: () => void }>) {
  const t = useT();
  const playing = s.state === 'playing';
  const pct = s.durationMs ? (s.positionMs / s.durationMs) * 100 : 0;
  const buffering = s.state === 'buffering';
  // `transcode` = the audio was re-encoded to AAC; `remux` = HLS repackage with
  // both streams copied. Video is NEVER transcoded, so it always reads as direct.
  const transcode = s.mode === 'transcode';
  const remux = s.mode === 'remux';
  const lan = s.network === 'LAN';

  let stateColor = color('text/50');
  let stateLabel = t('admin.paused');
  if (buffering) {
    stateColor = color('accent');
    stateLabel = t('admin.buffering');
  } else if (playing) {
    stateColor = color('success');
    stateLabel = t('admin.playing');
  }

  let pipe: { color: string; bg: string; label: string } = {
    color: color('success'),
    bg: color('success/14'),
    label: t('admin.directPlay'),
  };
  if (transcode)
    pipe = { color: color('accent'), bg: color('accentWash/14'), label: t('admin.audioTranscode') };
  else if (remux) pipe = { color: color('info'), bg: color('info/14'), label: t('admin.remux') };
  let sub = '';
  if (s.kind === 'episode' && s.season != null)
    sub = t('admin.episodeShort', { season: s.season, episode: s.episode ?? '' });
  else if (s.year != null) sub = String(s.year);

  return (
    <Surface elevated pad="none" radius={16} border="border" row gap={18} px={20} py={18}>
      <NowPlayingThumb s={s} />

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-4.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h3 className="truncate font-display text-[17px] font-bold leading-[1.1]">
                {s.showTitle ? `${s.showTitle}` : s.title}
              </h3>
              <span
                className="inline-flex items-center gap-1.5 text-[10.5px] font-bold"
                style={{ color: stateColor }}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${playing || buffering ? 'animate-[kroma-breathe_2s_ease-in-out_infinite]' : ''}`}
                  style={{ background: stateColor }}
                />
                {stateLabel}
              </span>
            </div>
            <div className="mt-1 text-[12.5px] font-medium text-text/50">
              {[sub, s.videoLabel].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2.75">
            <div className="text-right">
              <div className="text-[14px] font-semibold">{s.username}</div>
              <div className="text-[12px] font-medium text-text/50">
                {s.player} · {s.device}
              </div>
            </div>
            <Avatar
              name={s.username}
              src={resolveImageUrl(apiBase(), avatarUrl)}
              size={38}
              roundness={10 / 38}
            />
            <IconButton control="sm" label={t('admin.stopStream')} onPress={onStop}>
              <Icon name="player-stop-filled" size={15} color="danger" />
            </IconButton>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[12px] font-semibold tabular-nums text-text/70">
            {timecode(s.positionMs)}
          </span>
          <div className="flex-1">
            <Progress value={pct / 100} rounded />
          </div>
          <span className="text-[12px] font-semibold tabular-nums text-text/40">
            {s.durationMs ? timecode(s.durationMs) : '-'}
          </span>
        </div>

        <div className="flex flex-wrap gap-x-6.5 gap-y-2.5 border-t border-border pt-3">
          <DataField.Root size="sm" label={t('admin.statPlayback')}>
            <span
              className="inline-flex items-center gap-1.5 self-start rounded-sm px-2.25 py-0.75 text-[13px] font-semibold"
              style={{ color: pipe.color, background: pipe.bg }}
            >
              {pipe.label}
            </span>
          </DataField.Root>
          <DataField.Root size="sm" label={t('admin.statVideo')}>
            <span className="text-[13px] font-semibold" style={{ color: color('success') }}>
              {s.videoLabel}
            </span>
          </DataField.Root>
          <DataField.Root size="sm" label={t('admin.statAudioTrack')}>
            <span
              className="text-[13px] font-semibold"
              style={{ color: color(transcode ? 'accent' : 'success') }}
            >
              {transcode ? `${s.audioLabel} → AAC` : s.audioLabel}
            </span>
          </DataField.Root>
          <DataField.Root size="sm" label={t('admin.statSubtitles')}>
            <span className="text-[13px] font-semibold text-text/78">{s.subtitle}</span>
          </DataField.Root>
          <DataField.Root size="sm" label={t('admin.statBitrate')}>
            <span className="text-[13px] font-semibold tabular-nums text-text/78">
              {formatMbps(s.bitrate)} Mb/s
            </span>
          </DataField.Root>
          <DataField.Root size="sm" label={t('admin.statNetwork')}>
            <span
              className="inline-flex items-center gap-1.5 self-start rounded-sm px-2.25 py-0.75 text-[13px] font-semibold"
              style={{
                color: color(lan ? 'success' : 'info'),
                background: color(lan ? 'success/12' : 'info/12'),
              }}
            >
              {s.network} · {s.ip}
            </span>
          </DataField.Root>
        </div>
      </div>
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
      <Dialog open title={t('admin.stopStreamTitle')} width={520} onClose={() => call.end(false)}>
        <p className="text-[13px] text-dim">
          {t('admin.stopStreamDesc', { user: session.username })}
        </p>
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
      </Dialog>
    );
  },
);
